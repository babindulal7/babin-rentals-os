-- 0189_delivery_zones.sql
-- Delivery zones for zone-based dispatch fees
-- T4-07: delivery_zones table + RPCs

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

-- Read policy: authenticated staff (non-client roles) can read
create policy delivery_zones_read_staff on public.delivery_zones
    for select to authenticated
    using (
        exists (
            select 1 from public.users u
            where u.id = auth.uid()
            and u.primary_role in ('Owner','Admin','Manager','Coordinator','Warehouse','Technician','Driver','Accounts')
        )
    );

-- Write policy: Coordinator and above can manage zones
create policy delivery_zones_write_coordinator_plus on public.delivery_zones
    for all to authenticated
    using (
        exists (
            select 1 from public.users u
            where u.id = auth.uid()
            and u.primary_role in ('Owner','Admin','Manager','Coordinator')
        )
    )
    with check (
        exists (
            select 1 from public.users u
            where u.id = auth.uid()
            and u.primary_role in ('Owner','Admin','Manager','Coordinator')
        )
    );

-- RPC: create_delivery_zone
create or replace function public.create_delivery_zone(
    p_name text,
    p_description text,
    p_fee_paisa bigint
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_zone_id uuid;
begin
    -- Verify caller is Coordinator or above
    if not public.auth_is_coordinator_or_above() then
        raise insufficient_privilege using message = 'Only Coordinator+ can create delivery zones';
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

comment on function public.create_delivery_zone(text, text, bigint) is 'Create a delivery zone (Coordinator+ only). Returns zone ID.';

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
set search_path = public
as $$
declare
    v_updated boolean;
begin
    -- Verify caller is Coordinator or above
    if not public.auth_is_coordinator_or_above() then
        raise insufficient_privilege using message = 'Only Coordinator+ can update delivery zones';
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

comment on function public.update_delivery_zone(uuid, text, text, bigint, boolean) is 'Update a delivery zone (Coordinator+ only). Returns true if updated.';

-- RPC: deactivate_delivery_zone (soft delete)
create or replace function public.deactivate_delivery_zone(p_zone_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_updated boolean;
begin
    -- Verify caller is Coordinator or above
    if not public.auth_is_coordinator_or_above() then
        raise insufficient_privilege using message = 'Only Coordinator+ can deactivate delivery zones';
    end if;

    update public.delivery_zones
    set is_active = false,
        updated_at = now()
    where id = p_zone_id;

    get diagnostics v_updated = row_count;
    return v_updated;
end;
$$;

comment on function public.deactivate_delivery_zone(uuid) is 'Deactivate (soft delete) a delivery zone (Coordinator+ only). Returns true if deactivated.';

-- RPC: list_delivery_zones (paginated, active-only option)
create or replace function public.list_delivery_zones(
    p_limit int default 50,
    p_offset int default 0,
    p_active_only boolean default true
)
returns setof public.delivery_zones
language plpgsql
security definer
set search_path = public
as $$
begin
    -- Verify caller is authenticated staff (not client)
    if not public.auth_is_staff() then
        raise insufficient_privilege using message = 'Only staff can list delivery zones';
    end if;

    return query
    select dz.*
    from public.delivery_zones dz
    where p_active_only = false or dz.is_active = true
    order by dz.name asc
    limit p_limit offset p_offset;
end;
$$;

comment on function public.list_delivery_zones(int, int, boolean) is 'List delivery zones (staff only). Paginated. Active-only filter.';

-- RPC: get_delivery_zone_fee (for dispatch calculation)
create or replace function public.get_delivery_zone_fee(p_zone_name text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
    v_fee bigint;
begin
    -- This can be called by any authenticated user for fee lookup
    if not public.auth_is_staff() then
        raise insufficient_privilege using message = 'Only staff can query delivery zone fees';
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

comment on function public.get_delivery_zone_fee(text) is 'Get active zone fee by name (staff only). Returns fee in paisa.';

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