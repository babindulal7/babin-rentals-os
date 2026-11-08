-- 0222_repair_confirm_booking_atomic_and_reservation_dedup.sql
-- T3-smart-reservations / System Design Consistency Audit (5 Nov 2026)
--
-- Repairs two critical defects found during system design concurrency audit:
-- 1. confirm_booking_atomic (0188) omitted branch_id and actor_role when inserting into
--    booking_stage_transitions, causing a NOT NULL constraint violation crash.
-- 2. reservations_follow_stage_transition (0100) attempted to insert duplicate reservation rows
--    for units already reserved under a temporary hold (0188), causing GiST exclusion collision
--    against the booking's own hold.
--
-- Also ensures expired holds are reclaimed atomically before confirmation in all transition paths,
-- and active holds owned by the booking are cleanly promoted to confirmed.

begin;

-- ---------------------------------------------------------------------------
-- 1 ▸ Update reservations_follow_stage_transition
-- ---------------------------------------------------------------------------
create or replace function reservations_follow_stage_transition()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_pickup     timestamptz;
  v_return     timestamptz;
  v_period     tstzrange;
  v_booking_no text;
  v_uncovered  text;
begin
  -- ── Release paths ───────────────────────────────────────────────────────
  -- Returned and Closed end the commitment; Quote un-makes it.
  -- Filtered on `released_at is null` so Returned -> Closed is an idempotent no-op.
  if NEW.to_stage in ('Returned', 'Closed', 'Quote') then
    update inventory_reservations
       set released_at     = NEW.occurred_at,
           released_reason = case NEW.to_stage
             when 'Returned' then 'Released on Return: the booking reached Returned.'
             when 'Closed'   then 'Released on Close: the booking reached Closed.'
             else 'Released by a reversal back to Quote: a Quote holds nothing.'
           end
     where booking_id = NEW.booking_id
       and released_at is null;
    return NEW;
  end if;

  if NEW.to_stage <> 'Booked' then
    return NEW;
  end if;

  -- ── Booked: place or confirm the holds ──────────────────────────────────
  select pickup_at, return_at, booking_no
    into v_pickup, v_return, v_booking_no
    from bookings
   where id = NEW.booking_id;

  if v_pickup is null then
    raise exception
      'Reservation rejected: booking % could not be read, so its rental window is unknown.',
      NEW.booking_id;
  end if;

  -- Half-open [start, end), matching availability.ts
  v_period := tstzrange(v_pickup, v_return, '[)');

  -- 1. Reclaim expired temporary holds for affected assets/products
  update inventory_reservations
     set hold_state = 'expired_hold',
         released_at = NEW.occurred_at,
         released_reason = 'Hold expired automatically prior to confirmation'
   where hold_state = 'active_hold'
     and expires_at <= NEW.occurred_at
     and released_at is null
     and (
       asset_id in (
         select distinct blu.asset_id
           from booking_line_units blu
           join booking_lines bl on bl.id = blu.booking_line_id
          where bl.booking_id = NEW.booking_id
            and bl.voided_at is null
            and blu.released_at is null
       )
       or product_id in (
         select distinct bl.product_id
           from booking_lines bl
          where bl.booking_id = NEW.booking_id
            and bl.voided_at is null
            and bl.product_id is not null
       )
     );

  -- 2. Promote any existing active holds owned by this booking to confirmed
  update inventory_reservations
     set hold_state = 'confirmed',
         expires_at = null,
         period = v_period
   where booking_id = NEW.booking_id
     and hold_state = 'active_hold'
     and released_at is null;

  -- 3. Serialised: one row per live assigned unit (skipping units already reserved for this booking)
  insert into inventory_reservations
    (client_uuid, booking_id, booking_line_id, asset_id, qty, period, created_by, hold_state)
  select gen_random_uuid(), NEW.booking_id, bl.id, blu.asset_id, 1, v_period, NEW.actor_id, 'confirmed'
    from booking_lines bl
    join booking_line_units blu on blu.booking_line_id = bl.id
   where bl.booking_id = NEW.booking_id
     and bl.voided_at is null
     and blu.released_at is null
     and not exists (
       select 1 from inventory_reservations r
        where r.booking_id = NEW.booking_id
          and r.asset_id = blu.asset_id
          and r.released_at is null
     );

  -- 4. Quantity: remainder of each line not covered by live units or existing reservations
  insert into inventory_reservations
    (client_uuid, booking_id, booking_line_id, product_id, qty, period, created_by, hold_state)
  select gen_random_uuid(), NEW.booking_id, bl.id, bl.product_id,
         bl.qty - coalesce(u.n, 0) - coalesce(res.n, 0),
         v_period, NEW.actor_id, 'confirmed'
    from booking_lines bl
    left join lateral (
      select count(*) as n
        from booking_line_units blu
       where blu.booking_line_id = bl.id
         and blu.released_at is null
    ) u on true
    left join lateral (
      select coalesce(sum(r.qty), 0) as n
        from inventory_reservations r
       where r.booking_line_id = bl.id
         and r.product_id = bl.product_id
         and r.asset_id is null
         and r.released_at is null
    ) res on true
   where bl.booking_id = NEW.booking_id
     and bl.voided_at is null
     and bl.product_id is not null
     and (bl.qty - coalesce(u.n, 0) - coalesce(res.n, 0)) > 0;

  -- ── Coverage ────────────────────────────────────────────────────────────
  select string_agg(bl.description, ', ')
    into v_uncovered
    from booking_lines bl
   where bl.booking_id = NEW.booking_id
     and bl.voided_at is null
     and bl.product_id is not null
     and not exists (
       select 1 from inventory_reservations r
        where r.booking_line_id = bl.id
          and r.released_at is null
     );

  if v_uncovered is not null then
    raise exception
      'Reservation rejected: booking % reached Booked with no hold behind %. Nothing was booked.',
      coalesce(v_booking_no, NEW.booking_id::text), v_uncovered;
  end if;

  return NEW;
end;
$$;

comment on function reservations_follow_stage_transition() is
  'R-26 / 0100 / 0222: inventory_reservations is written by the database from the Booked transition '
  'and released on Returned/Closed/Quote reversal. Promotes existing active holds owned by this booking '
  'to confirmed, reclaims expired competitor holds, and avoids duplicate insertion.';

-- ---------------------------------------------------------------------------
-- 2 ▸ Update confirm_booking_atomic
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
  v_res_units       int;
  v_res_qty         int;
begin
  v_role := auth_user_role();
  if v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse') then
    raise exception 'Permission denied: role % cannot confirm bookings.', v_role
      using errcode = '42501';
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

  -- 7. Insert the stage transition with required branch_id and actor_role
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

comment on function confirm_booking_atomic is
  '0188 / 0222: Atomic, server-authoritative booking confirmation. Validates booking state, '
  'locks inventory in deterministic order, reclaims expired holds, transitions stage to Booked '
  'with branch_id and actor_role, and commits inventory reservations in one transaction.';

commit;
