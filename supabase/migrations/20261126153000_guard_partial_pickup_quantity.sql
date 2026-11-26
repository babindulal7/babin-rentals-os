-- #443: serialize quantity pickups against the booked line and reject
-- movements that would take more than the line's booked quantity.
create index idx_session_line_movements_reverses
  on public.session_line_movements (reverses_movement_id)
  where reverses_movement_id is not null;

-- The read model uses the same original-and-correction arithmetic as the
-- guard. It carries only booking-line identifiers and physical quantities;
-- security_invoker preserves both source tables' row-level policies.
create view public.handover_pickup_totals
with (security_invoker = true) as
select m.booking_line_id,
       sum(m.qty - coalesce(r.reversed_qty, 0))::bigint as picked_qty
  from public.session_line_movements m
  join public.operation_sessions s on s.id = m.session_id
  left join lateral (
    select sum(reversal.qty) as reversed_qty
      from public.session_line_movements reversal
     where reversal.reverses_movement_id = m.id
  ) r on true
 where s.operation = 'Handover'
   and m.resulting_item_state = 'Picked Up'
   and m.reverses_movement_id is null
 group by m.booking_line_id;

revoke all on public.handover_pickup_totals from public, anon;
grant select on public.handover_pickup_totals to authenticated;

-- Only an open session with an unreversed pickup can be finished without new
-- marks. Aggregation keeps the query bounded to one row per session.
create view public.handover_resumable_sessions
with (security_invoker = true) as
select s.id as session_id, s.booking_id
  from public.operation_sessions s
  join public.session_line_movements m on m.session_id = s.id
  left join lateral (
    select coalesce(sum(reversal.qty), 0) as reversed_qty
      from public.session_line_movements reversal where reversal.reverses_movement_id = m.id
  ) r on true
 where s.operation = 'Handover' and s.state = 'In Progress'
   and m.resulting_item_state = 'Picked Up' and m.reverses_movement_id is null
 group by s.id, s.booking_id
having sum(m.qty - r.reversed_qty) > 0;
revoke all on public.handover_resumable_sessions from public, anon;
grant select on public.handover_resumable_sessions to authenticated;

create function public.guard_quantity_pickup_total()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_required integer;
  v_booking_id uuid;
  v_session_booking uuid;
  v_operation public.operation_kind;
  v_picked bigint;
  v_original_line uuid;
  v_original_booking uuid;
  v_original_qty integer;
  v_reversed bigint;
begin
  select operation, booking_id into v_operation, v_session_booking
    from public.operation_sessions where id = NEW.session_id;

  if NEW.reverses_movement_id is not null then
    select m.booking_line_id, s.booking_id, m.qty
      into v_original_line, v_original_booking, v_original_qty
      from public.session_line_movements m
      join public.operation_sessions s on s.id = m.session_id
     where m.id = NEW.reverses_movement_id
       and m.reverses_movement_id is null
       and s.operation = 'Handover'
       and m.resulting_item_state = 'Picked Up';
    if v_original_line is null then
      return NEW;
    end if;
    perform 1 from public.bookings where id = v_original_booking for update;
    perform 1 from public.booking_lines where id = v_original_line for update;
    if NEW.booking_line_id is distinct from v_original_line
       or v_session_booking is distinct from v_original_booking then
      raise exception 'Pickup correction must refer to the same booking line.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.session_line_movements where client_uuid = NEW.client_uuid) then
      return NEW;
    end if;
    select coalesce(sum(qty), 0) into v_reversed
      from public.session_line_movements where reverses_movement_id = NEW.reverses_movement_id;
    if v_reversed + NEW.qty > v_original_qty then
      raise exception 'Pickup correction exceeds the original movement quantity.' using errcode = 'P0001';
    end if;
    return NEW;
  end if;

  if NEW.resulting_item_state is distinct from 'Picked Up'::public.item_quantity_state then
    return NEW;
  end if;
  if v_operation is distinct from 'Handover'::public.operation_kind then
    return NEW;
  end if;

  -- Match the existing cancellation/pickup guard's booking-first lock order.
  perform 1 from public.bookings where id = v_session_booking for update;
  select qty, booking_id into v_required, v_booking_id
    from public.booking_lines where id = NEW.booking_line_id for update;
  if v_required is null or v_booking_id is distinct from v_session_booking then
    raise exception 'Pickup quantity cannot be verified for this booking line.' using errcode = 'P0001';
  end if;

  -- Preserve idempotent retries. The existing unique key resolves the conflict.
  if exists (select 1 from public.session_line_movements where client_uuid = NEW.client_uuid) then
    return NEW;
  end if;

  if NEW.unit_id is not null or nullif(NEW.serial, '') is not null then
    if NEW.qty <> 1 then
      raise exception 'A pickup for a specific unit must have quantity one.' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.session_line_movements m
      join public.operation_sessions s on s.id = m.session_id
      where m.booking_line_id = NEW.booking_line_id
        and s.operation = 'Handover' and m.resulting_item_state = 'Picked Up'
        and m.reverses_movement_id is null
        and ((NEW.unit_id is not null and m.unit_id = NEW.unit_id)
          or (nullif(NEW.serial, '') is not null and m.serial = NEW.serial))
        and m.qty > coalesce((select sum(r.qty) from public.session_line_movements r
          where r.reverses_movement_id = m.id), 0)
    ) then
      raise exception 'This unit was already recorded for pickup.' using errcode = 'P0001';
    end if;
  end if;

  select coalesce((select picked_qty from public.handover_pickup_totals
    where booking_line_id = NEW.booking_line_id), 0) into v_picked;

  if v_picked < 0 or v_picked + NEW.qty > v_required then
    raise exception 'Pickup quantity exceeds the remaining booked quantity.' using errcode = 'P0001';
  end if;
  return NEW;
end
$$;

create trigger trg_guard_quantity_pickup_total
before insert on public.session_line_movements
for each row execute function public.guard_quantity_pickup_total();

-- Commit the line projection in the same transaction as its physical
-- movement. An interrupted client can then reload without a missing line.
create function public.sync_handover_line_from_pickup()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_line uuid;
  v_session uuid;
  v_actor uuid;
  v_required integer;
  v_picked bigint;
  v_state public.handover_line_state;
begin
  if NEW.reverses_movement_id is null then
    if NEW.resulting_item_state is distinct from 'Picked Up'::public.item_quantity_state
       or not exists (select 1 from public.operation_sessions where id = NEW.session_id and operation = 'Handover') then
      return NEW;
    end if;
    v_line := NEW.booking_line_id;
    v_session := NEW.session_id;
    v_actor := NEW.created_by;
  else
    select m.booking_line_id, m.session_id, m.created_by
      into v_line, v_session, v_actor
      from public.session_line_movements m
      join public.operation_sessions s on s.id = m.session_id
     where m.id = NEW.reverses_movement_id and m.reverses_movement_id is null
       and m.resulting_item_state = 'Picked Up' and s.operation = 'Handover';
    if v_line is null then return NEW; end if;
  end if;
  select qty into v_required from public.booking_lines where id = v_line;
  select coalesce((select picked_qty from public.handover_pickup_totals where booking_line_id = v_line), 0)
    into v_picked;
  v_state := case when v_picked = v_required then 'Picked Up'::public.handover_line_state
                  else 'Remaining'::public.handover_line_state end;
  insert into public.handover_lines
    (client_uuid, booking_line_id, state, qty_required, first_session_id, completed_session_id, picked_up_at, created_by)
  values
    (gen_random_uuid(), v_line, v_state, v_required, v_session,
     case when v_state = 'Picked Up' then NEW.session_id end,
     case when v_state = 'Picked Up' then NEW.moved_at end, v_actor)
  on conflict (booking_line_id) do update
    set state = excluded.state, qty_required = excluded.qty_required,
        completed_session_id = excluded.completed_session_id, picked_up_at = excluded.picked_up_at,
        updated_at = now();
  return NEW;
end
$$;

create trigger trg_sync_handover_line_from_pickup
after insert on public.session_line_movements
for each row execute function public.sync_handover_line_from_pickup();
