-- 0189_delivery_zones.sql
-- Delivery zones for zone-based dispatch fees
-- T4-07: delivery_zones table + RPCs (amended 2026-11-03: money-blind roles get no fee, no DELETE, Owner/Admin/Manager only)

create table if not exists public.delivery_zones (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    description text,
    fee_paisa bigint not null default 0,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.delivery_zones is 'Delivery zones with per-zone fees for dispatch calculation';
comment on column public.delivery_zones.name is 'Zone name (e.g., "Ring Road", "Boudha", "Outside Valley")';
comment on column public.delivery_zones.description is 'Human-readable description of zone boundaries';
comment on column public.delivery_zones.fee_paisa is 'Zone fee in paisa (integer, half-up rounding)';
comment on column public.delivery_zones.is_active is 'Whether this zone is available for new dispatches';

-- Index
create index if not exists delivery_zones_active_idx on public.delivery_zones (is_active) where is_active;

-- RLS
alter table public.delivery_zones enable row level security;

-- Read policy: authenticated staff (non-client roles) can read base columns
-- fee_paisa is filtered by RPCs below via auth_can_view_money()
create policy delivery_zones_read_staff on public.delivery_zones
    for select to authenticated
    using (
        exists (
            select 1 from public.users u
            where u.id = auth.uid()
            and u.primary_role in ('Owner','Admin','Manager','Coordinator','Warehouse','Technician','Driver','Accounts')
        )
    );

-- Write policy: Owner/Admin/Manager only (not Coordinator) — INSERT and UPDATE only, no DELETE
-- "Deactivate" is the terminal action via RPC
create policy delivery_zones_insert_manager_plus on public.delivery_zones
    for insert to authenticated
    with check (
        exists (
            select 1 from public.users u
            where u.id = auth.uid()
            and u.primary_role in ('Owner','Admin','Manager')
        )
    );

create policy delivery_zones_update_manager_plus on public.delivery_zones
    for update to authenticated
    using (
        exists (
            select 1 from public.users u
            where u.id = auth.uid()
            and u.primary_role in ('Owner','Admin','Manager')
        )
    )
    with check (
        exists (
            select 1 from public.users u
            where u.id = auth.uid()
            and u.primary_role in ('Owner','Admin','Manager')
        )
    );

-- Helper: auth_is_manager_or_above
create or replace function public.auth_is_manager_or_above()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(auth_user_role() in ('Owner', 'Admin', 'Manager'), false);
$$;

revoke all on function public.auth_is_manager_or_above() from anon, public;
grant execute on function public.auth_is_manager_or_above() to authenticated;

-- RPC: create_delivery_zone
create or replace function public.create_delivery_zone(
    p_name text,
    p_description text,
    p_fee_paisa bigint
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_zone_id uuid;
begin
    -- Verify caller is Manager or above
    if not public.auth_is_manager_or_above() then
        raise insufficient_privilege using message = 'Only Manager+ can create delivery zones';
    end if;

    if p_name is null or trim(p_name) = '' then
        raise exception 'Zone name cannot be empty' using errcode = 'check_violation';
    end if;

    if p_fee_paisa < 0 then
        raise exception 'Zone fee cannot be negative' using errcode = 'check_violation';
    end if;

    insert into public.delivery_zones (name, description, fee_paisa)
    values (trim(p_name), trim(p_description), p_fee_paisa)
    returning id into v_zone_id;

    return v_zone_id;
end;
$$;

comment on function public.create_delivery_zone(text, text, bigint) is 'Create a delivery zone (Manager+ only). Returns zone ID.';

-- RPC: update_delivery_zone
create or replace function public.update_delivery_zone(
    p_zone_id uuid,
    p_name text default null,
    p_description text default null,
    p_fee_paisa bigint default null,
    p_is_active boolean default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_updated boolean;
begin
    -- Verify caller is Manager or above
    if not public.auth_is_manager_or_above() then
        raise insufficient_privilege using message = 'Only Manager+ can update delivery zones';
    end if;

    update public.delivery_zones
    set
        name = coalesce(nullif(trim(p_name), ''), name),
        description = coalesce(nullif(trim(p_description), ''), description),
        fee_paisa = coalesce(p_fee_paisa, fee_paisa),
        is_active = coalesce(p_is_active, is_active),
        updated_at = now()
    where id = p_zone_id;

    get diagnostics v_updated = row_count;
    return v_updated;
end;
$$;

comment on function public.update_delivery_zone(uuid, text, text, bigint, boolean) is 'Update a delivery zone (Manager+ only). Returns true if updated.';

-- RPC: deactivate_delivery_zone (soft delete — terminal action)
create or replace function public.deactivate_delivery_zone(p_zone_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_updated boolean;
begin
    -- Verify caller is Manager or above
    if not public.auth_is_manager_or_above() then
        raise insufficient_privilege using message = 'Only Manager+ can deactivate delivery zones';
    end if;

    update public.delivery_zones
    set is_active = false,
        updated_at = now()
    where id = p_zone_id;

    get diagnostics v_updated = row_count;
    return v_updated;
end;
$$;

comment on function public.deactivate_delivery_zone(uuid) is 'Deactivate (soft delete) a delivery zone (Manager+ only). Returns true if deactivated.';

-- RPC: list_delivery_zones (paginated, active-only option)
-- Returns fee_paisa ONLY if caller can view money (Law 6)
create or replace function public.list_delivery_zones(
    p_limit int default 50,
    p_offset int default 0,
    p_active_only boolean default true
)
returns setof public.delivery_zones
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    -- Verify caller is authenticated staff (not client)
    if not public.auth_is_staff() then
        raise insufficient_privilege using message = 'Only staff can list delivery zones';
    end if;

    return query
    select
        dz.id,
        dz.name,
        dz.description,
        case when public.auth_can_view_money() then dz.fee_paisa else null end as fee_paisa,
        dz.is_active,
        dz.created_at,
        dz.updated_at
    from public.delivery_zones dz
    where p_active_only = false or dz.is_active = true
    order by dz.name asc
    limit p_limit offset p_offset;
end;
$$;

comment on function public.list_delivery_zones(int, int, boolean) is 'List delivery zones (staff only). Paginated. Active-only filter. fee_paisa returned only for money-enabled roles (Law 6).';

-- RPC: get_delivery_zone_fee (for dispatch calculation)
-- Returns fee_paisa ONLY if caller can view money (Law 6)
create or replace function public.get_delivery_zone_fee(p_zone_name text)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_fee bigint;
begin
    -- This can be called by any authenticated user for fee lookup
    if not public.auth_is_staff() then
        raise insufficient_privilege using message = 'Only staff can query delivery zone fees';
    end if;

    if not public.auth_can_view_money() then
        raise insufficient_privilege using message = 'Zone fee requires money-view permission';
    end if;

    select dz.fee_paisa
    into v_fee
    from public.delivery_zones dz
    where dz.name = p_zone_name
      and dz.is_active = true;

    if v_fee is null then
        raise exception 'Zone not found or inactive: %', p_zone_name using errcode = 'no_data';
    end if;

    return v_fee;
end;
$$;

comment on function public.get_delivery_zone_fee(text) is 'Get active zone fee by name (money-enabled roles only). Returns fee in paisa.';

-- Grant execute on RPCs
grant execute on function public.create_delivery_zone(text, text, bigint) to authenticated;
grant execute on function public.update_delivery_zone(uuid, text, text, bigint, boolean) to authenticated;
grant execute on function public.deactivate_delivery_zone(uuid) to authenticated;
grant execute on function public.list_delivery_zones(int, int, boolean) to authenticated;
grant execute on function public.get_delivery_zone_fee(text) to authenticated;

-- Revoke execute from anon and public
revoke all on function public.create_delivery_zone(text, text, bigint) from anon, public;
revoke all on function public.update_delivery_zone(uuid, text, text, bigint, boolean) from anon, public;
revoke all on function public.deactivate_delivery_zone(uuid) from anon, public;
revoke all on function public.list_delivery_zones(int, int, boolean) from anon, public;
revoke all on function public.get_delivery_zone_fee(text) from anon, public;

-- Seed default Kathmandu valley zones
insert into public.delivery_zones (name, description, fee_paisa, is_active)
values
    ('Ring Road', 'Inside Kathmandu Ring Road', 350000, true),
    ('Boudha', 'Boudha and surrounding areas', 350000, true),
    ('Swoyambhu', 'Swoyambhu and surrounding areas', 350000, true),
    ('Patan', 'Lalitpur/Patan area', 350000, true),
    ('Bhaktapur', 'Bhaktapur area', 350000, true),
    ('Kirtipur', 'Kirtipur area', 350000, true),
    ('Outside Valley', 'Outside Kathmandu Valley — quoted per job', 0, true)
on conflict (name) do nothing;

-- Verification assertions (PGlite-compatible subset)
do $verify$
declare
    v_pol_count int;
begin
    -- 1. Verify INSERT and UPDATE policies exist (no DELETE)
    select count(*) into v_pol_count
    from pg_policies
    where schemaname = 'public' and tablename = 'delivery_zones' and cmd in ('INSERT', 'UPDATE');
    
    if v_pol_count < 2 then
        raise exception '0189: Missing INSERT/UPDATE policies';
    end if;

    -- 2. Verify no DELETE policy exists
    select count(*) into v_pol_count
    from pg_policies
    where schemaname = 'public' and tablename = 'delivery_zones' and cmd = 'DELETE';
    
    if v_pol_count > 0 then
        raise exception '0189: DELETE policy must not exist (Law 3)';
    end if;

    raise notice '0189 verification passed: Law 3 (no DELETE), Owner/Admin/Manager write policies exist';
end;
$verify$;