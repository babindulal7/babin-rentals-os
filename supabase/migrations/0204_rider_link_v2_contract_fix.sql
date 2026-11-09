-- 0204_rider_link_v2_contract_fix.sql
-- T4-08 / W49: Fix rider link contract mismatch (P0 from 2026-11-02 PROGRESS)
-- Aligns DB function signature with client expectation:
--   create_rider_link(p_client_uuid, p_job_id, p_rider_name, p_rider_phone)
--   returns jsonb {link_id, raw_token, already_issued}
-- Server mints raw token (pgcrypto), stores only SHA-256 hash.
-- Raw token returned ONLY on first issuance, never stored.
-- Revokes authenticated execute on rider-facing RPCs (R1: service_role only).
-- Makes token_hash not readable by authenticated.

begin;

-- 1. Add client_uuid column to delivery_job_links for Law 8 idempotency
alter table public.delivery_job_links
  add column if not exists client_uuid uuid;

-- Backfill existing rows with a generated UUID (one-time)
update public.delivery_job_links
set client_uuid = gen_random_uuid()
where client_uuid is null;

-- Make it NOT NULL + UNIQUE
alter table public.delivery_job_links
  alter column client_uuid set not null;

create unique index if not exists delivery_job_links_client_uuid_idx
  on public.delivery_job_links(client_uuid);

-- 2. Drop old create_rider_link (different arg types = overload, not replace)
drop function if exists public.create_rider_link(uuid, text, text, text);

-- 2. Replace create_rider_link with new signature: server mints token, returns jsonb
create or replace function public.create_rider_link(
  p_client_uuid uuid,
  p_job_id uuid,
  p_rider_name text,
  p_rider_phone text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := (
    select u.primary_role::text from public.users u
    where u.id = auth.uid() and u.is_active
  );
  v_job public.delivery_jobs%rowtype;
  v_link_id uuid;
  v_raw_token text;
  v_token_hash text;
  v_expires_at timestamptz;
  v_already_issued boolean := false;
begin
  -- Authorization: same as before
  if v_actor is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse') then
    raise exception 'Unauthorized to create rider links' using errcode = '42501';
  end if;

  select * into v_job from public.delivery_jobs where id = p_job_id;
  if not found then
    raise exception 'Delivery job not found';
  end if;

  if v_role not in ('Owner', 'Admin') and not exists (
    select 1 from public.users u where u.id = v_actor and u.branch_id = v_job.branch_id
  ) then
    raise exception 'Branch access denied' using errcode = '42501';
  end if;

  if v_job.status in ('Delivered', 'Failed') then
    raise exception 'Cannot create a rider link for a finished delivery job';
  end if;

  -- Validate inputs
  if length(btrim(coalesce(p_rider_name, ''))) < 2 then
    raise exception 'Rider name is required (minimum 2 characters)';
  end if;
  if length(btrim(coalesce(p_rider_phone, ''))) < 7 then
    raise exception 'Rider phone is required (minimum 7 characters)';
  end if;

  -- Idempotency: check if client_uuid already has a link for this job
  select id into v_link_id
  from public.delivery_job_links
  where client_uuid = p_client_uuid and job_id = p_job_id;

  if v_link_id is not null then
    v_already_issued := true;
    v_expires_at := (select expires_at from public.delivery_job_links where id = v_link_id);
    return jsonb_build_object(
      'link_id', v_link_id,
      'raw_token', null,
      'already_issued', true
    );
  end if;

  -- Server-side token minting (128-bit raw token)
  -- Use extensions schema for pgcrypto functions (search_path = public, pg_temp)
  v_raw_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_token_hash := encode(extensions.digest(convert_to(v_raw_token, 'UTF8'), 'sha256'), 'hex');
  v_expires_at := now() + interval '24 hours';

  insert into public.delivery_job_links (
    job_id, token_hash, rider_name, rider_phone, client_uuid, created_by, expires_at
  ) values (
    p_job_id, v_token_hash, btrim(p_rider_name), btrim(p_rider_phone),
    p_client_uuid, v_actor, v_expires_at
  ) returning id into v_link_id;

  -- Audit creation
  insert into public.audit_events (
    client_uuid, event_class, category, module, action, severity, status,
    table_name, record_id, actor_id, actor_role, branch_id, new_values
  ) values (
    gen_random_uuid(),
    'status change',
    'Rentals',
    'Operations',
    'Create',
    'Informational',
    'Success',
    'delivery_job_links',
    v_link_id,
    v_actor,
    v_role::system_role,
    v_job.branch_id,
    jsonb_build_object(
      'job_id', p_job_id,
      'rider_name', btrim(p_rider_name),
      'rider_phone', btrim(p_rider_phone)
    )
  );

  -- Return raw token ONLY on first issuance (never stored)
  return jsonb_build_object(
    'link_id', v_link_id,
    'raw_token', v_raw_token,
    'already_issued', false
  );
end;
$$;

-- 3. Revoke authenticated execute on rider-facing RPCs (R1: service_role only)
-- These must only be callable via the Edge Function (service_role)
revoke all on function public.get_rider_job_by_token(text) from public, anon, authenticated;
revoke all on function public.rider_mark_picked_up(text) from public, anon, authenticated;
revoke all on function public.rider_complete_delivery(text, text, text, text) from public, anon, authenticated;

grant execute on function public.get_rider_job_by_token(text) to service_role;
grant execute on function public.rider_mark_picked_up(text) to service_role;
grant execute on function public.rider_complete_delivery(text, text, text, text) to service_role;

-- create_rider_link and revoke_rider_link remain staff-callable (Owner/Admin/Manager/Coordinator/Warehouse)
revoke all on function public.create_rider_link(uuid, uuid, text, text) from public, anon;
grant execute on function public.create_rider_link(uuid, uuid, text, text) to authenticated, service_role;

revoke all on function public.revoke_rider_link(uuid) from public, anon;
grant execute on function public.revoke_rider_link(uuid) to authenticated, service_role;

-- 4. Make token_hash NOT selectable by authenticated (column-level security)
-- Revoke SELECT on token_hash from authenticated, grant only on other columns
revoke select on public.delivery_job_links from authenticated;

grant select (
  id, job_id, rider_name, rider_phone, created_at, expires_at,
  revoked_at, revoked_by, completed_at, created_by, client_uuid
) on public.delivery_job_links to authenticated;

-- Recreate the staff read policy without token_hash access
drop policy if exists delivery_job_links_staff_read on public.delivery_job_links;

create policy delivery_job_links_staff_read on public.delivery_job_links
  for select to authenticated using (
    auth.uid() is not null and exists (
      select 1 from public.delivery_jobs j
      join public.users u on u.id = auth.uid() and u.is_active
      where j.id = delivery_job_links.job_id
        and (
          u.primary_role in ('Owner', 'Admin')
          or (u.primary_role in ('Manager', 'Coordinator', 'Warehouse') and u.branch_id = j.branch_id)
        )
    )
  );

-- 5. Verification assertions
do $verify$
declare
  v_anon_has_token_hash boolean;
  v_auth_has_token_hash boolean;
  v_create_sig text;
  v_rider_exec_anon boolean;
  v_rider_exec_auth boolean;
begin
  -- Ensure token_hash column exists and is not granted to anon or authenticated
  select has_column_privilege('anon', 'public.delivery_job_links', 'token_hash', 'SELECT')
  into v_anon_has_token_hash;
  select has_column_privilege('authenticated', 'public.delivery_job_links', 'token_hash', 'SELECT')
  into v_auth_has_token_hash;

  if v_anon_has_token_hash or v_auth_has_token_hash then
    raise exception '0204: token_hash must not be SELECT-able by anon or authenticated';
  end if;

  -- Ensure create_rider_link signature is the new one (4 args: uuid, uuid, text, text)
  select pg_get_function_identity_arguments(oid)
  into v_create_sig
  from pg_proc
  where proname = 'create_rider_link' and pronamespace = 'public'::regnamespace;

  if v_create_sig <> 'p_client_uuid uuid, p_job_id uuid, p_rider_name text, p_rider_phone text' then
    raise exception '0204: create_rider_link signature mismatch: %', v_create_sig;
  end if;

  -- Ensure rider-facing RPCs are NOT executable by authenticated
  select has_function_privilege('authenticated', 'public.get_rider_job_by_token(text)', 'EXECUTE')
  into v_rider_exec_auth;
  if v_rider_exec_auth then
    raise exception '0204: get_rider_job_by_token must not be executable by authenticated';
  end if;
  select has_function_privilege('authenticated', 'public.rider_mark_picked_up(text)', 'EXECUTE')
  into v_rider_exec_auth;
  if v_rider_exec_auth then
    raise exception '0204: rider_mark_picked_up must not be executable by authenticated';
  end if;
  select has_function_privilege('authenticated', 'public.rider_complete_delivery(text, text, text, text)', 'EXECUTE')
  into v_rider_exec_auth;
  if v_rider_exec_auth then
    raise exception '0204: rider_complete_delivery must not be executable by authenticated';
  end if;

  -- Ensure they ARE executable by service_role
  select has_function_privilege('service_role', 'public.get_rider_job_by_token(text)', 'EXECUTE')
  into v_rider_exec_auth;
  if not v_rider_exec_auth then
    raise exception '0204: get_rider_job_by_token must be executable by service_role';
  end if;

  select has_function_privilege('service_role', 'public.rider_mark_picked_up(text)', 'EXECUTE')
  into v_rider_exec_auth;
  if not v_rider_exec_auth then
    raise exception '0204: rider_mark_picked_up must be executable by service_role';
  end if;

  select has_function_privilege('service_role', 'public.rider_complete_delivery(text, text, text, text)', 'EXECUTE')
  into v_rider_exec_auth;
  if not v_rider_exec_auth then
    raise exception '0204: rider_complete_delivery must be executable by service_role';
  end if;

  -- Ensure anon cannot execute any of these
  select has_function_privilege('anon', 'public.get_rider_job_by_token(text)', 'EXECUTE')
  into v_rider_exec_anon;
  if v_rider_exec_anon then
    raise exception '0204: get_rider_job_by_token must not be executable by anon';
  end if;
  select has_function_privilege('anon', 'public.rider_mark_picked_up(text)', 'EXECUTE')
  into v_rider_exec_anon;
  if v_rider_exec_anon then
    raise exception '0204: rider_mark_picked_up must not be executable by anon';
  end if;
  select has_function_privilege('anon', 'public.rider_complete_delivery(text, text, text, text)', 'EXECUTE')
  into v_rider_exec_anon;
  if v_rider_exec_anon then
    raise exception '0204: rider_complete_delivery must not be executable by anon';
  end if;
  select has_function_privilege('anon', 'public.create_rider_link(uuid, uuid, text, text)', 'EXECUTE')
  into v_rider_exec_anon;
  if v_rider_exec_anon then
    raise exception '0204: create_rider_link must not be executable by anon';
  end if;
  select has_function_privilege('anon', 'public.revoke_rider_link(uuid)', 'EXECUTE')
  into v_rider_exec_anon;
  if v_rider_exec_anon then
    raise exception '0204: revoke_rider_link must not be executable by anon';
  end if;

  raise notice '0204 verification passed: contract aligned, R1 enforced, token_hash protected';
end;
$verify$;

commit;