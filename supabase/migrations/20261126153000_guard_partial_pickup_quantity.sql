-- #443: serialize quantity pickups against the booked line and reject
-- movements that would take more than the line's booked quantity.
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
begin
  if NEW.unit_id is not null or NEW.reverses_movement_id is not null
     or NEW.resulting_item_state is distinct from 'Picked Up'::public.item_quantity_state then
    return NEW;
  end if;

  select operation, booking_id into v_operation, v_session_booking
    from public.operation_sessions where id = NEW.session_id;
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

  select coalesce(sum(m.qty), 0) - coalesce((
    select sum(reversal.qty)
      from public.session_line_movements reversal
      join public.session_line_movements original on original.id = reversal.reverses_movement_id
      join public.operation_sessions original_session on original_session.id = original.session_id
     where original.booking_line_id = NEW.booking_line_id
       and original_session.operation = 'Handover'
       and original.resulting_item_state = 'Picked Up'
  ), 0)
  into v_picked
  from public.session_line_movements m
  join public.operation_sessions s on s.id = m.session_id
  where m.booking_line_id = NEW.booking_line_id
    and s.operation = 'Handover'
    and m.resulting_item_state = 'Picked Up'
    and m.reverses_movement_id is null;

  if v_picked < 0 or v_picked + NEW.qty > v_required then
    raise exception 'Pickup quantity exceeds the remaining booked quantity.' using errcode = 'P0001';
  end if;
  return NEW;
end
$$;

create trigger trg_guard_quantity_pickup_total
before insert on public.session_line_movements
for each row execute function public.guard_quantity_pickup_total();
