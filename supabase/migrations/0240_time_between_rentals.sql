-- Migration 0240: Time between rentals (Account-wide or Per product) (T2-22)
-- =============================================================================
-- RULINGS: B11, B53; Law 1, Law 3, Law 6, Law 8
--
-- Settings ▸ Operations rules gets "Time between rentals: Account-wide · Per product".
-- - Account-wide uses today's rentalTurnaround setting ('Same-instant handover allowed' vs 'Turnaround required').
-- - Per product uses each product's prep_time_minutes and cleaning_time_minutes.
--   A unit returned at 18:00 with 120 cleaning minutes is free from 20:00.
--   A 09:00 pickup with 60 prep minutes needs the unit back by 08:00.
-- The reservation check widens the period at the database layer where reservations
-- are committed, so the database refuses a booking that is too close.
-- Existing reservations are not changed.
-- =============================================================================

begin;

-- 1. Helper function: get_effective_rental_window
create or replace function public.get_effective_rental_window(
  p_pickup timestamptz,
  p_return timestamptz,
  p_prep_minutes integer default 0,
  p_cleaning_minutes integer default 0
) returns tstzrange
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_mode text;
  v_turnaround text;
  v_prep interval;
  v_cleaning interval;
begin
  if p_pickup is null or p_return is null or p_return < p_pickup then
    return tstzrange(p_pickup, p_return, '[)');
  end if;

  -- Read organization setting (defaults to 'Account-wide' if row or key doesn't exist)
  select value#>>'{}' into v_mode
    from settings
   where key = 'timeBetweenRentals' and scope = 'org';

  if v_mode is null then
    v_mode := 'Account-wide';
  end if;

  if v_mode = 'Per product' then
    v_prep := (coalesce(p_prep_minutes, 0) || ' minutes')::interval;
    v_cleaning := (coalesce(p_cleaning_minutes, 0) || ' minutes')::interval;
    return tstzrange(p_pickup - v_prep, p_return + v_cleaning, '[)');
  else
    select value#>>'{}' into v_turnaround
      from settings
     where key = 'rentalTurnaround' and scope = 'org';

    if v_turnaround = 'Turnaround required' then
      return tstzrange(p_pickup, p_return, '[]');
    else
      return tstzrange(p_pickup, p_return, '[)');
    end if;
  end if;
end;
$$;

revoke all on function public.get_effective_rental_window(timestamptz, timestamptz, integer, integer) from public, anon;
grant execute on function public.get_effective_rental_window(timestamptz, timestamptz, integer, integer) to authenticated;

comment on function public.get_effective_rental_window(timestamptz, timestamptz, integer, integer) is
  'T2-22 / B11: Computes the effective reservation range given rental start/end, product prep and cleaning minutes, and the timeBetweenRentals setting.';


-- 2. Update reservations_follow_stage_transition to use get_effective_rental_window
create or replace function public.reservations_follow_stage_transition()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_pickup     timestamptz;
  v_return     timestamptz;
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

  -- 2. Promote any existing active holds owned by this booking to confirmed with widened period
  update inventory_reservations r
     set hold_state = 'confirmed',
         expires_at = null,
         period = public.get_effective_rental_window(v_pickup, v_return, p.prep_time_minutes, p.cleaning_time_minutes)
    from booking_lines bl
    join products p on p.id = bl.product_id
   where r.booking_id = NEW.booking_id
     and r.booking_line_id = bl.id
     and r.hold_state = 'active_hold'
     and r.released_at is null;

  -- 3. Serialised: one row per live assigned unit (skipping units already reserved for this booking)
  insert into inventory_reservations
    (client_uuid, booking_id, booking_line_id, asset_id, qty, period, created_by, hold_state)
  select gen_random_uuid(), NEW.booking_id, bl.id, blu.asset_id, 1,
         public.get_effective_rental_window(v_pickup, v_return, p.prep_time_minutes, p.cleaning_time_minutes),
         NEW.actor_id, 'confirmed'
    from booking_lines bl
    join products p on p.id = bl.product_id
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
         public.get_effective_rental_window(v_pickup, v_return, p.prep_time_minutes, p.cleaning_time_minutes),
         NEW.actor_id, 'confirmed'
    from booking_lines bl
    join products p on p.id = bl.product_id
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

comment on function public.reservations_follow_stage_transition() is
  'R-26 / 0100 / 0222 / 0240: inventory_reservations is written by the database from the Booked transition '
  'and released on Returned/Closed/Quote reversal. Promotes existing active holds owned by this booking '
  'to confirmed, reclaims expired competitor holds, applies turnaround/buffer periods, and avoids duplicate insertion.';


-- 3. Update create_or_extend_hold to compute effective rental window with buffer
create or replace function public.create_or_extend_hold(
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
  v_existing     inventory_reservations%rowtype;
  v_prep_min     int := 0;
  v_clean_min    int := 0;
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

  select coalesce(p.prep_time_minutes, 0), coalesce(p.cleaning_time_minutes, 0)
    into v_prep_min, v_clean_min
    from products p
   where p.id = v_line.product_id;

  v_period := public.get_effective_rental_window(v_booking.pickup_at, v_booking.return_at, v_prep_min, v_clean_min);

  if p_period is not null and p_period <> v_period and p_period <> tstzrange(v_booking.pickup_at, v_booking.return_at, '[)') then
    raise exception 'Hold period must match the booking rental period.';
  end if;
  v_expires_at := now() + (coalesce(p_duration_minutes, 240) || ' minutes')::interval;

  -- Law 8: retries must not reserve the same stock twice. The booking row
  -- was locked above, serializing duplicate requests on this booking.
  select * into v_existing
    from inventory_reservations
   where client_uuid = p_client_uuid
     for update;
  if found then
    if v_existing.created_by is distinct from v_actor_id
       or v_existing.booking_id is distinct from p_booking_id
       or v_existing.booking_line_id is distinct from p_booking_line_id
       or v_existing.asset_id is distinct from p_asset_id
       or v_existing.product_id is distinct from p_product_id
       or v_existing.qty is distinct from p_qty
       or (v_existing.period is distinct from v_period and v_existing.period is distinct from tstzrange(v_booking.pickup_at, v_booking.return_at, '[)')) then
      raise exception 'Hold idempotency key belongs to a different request.'
        using errcode = '23505';
    end if;
    if v_existing.hold_state <> 'active_hold'
       or v_existing.released_at is not null
       or v_existing.expires_at is null
       or v_existing.expires_at <= now() then
      raise exception 'Hold idempotency key was already consumed; start a new hold request.'
        using errcode = '23505';
    end if;
    return jsonb_build_object(
      'success', true,
      'reservation_id', v_existing.id,
      'hold_state', 'active_hold',
      'expires_at', v_existing.expires_at,
      'qty', v_existing.qty,
      'already_held', true
    );
  end if;

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
    'qty', coalesce(p_qty, 1),
    'already_held', false
  );
end;
$$;

revoke all on function public.create_or_extend_hold(uuid, uuid, uuid, uuid, int, tstzrange, int, uuid, uuid) from public, anon;
grant execute on function public.create_or_extend_hold(uuid, uuid, uuid, uuid, int, tstzrange, int, uuid, uuid) to authenticated;

comment on function public.create_or_extend_hold(uuid, uuid, uuid, uuid, int, tstzrange, int, uuid, uuid) is
  'R-26 / 0188 / 0232 / 0240: creates or updates a temporary inventory hold for a Quote, factoring in product prep and cleaning windows when in per-product mode.';

commit;
