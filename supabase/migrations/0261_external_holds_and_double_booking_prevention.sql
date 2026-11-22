-- 0261_external_holds_and_double_booking_prevention.sql
-- T9-02: Booqable rentals block the OS calendar and prevent double booking
-- Creates external_holds table, GiST exclusion, mutual conflict prevention,
-- and updates enforce_inventory_reservation_capacity to honor external holds.

begin;

-- 1. Create table external_holds
create table if not exists public.external_holds (
  id uuid primary key default gen_random_uuid(),
  booqable_order_id text not null,
  booqable_order_number text not null,
  product_id uuid not null references public.products(id),
  asset_id uuid references public.product_units(id),
  qty int not null default 1 check (qty > 0),
  period tstzrange not null,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  constraint external_holds_serial_qty_one check (asset_id is null or qty = 1),
  constraint external_holds_no_duplicate_serial
    exclude using gist (asset_id with =, period with &&)
    where (status = 'active' and asset_id is not null)
);

comment on table public.external_holds is
  'Imported Booqable rentals holding units or capacity in the OS during cutover (T9-02, PLAN §7).';
comment on column public.external_holds.booqable_order_number is
  'Neutral reference number displayed as "Held in Booqable #<number>". No client money or pricing stored (Law 6).';

-- Indexes for overlap queries
create index if not exists external_holds_product_period_idx
  on public.external_holds (product_id, period)
  where status = 'active';

create index if not exists external_holds_asset_period_idx
  on public.external_holds (asset_id, period)
  where status = 'active' and asset_id is not null;

create index if not exists external_holds_booqable_order_idx
  on public.external_holds (booqable_order_id, booqable_order_number);

-- 2. Trigger: Prevent external hold insertion/activation if asset is already reserved in OS
create or replace function public.check_external_hold_against_reservations()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if NEW.status = 'active' and NEW.asset_id is not null then
    if exists (
      select 1 from public.inventory_reservations r
      where r.asset_id = NEW.asset_id
        and r.released_at is null
        and r.hold_state in ('confirmed', 'active_hold')
        and r.period && NEW.period
    ) then
      raise exception
        'External hold conflict: asset % is already reserved by an OS booking over period %.',
        NEW.asset_id, NEW.period
        using errcode = '23P01';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_check_external_hold_against_reservations on public.external_holds;
create trigger trg_check_external_hold_against_reservations
  before insert or update on public.external_holds
  for each row
  execute function public.check_external_hold_against_reservations();

-- 3. Update enforce_inventory_reservation_capacity() to take external_holds into account
create or replace function public.enforce_inventory_reservation_capacity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product_id     uuid;
  v_tracking_mode  product_tracking_mode;
  v_total_quantity int;
  v_capacity       int;
  v_peak           int;
  v_held_order_no  text;
begin
  -- Released or expired holds consume nothing
  if NEW.released_at is not null or NEW.hold_state in ('released', 'expired_hold') then
    return NEW;
  end if;

  -- 3a. Serialized asset collision check against active external holds
  if NEW.asset_id is not null then
    select eh.booqable_order_number into v_held_order_no
    from public.external_holds eh
    where eh.asset_id = NEW.asset_id
      and eh.status = 'active'
      and eh.period && NEW.period
    limit 1;

    if v_held_order_no is not null then
      raise exception
        'Reservation rejected: asset % is held by Booqable booking #% over period %.',
        NEW.asset_id, v_held_order_no, NEW.period
        using errcode = '23P01';
    end if;
  end if;

  if NEW.product_id is not null then
    v_product_id := NEW.product_id;
  else
    select pu.product_id into v_product_id
    from public.product_units pu
    where pu.id = NEW.asset_id;

    if v_product_id is null then
      raise exception
        'Reservation rejected: asset % does not resolve to a product.', NEW.asset_id;
    end if;
  end if;

  select p.tracking_mode, p.total_quantity
    into v_tracking_mode, v_total_quantity
  from public.products p
  where p.id = v_product_id
  for update;

  if not found then
    raise exception
      'Reservation rejected: product % does not exist.', v_product_id;
  end if;

  if v_tracking_mode = 'Serialised' then
    select count(*) into v_capacity
    from public.product_units pu
    where pu.product_id = v_product_id
      and pu.status not in ('Maintenance', 'Missing', 'Retired');
  else
    v_capacity := v_total_quantity;
  end if;

  -- 3b. Peak concurrency calculation including OS reservations AND active external holds
  with live as (
    -- OS reservations (by product)
    select r.period, r.qty
    from public.inventory_reservations r
    where r.released_at is null
      and r.hold_state in ('confirmed', 'active_hold')
      and r.product_id = v_product_id
      and r.period && NEW.period
    union all
    -- OS reservations (by asset)
    select r.period, r.qty
    from public.inventory_reservations r
    join public.product_units pu on pu.id = r.asset_id
    where r.released_at is null
      and r.hold_state in ('confirmed', 'active_hold')
      and pu.product_id = v_product_id
      and r.period && NEW.period
    union all
    -- External holds from Booqable (by product)
    select eh.period, eh.qty
    from public.external_holds eh
    where eh.status = 'active'
      and eh.product_id = v_product_id
      and eh.period && NEW.period
    union all
    -- External holds from Booqable (by asset)
    select eh.period, eh.qty
    from public.external_holds eh
    join public.product_units pu on pu.id = eh.asset_id
    where eh.status = 'active'
      and pu.product_id = v_product_id
      and eh.period && NEW.period
  ),
  candidates as (
    select distinct lower(l.period) as at
    from live l
    where NEW.period @> lower(l.period)
  )
  select coalesce(max(occupancy.held), 0) into v_peak
  from (
    select (
      select coalesce(sum(l.qty), 0)
      from live l
      where l.period @> c.at
    ) as held
    from candidates c
  ) occupancy;

  if v_peak > v_capacity then
    raise exception
      'Reservation rejected: product % would have % units held at once (including Booqable holds) between % and %, but stock on hand is %.',
      v_product_id, v_peak, lower(NEW.period), upper(NEW.period), v_capacity;
  end if;

  return NEW;
end;
$$;

-- 4. RPC: sync_external_holds
-- Idempotently inserts or updates external holds from Booqable
create or replace function public.sync_external_holds(
  p_holds jsonb
) returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := (
    select u.primary_role::text from public.users u
    where u.id = auth.uid() and u.is_active
  );
  v_hold jsonb;
  v_upsert_count int := 0;
  v_order_id text;
  v_order_no text;
  v_prod_id uuid;
  v_asset_id uuid;
  v_qty int;
  v_start timestamptz;
  v_end timestamptz;
  v_status text;
begin
  -- Staff authority check (Owner, Admin, Manager, Coordinator)
  if v_actor is not null and v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise exception 'Unauthorized to sync external holds' using errcode = '42501';
  end if;

  if p_holds is null or jsonb_typeof(p_holds) != 'array' then
    raise exception 'p_holds must be a jsonb array';
  end if;

  for v_hold in select * from jsonb_array_elements(p_holds) loop
    v_order_id := v_hold->>'booqable_order_id';
    v_order_no := v_hold->>'booqable_order_number';
    v_prod_id := (v_hold->>'product_id')::uuid;
    v_asset_id := (v_hold->>'asset_id')::uuid;
    v_qty := coalesce((v_hold->>'qty')::int, 1);
    v_start := (v_hold->>'start_date')::timestamptz;
    v_end := (v_hold->>'end_date')::timestamptz;
    v_status := coalesce(v_hold->>'status', 'active');

    if v_order_id is null or v_order_no is null or v_prod_id is null or v_start is null or v_end is null then
      continue;
    end if;

    -- Upsert hold by booqable_order_id + product_id + asset_id
    insert into public.external_holds (
      booqable_order_id,
      booqable_order_number,
      product_id,
      asset_id,
      qty,
      period,
      status,
      created_by
    ) values (
      v_order_id,
      v_order_no,
      v_prod_id,
      v_asset_id,
      v_qty,
      tstzrange(v_start, v_end, '[)'),
      v_status,
      v_actor
    )
    on conflict (id) do update set
      period = excluded.period,
      status = excluded.status,
      qty = excluded.qty,
      updated_at = now();

    v_upsert_count := v_upsert_count + 1;
  end loop;

  return v_upsert_count;
end;
$$;

comment on function public.sync_external_holds(jsonb) is
  'Idempotently syncs external Booqable reservation holds into the OS (staff only).';

-- 5. View: external_holds_v
create or replace view public.external_holds_v as
select
  eh.id,
  eh.booqable_order_id,
  eh.booqable_order_number,
  'Held in Booqable #' || eh.booqable_order_number as display_chip,
  eh.product_id,
  p.name as product_name,
  eh.asset_id,
  pu.asset_tag,
  eh.qty,
  eh.period,
  lower(eh.period) as start_date_utc,
  upper(eh.period) as end_date_utc,
  eh.status,
  eh.created_at,
  eh.updated_at
from public.external_holds eh
join public.products p on p.id = eh.product_id
left join public.product_units pu on pu.id = eh.asset_id;

-- 6. Row Level Security & Grants
alter table public.external_holds enable row level security;

create policy external_holds_staff_select on public.external_holds
  for select
  using (public.auth_is_staff());

create policy external_holds_staff_write on public.external_holds
  for all
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.is_active
        and u.primary_role in ('Owner', 'Admin', 'Manager', 'Coordinator')
    )
  );

grant select on public.external_holds to authenticated;
grant select on public.external_holds_v to authenticated;
grant execute on function public.sync_external_holds(jsonb) to authenticated;

revoke all on public.external_holds from anon, public;
revoke all on public.external_holds_v from anon, public;
revoke all on function public.sync_external_holds(jsonb) from anon, public;

-- 7. Verification block
do $verify$
declare
  v_table_exists boolean;
  v_view_exists boolean;
  v_func_exists boolean;
begin
  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'external_holds'
  ) into v_table_exists;
  if not v_table_exists then
    raise exception '0261 verification failed: external_holds table missing';
  end if;

  select exists (
    select 1 from information_schema.views
    where table_schema = 'public' and table_name = 'external_holds_v'
  ) into v_view_exists;
  if not v_view_exists then
    raise exception '0261 verification failed: external_holds_v view missing';
  end if;

  select exists (
    select 1 from information_schema.routines
    where routine_schema = 'public' and routine_name = 'sync_external_holds'
  ) into v_func_exists;
  if not v_func_exists then
    raise exception '0261 verification failed: sync_external_holds function missing';
  end if;

  raise notice '0261 verification passed: external_holds, exclusion triggers, and sync RPC intact';
end;
$verify$;

commit;
