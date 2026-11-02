-- =============================================================================
-- Migration 0205: extend_booking must not require a Draft invoice (T3-14b fix)
--
-- 0200 replaced extend_booking's "update the Draft invoice's lines, if there is
-- one" with an unconditional call to resync_draft_invoice. That function raises
-- "no Draft invoice for booking N" when the booking has none, so extending a
-- rental failed for every booking without a Draft:
--   - a booking confirmed before 0200 (0200 creates the Draft only on
--     Quote -> Booked and has no backfill);
--   - a booking whose invoice is already numbered (W16: numbered on full payment).
--
-- Caught by `npm run check:anon`:
--   "Owner can extend an On Rent booking (resync_draft_invoice: no Draft invoice
--    for booking 864.)"
-- check:pglite and check:lifecycle did not catch it: neither extended a booking
-- that has no Draft. This migration adds that case to check:lifecycle (L67).
--
-- Fix: the function is otherwise identical to 0200. Step 8 now calls
-- resync_draft_invoice only when a Draft exists (W15: the Draft follows the
-- booking while it stays a Draft). With no Draft, invoice_resync is null and no
-- invoice is touched. That is what 0193 did before 0200, and what 0200's own
-- function comment says ("Issued invoices are not touched").
--
-- NOT decided here: what a change to a booking with a NUMBERED invoice should
-- do (second invoice, credit note, or a block with a message). That is O-14 /
-- T3-14c. This migration leaves a numbered invoice exactly as 0193 did.
--
-- N-5: Written, numbered, tested locally under PGlite. Babin applies after backup.
-- Revert (B-6): restore the 0200 definition of extend_booking(jsonb), one statement.
-- The overload extend_booking(uuid, integer, text, uuid) calls this one and is
-- unchanged; create or replace keeps every grant.
-- =============================================================================

begin;
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
  v_actor         uuid := nullif(coalesce(p_payload ->> 'actor_id', p_payload ->> 'extended_by', ''), '')::uuid;
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

comment on function public.extend_booking(jsonb) is
  'Extends a booking by N days. Checks role permissions (C+), updates return_at, updates line days, '
  'expands inventory_reservations (triggering double-booking and capacity checks), and logs audit_events. '
  'With a Draft invoice: calls resync_draft_invoice to re-derive lines and totals (W15). With no Draft '
  '(never created, or already numbered) nothing is re-derived and invoice_resync is null. A numbered '
  'invoice is not touched (F5 guard); how a change after numbering is handled is O-14 / T3-14c.';

-- Post-conditions: the replacement kept the ACL, the definer rights, the pinned
-- search_path and carries the Draft guard. Behaviour is proven by check:lifecycle
-- L67 and check:anon; a migration must not write to live rows to prove it.
do $verify$
declare
  v_oid oid := 'public.extend_booking(jsonb)'::regprocedure;
  v_def text := pg_get_functiondef(v_oid);
begin
  if not (select prosecdef from pg_proc where oid = v_oid) then
    raise exception '0205 post-condition failed: extend_booking(jsonb) is no longer SECURITY DEFINER.';
  end if;
  if not exists (select 1 from pg_proc where oid = v_oid and proconfig @> array['search_path=public, pg_temp']) then
    raise exception '0205 post-condition failed: extend_booking(jsonb) lost its pinned search_path.';
  end if;
  if has_function_privilege('anon', v_oid, 'execute') then
    raise exception '0205 post-condition failed: anon can execute extend_booking(jsonb).';
  end if;
  if not has_function_privilege('authenticated', v_oid, 'execute') then
    raise exception '0205 post-condition failed: authenticated can no longer execute extend_booking(jsonb).';
  end if;
  if position('if exists (select 1 from invoices where booking_id = v_booking_id and status = ''Draft'')' in v_def) = 0 then
    raise exception '0205 post-condition failed: extend_booking(jsonb) does not guard the Draft re-sync.';
  end if;
end;
$verify$;

commit;
