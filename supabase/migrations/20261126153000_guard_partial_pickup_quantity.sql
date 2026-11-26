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
