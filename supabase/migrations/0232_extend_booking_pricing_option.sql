-- 0232_extend_booking_pricing_option.sql
-- T3-17 / W41: Price of extra days on rental extension:
-- Two one-tap choices every time:
--   'same_rate'     — Same rate and discount as the booking (proportional discount carried forward)
--   'standard_rate' — Standard rate (catalog rate, no additional discount on extension days)

begin;

create or replace function public.extend_booking(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking_id      uuid := (p_payload ->> 'booking_id')::uuid;
  v_days            integer := coalesce((p_payload ->> 'days')::integer, (p_payload ->> 'extension_days')::integer, 0);
  v_reason          text := btrim(coalesce(p_payload ->> 'reason', ''));
  v_pricing_option  text := lower(btrim(coalesce(p_payload ->> 'pricing_option', 'same_rate')));
  v_actor           uuid := nullif(coalesce(p_payload ->> 'actor_id', p_payload ->> 'extended_by', ''), '')::uuid;
  v_role            system_role;
  v_booking         bookings%rowtype;
  v_now             timestamptz := now();
  v_old_return      timestamptz;
  v_new_return      timestamptz;
  v_client_uuid     uuid := nullif(coalesce(p_payload ->> 'client_uuid', ''), '')::uuid;
  v_resync          jsonb;
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

  if v_pricing_option not in ('same_rate', 'standard_rate') then
    raise exception
      'extend_booking: invalid pricing_option "%" (must be "same_rate" or "standard_rate").',
      v_pricing_option;
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

  -- 3. Resolve actor
  v_actor := coalesce(v_actor, auth.uid());
  if v_actor is null then
    select id into v_actor
      from users
     where primary_role in ('Owner', 'Admin', 'Manager', 'Coordinator')
       and is_active
     order by created_at
     limit 1;
  end if;

  if v_role is null and v_actor is not null then
    select primary_role into v_role from users where id = v_actor;
  end if;
  v_role := coalesce(v_role, 'Coordinator');

  -- 4. Calculate new return timestamp
  v_old_return := v_booking.return_at;
  v_new_return := v_old_return + (v_days || ' days')::interval;

  -- 5. Update bookings.return_at
  update bookings
     set return_at = v_new_return,
         updated_at = v_now
   where id = v_booking_id;

  -- 6. Update booking_lines days (and discount according to W41 pricing choice)
  if v_pricing_option = 'same_rate' then
    -- Same rate & discount: carry line discount forward proportionally
    update booking_lines
       set discount_amount = case
             when days > 0 and discount_amount is not null and discount_amount > 0 then
               round((discount_amount::numeric / days::numeric) * (days + v_days)::numeric, 2)
             else discount_amount
           end,
           days = days + v_days,
           updated_at = v_now
     where booking_id = v_booking_id
       and voided_at is null
       and days is not null;
  else
    -- Standard rate: extra days carry 0 additional discount (existing discount_amount stays unchanged)
    update booking_lines
       set days = days + v_days,
           updated_at = v_now
     where booking_id = v_booking_id
       and voided_at is null
       and days is not null;
  end if;

  -- 7. Update inventory_reservations (GiST exclusion and capacity ceiling re-evaluate here)
  update inventory_reservations
     set period = tstzrange(lower(period), v_new_return, '[)')
   where booking_id = v_booking_id
     and released_at is null;

  -- 8. W15: the invoice follows the booking only while it is a Draft.
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
      'pricing_option', v_pricing_option,
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
    'pricing_option', v_pricing_option,
    'invoice_resync', v_resync
  );
end;
$$;

comment on function public.extend_booking(jsonb) is
  '0232: Extends a booking by N days with W41 pricing option (same_rate vs standard_rate). '
  'Checks role permissions (C+), updates return_at, updates line days and discounts, '
  'expands inventory_reservations (triggering double-booking and capacity checks), and logs audit_events. '
  'With a Draft invoice: calls resync_draft_invoice to re-derive lines and totals (W15).';

revoke execute on function public.extend_booking(jsonb) from public, anon;
grant execute on function public.extend_booking(jsonb) to authenticated;

commit;
