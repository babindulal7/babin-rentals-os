begin;

-- ============================================================================
-- Migration 0253: Temporary Stock from Partners (T2-24, B13, B36, B47, Law 6)
-- ============================================================================

-- 1. Create enums
do $$
begin
  if not exists (select 1 from pg_type where typname = 'partner_cost_kind') then
    create type public.partner_cost_kind as enum ('daily', 'fixed');
  end if;
  if not exists (select 1 from pg_type where typname = 'temporary_stock_status') then
    create type public.temporary_stock_status as enum ('Active', 'Returned to partner', 'Cancelled');
  end if;
end $$;

-- 2. Table: temporary_stock
create table if not exists public.temporary_stock (
  id                  uuid primary key default gen_random_uuid(),
  client_uuid         uuid not null unique,
  supplier_id         uuid not null references public.suppliers(id),
  product_id          uuid not null references public.products(id),
  tracking_mode       public.product_tracking_mode not null default 'Serialised',
  quantity            integer not null check (quantity > 0),
  available_from      timestamptz not null,
  available_until     timestamptz not null,
  cost_kind           public.partner_cost_kind not null,
  cost_paisa          bigint not null check (cost_paisa >= 0),
  status              public.temporary_stock_status not null default 'Active',
  notes               text,
  returned_at         timestamptz,
  returned_by         uuid references public.users(id),
  created_at          timestamptz not null default now(),
  created_by          uuid not null references public.users(id),
  constraint chk_temp_stock_window check (available_until > available_from)
);

create index if not exists idx_temporary_stock_product on public.temporary_stock(product_id);
create index if not exists idx_temporary_stock_supplier on public.temporary_stock(supplier_id);
create index if not exists idx_temporary_stock_status on public.temporary_stock(status);

-- 3. Link partner units in product_units
alter table public.product_units
  add column if not exists temporary_stock_id uuid references public.temporary_stock(id),
  add column if not exists is_partner_unit boolean not null default false;

create index if not exists idx_product_units_temp_stock
  on public.product_units(temporary_stock_id)
  where temporary_stock_id is not null;

-- 4. RLS on temporary_stock
alter table public.temporary_stock enable row level security;

drop policy if exists temporary_stock_select on public.temporary_stock;
create policy temporary_stock_select on public.temporary_stock
  for select
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician', 'Accounts'));

drop policy if exists temporary_stock_modify on public.temporary_stock;
create policy temporary_stock_modify on public.temporary_stock
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts'));

-- 5. Law 6 column-level money masking on temporary_stock
revoke select on public.temporary_stock from authenticated;
grant select (
  id, client_uuid, supplier_id, product_id, tracking_mode, quantity,
  available_from, available_until, status, notes, returned_at, returned_by,
  created_at, created_by
) on public.temporary_stock to authenticated;

create or replace view public.temporary_stock_v as
select
  id,
  client_uuid,
  supplier_id,
  product_id,
  tracking_mode,
  quantity,
  available_from,
  available_until,
  case when public.auth_can_view_money() then cost_kind else null end as cost_kind,
  case when public.auth_can_view_money() then cost_paisa else null end as cost_paisa,
  status,
  notes,
  returned_at,
  returned_by,
  created_at,
  created_by
from public.temporary_stock;

revoke all on public.temporary_stock_v from public, anon;
grant select on public.temporary_stock_v to authenticated;

comment on view public.temporary_stock_v is
  'Law 6 column-masked view: cost_kind and cost_paisa resolve to null for Warehouse, Technician, and Driver.';

-- 6. Update validate_unit_reservability trigger: partner units cannot be reserved outside agreement window
create or replace function public.validate_unit_reservability()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  unit_row public.product_units;
  v_stock public.temporary_stock;
begin
  if new.asset_id is null or new.released_at is not null then
    return new;
  end if;

  select * into unit_row from public.product_units where id = new.asset_id;
  if not found then
    raise exception 'GATE:unit.reserve.not_found|Unit does not exist in inventory.';
  end if;

  if unit_row.retired_at is not null or unit_row.status = 'Retired' then
    raise exception 'GATE:unit.reserve.retired|Unit is retired and cannot be reserved.';
  end if;

  -- B13 / T2-24: Check partner unit agreement validity and window boundedness
  if coalesce(unit_row.is_partner_unit, false) and unit_row.temporary_stock_id is not null then
    select * into v_stock from public.temporary_stock where id = unit_row.temporary_stock_id;
    if not found or v_stock.status <> 'Active' then
      raise exception 'GATE:gate.partner_stock.inactive|Partner unit agreement is not active.';
    end if;
    if not (tstzrange(v_stock.available_from, v_stock.available_until, '[)') @> new.period) then
      raise exception 'GATE:gate.partner_stock.outside_window|Partner unit reservation [%, %) falls outside agreement window [%, %).',
        lower(new.period), upper(new.period), v_stock.available_from, v_stock.available_until;
    end if;
  end if;

  -- For downtime holds, skip active maintenance or damage finding blocks since downtime IS maintenance planning
  if new.kind = 'downtime' then
    return new;
  end if;

  -- 1. Unresolved damage finding check
  if exists (
    select 1 from public.damage_findings
    where unit_id = new.asset_id
      and voided_at is null
      and repaired_at is null
  ) then
    raise exception 'GATE:unit.reserve.damage_finding|Unit has an unresolved damage finding.';
  end if;

  -- 2. Damaged/Lost condition check
  if unit_row.condition in ('Damaged', 'Lost') then
    raise exception 'GATE:unit.reserve.damaged_condition|Unit is damaged or lost and cannot be reserved.';
  end if;

  -- 3. Maintenance record/status check
  if unit_row.status = 'Maintenance' or exists (
    select 1 from public.maintenance_records
    where product_unit_id = new.asset_id
      and completed_at is null
  ) then
    raise exception 'GATE:unit.reserve.maintenance|Unit is in maintenance and cannot be reserved.';
  end if;

  if exists (
    select 1 from public.cleaning_queue_entries
    where unit_id = new.asset_id
      and (nullif(btrim(qc_fail_reason), '') is not null or problem_state <> 'No Problems')
  ) then
    raise exception 'GATE:unit.reserve.qc_defect|Unit has an unresolved QC defect.';
  end if;

  return new;
end;
$$;

-- 7. Update get_available_product_capacity to compose partner units inside their agreement window
create or replace function public.get_available_product_capacity(
  p_product_id  uuid,
  p_period      tstzrange,
  p_ignore_booking_id uuid default null
)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tracking_mode  product_tracking_mode;
  v_total_quantity integer;
  v_capacity       integer;
  v_peak           integer;
begin
  select tracking_mode, total_quantity
    into v_tracking_mode, v_total_quantity
    from products
   where id = p_product_id;

  if not found then
    return 0;
  end if;

  if v_tracking_mode = 'Serialised' then
    -- Count owned units that are not retired, maintenance, or missing
    select count(*) into v_capacity
      from product_units pu
     where pu.product_id = p_product_id
       and coalesce(pu.is_partner_unit, false) = false
       and pu.status not in ('Maintenance', 'Missing', 'Retired');

    -- Plus partner units whose agreement is Active AND covers the requested period
    select v_capacity + count(*) into v_capacity
      from product_units pu
      join temporary_stock ts on ts.id = pu.temporary_stock_id
     where pu.product_id = p_product_id
       and pu.is_partner_unit = true
       and ts.status = 'Active'
       and tstzrange(ts.available_from, ts.available_until, '[)') @> p_period
       and pu.status not in ('Maintenance', 'Missing', 'Retired');
  else
    v_capacity := coalesce(v_total_quantity, 0);

    -- Plus active partner stock quantity covering the requested period
    select v_capacity + coalesce(sum(ts.quantity), 0) into v_capacity
      from temporary_stock ts
     where ts.product_id = p_product_id
       and ts.tracking_mode = 'Quantity'
       and ts.status = 'Active'
       and tstzrange(ts.available_from, ts.available_until, '[)') @> p_period;
  end if;

  with live as (
    select r.period, r.qty
      from inventory_reservations r
     where r.released_at is null
       and r.hold_state in ('confirmed', 'active_hold')
       and (p_ignore_booking_id is null or r.booking_id is distinct from p_ignore_booking_id)
       and r.product_id = p_product_id
       and r.period && p_period
    union all
    select r.period, r.qty
      from inventory_reservations r
      join product_units pu on pu.id = r.asset_id
     where r.released_at is null
       and r.hold_state in ('confirmed', 'active_hold')
       and (p_ignore_booking_id is null or r.booking_id is distinct from p_ignore_booking_id)
       and pu.product_id = p_product_id
       and r.period && p_period
  ),
  candidates as (
    select distinct lower(l.period) as at
      from live l
     where p_period @> lower(l.period)
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

  return greatest(0, v_capacity - v_peak);
end;
$$;

-- 8. RPC: record_temporary_stock
create or replace function public.record_temporary_stock(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_uuid     uuid;
  v_supplier_id     uuid;
  v_product_id      uuid;
  v_tracking_mode   product_tracking_mode;
  v_quantity        integer;
  v_available_from  timestamptz;
  v_available_until timestamptz;
  v_cost_kind       partner_cost_kind;
  v_cost_paisa      bigint;
  v_notes           text;
  v_branch_id       uuid;
  v_warehouse_id    uuid;
  v_stock_id        uuid;
  v_asset_codes     jsonb;
  v_code            text;
  v_sku             text;
  i                 integer;
begin
  if auth_user_role() not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts') then
    raise exception 'AUTH:permission_denied|Only management, coordinator, and accounts roles can record partner stock.';
  end if;

  v_client_uuid     := coalesce((p_payload ->> 'client_uuid')::uuid, gen_random_uuid());
  v_supplier_id     := (p_payload ->> 'supplier_id')::uuid;
  v_product_id      := (p_payload ->> 'product_id')::uuid;
  v_quantity        := coalesce((p_payload ->> 'quantity')::integer, 1);
  v_available_from  := (p_payload ->> 'available_from')::timestamptz;
  v_available_until := (p_payload ->> 'available_until')::timestamptz;
  v_cost_kind       := (p_payload ->> 'cost_kind')::partner_cost_kind;
  v_cost_paisa      := coalesce((p_payload ->> 'cost_paisa')::bigint, 0);
  v_notes           := p_payload ->> 'notes';
  v_asset_codes     := coalesce(p_payload -> 'asset_codes', '[]'::jsonb);

  if v_supplier_id is null or v_product_id is null or v_available_from is null or v_available_until is null then
    raise exception 'GATE:partner_stock.missing_fields|supplier_id, product_id, available_from, and available_until are required.';
  end if;

  if v_available_until <= v_available_from then
    raise exception 'GATE:partner_stock.invalid_window|available_until must be after available_from.';
  end if;

  if v_quantity <= 0 then
    raise exception 'GATE:partner_stock.invalid_quantity|quantity must be greater than zero.';
  end if;

  select tracking_mode, coalesce(model, asset_code) into v_tracking_mode, v_sku
    from public.products
   where id = v_product_id;

  if not found then
    raise exception 'GATE:partner_stock.product_not_found|Product does not exist.';
  end if;

  if p_payload ? 'tracking_mode' then
    v_tracking_mode := (p_payload ->> 'tracking_mode')::product_tracking_mode;
  end if;

  v_branch_id := coalesce(
    (p_payload ->> 'branch_id')::uuid,
    (select id from public.branches limit 1)
  );
  v_warehouse_id := coalesce(
    (p_payload ->> 'warehouse_id')::uuid,
    (select id from public.warehouses where branch_id = v_branch_id limit 1),
    (select id from public.warehouses limit 1)
  );

  insert into public.temporary_stock (
    client_uuid, supplier_id, product_id, tracking_mode, quantity,
    available_from, available_until, cost_kind, cost_paisa, status,
    notes, created_by
  ) values (
    v_client_uuid, v_supplier_id, v_product_id, v_tracking_mode, v_quantity,
    v_available_from, v_available_until, v_cost_kind, v_cost_paisa, 'Active',
    v_notes, auth.uid()
  ) returning id into v_stock_id;

  if v_tracking_mode = 'Serialised' then
    for i in 1..v_quantity loop
      if jsonb_array_length(v_asset_codes) >= i then
        v_code := v_asset_codes ->> (i - 1);
      else
        v_code := 'P-' || coalesce(v_sku, 'GEAR') || '-' || lpad(i::text, 2, '0');
      end if;

      insert into public.product_units (
        client_uuid, product_id, serial_no, asset_tag, barcode, qr_code,
        status, condition, branch_id, warehouse_id, temporary_stock_id,
        is_partner_unit, created_by
      ) values (
        gen_random_uuid(), v_product_id, v_code, v_code, v_code, v_code,
        'In Stock', 'Good', v_branch_id, v_warehouse_id, v_stock_id,
        true, auth.uid()
      );
    end loop;
  end if;

  return jsonb_build_object(
    'id', v_stock_id,
    'client_uuid', v_client_uuid,
    'status', 'Active',
    'quantity', v_quantity,
    'available_from', v_available_from,
    'available_until', v_available_until
  );
end;
$$;

revoke all on function public.record_temporary_stock(jsonb) from public, anon;
grant execute on function public.record_temporary_stock(jsonb) to authenticated;

-- 9. RPC: return_temporary_stock (B36, Law 3)
create or replace function public.return_temporary_stock(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_stock_id      uuid;
  v_stock         public.temporary_stock;
  v_notes         text;
  v_unit_rec      record;
begin
  if auth_user_role() not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician') then
    raise exception 'AUTH:permission_denied|Only staff roles can complete partner gear return.';
  end if;

  v_stock_id := coalesce((p_payload ->> 'temporary_stock_id')::uuid, (p_payload ->> 'id')::uuid);
  v_notes    := p_payload ->> 'notes';

  if v_stock_id is null then
    raise exception 'GATE:partner_stock.id_required|temporary_stock_id is required.';
  end if;

  select * into v_stock
    from public.temporary_stock
   where id = v_stock_id;

  if not found then
    raise exception 'GATE:partner_stock.not_found|Temporary stock agreement not found.';
  end if;

  if v_stock.status <> 'Active' then
    raise exception 'GATE:partner_stock.not_active|Temporary stock agreement is already % and cannot be returned again.', v_stock.status;
  end if;

  -- Refuse if any unit is currently on rent or packed on an open booking
  if exists (
    select 1
      from public.product_units pu
      join public.booking_line_units blu on blu.asset_id = pu.id
      join public.booking_lines bl on bl.id = blu.booking_line_id
      join public.bookings b on b.id = bl.booking_id
     where pu.temporary_stock_id = v_stock_id
       and blu.released_at is null
       and bl.voided_at is null
       and b.stage in ('Packed', 'On Rent')
  ) then
    raise exception 'GATE:gate.partner_stock.currently_on_rent|Cannot return partner stock while units are currently packed or on rent.';
  end if;

  -- Mark temporary_stock as Returned to partner
  update public.temporary_stock
     set status = 'Returned to partner',
         returned_at = now(),
         returned_by = auth.uid(),
         notes = case when v_notes is not null then coalesce(notes || E'\n', '') || v_notes else notes end
   where id = v_stock_id;

  -- Retire linked units and recompute unit status
  for v_unit_rec in
    select id from public.product_units where temporary_stock_id = v_stock_id
  loop
    update public.product_units
       set retired_at = now(),
           retired_by = auth.uid(),
           retirement_reason = 'Returned to partner at end of agreement'
     where id = v_unit_rec.id;

    perform public.recompute_unit_status(v_unit_rec.id);
  end loop;

  return jsonb_build_object(
    'id', v_stock_id,
    'status', 'Returned to partner',
    'returned_at', now()
  );
end;
$$;

revoke all on function public.return_temporary_stock(jsonb) from public, anon;
grant execute on function public.return_temporary_stock(jsonb) to authenticated;

-- 11. Update reservation capacity ceiling trigger to respect partner unit agreement windows
create or replace function public.enforce_inventory_reservation_capacity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product_id     uuid;
  v_tracking_mode  public.product_tracking_mode;
  v_total_quantity int;
  v_capacity       int;
  v_peak           int;
begin
  if NEW.released_at is not null then
    return NEW;
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
       and (
         (coalesce(pu.is_partner_unit, false) = false and pu.status not in ('Retired'))
         or (
           pu.is_partner_unit = true
           and pu.status not in ('Retired')
           and exists (
             select 1 from public.temporary_stock ts
              where ts.id = pu.temporary_stock_id
                and ts.status = 'Active'
                and tstzrange(ts.available_from, ts.available_until, '[)') @> NEW.period
           )
         )
       );
  else
    v_capacity := coalesce(v_total_quantity, 0) + coalesce((
      select sum(ts.quantity) from public.temporary_stock ts
       where ts.product_id = v_product_id
         and ts.tracking_mode = 'Quantity'
         and ts.status = 'Active'
         and tstzrange(ts.available_from, ts.available_until, '[)') @> NEW.period
    ), 0);
  end if;

  with live as (
    select r.period, r.qty
      from public.inventory_reservations r
     where r.released_at is null
       and r.product_id = v_product_id
       and r.period && NEW.period
    union all
    select r.period, r.qty
      from public.inventory_reservations r
      join public.product_units pu on pu.id = r.asset_id
     where r.released_at is null
       and pu.product_id = v_product_id
       and r.period && NEW.period
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
      'Reservation rejected: product % would have % units held at once between % and %, but stock on hand is %.',
      v_product_id, v_peak, lower(NEW.period), upper(NEW.period), v_capacity;
  end if;

  return NEW;
end;
$$;

-- 12. Update confirm_booking_atomic to fail-closed on capacity when allow_overbooking is false
create or replace function public.confirm_booking_atomic(
  p_booking_id  uuid,
  p_actor_id    uuid,
  p_client_uuid uuid,
  p_occurred_at timestamptz default now(),
  p_reason      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking         record;
  v_role            text;
  v_line_count      int;
  v_occurred_at     timestamptz;
  v_res_units       int;
  v_res_qty         int;
  v_actor           uuid;
  v_period          tstzrange;
  v_line_rec        record;
  v_free_cap        int;
  v_short_qty       int;
  v_assigned_count  int;
begin
  v_role := auth_user_role();
  if v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse') then
    raise exception 'Permission denied: role % cannot confirm bookings.', v_role
      using errcode = '42501';
  end if;

  v_actor := auth_user_id();
  if v_actor is null or p_actor_id is distinct from v_actor then
    raise exception 'Permission denied: confirmation actor must match the signed-in staff session.'
      using errcode = '42501';
  end if;
  if p_client_uuid is null then
    raise exception 'A confirmation idempotency key is required.';
  end if;

  v_occurred_at := coalesce(p_occurred_at, now());

  -- 1. Lock the booking row for update
  select id, booking_no, branch_id, client_id, stage, cancelled_at, closed_at, project_type, pickup_at, return_at
    into v_booking
    from bookings
   where id = p_booking_id
     for update;

  if not found then
    raise exception 'Booking % not found. Nothing was confirmed.', p_booking_id;
  end if;

  if v_role in ('Coordinator', 'Warehouse')
     and (auth_user_branch_id() is null
          or v_booking.branch_id is distinct from auth_user_branch_id()) then
    raise exception 'Permission denied: booking belongs to another branch.'
      using errcode = '42501';
  end if;

  if v_booking.cancelled_at is not null then
    raise exception '% was cancelled. A cancelled booking cannot be confirmed.', v_booking.booking_no;
  end if;

  if v_booking.closed_at is not null then
    raise exception '% is Closed. A closed booking cannot be confirmed.', v_booking.booking_no;
  end if;

  if v_booking.stage <> 'Quote' then
    if v_booking.stage = 'Booked' then
      return jsonb_build_object(
        'success', true,
        'booking_id', v_booking.id,
        'booking_no', v_booking.booking_no,
        'stage', 'Booked',
        'already_confirmed', true
      );
    end if;
    raise exception 'Confirm moves a booking from Quote to Booked; % is at %. Nothing was confirmed.',
      v_booking.booking_no, v_booking.stage;
  end if;

  if coalesce(trim(v_booking.project_type), '') = '' then
    raise exception 'Select a project type before confirming this rental. % has none recorded.',
      v_booking.booking_no;
  end if;

  -- 2. Verify live lines
  select count(*) into v_line_count
    from booking_lines
   where booking_id = p_booking_id
     and voided_at is null;

  if v_line_count = 0 then
    raise exception '% has no live lines, so there is nothing to commit.', v_booking.booking_no;
  end if;

  v_period := tstzrange(v_booking.pickup_at, v_booking.return_at, '[)');

  -- 3. Deterministically lock affected products
  perform p.id
     from products p
    where p.id in (
      select distinct bl.product_id
        from booking_lines bl
       where bl.booking_id = p_booking_id
         and bl.voided_at is null
         and bl.product_id is not null
    )
    order by p.id
      for update;

  -- 4. Deterministically lock affected units
  perform pu.id
     from product_units pu
    where pu.id in (
      select distinct blu.asset_id
        from booking_line_units blu
        join booking_lines bl on bl.id = blu.booking_line_id
       where bl.booking_id = p_booking_id
         and bl.voided_at is null
         and blu.released_at is null
    )
    order by pu.id
      for update;

  -- 5. Atomically reclaim expired holds for affected products and units
  update inventory_reservations
     set hold_state = 'expired_hold',
         released_at = v_occurred_at,
         released_reason = 'Hold expired automatically prior to confirmation'
   where hold_state = 'active_hold'
     and expires_at <= v_occurred_at
     and released_at is null
     and (
       asset_id in (
         select distinct blu.asset_id
           from booking_line_units blu
           join booking_lines bl on bl.id = blu.booking_line_id
          where bl.booking_id = p_booking_id
            and bl.voided_at is null
            and blu.released_at is null
       )
       or product_id in (
         select distinct bl.product_id
           from booking_lines bl
          where bl.booking_id = p_booking_id
            and bl.voided_at is null
            and bl.product_id is not null
       )
     );

  -- 6. Convert any existing active holds owned by this booking to confirmed
  update inventory_reservations
     set hold_state = 'confirmed',
         expires_at = null
   where booking_id = p_booking_id
     and hold_state = 'active_hold'
     and released_at is null;

  -- 6b. Evaluate available capacity vs demand for overbooking-enabled products
  for v_line_rec in
    select bl.id as line_id,
           bl.product_id,
           bl.qty,
           bl.description,
           coalesce(p.allow_overbooking, false) as allow_overbooking,
           p.tracking_mode
      from booking_lines bl
      join products p on p.id = bl.product_id
     where bl.booking_id = p_booking_id
       and bl.voided_at is null
       and bl.product_id is not null
     order by bl.id
  loop
    v_free_cap := public.get_available_product_capacity(v_line_rec.product_id, v_period, p_booking_id);

    if v_line_rec.allow_overbooking then
      if v_line_rec.qty > v_free_cap then
        v_short_qty := v_line_rec.qty - v_free_cap;
        update booking_lines
           set short_quantity = v_short_qty
         where id = v_line_rec.line_id;

        -- If serialised: prune any pre-assigned units exceeding free capacity or colliding
        if v_line_rec.tracking_mode = 'Serialised' then
          select count(*) into v_assigned_count
            from booking_line_units blu
           where blu.booking_line_id = v_line_rec.line_id
             and blu.released_at is null;

          if v_assigned_count > v_free_cap then
            delete from booking_line_units
             where id in (
               select id from booking_line_units
                where booking_line_id = v_line_rec.line_id
                  and released_at is null
                order by created_at desc
                limit (v_assigned_count - v_free_cap)
             );
          end if;
        end if;

        -- Record shortage in booking_at_risk
        insert into public.booking_at_risk (
          client_uuid,
          booking_id,
          booking_no,
          cause,
          product_id,
          product_name,
          resolution_notes,
          raised_by
        ) values (
          gen_random_uuid(),
          p_booking_id,
          v_booking.booking_no,
          'overbooking_shortage',
          v_line_rec.product_id,
          v_line_rec.description,
          format('%s short — sub-rent or swap', v_short_qty),
          v_actor
        );
      else
        update booking_lines
           set short_quantity = 0
         where id = v_line_rec.line_id;
      end if;
    else
      -- allow_overbooking is FALSE: fail closed if capacity is exceeded
      if v_line_rec.qty > v_free_cap then
        raise exception 'Reservation rejected: product "%" would have % units held at once, but stock on hand is %.',
          v_line_rec.description, v_line_rec.qty, v_free_cap;
      end if;

      update booking_lines
         set short_quantity = 0
       where id = v_line_rec.line_id;
    end if;
  end loop;

  -- 7. Insert the stage transition (which invokes triggers to move stage and write reservations)
  insert into booking_stage_transitions
    (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at, reason)
  values
    (p_client_uuid, p_booking_id, v_booking.branch_id, 'Quote', 'Booked', p_actor_id, v_role, v_occurred_at, p_reason);

  -- Read back counts of reservations committed
  select count(asset_id), coalesce(sum(qty), 0)
    into v_res_units, v_res_qty
    from inventory_reservations
   where booking_id = p_booking_id
     and released_at is null;

  return jsonb_build_object(
    'success', true,
    'booking_id', v_booking.id,
    'booking_no', v_booking.booking_no,
    'client_id', v_booking.client_id,
    'branch_id', v_booking.branch_id,
    'stage', 'Booked',
    'lines', v_line_count,
    'units_reserved', v_res_units,
    'quantity_reserved', v_res_qty
  );
end;
$$;

revoke execute on function public.confirm_booking_atomic(uuid, uuid, uuid, timestamptz, text) from public, anon;
grant execute on function public.confirm_booking_atomic(uuid, uuid, uuid, timestamptz, text) to authenticated;

commit;
