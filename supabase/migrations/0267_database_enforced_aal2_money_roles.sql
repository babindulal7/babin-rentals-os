-- Migration 0267: Database-enforced AAL2 two-step sign-in for money roles (T1-17 / B21 / B40 / P3)
--
-- Security card:
-- 1. Evaluates Supabase Auth AAL (Authenticator Assurance Level) in auth_can_view_money().
-- 2. Controlled by Owner-only armed setting 'twoStepAuthRequired' in public.settings.
-- 3. When armed, money roles (Owner, Admin, Manager, Coordinator, Accounts) whose session
--    is not 'aal2' receive FALSE from auth_can_view_money(), returning NULL for masked
--    columns, 0 rows in financial views, and refusing financial write RPCs.
-- 4. Floor roles (Warehouse, Technician, Driver) and external Client roles remain
--    strictly money-blind (Law 6) regardless of MFA factors.
-- 5. Factor tracking (staff_mfa_factors) and append-only audit trail (staff_mfa_audit).
-- 6. Lost-phone reset RPC (reset_staff_mfa) restricted to Owner (any role) and Admin (up to Manager, AD2).

begin;

-- 1. Tracking table for staff MFA factors
create table if not exists public.staff_mfa_factors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  factor_type text not null default 'totp' check (factor_type in ('totp')),
  status text not null default 'unverified' check (status in ('unverified', 'verified')),
  enrolled_at timestamptz not null default now(),
  verified_at timestamptz,
  last_used_at timestamptz,
  constraint staff_mfa_factors_user_key unique (user_id)
);

-- 2. Append-only audit table for MFA lifecycle events
create table if not exists public.staff_mfa_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  action text not null check (action in ('enrolled', 'verified', 'reset_by_admin', 'enforcement_toggled')),
  actor_id uuid references public.users (id),
  actor_role text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table public.staff_mfa_factors enable row level security;
alter table public.staff_mfa_audit enable row level security;

-- Policies
create policy staff_mfa_factors_select on public.staff_mfa_factors for select to authenticated
  using (public.auth_is_staff() and (user_id = public.auth_user_id() or public.auth_user_role() in ('Owner', 'Admin')));

create policy staff_mfa_audit_select on public.staff_mfa_audit for select to authenticated
  using (public.auth_user_role() in ('Owner', 'Admin'));

revoke all on public.staff_mfa_factors, public.staff_mfa_audit from public, anon;
grant select on public.staff_mfa_factors to authenticated;
grant select on public.staff_mfa_audit to authenticated;

-- 3. Core Postgres Gate: auth_can_view_money() with AAL2 enforcement
create or replace function public.auth_can_view_money()
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_role text;
  v_enforced boolean := false;
  v_aal text;
begin
  -- Step 1: Strict allow-list — ONLY approved money roles can EVER view money figures (PERMISSIONS.md §5 / Law 6)
  -- All floor roles (Warehouse, Technician, Driver), Clients, Anon, NULL, or unknown roles fail closed.
  v_role := public.auth_user_role();
  if v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts') or v_role is null then
    return false;
  end if;

  -- Step 2: Read enforcement setting (default FALSE for staged rollout)
  begin
    select (value #>> '{}')::boolean into v_enforced
    from public.settings
    where key = 'twoStepAuthRequired' and scope = 'org';
  exception when others then
    -- Fail closed: if settings cannot be read or query errors, do NOT disable security
    return false;
  end;

  if not coalesce(v_enforced, false) then
    -- Unarmed: approved money roles can view money during staging enrolment
    return true;
  end if;

  -- Step 3: Armed — evaluate Supabase Auth AAL claim from JWT
  begin
    v_aal := auth.jwt() ->> 'aal';
  exception when others then
    return false;
  end;

  return coalesce(v_aal, 'aal1') = 'aal2';
end;
$$;

revoke all on function public.auth_can_view_money() from public;
grant execute on function public.auth_can_view_money() to anon, authenticated;

-- 3b. Finance RLS gate: auth_is_finance_or_admin() requires auth_can_view_money()
create or replace function public.auth_is_finance_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth_user_role() in ('Owner', 'Admin', 'Manager', 'Accounts') and public.auth_can_view_money();
$$;

revoke all on function public.auth_is_finance_or_admin() from public;
grant execute on function public.auth_is_finance_or_admin() to anon, authenticated;

-- 4. Settings toggle RPC: set_two_step_auth_enforcement
create or replace function public.set_two_step_auth_enforcement(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_role text;
  v_caller_id uuid;
begin
  v_caller_role := public.auth_user_role();
  v_caller_id := public.auth_user_id();

  if v_caller_role is distinct from 'Owner' then
    raise exception 'GATE:gate.settings.role|Only the Owner may change two-step authentication enforcement.' using errcode = '42501';
  end if;

  insert into public.settings (key, value, scope, is_money, updated_by, updated_at)
  values ('twoStepAuthRequired', to_jsonb(p_enabled), 'org', false, v_caller_id, now())
  on conflict (key, scope, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set value = to_jsonb(p_enabled), updated_by = v_caller_id, updated_at = now();

  if v_caller_id is not null then
    insert into public.staff_mfa_audit (user_id, action, actor_id, actor_role, metadata)
    values (
      v_caller_id,
      'enforcement_toggled',
      v_caller_id,
      v_caller_role,
      jsonb_build_object('enforced', p_enabled)
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'is_enforced', p_enabled
  );
end;
$$;

revoke all on function public.set_two_step_auth_enforcement(boolean) from public, anon;
grant execute on function public.set_two_step_auth_enforcement(boolean) to authenticated;

-- 5. Lost-phone reset RPC: reset_staff_mfa
create or replace function public.reset_staff_mfa(p_target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_role text;
  v_caller_id uuid;
  v_target_role text;
begin
  v_caller_role := public.auth_user_role();
  v_caller_id := public.auth_user_id();

  select primary_role::text into v_target_role
  from public.users
  where id = p_target_user_id;

  if not found then
    raise exception 'GATE:gate.user.not_found|Staff user not found.' using errcode = 'P0002';
  end if;

  -- Authorization check:
  -- Owner can reset anyone.
  -- Admin can reset up to Manager (AD2); cannot reset Owner or other Admin.
  if v_caller_role = 'Owner' then
    null;
  elsif v_caller_role = 'Admin' then
    if v_target_role in ('Owner', 'Admin') then
      raise exception 'GATE:gate.security.mfa_reset_forbidden|Admin cannot reset two-step verification for Owner or other Admin.' using errcode = '42501';
    end if;
  else
    raise exception 'GATE:gate.security.mfa_reset_forbidden|Only Owner or Admin can reset staff two-step verification.' using errcode = '42501';
  end if;

  -- Delete factor from public tracking
  delete from public.staff_mfa_factors where user_id = p_target_user_id;

  -- Delete enrolled factors from auth schema if table exists in hosted environment
  if exists (select 1 from information_schema.tables where table_schema = 'auth' and table_name = 'mfa_factors') then
    execute 'delete from auth.mfa_factors where user_id = $1' using p_target_user_id;
  end if;

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

-- 6. Enrolment helper RPC: record_staff_mfa_enrolment
create or replace function public.record_staff_mfa_enrolment(p_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_caller_role text;
begin
  v_user_id := coalesce(p_user_id, public.auth_user_id());
  v_caller_role := public.auth_user_role();

  if v_user_id is null then
    raise exception 'GATE:gate.auth.unauthenticated|Authentication required.' using errcode = '42501';
  end if;

  if v_user_id != public.auth_user_id() and v_caller_role != 'Owner' then
    raise exception 'GATE:gate.security.mfa_enrol_forbidden|Cannot enrol MFA for another user.' using errcode = '42501';
  end if;

  insert into public.staff_mfa_factors (user_id, factor_type, status, verified_at, last_used_at)
  values (v_user_id, 'totp', 'verified', now(), now())
  on conflict (user_id)
  do update set status = 'verified', verified_at = now(), last_used_at = now();

  insert into public.staff_mfa_audit (user_id, action, actor_id, actor_role, metadata)
  values (v_user_id, 'enrolled', public.auth_user_id(), v_caller_role, jsonb_build_object('factor_type', 'totp'));

  return jsonb_build_object('success', true, 'user_id', v_user_id, 'status', 'verified');
end;
$$;

revoke all on function public.record_staff_mfa_enrolment(uuid) from public, anon;
grant execute on function public.record_staff_mfa_enrolment(uuid) to authenticated;

-- 7. Overview RPC: get_staff_mfa_overview
create or replace function public.get_staff_mfa_overview()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_role text;
  v_result jsonb;
begin
  v_caller_role := public.auth_user_role();
  if v_caller_role not in ('Owner', 'Admin', 'Manager') then
    raise exception 'GATE:gate.settings.role|Only Owner, Admin, or Manager can view staff MFA overview.' using errcode = '42501';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'user_id', u.id,
      'full_name', u.full_name,
      'email', case when v_caller_role in ('Owner', 'Admin') then u.email else null end,
      'primary_role', u.primary_role,
      'is_money_role', u.primary_role in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts'),
      'mfa_status', coalesce(f.status, 'unregistered'),
      'verified_at', f.verified_at,
      'last_used_at', f.last_used_at
    ) order by u.primary_role, u.full_name
  ) into v_result
  from public.users u
  left join public.staff_mfa_factors f on f.user_id = u.id
  where u.is_active = true and u.deactivated_at is null
    and u.primary_role not in ('Client');

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

revoke all on function public.get_staff_mfa_overview() from public, anon;
grant execute on function public.get_staff_mfa_overview() to authenticated;

commit;
