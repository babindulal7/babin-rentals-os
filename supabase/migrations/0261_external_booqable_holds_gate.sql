-- T9-02 / 0261 — Booqable external stock commitments (database-gate draft).
-- IMPORTANT: DRAFT / UNVERIFIED. Do not deploy or apply to staging/production.
-- No importer, web availability projection or calendar UI in this migration.
-- Depends on 0040 sync tables, 0188 hold_state, and 0253 partner-stock capacity.
-- Source design: docs/verification/T9-02_DB_GATE_DESIGN_2026-11-22.md.
begin;

-- A separate immutable history: external source orders are NOT OS bookings.
create table public.external_holds (
  id uuid primary key default gen_random_uuid(),
  client_uuid uuid not null unique,
  source text not null default 'booqable'
    check (source = 'booqable'),
  external_order_id text not null check (length(btrim(external_order_id)) > 0),
  external_line_id text not null check (length(btrim(external_line_id)) > 0),
  external_order_number text not null check (length(btrim(external_order_number)) > 0),
  product_id uuid not null references public.products(id),
  asset_id uuid references public.product_units(id),
  qty integer not null check (qty > 0 and (asset_id is null or qty = 1)),
  period tstzrange not null
    check (not isempty(period)
      and not lower_inf(period) and not upper_inf(period)
      and lower_inc(period)),
  status text not null default 'active'
    check (status in ('active', 'completed', 'cancelled')),
  released_at timestamptz,
  released_reason text,
  source_updated_at timestamptz,
  last_seen_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (source, external_line_id),
  constraint external_holds_release_reason
    check (
      (status = 'active' and released_at is null and released_reason is null)
      or
      (status <> 'active' and released_at is not null
         and length(btrim(coalesce(released_reason, ''))) >= 10)
    )
);

create index external_holds_active_product_window
  on public.external_holds using gist (product_id, period)
  where status = 'active';

-- The same mapped physical unit cannot appear on two active external orders.
alter table public.external_holds
  add constraint external_holds_same_asset_overlap
  exclude using gist (asset_id with =, period with &&)
  where (status = 'active' and asset_id is not null);

-- A 07:00 pull is NOT proved healthy until the importer explicitly sets it so.
-- Deployment of this migration does not activate cutover protection.
-- Freshness threshold intentionally has no guessed default (owner decision).
create table public.booqable_hold_feed_state (
  source text primary key check (source = 'booqable'),
  enabled boolean not null default false,
  healthy boolean not null default false,
  last_full_sync_at timestamptz,
  maximum_healthy_age interval
    check (maximum_healthy_age is null or maximum_healthy_age > interval '0 seconds'),
  last_error text,
  updated_at timestamptz not null default now()
);
insert into public.booqable_hold_feed_state (source, enabled, healthy)
values ('booqable', false, false);

-- Staff may read only the fields needed for availability; no Booqable PII/money.
alter table public.external_holds enable row level security;
create policy external_holds_staff_read on public.external_holds
  for select to authenticated
  using (public.auth_user_role() in
    ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician'));
revoke all on public.external_holds from public, anon, authenticated;
grant select (
  id, source, external_order_number, product_id, asset_id, qty,
  period, status, last_seen_at
) on public.external_holds to authenticated;
grant all on public.external_holds to service_role;

alter table public.booqable_hold_feed_state enable row level security;
revoke all on public.booqable_hold_feed_state from public, anon, authenticated;
grant all on public.booqable_hold_feed_state to service_role;

-- Release rows are retained (Law 3), including after sync cancellation.
create or replace function public.reject_external_hold_deletion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'External Booqable holds are retained. Mark returned/cancelled with a release reason.'
    using errcode = '23514';
end;
$$;
revoke all on function public.reject_external_hold_deletion() from public, anon, authenticated;
create trigger trg_external_holds_no_delete
before delete on public.external_holds for each row
execute function public.reject_external_hold_deletion();

-- Missing the singleton cutover state must not silently restore availability.
-- Preserve its row even for service_role; disable explicitly through an UPDATE.
create trigger trg_booqable_feed_state_no_delete
before delete on public.booqable_hold_feed_state for each row
execute function public.reject_external_hold_deletion();

-- Normalize external hold windows using product turnaround rules (0240)
create or replace function public.normalize_external_hold_window()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prep_minutes integer;
  v_cleaning_minutes integer;
begin
  if new.status <> 'active' then
    return new;
  end if;

  select coalesce(p.prep_time_minutes, 0), coalesce(p.cleaning_time_minutes, 0)
    into v_prep_minutes, v_cleaning_minutes
    from public.products p where p.id = new.product_id;

  new.period := public.get_effective_rental_window(
    lower(new.period),
    upper(new.period),
    v_prep_minutes,
    v_cleaning_minutes
  );
  return new;
end;
$$;
revoke all on function public.normalize_external_hold_window() from public, anon, authenticated;

create trigger trg_t9_external_holds_normalize
before insert or update of product_id, period, status on public.external_holds
for each row execute function public.normalize_external_hold_window();

-- Cross-table database gate, not browser/UI advice.
-- Every active OS reservation and external-hold write locks the same product
-- before checking both tables, so concurrent transactions cannot both win.
-- Original reservation GiST/quantity/turnaround/shortage rules remain untouched.
create or replace function public.assert_external_hold_inventory_capacity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product_id uuid;
  v_asset_id uuid;
  v_period tstzrange;
  v_tracking_mode public.product_tracking_mode;
  v_total_quantity integer;
  v_capacity integer;
  v_peak integer;
  v_feed public.booqable_hold_feed_state%rowtype;
begin
  if tg_table_name = 'external_holds' then
    if new.status <> 'active' then
      return new;
    end if;
    v_product_id := new.product_id;
    v_asset_id := new.asset_id;
    v_period := new.period;
  else
    -- Release/expire must never be blocked by feed health.
    if new.released_at is not null
       or new.hold_state not in ('confirmed', 'active_hold') then
      return new;
    end if;
    v_asset_id := new.asset_id;
    v_period := new.period;
    if new.product_id is not null then
      v_product_id := new.product_id;
    else
      select pu.product_id into v_product_id
        from public.product_units pu where pu.id = v_asset_id;
    end if;
  end if;

  if v_product_id is null or isempty(v_period) then
    raise exception 'GATE:external_hold_invalid_stock|Product and window must resolve.'
      using errcode = '23514';
  end if;

  -- Same lock discipline as enforce_inventory_reservation_capacity() (0045/0253).
  select p.tracking_mode, p.total_quantity
    into v_tracking_mode, v_total_quantity
    from public.products p where p.id = v_product_id for update;
  if not found then
    raise exception 'GATE:external_hold_unknown_product|Product could not be locked.'
      using errcode = '23514';
  end if;

  if v_asset_id is not null and not exists (
    select 1 from public.product_units pu
    where pu.id = v_asset_id and pu.product_id = v_product_id
  ) then
    raise exception 'GATE:external_hold_asset_mismatch|Serial belongs to another product.'
      using errcode = '23514';
  end if;

  -- A cutover-enabled unhealthy or stale feed blocks even a product with no
  -- known holds. A failed importer must set healthy=false OUTSIDE its failed
  -- import transaction. Owner must select maximum_healthy_age before enabling.
  if tg_table_name = 'inventory_reservations' then
    select * into v_feed from public.booqable_hold_feed_state
     where source = 'booqable';
    if not found then
      raise exception 'GATE:booqable_feed_missing|Cutover feed state cannot be read.'
        using errcode = '23514';
    end if;
    if v_feed.enabled and (
      not v_feed.healthy
      or v_feed.last_full_sync_at is null
      or v_feed.maximum_healthy_age is null
      or v_feed.last_full_sync_at < now() - v_feed.maximum_healthy_age
    ) then
      raise exception 'GATE:booqable_feed_unhealthy|Booqable availability cannot be verified.'
        using errcode = '23514';
    end if;
  end if;

  if not exists (
    select 1 from public.external_holds e
    where e.status = 'active' and e.product_id = v_product_id
      and e.period && v_period
  ) then
    -- Current inventory_reservations constraints still enforce OS-only stock.
    return new;
  end if;

  -- Serial conflict has to refuse even if another unit makes the product
  -- total appear sufficient. This covers both directions of the race.
  if exists (
    select 1 from public.external_holds e
    join public.inventory_reservations r
      on r.asset_id = e.asset_id and r.period && e.period
    where e.status = 'active' and e.asset_id is not null
      and e.product_id = v_product_id and e.period && v_period
      and r.released_at is null
      and r.hold_state in ('confirmed', 'active_hold')
  ) then
    raise exception 'GATE:booqable_serial_held|This physical unit is already held in Booqable.'
      using errcode = '23514';
  end if;

  -- Preserve 0253's partner-capacity rule and conservative whole-window bound.
  if v_tracking_mode = 'Serialised' then
    select count(*) into v_capacity
      from public.product_units pu
     where pu.product_id = v_product_id
       and (
         (coalesce(pu.is_partner_unit, false) = false
          and pu.status not in ('Retired'))
         or (
           pu.is_partner_unit = true and pu.status not in ('Retired')
           and exists (
             select 1 from public.temporary_stock ts
              where ts.id = pu.temporary_stock_id and ts.status = 'Active'
                and tstzrange(ts.available_from, ts.available_until, '[)') @> v_period
           )
         )
       );
  else
    v_capacity := coalesce(v_total_quantity, 0) + coalesce((
      select sum(ts.quantity) from public.temporary_stock ts
       where ts.product_id = v_product_id
         and ts.tracking_mode = 'Quantity'
         and ts.status = 'Active'
         and tstzrange(ts.available_from, ts.available_until, '[)') @> v_period
    ), 0);
  end if;

  -- Peak-of-sweep: sum only inventory actually held at a given instant.
  -- Both OS and Booqable rows contribute; no double-counting a time window.
  with active as (
    select r.period, r.qty
      from public.inventory_reservations r
     where r.product_id = v_product_id
       and r.released_at is null
       and r.hold_state in ('confirmed', 'active_hold')
       and r.period && v_period
    union all
    select r.period, r.qty
      from public.inventory_reservations r
      join public.product_units pu on pu.id = r.asset_id
     where pu.product_id = v_product_id
       and r.released_at is null
       and r.hold_state in ('confirmed', 'active_hold')
       and r.period && v_period
    union all
    select e.period, e.qty
      from public.external_holds e
     where e.product_id = v_product_id and e.status = 'active'
       and e.period && v_period
  ),
  instants as (
    select distinct greatest(lower(a.period), lower(v_period)) as at
      from active a
    union
    select lower(v_period) as at
  )
  select coalesce(max((
    select coalesce(sum(a.qty), 0)
      from active a where a.period @> t.at
  )), 0) into v_peak
    from instants t;

  if v_peak > v_capacity then
    raise exception
      'GATE:booqable_capacity_held|Product % has % combined OS/Booqable units held; capacity is %.',
      v_product_id, v_peak, v_capacity
      using errcode = '23514';
  end if;

  return new;
end;
$$;
revoke all on function public.assert_external_hold_inventory_capacity() from public, anon, authenticated;

-- The OS writer must never be able to bypass the new external table.
create trigger trg_t9_external_holds_guard_inventory
after insert or update on public.inventory_reservations
for each row execute function public.assert_external_hold_inventory_capacity();

-- Importer writes must also refuse conflicts with existing OS reservations.
create trigger trg_t9_external_holds_guard_source
after insert or update on public.external_holds
for each row execute function public.assert_external_hold_inventory_capacity();

comment on table public.external_holds is
  'T9-02: non-billing Booqable rental holds. Database capacity gate only; source sync and UI acceptance are NOT implemented here.';
comment on function public.assert_external_hold_inventory_capacity() is
  'T9-02: serial and aggregate stock guard against both Booqable external_holds and inventory_reservations. No override.';

commit;
