-- =============================================================================
-- 0233_editable_staff_permissions.sql — Editable Role & Per-Staff Permissions
--
-- Implements Babin's 2026-11-12 ruling:
--   - Staff permissions can be changed in Settings (both role-level matrix and
--     per-staff overrides in Staff Directory).
--   - Safety boundaries remain locked in Postgres:
--       1. Owner always retains full access (cannot be locked out of settings).
--       2. Law 6 money-blindness is protected: Warehouse, Technician, Driver,
--          and Client cannot be granted 'money.view'.
--       3. Client remains external (cannot be granted 'staff.surface').
--   - Law 3: Hard delete forbidden on role_permissions, user_permission_overrides,
--     and permission_audit_log (overrides are cleared via RPC + audit log).
--   - Law 8: client_uuid idempotency on every write RPC.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Tables: role_permissions, user_permission_overrides, permission_audit_log
-- -----------------------------------------------------------------------------
create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  client_uuid uuid not null unique default gen_random_uuid(),
  role public.system_role not null,
  capability text not null,
  allowed boolean not null,
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now(),
  unique (role, capability)
);

comment on table public.role_permissions is
  'Role-level capability overrides configured in Settings -> Users & Roles.';

create table if not exists public.user_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  client_uuid uuid not null unique default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  capability text not null,
  allowed boolean not null,
  reason text,
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now(),
  unique (user_id, capability)
);

comment on table public.user_permission_overrides is
  'Per-staff capability overrides configured in Settings -> Staff Directory.';

create table if not exists public.permission_audit_log (
  id uuid primary key default gen_random_uuid(),
  client_uuid uuid not null unique,
  target_type text not null check (target_type in ('role', 'user')),
  target_role public.system_role,
  target_user_id uuid references public.users(id),
  capability text not null,
  previous_allowed boolean,
  new_allowed boolean,
  changed_by uuid not null references public.users(id),
  reason text,
  created_at timestamptz not null default now()
);

comment on table public.permission_audit_log is
  'Append-only audit trail for role and per-staff permission changes (Law 3).';

-- -----------------------------------------------------------------------------
-- 2. Law 3: Prevent hard DELETE on permission tables
-- -----------------------------------------------------------------------------
create or replace function public.trg_permissions_prevent_delete_fn()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'Hard delete is forbidden on % (Law 3).', tg_table_name
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_role_permissions_no_delete on public.role_permissions;
create trigger trg_role_permissions_no_delete
  before delete on public.role_permissions
  for each row execute function public.trg_permissions_prevent_delete_fn();

drop trigger if exists trg_permission_audit_log_no_delete on public.permission_audit_log;
create trigger trg_permission_audit_log_no_delete
  before delete on public.permission_audit_log
  for each row execute function public.trg_permissions_prevent_delete_fn();

-- -----------------------------------------------------------------------------
-- 3. RLS Policies (read-only for authenticated; writes only via SECURITY DEFINER RPCs)
-- -----------------------------------------------------------------------------
alter table public.role_permissions enable row level security;
alter table public.user_permission_overrides enable row level security;
alter table public.permission_audit_log enable row level security;

revoke insert, update, delete on public.role_permissions from anon, authenticated;
revoke insert, update, delete on public.user_permission_overrides from anon, authenticated;
revoke insert, update, delete on public.permission_audit_log from anon, authenticated;

grant select on public.role_permissions to authenticated;
grant select on public.user_permission_overrides to authenticated;
grant select on public.permission_audit_log to authenticated;

drop policy if exists role_permissions_staff_select on public.role_permissions;
create policy role_permissions_staff_select on public.role_permissions
  for select to authenticated
  using (public.auth_is_staff());

drop policy if exists user_permission_overrides_select on public.user_permission_overrides;
create policy user_permission_overrides_select on public.user_permission_overrides
  for select to authenticated
  using (
    public.auth_user_role() = 'Owner'
    or user_id = public.auth_user_id()
  );

drop policy if exists permission_audit_log_owner_select on public.permission_audit_log;
create policy permission_audit_log_owner_select on public.permission_audit_log
  for select to authenticated
  using (public.auth_user_role() = 'Owner');

-- -----------------------------------------------------------------------------
-- 4. Effective Capability Helper: auth_has_capability
-- -----------------------------------------------------------------------------
create or replace function public.auth_has_capability(
  p_capability text,
  p_default boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_role public.system_role;
  v_override boolean;
  v_role_allowed boolean;
begin
  v_user_id := public.auth_user_id();
  v_role := public.auth_user_role();

  -- Safety boundary 1: Owner always retains full access
  if v_role = 'Owner' then
    return true;
  end if;

  -- Safety boundary 2: Client is always external
  if v_role = 'Client' and p_capability = 'staff.surface' then
    return false;
  end if;

  -- Safety boundary 3: Law 6 money-blindness protected for floor & external roles
  if p_capability = 'money.view' and v_role in ('Warehouse', 'Technician', 'Driver', 'Client') then
    return false;
  end if;

  if v_user_id is not null then
    select allowed into v_override
    from public.user_permission_overrides
    where user_id = v_user_id and capability = p_capability;

    if found then
      return v_override;
    end if;
  end if;

  select allowed into v_role_allowed
  from public.role_permissions
  where role = v_role and capability = p_capability;

  if found then
    return v_role_allowed;
  end if;

  return p_default;
end;
$$;

revoke all on function public.auth_has_capability(text, boolean) from public, anon;
grant execute on function public.auth_has_capability(text, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. RPC: set_role_permission (Owner only, Law 8 idempotent)
-- -----------------------------------------------------------------------------
create or replace function public.set_role_permission(
  p_client_uuid uuid,
  p_role public.system_role,
  p_capability text,
  p_allowed boolean,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_prev boolean;
begin
  if public.auth_user_role() <> 'Owner' then
    raise exception 'Permission denied: only Owner may edit role permissions'
      using errcode = '42501';
  end if;

  -- Idempotency check (Law 8)
  if exists (select 1 from public.permission_audit_log where client_uuid = p_client_uuid) then
    return true;
  end if;

  if trim(coalesce(p_capability, '')) = '' then
    raise exception 'Capability key is required' using errcode = '22000';
  end if;

  if p_role = 'Owner' and not p_allowed then
    raise exception 'Owner always retains full access and cannot be restricted'
      using errcode = '42501';
  end if;

  if p_role = 'Client' and p_capability = 'staff.surface' and p_allowed then
    raise exception 'Client is an external portal role and cannot access staff surfaces'
      using errcode = '42501';
  end if;

  if p_capability = 'money.view' and p_allowed and p_role in ('Warehouse', 'Technician', 'Driver', 'Client') then
    raise exception 'Law 6 protection: money-blind roles (%) cannot be granted money.view', p_role
      using errcode = '42501';
  end if;

  v_actor := public.auth_user_id();

  select allowed into v_prev
  from public.role_permissions
  where role = p_role and capability = p_capability;

  insert into public.role_permissions (client_uuid, role, capability, allowed, updated_by, updated_at)
  values (p_client_uuid, p_role, p_capability, p_allowed, v_actor, now())
  on conflict (role, capability)
  do update set
    allowed = excluded.allowed,
    updated_by = excluded.updated_by,
    updated_at = now();

  insert into public.permission_audit_log (
    client_uuid, target_type, target_role, capability, previous_allowed, new_allowed, changed_by, reason
  ) values (
    p_client_uuid, 'role', p_role, p_capability, v_prev, p_allowed, v_actor, nullif(trim(coalesce(p_reason, '')), '')
  );

  return true;
end;
$$;

revoke all on function public.set_role_permission(uuid, public.system_role, text, boolean, text) from public, anon;
grant execute on function public.set_role_permission(uuid, public.system_role, text, boolean, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. RPC: set_user_permission_override (Owner only, Law 8 idempotent)
-- -----------------------------------------------------------------------------
create or replace function public.set_user_permission_override(
  p_client_uuid uuid,
  p_user_id uuid,
  p_capability text,
  p_allowed boolean,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_target_role public.system_role;
  v_prev boolean;
begin
  if public.auth_user_role() <> 'Owner' then
    raise exception 'Permission denied: only Owner may edit staff permission overrides'
      using errcode = '42501';
  end if;

  if exists (select 1 from public.permission_audit_log where client_uuid = p_client_uuid) then
    return true;
  end if;

  select role into v_target_role from public.users where id = p_user_id;
  if not found then
    raise exception 'Staff user not found' using errcode = 'P0002';
  end if;

  if v_target_role = 'Owner' and not p_allowed then
    raise exception 'Owner always retains full access and cannot be restricted'
      using errcode = '42501';
  end if;

  if p_capability = 'money.view' and p_allowed and v_target_role in ('Warehouse', 'Technician', 'Driver', 'Client') then
    raise exception 'Law 6 protection: money-blind role (%) cannot be granted money.view', v_target_role
      using errcode = '42501';
  end if;

  v_actor := public.auth_user_id();

  select allowed into v_prev
  from public.user_permission_overrides
  where user_id = p_user_id and capability = p_capability;

  insert into public.user_permission_overrides (client_uuid, user_id, capability, allowed, reason, updated_by, updated_at)
  values (p_client_uuid, p_user_id, p_capability, p_allowed, nullif(trim(coalesce(p_reason, '')), ''), v_actor, now())
  on conflict (user_id, capability)
  do update set
    allowed = excluded.allowed,
    reason = excluded.reason,
    updated_by = excluded.updated_by,
    updated_at = now();

  insert into public.permission_audit_log (
    client_uuid, target_type, target_user_id, capability, previous_allowed, new_allowed, changed_by, reason
  ) values (
    p_client_uuid, 'user', p_user_id, p_capability, v_prev, p_allowed, v_actor, nullif(trim(coalesce(p_reason, '')), '')
  );

  return true;
end;
$$;

revoke all on function public.set_user_permission_override(uuid, uuid, text, boolean, text) from public, anon;
grant execute on function public.set_user_permission_override(uuid, uuid, text, boolean, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. RPC: clear_user_permission_override (resets to role default, Owner only)
-- -----------------------------------------------------------------------------
create or replace function public.clear_user_permission_override(
  p_client_uuid uuid,
  p_user_id uuid,
  p_capability text,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_prev boolean;
begin
  if public.auth_user_role() <> 'Owner' then
    raise exception 'Permission denied: only Owner may clear staff permission overrides'
      using errcode = '42501';
  end if;

  if exists (select 1 from public.permission_audit_log where client_uuid = p_client_uuid) then
    return true;
  end if;

  v_actor := public.auth_user_id();

  select allowed into v_prev
  from public.user_permission_overrides
  where user_id = p_user_id and capability = p_capability;

  delete from public.user_permission_overrides
  where user_id = p_user_id and capability = p_capability;

  insert into public.permission_audit_log (
    client_uuid, target_type, target_user_id, capability, previous_allowed, new_allowed, changed_by, reason
  ) values (
    p_client_uuid, 'user', p_user_id, p_capability, v_prev, null, v_actor, nullif(trim(coalesce(p_reason, '')), '')
  );

  return true;
end;
$$;

revoke all on function public.clear_user_permission_override(uuid, uuid, text, text) from public, anon;
grant execute on function public.clear_user_permission_override(uuid, uuid, text, text) to authenticated;

commit;
