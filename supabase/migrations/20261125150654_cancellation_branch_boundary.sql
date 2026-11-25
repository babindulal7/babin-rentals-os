-- #440 forward-only cancellation authorization repair; no fee or refund changes.
begin;

create or replace function public.cancel_booking(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking_id    uuid := (p_payload ->> 'booking_id')::uuid;
  v_reason        text := btrim(coalesce(p_payload ->> 'reason', ''));
  v_actor         uuid;
  v_role          public.system_role;
  v_booking       public.bookings%rowtype;
  v_now           timestamptz := now();
  v_client_uuid   uuid := nullif(coalesce(p_payload ->> 'client_uuid', ''), '')::uuid;
begin
  if v_booking_id is null then
    raise exception 'cancel_booking: booking_id is required.';
  end if;

  if char_length(v_reason) < 10 then
    raise exception
      'cancel_booking: cancellation reason must be at least 10 characters (got % characters). State why the booking is being cancelled.',
      char_length(v_reason);
  end if;

  -- 2. Role & permission validation (R-05, PERMISSIONS.md)
  v_role := public.auth_user_role();
  if v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise exception
      'cancel_booking: this session (%) may not cancel a booking. Coordinator, Manager, Admin and Owner only.',
      coalesce(v_role::text, 'unidentified')
      using errcode = '42501';
  end if;

  -- 3. Resolve actor strictly from authenticated session (never forgeable by caller)
  v_actor := public.auth_user_id();
  if v_actor is null then
    raise exception 'cancel_booking: an authenticated user is required to cancel a booking.'
      using errcode = '42501';
  end if;

  -- Authorization must precede lookup and state disclosure. Coordinator is
  -- branch-scoped (0233); retain Manager authority pending explicit ruling.
  select * into v_booking
    from public.bookings
   where id = v_booking_id
     and (v_role <> 'Coordinator' or branch_id = public.auth_user_branch_id())
   for update;
  if not found then
    raise exception 'cancel_booking: booking unavailable or access denied.'
      using errcode = '42501';
  end if;

  if v_booking.cancelled_at is not null then
    raise exception 'cancel_booking: booking % is already cancelled (at %).',
      v_booking.booking_no, v_booking.cancelled_at;
  end if;

  if v_booking.closed_at is not null or v_booking.stage = 'Closed' then
    raise exception 'cancel_booking: booking % is Closed and cannot be cancelled.', v_booking.booking_no;
  end if;

  if v_booking.stage in ('On Rent', 'Returned') then
    raise exception
      'cancel_booking: booking % is at stage % and cannot be cancelled. Gear in the field must be returned and settled.',
      v_booking.booking_no, v_booking.stage;
  end if;

  -- Check if any unit lines are picked up
  if exists (
    select 1 from public.booking_line_units blu
     join public.booking_lines bl on bl.id = blu.booking_line_id
     where bl.booking_id = v_booking_id
       and blu.unit_state = 'Picked Up'
  ) then
    raise exception 'cancel_booking: booking % has units already picked up and cannot be cancelled.', v_booking.booking_no;
  end if;

  if v_booking.stage = 'Packed' and v_role = 'Coordinator' then
    raise exception
      'cancel_booking: booking % is Packed. Cancelling a Packed booking requires Manager, Admin or Owner authority.',
      v_booking.booking_no
      using errcode = '42501';
  end if;

  -- 4. Update bookings row (SECURITY DEFINER bypasses reject_direct_booking_stage_write)
  update public.bookings
     set cancelled_at        = v_now,
         cancelled_by        = v_actor,
         cancellation_reason = v_reason,
         updated_at          = v_now
   where id = v_booking_id;

  -- 5. Record audit event
  if v_client_uuid is null then
    v_client_uuid := gen_random_uuid();
  end if;

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
    branch_id,
    old_values,
    new_values,
    reason
  ) values (
    v_client_uuid,
    'status change',
    'Rentals',
    'Rentals',
    'Update',
    'Informational',
    'Success',
    'bookings',
    v_booking_id,
    v_actor,
    v_role,
    v_booking.branch_id,
    jsonb_build_object(
      'cancelled_at', null,
      'stage', v_booking.stage
    ),
    jsonb_build_object(
      'cancelled_at', v_now,
      'cancelled_by', v_actor,
      'cancellation_reason', v_reason,
      'stage', v_booking.stage
    ),
    v_reason
  );

  return jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'booking_no', v_booking.booking_no,
    'cancelled_at', v_now,
    'cancelled_by', v_actor,
    'cancellation_reason', v_reason
  );
end;
$$;

revoke execute on function public.cancel_booking(jsonb) from anon, public;
grant execute on function public.cancel_booking(jsonb) to authenticated;

revoke execute on function public.cancel_booking(uuid, text, uuid) from anon, public;
grant execute on function public.cancel_booking(uuid, text, uuid) to authenticated;

commit;
