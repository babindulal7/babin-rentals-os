-- Migration 0184: Repair job closes damage finding and restores unit availability (T2-06, Ruling D4)
-- =============================================================================
-- Ruling D4 (26 Oct 2026): What puts a repaired unit back in stock is closing
-- the repair (Maintenance) job with a note, by a Technician or Manager+.
-- Closing marks the linked damage_findings row repaired (repaired_at, repaired_by)
-- and re-runs the unit status engine, restoring the unit's condition and making
-- the unit reservable again.
--
-- 1. Schema additions:
--    - damage_findings: repaired_at, repaired_by, repair_maintenance_id, repair_notes
--    - maintenance_records: damage_finding_id
-- 2. Grants:
--    - grant select on new non-money columns to authenticated
--    - update maintenance_records_all RLS policy to include Technician
-- 3. Masking views:
--    - update damage_findings_v with repaired_* fields appended
--    - update maintenance_records_v with damage_finding_id appended
-- 4. Status engine & reservability triggers:
--    - validate_unit_reservability: open finding check requires voided_at is null and repaired_at is null
--    - check_unit_reservability_on_insert: same
--    - recompute_unit_status: maintenance condition checks unrepaired findings
--    - trg_clear_damage_on_maintenance_complete: updates linked finding, resets condition, and triggers recompute
--    - trg_damage_findings_unit_status: triggers unit recompute on finding changes
-- 5. RPCs:
--    - close_maintenance_job(...) / complete_maintenance_job(...)
-- =============================================================================

begin;

-- 1. Schema additions
alter table public.damage_findings
  add column if not exists repaired_at timestamptz,
  add column if not exists repaired_by uuid references public.users (id),
  add column if not exists repair_maintenance_id uuid references public.maintenance_records (id) on delete set null,
  add column if not exists repair_notes text;

alter table public.maintenance_records
  add column if not exists damage_finding_id uuid references public.damage_findings (id) on delete set null;

create index if not exists idx_damage_findings_repaired_at on public.damage_findings (repaired_at);
create index if not exists idx_damage_findings_repair_maintenance on public.damage_findings (repair_maintenance_id);
create index if not exists idx_damage_findings_unit_unresolved on public.damage_findings (unit_id) where voided_at is null and repaired_at is null;
create index if not exists idx_maintenance_records_damage_finding on public.maintenance_records (damage_finding_id);

-- 2. Grants on new columns
grant select (repaired_at, repaired_by, repair_maintenance_id, repair_notes)
  on public.damage_findings to authenticated;

grant select (damage_finding_id)
  on public.maintenance_records to authenticated;

-- 3. Admit Technician to maintenance_records_all (Ruling D3/D4, PERMISSIONS §3)
drop policy if exists maintenance_records_all on public.maintenance_records;
create policy maintenance_records_all on public.maintenance_records
  for all
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  )
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  );

-- 4. Masking views (new columns appended at the end to satisfy CREATE OR REPLACE VIEW rules)
create or replace view public.damage_findings_v as
select
  id,
  client_uuid,
  source,
  return_line_id,
  cleaning_queue_entry_id,
  unit_id,
  damage_type,
  description,
  severity,
  case
    when auth_can_view_money() then estimated_cost
    else null::numeric
  end as estimated_cost,
  approval_state,
  approved_by,
  approved_at,
  disposition,
  case_id,
  charge_id,
  voided_at,
  created_at,
  created_by,
  updated_at,
  repaired_at,
  repaired_by,
  repair_maintenance_id,
  repair_notes
from public.damage_findings
where auth_is_staff();

revoke all on public.damage_findings_v from anon, public;
grant select on public.damage_findings_v to authenticated;

create or replace view public.maintenance_records_v as
select
  id,
  client_uuid,
  record_no,
  product_unit_id,
  maintenance_type,
  priority,
  status,
  description,
  findings,
  actions_taken,
  vendor_name,
  case when auth_can_view_money() then cost else null end as cost,
  scheduled_date,
  started_at,
  completed_at,
  performed_by,
  approved_by,
  created_at,
  created_by,
  updated_at,
  updated_by,
  damage_finding_id
from public.maintenance_records
where auth_is_staff();

revoke all on public.maintenance_records_v from anon, public;
grant select on public.maintenance_records_v to authenticated;

-- 5. Trigger to clear damage and update unit status when maintenance completes
create or replace function public.trg_clear_damage_on_maintenance_complete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_note text;
begin
  if new.status in ('Completed', 'Closed') and new.completed_at is not null
     and (old.completed_at is null or old.status not in ('Completed', 'Closed')) then

    v_actor := coalesce(auth.uid(), new.performed_by, new.updated_by);
    v_note := coalesce(new.actions_taken, new.description);

    -- A. Mark explicitly linked damage finding as repaired
    if new.damage_finding_id is not null then
      update public.damage_findings
      set repaired_at = coalesce(repaired_at, new.completed_at, now()),
          repaired_by = coalesce(repaired_by, v_actor),
          repair_maintenance_id = coalesce(repair_maintenance_id, new.id),
          repair_notes = coalesce(repair_notes, v_note),
          updated_at = now()
      where id = new.damage_finding_id
        and repaired_at is null;
    end if;

    -- B. Mark any damage findings referencing this maintenance record
    update public.damage_findings
    set repaired_at = coalesce(repaired_at, new.completed_at, now()),
        repaired_by = coalesce(repaired_by, v_actor),
        repair_notes = coalesce(repair_notes, v_note),
        updated_at = now()
    where repair_maintenance_id = new.id
      and repaired_at is null;

    -- C. Also clear any open damage findings on this specific unit if this was a Repair
    update public.damage_findings
    set repaired_at = coalesce(repaired_at, new.completed_at, now()),
        repaired_by = coalesce(repaired_by, v_actor),
        repair_maintenance_id = coalesce(repair_maintenance_id, new.id),
        repair_notes = coalesce(repair_notes, v_note),
        updated_at = now()
    where unit_id = new.product_unit_id
      and voided_at is null
      and repaired_at is null
      and (new.damage_finding_id is null or id = new.damage_finding_id);

    -- D. Restore unit condition from Damaged to Good
    update public.product_units
    set condition = 'Good',
        updated_at = now()
    where id = new.product_unit_id
      and condition = 'Damaged';

    -- E. Recompute unit status in inventory engine
    perform public.recompute_unit_status(new.product_unit_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_maintenance_clear_damage on public.maintenance_records;
create trigger trg_maintenance_clear_damage
  after update on public.maintenance_records
  for each row
  execute function public.trg_clear_damage_on_maintenance_complete();

-- Trigger on damage_findings for unit status engine
create or replace function public.trg_recompute_unit_status_on_damage_finding()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.unit_id is not null then
    perform public.recompute_unit_status(new.unit_id);
  end if;
  if old.unit_id is not null and old.unit_id is distinct from new.unit_id then
    perform public.recompute_unit_status(old.unit_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_damage_findings_unit_status on public.damage_findings;
create trigger trg_damage_findings_unit_status
  after insert or update of unit_id, voided_at, repaired_at or delete on public.damage_findings
  for each row
  execute function public.trg_recompute_unit_status_on_damage_finding();

-- 6. Reservability checks: specific damage finding check runs before general maintenance status
create or replace function public.validate_unit_reservability()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  unit_row public.product_units;
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

  -- 1. Unresolved damage finding check (specific finding clearance required)
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

create or replace function public.check_unit_reservability_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_unit_status text;
  v_unit_condition public.unit_condition;
  v_retired_at timestamptz;
begin
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

  -- 1. Unresolved damage finding check
  if exists (
    select 1 from public.damage_findings df
     where df.unit_id = NEW.asset_id
       and df.voided_at is null
       and df.repaired_at is null
  ) then
    raise exception 'GATE:unit.reserve.damage_finding|Unit % has an unresolved damage finding and cannot be reserved.', NEW.asset_id;
  end if;

  -- 2. Damaged/Lost condition check
  if v_unit_condition in ('Damaged', 'Lost') then
    raise exception 'GATE:unit.reserve.damaged_condition|Unit % is in % condition and cannot be reserved.', NEW.asset_id, v_unit_condition;
  end if;

  -- 3. Maintenance record/status check
  if v_unit_status = 'Maintenance' or exists (
    select 1 from public.maintenance_records mr
     where mr.product_unit_id = NEW.asset_id
       and mr.completed_at is null
  ) then
    raise exception 'GATE:unit.reserve.maintenance|Unit % is in maintenance and cannot be reserved.', NEW.asset_id;
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

-- 7. Update recompute_unit_status: maintenance condition checks unresolved damage findings
create or replace function public.recompute_unit_status(p_asset_id uuid)
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
  from public.product_units
  where id = p_asset_id;

  if not found then
    return null;
  end if;

  -- 1. Retired if product_units.retired_at is not null
  if v_retired_at is not null then
    v_new_status := 'Retired';

  -- 2. Missing if an open case links to this unit
  elsif exists (
    select 1 from public.cases c
    where c.type = 'Missing'
      and c.status not in ('Resolved', 'Closed', 'Cancelled')
      and (
        exists (
          select 1 from public.damage_findings df
          where df.case_id = c.id
            and df.unit_id = p_asset_id
            and df.voided_at is null
            and df.repaired_at is null
        )
        or
        (c.linked_booking_id is not null and exists (
          select 1 from public.booking_line_units blu
          join public.booking_lines bl on bl.id = blu.booking_line_id
          where bl.booking_id = c.linked_booking_id
            and blu.asset_id = p_asset_id
            and blu.unit_state = 'Missing'
        ))
      )
  ) then
    v_new_status := 'Missing';

  -- 3. Maintenance if an unfinished maintenance row exists OR unresolved damage finding exists
  elsif exists (
    select 1 from public.maintenance_records mr
    where mr.product_unit_id = p_asset_id
      and mr.completed_at is null
  ) or exists (
    select 1 from public.damage_findings df
    where df.unit_id = p_asset_id
      and df.voided_at is null
      and df.repaired_at is null
  ) then
    v_new_status := 'Maintenance';

  -- 4. On Rent if on a booking currently in On Rent stage AND not yet returned or released
  elsif exists (
    select 1 from public.booking_line_units blu
    join public.booking_lines bl on bl.id = blu.booking_line_id
    join public.bookings b on b.id = bl.booking_id
    where blu.asset_id = p_asset_id
      and b.stage = 'On Rent'
      and b.cancelled_at is null
      and blu.returned_at is null
      and blu.released_at is null
  ) then
    v_new_status := 'On Rent';

  -- 5. Returning if an unfinished Return session has accepted the unit but not completed
  elsif exists (
    select 1 from public.operation_sessions os
    where os.operation = 'Return'
      and os.state != 'Completed'
      and (
        exists (select 1 from public.session_line_movements slm where slm.session_id = os.id and slm.unit_id = p_asset_id)
        or exists (select 1 from public.booking_line_units blu where blu.return_session_id = os.id and blu.asset_id = p_asset_id)
      )
  ) then
    v_new_status := 'Returning';

  -- 6. Inspection if on a Returned booking with no completed inspection
  elsif exists (
    select 1 from public.booking_line_units blu
    join public.booking_lines bl on bl.id = blu.booking_line_id
    join public.bookings b on b.id = bl.booking_id
    where blu.asset_id = p_asset_id
      and b.stage = 'Returned'
      and b.cancelled_at is null
      and (
        blu.condition is null
        or exists (
          select 1 from public.return_lines rl
          where rl.booking_line_id = bl.id
            and (rl.inspection_state != 'Inspected' or rl.inspected_at is null)
        )
      )
  ) then
    v_new_status := 'Inspection';

  -- 7. Cleaning if in the cleaning queue and unfinished (cleaning_queue_entries.completed_at is null)
  elsif exists (
    select 1 from public.cleaning_queue_entries cqe
    where cqe.unit_id = p_asset_id
      and cqe.completed_at is null
  ) then
    v_new_status := 'Cleaning';

  -- 8. Packed if packed on a booking currently in Packed stage
  elsif exists (
    select 1 from public.booking_line_units blu
    join public.booking_lines bl on bl.id = blu.booking_line_id
    join public.bookings b on b.id = bl.booking_id
    where blu.asset_id = p_asset_id
      and b.stage = 'Packed'
      and b.cancelled_at is null
      and blu.packed = true
      and blu.released_at is null
  ) then
    v_new_status := 'Packed';

  -- 9. Reserved if a live inventory_reservations row covers now()
  elsif exists (
    select 1 from public.inventory_reservations ir
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
    update public.product_units
    set status = v_new_status,
        updated_at = now()
    where id = p_asset_id;
    perform set_config('app.unit_status_recompute', 'off', true);
  end if;

  return v_new_status;
end;
$$;

-- 8. close_maintenance_job RPC (Ruling D4)
create or replace function public.close_maintenance_job(
  p_maintenance_id uuid,
  p_note text,
  p_findings text default null,
  p_actions_taken text default null,
  p_cost numeric default null,
  p_unit_condition public.unit_condition default 'Good',
  p_client_uuid uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_record public.maintenance_records;
  v_role text;
  v_uid uuid;
  v_clean_note text;
  v_audit_uuid uuid;
  v_target_condition public.unit_condition;
begin
  v_uid := auth.uid();
  v_role := public.auth_user_role()::text;

  if v_uid is null or v_role not in ('Owner', 'Admin', 'Manager', 'Technician') then
    raise exception 'Permission denied: only Technician or Manager+ can close maintenance jobs.'
      using errcode = '42501';
  end if;

  v_clean_note := btrim(coalesce(p_actions_taken, p_note, ''));
  if length(v_clean_note) < 3 then
    raise exception 'A note/actions taken (minimum 3 characters) is required to close a maintenance job.';
  end if;

  select * into v_record from public.maintenance_records where id = p_maintenance_id for update;
  if not found then
    raise exception 'Maintenance job not found: %', p_maintenance_id;
  end if;

  if v_record.status in ('Completed', 'Closed') and v_record.completed_at is not null then
    raise exception 'Maintenance job % is already closed.', v_record.record_no;
  end if;

  v_target_condition := coalesce(p_unit_condition, 'Good'::public.unit_condition);

  -- Updating maintenance record with completed_at triggers trg_maintenance_clear_damage
  update public.maintenance_records
  set status = 'Completed',
      completed_at = now(),
      findings = coalesce(p_findings, findings),
      actions_taken = v_clean_note,
      cost = case
        when p_cost is not null and public.auth_can_view_money() then p_cost
        when p_cost is not null and v_role in ('Technician') then p_cost
        else cost
      end,
      performed_by = coalesce(performed_by, v_uid),
      updated_at = now(),
      updated_by = v_uid
  where id = p_maintenance_id;

  -- Restore custom condition if passed
  if v_target_condition <> 'Damaged' then
    update public.product_units
    set condition = v_target_condition,
        updated_at = now()
    where id = v_record.product_unit_id;
  end if;

  -- Recompute unit status (D4: unit becomes In Stock and reservable)
  perform public.recompute_unit_status(v_record.product_unit_id);

  -- Log audit event
  v_audit_uuid := coalesce(p_client_uuid, gen_random_uuid());
  insert into public.audit_events (
    client_uuid,
    event_class,
    category,
    module,
    action,
    severity,
    status,
    table_name,
    record_id,
    actor_id,
    actor_role,
    new_values
  ) values (
    v_audit_uuid,
    'status change',
    'Inventory'::audit_category,
    'Inventory'::audit_module,
    'Update'::audit_action,
    'Informational',
    'Success',
    'maintenance_records',
    p_maintenance_id,
    v_uid,
    auth_user_role(),
    jsonb_build_object(
      'status', 'Completed',
      'unit_id', v_record.product_unit_id,
      'unit_condition', v_target_condition,
      'actions_taken', v_clean_note
    )
  );

  return jsonb_build_object(
    'success', true,
    'id', p_maintenance_id,
    'record_no', v_record.record_no,
    'status', 'Completed'
  );
end;
$$;

revoke all on function public.close_maintenance_job(uuid, text, text, text, numeric, public.unit_condition, uuid) from anon, public;
grant execute on function public.close_maintenance_job(uuid, text, text, text, numeric, public.unit_condition, uuid) to authenticated;

-- complete_maintenance_job alias wrapper
create or replace function public.complete_maintenance_job(
  p_job_id uuid,
  p_actions_taken text,
  p_findings text default null,
  p_cost numeric default null,
  p_unit_condition public.unit_condition default 'Good',
  p_client_uuid uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return public.close_maintenance_job(
    p_job_id,
    p_actions_taken,
    p_findings,
    p_actions_taken,
    p_cost,
    p_unit_condition,
    p_client_uuid
  );
end;
$$;

revoke all on function public.complete_maintenance_job(uuid, text, text, numeric, public.unit_condition, uuid) from anon, public;
grant execute on function public.complete_maintenance_job(uuid, text, text, numeric, public.unit_condition, uuid) to authenticated;

commit;
