-- RULING 2026-10-24: only a verified, persisted usable Return releases stock.
-- Extend 0174 to quantity receipts and keep genuine QC defects independent of
-- Reset completion. WRITTEN locally; never apply to hosted Supabase (N-5).
begin;

-- Only verified new receipts enter this private ledger. Historical movements
-- without inspection proof are never reclassified as usable inventory.
create table record_editor_private.verified_return_quantities (
  movement_id uuid primary key references session_line_movements(id),
  booking_line_id uuid not null references booking_lines(id),
  quantity_delta integer not null check (quantity_delta <> 0),
  inspected_at timestamptz not null,
  verified_by uuid not null references users(id)
);
alter table record_editor_private.verified_return_quantities enable row level security;
revoke all on record_editor_private.verified_return_quantities from public, anon, authenticated;

create or replace function record_editor_private.release_verified_return_holds(p_line uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  line_row booking_lines;
  original_quantity integer;
  received_quantity bigint;
  verified_quantity bigint;
  remaining_quantity integer;
  hold_row inventory_reservations;
  received_serials integer;
begin
  select * into line_row from booking_lines where id = p_line for update;
  if not found or line_row.product_id is null or line_row.voided_at is not null then return; end if;
  if not exists (select 1 from bookings where id = line_row.booking_id and stage = 'On Rent' and cancelled_at is null) then return; end if;
  -- RULING 2026-10-24: branch grants constrain every custody write, including
  -- partial receipts which deliberately leave the parent stage unchanged.
  if auth.uid() is null or not coalesce(auth_user_role()::text in ('Owner','Admin','Manager','Coordinator','Warehouse','Technician'),false) then
    raise exception 'Permission denied to release Return reservations.' using errcode = '42501';
  end if;
  perform public.assert_operation_branch_grant('return', line_row.booking_id);

  -- Uninspected records and missing/damaged outcomes cannot release a usable
  -- stock commitment. Match the actual Return session to the booking and line.
  update inventory_reservations ir
     set released_at = clock_timestamp(),
         released_reason = 'Released on Return: unit physically returned and inspected usable.'
    from booking_line_units blu, return_lines rl, operation_sessions os
   where blu.booking_line_id = p_line and blu.asset_id = ir.asset_id
     and ir.booking_line_id = p_line and ir.released_at is null
     and blu.returned_at is not null and blu.unit_state = 'Returned'
     and blu.condition in ('Excellent', 'Good', 'Fair')
     and rl.booking_line_id = p_line and rl.session_id = blu.return_session_id
     and rl.inspection_state = 'Inspected' and rl.inspected_at is not null
     and rl.condition in ('Excellent', 'Good', 'Fair')
     and os.id = rl.session_id and os.booking_id = line_row.booking_id
     and os.operation = 'Return' and os.state = 'Completed'
     and rl.inspected_at >= coalesce(os.started_at, os.created_at);

  original_quantity := greatest(0, line_row.qty - (
    select count(*)::integer from booking_line_units
     where booking_line_id = p_line and asset_id is not null and released_at is null
  ));
  -- Quantity movements contain the amount received in each pass, not an
  -- accumulated UI count. Replayed client_uuid inserts cannot be counted twice.
  select coalesce(sum(vq.quantity_delta), 0)
    into verified_quantity
    from record_editor_private.verified_return_quantities vq
   where vq.booking_line_id = p_line;
  select coalesce(sum(vq.quantity_delta),0) into received_quantity
    from record_editor_private.verified_return_quantities vq
    join session_line_movements sm on sm.id=vq.movement_id
    join operation_sessions os on os.id=sm.session_id
   where vq.booking_line_id=p_line and os.state='Completed';
  select count(*)::integer into received_serials from booking_line_units blu
    join operation_sessions os on os.id=blu.return_session_id
   where blu.booking_line_id=p_line and blu.asset_id is not null and blu.released_at is null
     and blu.returned_at is not null and blu.unit_state in ('Returned','Damaged')
     and os.operation='Return' and os.booking_id=line_row.booking_id;
  if received_serials + verified_quantity >= line_row.qty then
    update return_lines set state='Returned', returned_at=coalesce(returned_at,clock_timestamp()),
      not_returned_reason=null,not_returned_decision=null
     where booking_line_id=p_line and state <> 'Returned';
  elsif exists (select 1 from record_editor_private.verified_return_quantities
    where booking_line_id=p_line and quantity_delta<0) then
    update return_lines set state='Outstanding', returned_at=null
     where booking_line_id=p_line and state='Returned';
  end if;
  if original_quantity = 0 then return; end if;
  remaining_quantity := greatest(0, original_quantity - least(original_quantity, greatest(0, received_quantity))::integer);
  -- Never manufacture a replacement hold or revive an override/cancellation.
  -- The existing reservation rows, exclusion and product-capacity guard remain
  -- authoritative, and the adjustment commits with the receipt write.
  for hold_row in select * from inventory_reservations where booking_line_id = p_line
    and product_id = line_row.product_id and asset_id is null and released_at is null
    order by created_at, id for update
  loop
    if remaining_quantity = 0 then
      update inventory_reservations set released_at = clock_timestamp(),
        released_reason = 'Released on verified quantity Return.' where id = hold_row.id;
    elsif hold_row.qty > remaining_quantity then
      update inventory_reservations set qty = remaining_quantity where id = hold_row.id;
      remaining_quantity := 0;
    else
      remaining_quantity := remaining_quantity - hold_row.qty;
    end if;
  end loop;
  -- An append-only compensating movement can undo a quantity receipt. Restore
  -- only this return's own existing hold, with the capacity guard still active;
  -- never revive a hold released by cancellation or an overbooking override.
  if remaining_quantity > 0 and exists (
    select 1 from record_editor_private.verified_return_quantities
     where booking_line_id = p_line and quantity_delta < 0
  ) then
    select * into hold_row from inventory_reservations
     where booking_line_id = p_line and product_id = line_row.product_id and asset_id is null
       and (released_at is null or released_reason = 'Released on verified quantity Return.')
     order by (released_at is null) desc, created_at desc, id limit 1 for update;
    if found then
      update inventory_reservations
         set qty = case when hold_row.released_at is null then hold_row.qty + remaining_quantity else remaining_quantity end,
             released_at = null, released_reason = null
       where id = hold_row.id;
    end if;
  end if;
end; $$;
revoke all on function record_editor_private.release_verified_return_holds(uuid) from public, anon, authenticated;

create or replace function release_unit_reservation_on_unit_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform record_editor_private.release_verified_return_holds(new.booking_line_id);
  if new.released_at is not null and old.released_at is distinct from new.released_at then
    update inventory_reservations set released_at = new.released_at,
      released_reason = 'Released on Assignment Release: unit unassigned from booking line.'
     where booking_line_id = new.booking_line_id and asset_id = new.asset_id and released_at is null;
  end if;
  return new;
end; $$;
drop trigger if exists trg_booking_line_units_release_reservation on booking_line_units;
create trigger trg_booking_line_units_release_reservation
  after update of returned_at, released_at, return_session_id, condition, unit_state on booking_line_units
  for each row execute function release_unit_reservation_on_unit_change();

create or replace function release_reservations_on_verified_return_receipt()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  session_row operation_sessions;
  inspection return_lines;
  original_receipt record;
  reversed_quantity bigint;
  maximum_quantity integer;
  current_quantity bigint;
  v_delta integer;
begin
  if tg_table_name = 'session_line_movements' then
    select * into session_row from operation_sessions where id = new.session_id;
    if session_row.operation='Return' and session_row.state <> 'In Progress' then
      raise exception 'GATE:return.session.sealed|A completed Return cannot accept another receipt.';
    end if;
    if session_row.operation = 'Return' and new.unit_id is null and new.resulting_item_state = 'Returned' then
      if not exists(select 1 from bookings where id=session_row.booking_id and stage='On Rent' and cancelled_at is null) then
        raise exception 'GATE:return.quantity.stage|Quantity receipts require an active On Rent booking.';
      end if;
      perform 1 from booking_lines where id = new.booking_line_id and booking_id = session_row.booking_id for update;
      if not found then raise exception 'GATE:return.quantity.line|Receipt does not belong to this Return booking.'; end if;
      select * into inspection from return_lines where booking_line_id = new.booking_line_id
        and session_id = new.session_id and inspection_state = 'Inspected'
        and inspected_at >= coalesce(session_row.started_at, session_row.created_at)
        and condition in ('Excellent', 'Good', 'Fair');
      if not found then raise exception 'GATE:return.quantity.inspection|Inspect the received quantity before recording its usable Return.'; end if;
      if new.reverses_movement_id is not null then
        select * into original_receipt from record_editor_private.verified_return_quantities vq
         where vq.movement_id = new.reverses_movement_id and vq.booking_line_id = new.booking_line_id and vq.quantity_delta > 0;
        if not found then raise exception 'GATE:return.quantity.reversal|Only a verified receipt on the same line may be reversed.'; end if;
        select coalesce(sum(sm.qty),0) into reversed_quantity from session_line_movements sm
         where sm.reverses_movement_id = new.reverses_movement_id;
        if reversed_quantity > original_receipt.quantity_delta then
          raise exception 'GATE:return.quantity.reversal|A correction cannot exceed its original receipt.';
        end if;
      end if;
      select greatest(0, bl.qty - (select count(*)::integer from booking_line_units blu
        where blu.booking_line_id=bl.id and blu.asset_id is not null and blu.released_at is null))
        into maximum_quantity from booking_lines bl where bl.id=new.booking_line_id;
      select coalesce(sum(vq.quantity_delta),0) into current_quantity
        from record_editor_private.verified_return_quantities vq where vq.booking_line_id=new.booking_line_id;
      v_delta := case when new.reverses_movement_id is null then new.qty else -new.qty end;
      if current_quantity + v_delta < 0 or current_quantity + v_delta > maximum_quantity then
        raise exception 'GATE:return.quantity.bounds|Verified receipts cannot exceed the line quantity or reverse more than was received.';
      end if;
      insert into record_editor_private.verified_return_quantities(movement_id,booking_line_id,quantity_delta,inspected_at,verified_by)
        values(new.id,new.booking_line_id,v_delta,
          inspection.inspected_at,inspection.inspected_by);
    end if;
  end if;
  perform record_editor_private.release_verified_return_holds(new.booking_line_id);
  return new;
end; $$;
revoke all on function release_reservations_on_verified_return_receipt() from public, anon, authenticated;
create trigger trg_return_movement_releases_verified_quantity
  after insert on session_line_movements for each row
  execute function release_reservations_on_verified_return_receipt();
create trigger trg_return_inspection_releases_verified_stock
  after insert or update of inspection_state, inspected_at, condition on return_lines
  for each row execute function release_reservations_on_verified_return_receipt();

-- Seals are immutable. Exact idempotency conflicts do not insert another row;
-- changed facts must belong to a fresh, open Return pass.
create or replace function guard_verified_return_facts()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare s operation_sessions;
begin
  if tg_table_name='operation_sessions' then
    if old.operation='Return' and old.state='Completed' and new.state is distinct from old.state then
      raise exception 'GATE:return.session.sealed|A completed Return cannot be reopened.';
    end if;
  elsif tg_table_name='booking_line_units' then
    if row(new.returned_at,new.return_session_id,new.condition,new.unit_state)
      is not distinct from row(old.returned_at,old.return_session_id,old.condition,old.unit_state) then return new; end if;
    if exists(select 1 from operation_sessions where id=old.return_session_id and operation='Return' and state='Completed') then
      raise exception 'GATE:return.session.sealed|A completed Return receipt cannot be changed.';
    end if;
    if new.return_session_id is not null then
      select * into s from operation_sessions where id=new.return_session_id;
      if s.operation is distinct from 'Return' or s.state is distinct from 'In Progress'
        or not exists(select 1 from booking_lines where id=new.booking_line_id and booking_id=s.booking_id) then
        raise exception 'GATE:return.session.sealed|New Return facts require this booking''s open Return session.';
      end if;
    end if;
  else
    select * into s from operation_sessions where id=new.session_id;
    if s.operation='Return' and s.state <> 'In Progress' then
      raise exception 'GATE:return.session.sealed|Inspection facts require an open Return session.';
    end if;
    if exists(select 1 from record_editor_private.verified_return_quantities vq
      join session_line_movements sm on sm.id=vq.movement_id
      where sm.session_id=new.session_id and vq.booking_line_id=new.booking_line_id)
      and (new.inspection_state is distinct from 'Inspected' or new.inspected_at is null
        or not coalesce(new.condition in ('Excellent','Good','Fair'),false)) then
      raise exception 'GATE:return.quantity.retry|A persisted usable receipt cannot be changed on retry.';
    end if;
  end if;
  return new;
end; $$;
revoke all on function guard_verified_return_facts() from public,anon,authenticated;
create trigger trg_return_session_seal_immutable before update of state on operation_sessions
  for each row execute function guard_verified_return_facts();
create trigger trg_return_serial_facts_immutable before update of returned_at,return_session_id,condition,unit_state on booking_line_units
  for each row execute function guard_verified_return_facts();
create trigger trg_return_inspection_facts_open before insert or update of session_id,inspection_state,inspected_at,condition on return_lines
  for each row execute function guard_verified_return_facts();

-- Partial Return remains On Rent, so its commit point is the persisted session
-- seal. A failed seal rolls back its availability change; an interrupted open
-- session keeps its holds and can retry the original receipt safely.
create or replace function release_reservations_on_return_session_commit()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare line_id uuid;
begin
  if new.operation='Return' and new.state='Completed' and old.state is distinct from new.state then
    for line_id in select distinct booking_line_id from session_line_movements where session_id=new.id
      union select booking_line_id from booking_line_units where return_session_id=new.id
    loop
      perform record_editor_private.release_verified_return_holds(line_id);
    end loop;
  end if;
  return new;
end; $$;
revoke all on function release_reservations_on_return_session_commit() from public,anon,authenticated;
create trigger trg_return_session_commit_releases_reservations
  after update of state on operation_sessions for each row
  execute function release_reservations_on_return_session_commit();

-- A completed Reset stamp is task progress, never proof that a recorded QC
-- failure disappeared. The defect fields must themselves be cleared by QC.
create or replace function validate_unit_reservability()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare unit_row product_units;
begin
  if new.asset_id is null or new.released_at is not null then return new; end if;
  select * into unit_row from product_units where id = new.asset_id;
  if not found then raise exception 'GATE:unit.reserve.not_found|Unit does not exist in inventory.'; end if;
  if unit_row.retired_at is not null or unit_row.status = 'Retired' then
    raise exception 'GATE:unit.reserve.retired|Unit is retired and cannot be reserved.';
  end if;
  if unit_row.status = 'Maintenance' or exists (select 1 from maintenance_records where product_unit_id = new.asset_id and completed_at is null) then
    raise exception 'GATE:unit.reserve.maintenance|Unit is in maintenance and cannot be reserved.';
  end if;
  if unit_row.condition in ('Damaged', 'Lost') then
    raise exception 'GATE:unit.reserve.damaged_condition|Unit is damaged or lost and cannot be reserved.';
  end if;
  if exists (select 1 from damage_findings where unit_id = new.asset_id and voided_at is null) then
    raise exception 'GATE:unit.reserve.damage_finding|Unit has an unresolved damage finding.';
  end if;
  if exists (select 1 from cleaning_queue_entries where unit_id = new.asset_id
    and (nullif(btrim(qc_fail_reason), '') is not null or problem_state <> 'No Problems')) then
    raise exception 'GATE:unit.reserve.qc_defect|Unit has an unresolved QC defect.';
  end if;
  return new;
end; $$;

create or replace function public.read_verified_return_quantities(p_booking_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  if auth.uid() is null or not coalesce(auth_user_role()::text in ('Owner','Admin','Manager','Coordinator','Warehouse','Technician'),false) then
    raise exception 'Permission denied to read Return quantities.' using errcode='42501';
  end if;
  perform public.assert_operation_branch_grant('return',p_booking_id);
  select coalesce(jsonb_agg(jsonb_build_object('booking_line_id',bl.id,'returned_qty',
    coalesce((select sum(vq.quantity_delta) from record_editor_private.verified_return_quantities vq
      join session_line_movements sm on sm.id=vq.movement_id join operation_sessions os on os.id=sm.session_id
      where vq.booking_line_id=bl.id and os.state='Completed'),0)) order by bl.id),'[]'::jsonb)
    into result from booking_lines bl join products p on p.id=bl.product_id
   where bl.booking_id=p_booking_id and bl.voided_at is null and p.tracking_mode <> 'Consumable'
     and bl.line_type::text not in ('Service','Sub-rental','Manual item','service','sub_rental','sub-rental','manual_item','manual item');
  return result;
end; $$;
revoke all on function public.read_verified_return_quantities(uuid) from public,anon;
grant execute on function public.read_verified_return_quantities(uuid) to authenticated;
commit;
