-- ============================================================================
-- 0188_smart_reservation_holds.sql
-- Smart Reservation, Expiring Temporary Holds & Atomic Confirmation (P0)
--
-- 1. inventory_reservations: add hold_state ('active_hold', 'expired_hold', 'confirmed', 'released')
--    and expires_at (timestamptz).
-- 2. Update GiST exclusion constraint inventory_reservations_no_double_booking
--    to include active_hold as well as confirmed reservations.
-- 3. Update enforce_inventory_reservation_capacity() to consider active_hold alongside confirmed.
-- 4. RPC confirm_booking_atomic: atomic server-authoritative confirmation with
--    deterministic row locking, automatic hold expiry reclamation, stage transition, and reservation commit.
-- 5. RPC create_or_extend_hold: create/renew scarce expiring inventory holds (default 4h).
-- 6. RPC release_hold: authorized hold release.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 ▸ Schema additions on inventory_reservations
-- ---------------------------------------------------------------------------
alter table inventory_reservations
  add column if not exists hold_state text not null default 'confirmed'
    check (hold_state in ('active_hold', 'expired_hold', 'confirmed', 'released')),
  add column if not exists expires_at timestamptz;

comment on column inventory_reservations.hold_state is
  'Lifecycle of this reservation: active_hold (temporary hold awaiting payment/contract), '
  'expired_hold (reclaimed hold after expiry), confirmed (binding commitment for Booked+), '
  'or released (freed by return, cancel, or manual release).';

comment on column inventory_reservations.expires_at is
  'Expiry instant for active_hold (default 4 hours from creation). NULL for confirmed reservations.';

-- ---------------------------------------------------------------------------
-- 2 ▸ Update GiST exclusion constraint on inventory_reservations
-- ---------------------------------------------------------------------------
alter table inventory_reservations
  drop constraint if exists inventory_reservations_no_double_booking;

alter table inventory_reservations
  add constraint inventory_reservations_no_double_booking
    exclude using gist (asset_id with =, period with &&)
    where (released_at is null and hold_state in ('confirmed', 'active_hold') and asset_id is not null);

-- ---------------------------------------------------------------------------
-- 3 ▸ Update capacity ceiling trigger to count active_hold
-- ---------------------------------------------------------------------------
create or replace function enforce_inventory_reservation_capacity()
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
begin
  -- Released or expired holds consume nothing
  if NEW.released_at is not null or NEW.hold_state in ('released', 'expired_hold') then
    return NEW;
  end if;

  if NEW.product_id is not null then
    v_product_id := NEW.product_id;
  else
    select pu.product_id into v_product_id
    from product_units pu
    where pu.id = NEW.asset_id;

    if v_product_id is null then
      raise exception
        'Reservation rejected: asset % does not resolve to a product.', NEW.asset_id;
    end if;
  end if;

  select p.tracking_mode, p.total_quantity
    into v_tracking_mode, v_total_quantity
  from products p
  where p.id = v_product_id
  for update;

  if not found then
    raise exception
      'Reservation rejected: product % does not exist.', v_product_id;
  end if;

  if v_tracking_mode = 'Serialised' then
    select count(*) into v_capacity
    from product_units pu
    where pu.product_id = v_product_id
      and pu.status not in ('Maintenance', 'Missing', 'Retired');
  else
    v_capacity := v_total_quantity;
  end if;

  with live as (
    select r.period, r.qty
    from inventory_reservations r
    where r.released_at is null
      and r.hold_state in ('confirmed', 'active_hold')
      and r.product_id = v_product_id
      and r.period && NEW.period
    union all
    select r.period, r.qty
    from inventory_reservations r
    join product_units pu on pu.id = r.asset_id
    where r.released_at is null
      and r.hold_state in ('confirmed', 'active_hold')
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

-- ---------------------------------------------------------------------------
-- 4 ▸ RPC confirm_booking_atomic
-- ---------------------------------------------------------------------------
create or replace function confirm_booking_atomic(
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
  v_prod_id         uuid;
  v_asset_id        uuid;
  v_res_units       int;
  v_res_qty         int;
  v_actor           uuid;
begin
  v_role := auth_user_role();
  if v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse') then
    raise exception 'Permission denied: role % cannot confirm bookings.', v_role
      using errcode = '42501';
  end if;

  -- A caller-provided actor is never an authorization credential.
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

  if v_booking.cancelled_at is not null then
    raise exception '% was cancelled. A cancelled booking cannot be confirmed.', v_booking.booking_no;
  end if;

  if v_booking.closed_at is not null then
    raise exception '% is Closed. A closed booking cannot be confirmed.', v_booking.booking_no;
  end if;

  if v_booking.stage <> 'Quote' then
    if v_booking.stage = 'Booked' then
      -- Idempotent duplicate check
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

  -- 7. Insert the stage transition (which invokes triggers to move stage and write reservations)
  insert into booking_stage_transitions
    (client_uuid, booking_id, from_stage, to_stage, actor_id, occurred_at, reason)
  values
    (p_client_uuid, p_booking_id, 'Quote', 'Booked', p_actor_id, v_occurred_at, p_reason);

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

comment on function confirm_booking_atomic is
  'Atomic, server-authoritative booking confirmation. Validates booking state, locks '
  'inventory in deterministic order, reclaims expired holds, transitions stage to Booked, '
  'and commits inventory reservations in one transaction.';

-- ---------------------------------------------------------------------------
-- 5 ▸ RPC create_or_extend_hold
-- ---------------------------------------------------------------------------
create or replace function create_or_extend_hold(
  p_booking_id        uuid,
  p_booking_line_id   uuid,
  p_asset_id          uuid default null,
  p_product_id        uuid default null,
  p_qty               int default 1,
  p_period            tstzrange default null,
  p_duration_minutes  int default 240,
  p_client_uuid       uuid default gen_random_uuid(),
  p_actor_id          uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role         text;
  v_expires_at   timestamptz;
  v_period       tstzrange;
  v_hold_id      uuid;
  v_actor_id     uuid;
  v_booking      record;
  v_line         record;
begin
  v_role := auth_user_role();
  if v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise exception 'Permission denied: role % cannot place inventory holds.', v_role
      using errcode = '42501';
  end if;

  -- Never trust an actor, product, period, or line identity supplied by the browser.
  v_actor_id := auth_user_id();
  if v_actor_id is null or (p_actor_id is not null and p_actor_id is distinct from v_actor_id) then
    raise exception 'Permission denied: hold actor must match the signed-in staff session.'
      using errcode = '42501';
  end if;
  if p_client_uuid is null then
    raise exception 'Hold idempotency key is required.';
  end if;
  if p_duration_minutes is not null and p_duration_minutes < 1 then
    raise exception 'Hold duration must be positive.';
  end if;
  if p_qty is null or p_qty < 1 then
    raise exception 'Hold quantity must be positive.';
  end if;
  if (p_asset_id is null) = (p_product_id is null) then
    raise exception 'Hold must reference exactly one asset or product.';
  end if;

  select b.branch_id, b.stage, b.pickup_at, b.return_at
    into v_booking
    from bookings b
   where b.id = p_booking_id
     for update;
  if not found then
    raise exception 'Cannot hold equipment for a missing booking.';
  end if;
  if v_booking.stage <> 'Quote' then
    raise exception 'Temporary inventory holds may only be created for a Quote.';
  end if;
  if v_role = 'Coordinator' and not exists (
    select 1 from users u
    where u.id = v_actor_id and u.branch_id is not distinct from v_booking.branch_id
  ) then
    raise exception 'Permission denied: booking belongs to another branch.'
      using errcode = '42501';
  end if;

  select bl.product_id, bl.qty
    into v_line
    from booking_lines bl
   where bl.id = p_booking_line_id
     and bl.booking_id = p_booking_id
     and bl.voided_at is null;
  if not found or v_line.product_id is null then
    raise exception 'Hold line is not an active equipment line on this booking.';
  end if;
  if p_qty > v_line.qty then
    raise exception 'Hold quantity exceeds the booking line quantity.';
  end if;
  if p_asset_id is not null and p_qty <> 1 then
    raise exception 'A single serialized asset hold must have quantity one.';
  end if;
  if p_product_id is not null and p_product_id is distinct from v_line.product_id then
    raise exception 'Hold product does not match its booking line.';
  end if;
  if p_asset_id is not null and not exists (
    select 1 from product_units pu
     where pu.id = p_asset_id and pu.product_id = v_line.product_id
  ) then
    raise exception 'Hold asset does not belong to its booking line product.';
  end if;

  if v_booking.pickup_at is null or v_booking.return_at is null
     or v_booking.return_at <= v_booking.pickup_at then
    raise exception 'Cannot create hold: booking rental period is incomplete.';
  end if;
  v_period := tstzrange(v_booking.pickup_at, v_booking.return_at, '[)');
  if p_period is not null and p_period <> v_period then
    raise exception 'Hold period must exactly match the booking rental period.';
  end if;
  v_expires_at := now() + (coalesce(p_duration_minutes, 240) || ' minutes')::interval;

  -- Reclaim expired holds on this asset/product first
  if p_asset_id is not null then
    update inventory_reservations
       set hold_state = 'expired_hold',
           released_at = now(),
           released_reason = 'Hold expired automatically'
     where asset_id = p_asset_id
       and hold_state = 'active_hold'
       and expires_at <= now()
       and released_at is null;
  elsif p_product_id is not null then
    update inventory_reservations
       set hold_state = 'expired_hold',
           released_at = now(),
           released_reason = 'Hold expired automatically'
     where product_id = p_product_id
       and hold_state = 'active_hold'
       and expires_at <= now()
       and released_at is null;
  end if;

  insert into inventory_reservations (
    client_uuid,
    booking_id,
    booking_line_id,
    asset_id,
    product_id,
    qty,
    period,
    state,
    hold_state,
    expires_at,
    created_by
  ) values (
    p_client_uuid,
    p_booking_id,
    p_booking_line_id,
    p_asset_id,
    p_product_id,
    coalesce(p_qty, 1),
    v_period,
    'Reserved',
    'active_hold',
    v_expires_at,
    v_actor_id
  )
  returning id into v_hold_id;

  return jsonb_build_object(
    'success', true,
    'reservation_id', v_hold_id,
    'hold_state', 'active_hold',
    'expires_at', v_expires_at,
    'qty', coalesce(p_qty, 1)
  );
end;
$$;

comment on function create_or_extend_hold is
  'Places or extends a scarce expiring inventory hold (default 4 hours) on a unit or product pool.';

-- ---------------------------------------------------------------------------
-- 6 ▸ RPC release_hold
-- ---------------------------------------------------------------------------
create or replace function release_hold(
  p_reservation_id uuid,
  p_reason         text default null,
  p_actor_id       uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role           text;
  v_actor          uuid;
  v_hold_state     text;
  v_booking_stage  text;
  v_branch_id      uuid;
begin
  v_role := auth_user_role();
  if v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse') then
    raise exception 'Permission denied: role % cannot release inventory holds.', v_role
      using errcode = '42501';
  end if;

  v_actor := auth_user_id();
  if v_actor is null or (p_actor_id is not null and p_actor_id is distinct from v_actor) then
    raise exception 'Permission denied: hold release actor must match the signed-in staff session.'
      using errcode = '42501';
  end if;

  -- Lock the reservation before deciding whether it is releasable. This
  -- endpoint releases temporary Quote holds, NEVER a committed reservation.
  select r.hold_state, b.stage::text, b.branch_id
    into v_hold_state, v_booking_stage, v_branch_id
    from inventory_reservations r
    join bookings b on b.id = r.booking_id
   where r.id = p_reservation_id
     and r.released_at is null
     for update of r;

  if not found then
    return jsonb_build_object('success', false, 'message', 'Hold not found or already released');
  end if;
  if v_hold_state <> 'active_hold' or v_booking_stage <> 'Quote' then
    raise exception 'Committed reservations cannot be manually released through release_hold.'
      using errcode = '42501';
  end if;
  if v_role in ('Coordinator', 'Warehouse') and not exists (
    select 1 from users u
     where u.id = v_actor and u.branch_id is not distinct from v_branch_id
  ) then
    raise exception 'Permission denied: hold belongs to another branch.'
      using errcode = '42501';
  end if;

  update inventory_reservations
     set hold_state = 'released',
         released_at = now(),
         released_reason = coalesce(nullif(btrim(p_reason), ''), 'Released manually by staff')
   where id = p_reservation_id
     and hold_state = 'active_hold'
     and released_at is null;

  if not found then
    return jsonb_build_object('success', false, 'message', 'Hold was already changed');
  end if;

  return jsonb_build_object('success', true, 'reservation_id', p_reservation_id);
end;
$$;

comment on function release_hold is
  'Explicitly and idempotently releases a live hold or reservation.';

-- ---------------------------------------------------------------------------
-- 7 ▸ Grants & Security Revocations
-- ---------------------------------------------------------------------------
revoke execute on function confirm_booking_atomic(uuid, uuid, uuid, timestamptz, text) from public, anon;
grant execute on function confirm_booking_atomic(uuid, uuid, uuid, timestamptz, text) to authenticated;

revoke execute on function create_or_extend_hold(uuid, uuid, uuid, uuid, int, tstzrange, int, uuid, uuid) from public, anon;
grant execute on function create_or_extend_hold(uuid, uuid, uuid, uuid, int, tstzrange, int, uuid, uuid) to authenticated;

revoke execute on function release_hold(uuid, text, uuid) from public, anon;
grant execute on function release_hold(uuid, text, uuid) to authenticated;

commit;
