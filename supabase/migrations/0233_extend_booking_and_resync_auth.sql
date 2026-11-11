-- Forward-only migration 0233: harden extend_booking authentication and revoke direct resync_draft_invoice
begin;

-- Revoke direct execution of resync_draft_invoice from all roles; definer-only.
revoke all on function public.resync_draft_invoice(uuid)
  from public, anon, authenticated;

create or replace function public.extend_booking(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking_id    uuid := (p_payload ->> 'booking_id')::uuid;
  v_days          integer := coalesce((p_payload ->> 'days')::integer, (p_payload ->> 'extension_days')::integer, 0);
  v_reason        text := btrim(coalesce(p_payload ->> 'reason', ''));
  -- Payload identities are untrusted hints; the audit actor must be the session.
  v_actor         uuid;
  v_claimed_actor uuid := nullif(p_payload ->> 'actor_id', '')::uuid;
  v_claimed_by    uuid := nullif(p_payload ->> 'extended_by', '')::uuid;
  v_role          system_role;
  v_booking       bookings%rowtype;
  v_now           timestamptz := now();
  v_old_return    timestamptz;
  v_new_return    timestamptz;
  v_client_uuid   uuid := nullif(coalesce(p_payload ->> 'client_uuid', ''), '')::uuid;
  v_resync        jsonb;
begin
  if v_booking_id is null then
    raise exception 'extend_booking: booking_id is required.';
  end if;

  if v_days < 1 then
    raise exception 'extend_booking: extension days must be at least 1 (got %).', v_days;
  end if;

  if char_length(v_reason) < 10 then
    raise exception
      'extend_booking: extension reason must be at least 10 characters (got % characters). State why the booking is being extended.',
      char_length(v_reason);
  end if;

  -- 1. Read booking
  select * into v_booking from bookings where id = v_booking_id;
  if not found then
    raise exception 'extend_booking: booking % does not exist.', v_booking_id;
  end if;

  if v_booking.cancelled_at is not null then
    raise exception 'extend_booking: booking % is cancelled and cannot be extended.', v_booking.booking_no;
  end if;

  if v_booking.closed_at is not null or v_booking.stage = 'Closed' then
    raise exception 'extend_booking: booking % is Closed and cannot be extended.', v_booking.booking_no;
  end if;

  if v_booking.stage = 'Returned' then
    raise exception 'extend_booking: booking % has already Returned and cannot be extended.', v_booking.booking_no;
  end if;

  if v_booking.stage not in ('Quote', 'Booked', 'Packed', 'On Rent') then
    raise exception 'extend_booking: booking % is at stage % and cannot be extended.', v_booking.booking_no, v_booking.stage;
  end if;

  -- 2. Role & permission validation (C+: Coordinator, Manager, Admin, Owner)
  v_role := auth_user_role();
  if v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise exception
      'extend_booking: this session (%) may not extend a booking. Coordinator, Manager, Admin and Owner only.',
      coalesce(v_role::text, 'unidentified')
      using errcode = '42501';
  end if;

  -- 3. Resolve actor from the same authenticated session used by the role gate.
  -- A caller cannot attribute an extension or its money recalculation to
  -- another user.
  v_actor := auth_user_id();
  if v_actor is null then
    raise exception 'extend_booking: an authenticated staff user is required.'
      using errcode = '42501';
  end if;
  if (v_claimed_actor is not null and v_claimed_actor is distinct from v_actor)
     or (v_claimed_by is not null and v_claimed_by is distinct from v_actor) then
    raise exception 'extend_booking: supplied actor does not match the authenticated session.'
      using errcode = '42501';
  end if;

  -- The Coordinator's booking-desk authority is site-scoped. SECURITY DEFINER
  -- bypasses row RLS, so verify booking ownership before any date, reservation,
  -- invoice, or audit writes. Owner/Admin retain their documented global scope.
  if v_role = 'Coordinator'
     and (auth_user_branch_id() is null
          or v_booking.branch_id is distinct from auth_user_branch_id()) then
    raise exception 'extend_booking: booking belongs to another branch.'
      using errcode = '42501';
  end if;

  -- 4. Calculate new return timestamp
  v_old_return := v_booking.return_at;
  v_new_return := v_old_return + (v_days || ' days')::interval;

  -- 5. Update bookings.return_at
  update bookings
     set return_at = v_new_return,
         updated_at = v_now
   where id = v_booking_id;

  -- 6. Update booking_lines days
  update booking_lines
     set days = days + v_days,
         updated_at = v_now
   where booking_id = v_booking_id
     and voided_at is null
     and days is not null;

  -- 7. Update inventory_reservations (GiST exclusion and capacity ceiling re-evaluate here)
  update inventory_reservations
     set period = tstzrange(lower(period), v_new_return, '[)')
   where booking_id = v_booking_id
     and released_at is null;

  -- 8. W15: the invoice follows the booking only while it is a Draft.
  --    resync_draft_invoice raises when there is no Draft (never created, e.g. a
  --    booking confirmed before 0200, or already numbered under W16), so call it
  --    only when one exists. A numbered invoice is not touched here (F5 guard);
  --    what to do after a change to a numbered invoice is O-14 / T3-14c, not
  --    decided in this function.
  if exists (select 1 from invoices where booking_id = v_booking_id and status = 'Draft') then
    v_resync := public.resync_draft_invoice(v_booking_id);
  end if;

  -- 9. Insert audit log
  insert into audit_events (
    client_uuid,
    event_class,
    module,
    category,
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
    coalesce(v_client_uuid, gen_random_uuid()),
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
      'return_at', v_old_return
    ),
    jsonb_build_object(
      'return_at', v_new_return,
      'days_added', v_days,
      'reason', v_reason
    ),
    v_reason
  );

  return jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'booking_no', v_booking.booking_no,
    'old_return_at', v_old_return,
    'new_return_at', v_new_return,
    'days_added', v_days,
    'invoice_resync', v_resync
  );
end;
$$;

commit;
