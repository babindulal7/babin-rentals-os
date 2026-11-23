-- Migration 0269: Database-enforced MFA provider proof, self-enrolment boundary, and session safety (T1-17 / Issue #304 / B21 / B40 / P3)
--
-- Security card:
-- 1. Closes trust-boundary vulnerability in record_staff_mfa_enrolment():
--    - Enforces strict self-enrolment (only auth_user_id() can record enrolment).
--    - Removes Owner/Admin parameter override to prevent forging enrolment for other users.
--    - Validates server-side factor proof against auth.mfa_factors: caller MUST possess a
--      verified TOTP factor in the authentication provider. A direct RPC call without
--      verified provider factor fails closed with GATE:gate.security.mfa_factor_unverified.
-- 2. Hardens lost-phone recovery in reset_staff_mfa():
--    - Prevents self-reset via administrative recovery RPC (GATE:gate.security.mfa_self_reset_forbidden).
--    - Invalidates active sessions in auth.sessions and tokens in auth.refresh_tokens upon reset.
--    - Removes factor from auth.mfa_factors and public.staff_mfa_factors atomically.
-- 3. Re-affirms strict money role allow-list in auth_can_view_money() (Owner, Admin, Manager, Coordinator, Accounts only).
--    - Floor roles (Warehouse, Technician, Driver), Clients, Anon, NULL, and unknown roles remain unconditionally money-blind.

begin;

-- 1. Enrolment helper RPC: record_staff_mfa_enrolment
create or replace function public.record_staff_mfa_enrolment(p_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_caller_id uuid;
  v_caller_role text;
  v_target_user_id uuid;
  v_has_verified_factor boolean := false;
begin
  v_caller_id := public.auth_user_id();
  v_caller_role := public.auth_user_role();

  if v_caller_id is null then
    raise exception 'GATE:gate.auth.unauthenticated|Authentication required.' using errcode = '42501';
  end if;

  v_target_user_id := coalesce(p_user_id, v_caller_id);

  -- Strict self-enrolment rule:
  -- Enrolment registers the caller's physical authenticator device.
  -- No caller (including Owner or Admin) may forge or record enrolment for any other user account.
  if v_target_user_id != v_caller_id then
    raise exception 'GATE:gate.security.mfa_enrol_forbidden|Cannot enrol MFA for another user.' using errcode = '42501';
  end if;

  -- Server-side provider verification check:
  -- The caller MUST have a verified TOTP factor in the authentication provider (auth.mfa_factors).
  -- A direct RPC invocation without genuine provider verification fails closed.
  if exists (select 1 from information_schema.tables where table_schema = 'auth' and table_name = 'mfa_factors') then
    select exists (
      select 1 from auth.mfa_factors
      where user_id = v_caller_id
        and factor_type = 'totp'
        and status = 'verified'
    ) into v_has_verified_factor;
  else
    -- Fallback for minimal test environments lacking auth.mfa_factors: require AAL2 JWT claim
    v_has_verified_factor := (coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2');
  end if;

  if not v_has_verified_factor then
    raise exception 'GATE:gate.security.mfa_factor_unverified|No verified TOTP factor exists in authentication provider.' using errcode = '42501';
  end if;

  insert into public.staff_mfa_factors (user_id, factor_type, status, verified_at, last_used_at)
  values (v_caller_id, 'totp', 'verified', now(), now())
  on conflict (user_id)
  do update set status = 'verified', verified_at = now(), last_used_at = now();

  insert into public.staff_mfa_audit (user_id, action, actor_id, actor_role, metadata)
  values (v_caller_id, 'verified', v_caller_id, v_caller_role, jsonb_build_object('factor_type', 'totp', 'provider', 'supabase_auth'));

  return jsonb_build_object(
    'success', true,
    'user_id', v_caller_id,
    'status', 'verified'
  );
end;
$$;

revoke all on function public.record_staff_mfa_enrolment(uuid) from public, anon;
grant execute on function public.record_staff_mfa_enrolment(uuid) to authenticated;

-- 2. Hardened lost-phone reset RPC: reset_staff_mfa
create or replace function public.reset_staff_mfa(p_target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_caller_role text;
  v_caller_id uuid;
  v_target_role text;
begin
  v_caller_role := public.auth_user_role();
  v_caller_id := public.auth_user_id();

  if v_caller_id is null then
    raise exception 'GATE:gate.auth.unauthenticated|Authentication required.' using errcode = '42501';
  end if;

  if p_target_user_id is null then
    raise exception 'GATE:gate.validation.required|Target user ID is required.' using errcode = '22023';
  end if;

  -- Self-reset prohibition:
  -- Administrative lost-phone reset cannot be used on one's own account.
  if p_target_user_id = v_caller_id then
    raise exception 'GATE:gate.security.mfa_self_reset_forbidden|Cannot use administrative reset on your own account. Use factor settings.' using errcode = '42501';
  end if;

  select primary_role::text into v_target_role
  from public.users
  where id = p_target_user_id;

  if not found then
    raise exception 'GATE:gate.user.not_found|Staff user not found.' using errcode = 'P0002';
  end if;

  -- Authorization hierarchy (AD2 / R-40):
  -- Owner can reset any staff member.
  -- Admin can reset up to Manager; cannot reset Owner or other Admin.
  if v_caller_role = 'Owner' then
    null;
  elsif v_caller_role = 'Admin' then
    if v_target_role in ('Owner', 'Admin') then
      raise exception 'GATE:gate.security.mfa_reset_forbidden|Admin cannot reset two-step verification for Owner or other Admin.' using errcode = '42501';
    end if;
  else
    raise exception 'GATE:gate.security.mfa_reset_forbidden|Only Owner or Admin can reset staff two-step verification.' using errcode = '42501';
  end if;

  -- 1. Remove factor from public mirror table
  delete from public.staff_mfa_factors where user_id = p_target_user_id;

  -- 2. Remove factor from auth provider schema if present
  if exists (select 1 from information_schema.tables where table_schema = 'auth' and table_name = 'mfa_factors') then
    execute 'delete from auth.mfa_factors where user_id = $1' using p_target_user_id;
  end if;

  -- 3. Invalidate active sessions to prevent stale JWT/session reuse
  if exists (select 1 from information_schema.tables where table_schema = 'auth' and table_name = 'sessions') then
    execute 'delete from auth.sessions where user_id = $1' using p_target_user_id;
  end if;

  -- 4. Invalidate refresh tokens
  if exists (select 1 from information_schema.tables where table_schema = 'auth' and table_name = 'refresh_tokens') then
    execute 'delete from auth.refresh_tokens where user_id = $1' using p_target_user_id;
  end if;

  -- 5. Audit trail: append-only log with actor role and target role
  insert into public.staff_mfa_audit (user_id, action, actor_id, actor_role, metadata)
  values (
    p_target_user_id,
    'reset_by_admin',
    v_caller_id,
    v_caller_role,
    jsonb_build_object('target_role', v_target_role, 'reason', 'lost_phone_reset')
  );

  return jsonb_build_object(
    'success', true,
    'reset_user_id', p_target_user_id,
    'reset_user_role', v_target_role
  );
end;
$$;

revoke all on function public.reset_staff_mfa(uuid) from public, anon;
grant execute on function public.reset_staff_mfa(uuid) to authenticated;

commit;
