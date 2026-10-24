-- =============================================================================
-- 0174 — RULING 2026-10-24: Release reservations on verified physical return.
--
-- ## What was wrong
--
-- Prior to this migration, `inventory_reservations` were released exclusively
-- when a whole booking transitioned stage (`to_stage in ('Returned','Closed','Quote')`
-- in `0100_reservations_written_by_transition.sql`).
--
-- In a partial return where Unit A is physically returned and verified usable
-- while Unit B remains on location, the parent booking correctly remains in
-- stage `'On Rent'`. However:
--
--   1. The original reservation hold for Unit A in `inventory_reservations`
--      retained `released_at IS NULL`.
--   2. The GiST exclusion constraint:
--        `exclude using gist (asset_id with =, period with &&) where (released_at is null and asset_id is not null)`
--      rejected any subsequent overlapping booking attempting to reserve Unit A
--      (`23P01`), even though Unit A was physically present and in usable condition.
--   3. In `recompute_unit_status(p_asset_id)` (0114), Rule 4 classified any unit
--      on an `'On Rent'` booking as `'On Rent'` without checking `blu.returned_at IS NULL`,
--      preventing the unit's inventory status from reflecting its return.
--
-- ## The rule (Ruling 2026-10-24, Brief v1.1)
--
--   - An individually verified, physically received usable unit becomes bookable
--     immediately after a persisted Return, even while Cleaning, QC or Reset tasks
--     are pending.
--   - Partial Return leaves the parent booking On Rent.
--   - Unreturned units remain held under the booking's original reservation.
--   - Units marked Damaged/Lost, under active Maintenance, Retired, or carrying
--     unresolved QC defects or un-voided Damage Findings remain strictly blocked.
--   - Reset completion or payment never silently clears a QC or damage finding.
--
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 ▸ Release unit reservation on physical return or assignment release.
-- ---------------------------------------------------------------------------
create or replace function release_unit_reservation_on_unit_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Physical return: unit returned_at was set or changed
  if NEW.returned_at is not null and (OLD.returned_at is null or OLD.returned_at is distinct from NEW.returned_at) then
    update public.inventory_reservations
       set released_at = coalesce(NEW.returned_at, clock_timestamp()),
           released_reason = case
             when NEW.unit_state = 'Damaged' or NEW.damaged = true then 'Released on Return: unit physically returned damaged.'
             when NEW.unit_state = 'Missing' then 'Released on Return: unit reported missing on return.'
             else 'Released on Return: unit physically returned.'
           end
     where booking_line_id = NEW.booking_line_id
       and asset_id = NEW.asset_id
       and released_at is null;
  end if;

  -- Assignment release: booking_line_units assignment ended before rental (§4.39a / 0076)
  if NEW.released_at is not null and (OLD.released_at is null or OLD.released_at is distinct from NEW.released_at) then
    update public.inventory_reservations
       set released_at = coalesce(NEW.released_at, clock_timestamp()),
           released_reason = 'Released on Assignment Release: unit unassigned from booking line.'
     where booking_line_id = NEW.booking_line_id
       and asset_id = NEW.asset_id
       and released_at is null;
  end if;

  return NEW;
end;
$$;

comment on function release_unit_reservation_on_unit_change() is
  'RULING 2026-10-24: Releases the active inventory_reservations row for a physical '
  'unit when its booking_line_units row records a physical return (returned_at) or '
  'an assignment release (released_at). Unreturned units on the same booking line '
  'or parent booking remain held.';

drop trigger if exists trg_booking_line_units_release_reservation on booking_line_units;
create trigger trg_booking_line_units_release_reservation
  after update of returned_at, released_at on booking_line_units
  for each row
  execute function release_unit_reservation_on_unit_change();


-- ---------------------------------------------------------------------------
-- 2 ▸ Guard against reserving units that are damaged, defective, or in maintenance.
-- ---------------------------------------------------------------------------
create or replace function validate_unit_reservability()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_unit_status public.inventory_state;
  v_unit_condition public.unit_condition;
  v_retired_at timestamptz;
begin
  -- Only validate active serialised reservations
  if NEW.asset_id is null or NEW.released_at is not null then
    return NEW;
  end if;

  select status, condition, retired_at
    into v_unit_status, v_unit_condition, v_retired_at
    from public.product_units
   where id = NEW.asset_id;

  if not found then
    raise exception 'GATE:unit.reserve.not_found|Unit % does not exist in inventory.', NEW.asset_id;
  end if;

  if v_retired_at is not null or v_unit_status = 'Retired' then
    raise exception 'GATE:unit.reserve.retired|Unit % is retired and cannot be reserved.', NEW.asset_id;
  end if;

  if v_unit_status = 'Maintenance' or exists (
    select 1 from public.maintenance_records mr
     where mr.product_unit_id = NEW.asset_id
       and mr.completed_at is null
  ) then
    raise exception 'GATE:unit.reserve.maintenance|Unit % is in maintenance and cannot be reserved.', NEW.asset_id;
  end if;

  if v_unit_condition in ('Damaged', 'Lost') then
    raise exception 'GATE:unit.reserve.damaged_condition|Unit % is in % condition and cannot be reserved.', NEW.asset_id, v_unit_condition;
  end if;

  if exists (
    select 1 from public.damage_findings df
     where df.unit_id = NEW.asset_id
       and df.voided_at is null
  ) then
    raise exception 'GATE:unit.reserve.damage_finding|Unit % has an unresolved damage finding and cannot be reserved.', NEW.asset_id;
  end if;

  if exists (
    select 1 from public.cleaning_queue_entries cqe
     where cqe.unit_id = NEW.asset_id
       and (cqe.qc_fail_reason is not null or cqe.problem_state not in ('No Problems'))
       and cqe.reset_completed_at is null
  ) then
    raise exception 'GATE:unit.reserve.qc_defect|Unit % has an unresolved QC defect and cannot be reserved.', NEW.asset_id;
  end if;

  return NEW;
end;
$$;

comment on function validate_unit_reservability() is
  'RULING 2026-10-24: Ensures units with active damage findings, QC defects, uncompleted '
  'maintenance, or retired status cannot receive new active reservations in inventory_reservations.';

drop trigger if exists trg_validate_unit_reservability on inventory_reservations;
create trigger trg_validate_unit_reservability
  before insert or update of asset_id, released_at on inventory_reservations
  for each row
  execute function validate_unit_reservability();


-- ---------------------------------------------------------------------------
-- 3 ▸ Update recompute_unit_status to respect partial return.
-- ---------------------------------------------------------------------------
create or replace function recompute_unit_status(p_asset_id uuid)
returns inventory_state
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new_status inventory_state;
  v_old_status inventory_state;
  v_retired_at timestamptz;
begin
  select status, retired_at into v_old_status, v_retired_at
  from product_units
  where id = p_asset_id;

  if not found then
    return null;
  end if;

  -- 1. Retired if product_units.retired_at is not null
  if v_retired_at is not null then
    v_new_status := 'Retired';

  -- 2. Missing if an open case links to this unit
  elsif exists (
    select 1 from cases c
    where c.type = 'Missing'
      and c.status not in ('Resolved', 'Closed', 'Cancelled')
      and (
        exists (select 1 from damage_findings df where df.case_id = c.id and df.unit_id = p_asset_id and df.voided_at is null)
        or
        (c.linked_booking_id is not null and exists (
          select 1 from booking_line_units blu
          join booking_lines bl on bl.id = blu.booking_line_id
          where bl.booking_id = c.linked_booking_id
            and blu.asset_id = p_asset_id
            and blu.unit_state = 'Missing'
        ))
      )
  ) then
    v_new_status := 'Missing';

  -- 3. Maintenance if an unfinished maintenance row exists
  elsif exists (
    select 1 from maintenance_records mr
    where mr.product_unit_id = p_asset_id
      and mr.completed_at is null
  ) then
    v_new_status := 'Maintenance';

  -- 4. On Rent if on a booking currently in On Rent stage AND not yet returned or released
  elsif exists (
    select 1 from booking_line_units blu
    join booking_lines bl on bl.id = blu.booking_line_id
    join bookings b on b.id = bl.booking_id
    where blu.asset_id = p_asset_id
      and b.stage = 'On Rent'
      and b.cancelled_at is null
      and blu.returned_at is null
      and blu.released_at is null
  ) then
    v_new_status := 'On Rent';

  -- 5. Returning if an unfinished Return session has accepted the unit but not completed
  elsif exists (
    select 1 from operation_sessions os
    where os.operation = 'Return'
      and os.state != 'Completed'
      and (
        exists (select 1 from session_line_movements slm where slm.session_id = os.id and slm.unit_id = p_asset_id)
        or exists (select 1 from booking_line_units blu where blu.return_session_id = os.id and blu.asset_id = p_asset_id)
      )
  ) then
    v_new_status := 'Returning';

  -- 6. Inspection if on a Returned booking with no completed inspection
  elsif exists (
    select 1 from booking_line_units blu
    join booking_lines bl on bl.id = blu.booking_line_id
    join bookings b on b.id = bl.booking_id
    where blu.asset_id = p_asset_id
      and b.stage = 'Returned'
      and b.cancelled_at is null
      and (
        blu.condition is null
        or exists (
          select 1 from return_lines rl
          where rl.booking_line_id = bl.id
            and (rl.inspection_state != 'Inspected' or rl.inspected_at is null)
        )
      )
  ) then
    v_new_status := 'Inspection';

  -- 7. Cleaning if in the cleaning queue and unfinished (cleaning_queue_entries.completed_at is null)
  elsif exists (
    select 1 from cleaning_queue_entries cqe
    where cqe.unit_id = p_asset_id
      and cqe.completed_at is null
  ) then
    v_new_status := 'Cleaning';

  -- 8. Packed if packed on a booking currently in Packed stage
  elsif exists (
    select 1 from booking_line_units blu
    join booking_lines bl on bl.id = blu.booking_line_id
    join bookings b on b.id = bl.booking_id
    where blu.asset_id = p_asset_id
      and b.stage = 'Packed'
      and b.cancelled_at is null
      and blu.packed = true
      and blu.released_at is null
  ) then
    v_new_status := 'Packed';

  -- 9. Reserved if a live inventory_reservations row covers now()
  elsif exists (
    select 1 from inventory_reservations ir
    where ir.asset_id = p_asset_id
      and ir.released_at is null
      and ir.period @> now()
  ) then
    v_new_status := 'Reserved';

  -- 10. Default: In Stock
  else
    v_new_status := 'In Stock';
  end if;

  -- Writes the result into product_units.status using transaction-scoped GUC
  if v_old_status is distinct from v_new_status then
    perform set_config('app.unit_status_recompute', 'on', true);
    update product_units
    set status = v_new_status,
        updated_at = now()
    where id = p_asset_id;
    perform set_config('app.unit_status_recompute', 'off', true);
  end if;

  return v_new_status;
end;
$$;

comment on function recompute_unit_status(uuid) is
  'RULING 2026-10-24: Updates unit status engine with partial return support. Units on an '
  'On Rent booking that have already been physically returned (returned_at is not null) are '
  'no longer classified as On Rent.';

commit;
