begin;

-- ============================================================================
-- Migration 0237: Planned Equipment Downtime with a Reason (T2-21, B10, Law 3, Law 8)
-- ============================================================================

-- 1. inventory_reservations: allow null booking_id & booking_line_id for downtime holds
alter table public.inventory_reservations
  alter column booking_id drop not null,
  alter column booking_line_id drop not null;

-- 2. Add kind, downtime_reason, downtime_notes, ended_by
do $$
begin
  if not exists (select 1 from pg_type where typname = 'reservation_kind') then
    create type public.reservation_kind as enum ('booking', 'downtime');
  end if;
end $$;

alter table public.inventory_reservations
  add column if not exists kind public.reservation_kind not null default 'booking',
  add column if not exists downtime_reason text,
  add column if not exists downtime_notes text,
  add column if not exists ended_by uuid references public.users(id);

comment on column public.inventory_reservations.kind is
  'T2-21: Distinguishes commercial booking reservations from planned downtime holds.';

comment on column public.inventory_reservations.downtime_reason is
  'B10: One of Repair, Service or calibration, Our own shoot, Lent to a partner, Marketing shoot, Other.';

-- 3. Constraints on inventory_reservations for downtime integrity
alter table public.inventory_reservations
  drop constraint if exists inventory_reservations_kind_integrity,
  add constraint inventory_reservations_kind_integrity check (
    (kind = 'booking' and booking_id is not null and booking_line_id is not null and downtime_reason is null) or
    (kind = 'downtime' and booking_id is null and booking_line_id is null and downtime_reason is not null)
  );

alter table public.inventory_reservations
  drop constraint if exists inventory_reservations_downtime_reason_check,
  add constraint inventory_reservations_downtime_reason_check check (
    downtime_reason is null or downtime_reason in (
      'Repair',
      'Service or calibration',
      'Our own shoot',
      'Lent to a partner',
      'Marketing shoot',
      'Other'
    )
  );

alter table public.inventory_reservations
  drop constraint if exists inventory_reservations_downtime_other_requires_notes,
  add constraint inventory_reservations_downtime_other_requires_notes check (
    downtime_reason <> 'Other' or (downtime_notes is not null and length(trim(downtime_notes)) >= 3)
  );

-- 4. Update validate_unit_reservability trigger (preserving 0184 order & repair clearance):
-- Downtime represents scheduled maintenance/repair, so bypass active maintenance/damage finding checks
-- while preserving the check that prevents booking retired units.
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

  -- For downtime holds, skip active maintenance or damage finding blocks since downtime IS maintenance planning
  if new.kind = 'downtime' then
    return new;
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

-- 5. Update RLS policy to admit Technician (PERMISSIONS §4.3: maintenance.create C+ · Floor)
drop policy if exists inventory_reservations_all on public.inventory_reservations;
create policy inventory_reservations_all on public.inventory_reservations
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician'));

-- 6. RPC: plan_equipment_downtime
create or replace function public.plan_equipment_downtime(
  p_client_uuid uuid,
  p_asset_id uuid,
  p_product_id uuid,
  p_qty int,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_reason text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_period tstzrange;
  v_conflicting_booking text;
  v_reservation_id uuid;
  v_prod_id uuid;
begin
  -- Idempotency check (Law 8)
  select id into v_reservation_id
  from public.inventory_reservations
  where client_uuid = p_client_uuid;

  if v_reservation_id is not null then
    return jsonb_build_object('success', true, 'reservation_id', v_reservation_id, 'idempotent', true);
  end if;

  -- Permission check: maintenance.create (C+ · Floor: Owner, Admin, Manager, Coordinator, Warehouse, Technician)
  v_role := auth_user_role();
  if v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician') then
    raise exception 'FORBIDDEN: User role % cannot plan equipment downtime.', v_role;
  end if;

  if p_start_at >= p_end_at then
    raise exception 'INVALID_RANGE: Downtime start % must precede end %.', p_start_at, p_end_at;
  end if;

  v_period := tstzrange(p_start_at, p_end_at, '[)');

  -- Resolve product_id from unit if asset_id provided
  if p_asset_id is not null then
    select product_id into v_prod_id
    from public.product_units
    where id = p_asset_id;

    if v_prod_id is null then
      raise exception 'NOT_FOUND: Product unit % does not exist.', p_asset_id;
    end if;

    -- Check if booking holds this unit in that range to report friendly error (B10: "BK-1234 has it on those dates")
    select b.booking_no into v_conflicting_booking
    from public.inventory_reservations r
    join public.bookings b on b.id = r.booking_id
    where r.asset_id = p_asset_id
      and r.released_at is null
      and r.hold_state in ('confirmed', 'active_hold')
      and r.period && v_period
    limit 1;

    if v_conflicting_booking is not null then
      raise exception '% has it on those dates', v_conflicting_booking;
    end if;
  else
    v_prod_id := p_product_id;
    if v_prod_id is null then
      raise exception 'INVALID_INPUT: Either asset_id or product_id must be provided.';
    end if;
  end if;

  -- Insert downtime hold (GiST constraint and capacity ceiling natively protect)
  insert into public.inventory_reservations (
    client_uuid,
    asset_id,
    product_id,
    qty,
    period,
    state,
    hold_state,
    kind,
    downtime_reason,
    downtime_notes,
    created_by
  ) values (
    p_client_uuid,
    p_asset_id,
    case when p_asset_id is not null then null else v_prod_id end,
    coalesce(p_qty, 1),
    v_period,
    'Reserved',
    'confirmed',
    'downtime',
    p_reason,
    p_notes,
    auth_user_id()
  )
  returning id into v_reservation_id;

  -- Audit event (Law 8)
  insert into public.audit_events (
    client_uuid,
    action,
    table_name,
    record_id,
    actor_id,
    reason,
    new_values
  ) values (
    p_client_uuid,
    'Create',
    'inventory_reservations',
    v_reservation_id,
    auth_user_id(),
    p_reason,
    jsonb_build_object(
      'kind', 'planned_downtime',
      'asset_id', p_asset_id,
      'product_id', v_prod_id,
      'reason', p_reason,
      'period', v_period::text
    )
  );

  return jsonb_build_object('success', true, 'reservation_id', v_reservation_id);
end;
$$;

-- 7. RPC: end_equipment_downtime ("End now", Law 3)
create or replace function public.end_equipment_downtime(
  p_reservation_id uuid,
  p_client_uuid uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_res record;
begin
  select * into v_res
  from public.inventory_reservations
  where id = p_reservation_id and kind = 'downtime';

  if not found then
    raise exception 'NOT_FOUND: Planned downtime reservation % does not exist.', p_reservation_id;
  end if;

  if v_res.released_at is not null then
    return jsonb_build_object('success', true, 'already_ended', true);
  end if;

  v_role := auth_user_role();
  if v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician') then
    raise exception 'FORBIDDEN: User role % cannot end equipment downtime.', v_role;
  end if;

  update public.inventory_reservations
  set released_at = now(),
      released_reason = 'Ended early by staff',
      hold_state = 'released',
      ended_by = auth_user_id()
  where id = p_reservation_id;

  insert into public.audit_events (
    client_uuid,
    action,
    table_name,
    record_id,
    actor_id,
    reason,
    new_values
  ) values (
    p_client_uuid,
    'Update',
    'inventory_reservations',
    p_reservation_id,
    auth_user_id(),
    'Ended early by staff',
    jsonb_build_object(
      'kind', 'end_downtime_now',
      'asset_id', v_res.asset_id,
      'ended_at', now()
    )
  );

  return jsonb_build_object('success', true, 'ended_at', now());
end;
$$;

-- 8. Protect against anon exposure
revoke all on function public.plan_equipment_downtime from public;
grant execute on function public.plan_equipment_downtime to authenticated;

revoke all on function public.end_equipment_downtime from public;
grant execute on function public.end_equipment_downtime to authenticated;

commit;
