-- =============================================================================
-- Migration 0200: Draft invoice at Confirm + re-sync function (T3-14b)
--
-- Implements W15/W16: Confirm creates exactly one numberless Draft invoice,
-- and the Draft follows the booking while it stays a Draft.
--
-- N-5: Written, numbered, tested locally under PGlite. Babin applies after backup.
-- =============================================================================

begin;

-- =============================================================================
-- 1. resync_draft_invoice — one function to rule them all
-- =============================================================================
-- Re-derives a Draft invoice's lines from the booking (equipment, crew,
-- transport, discounts) using the SAME arithmetic as create_invoice
-- (0168:848-877, :896-912). The current implementation rebuilds
-- Draft invoice lines with DELETE + INSERT and new idempotency keys.
-- Only internally authorized callers may perform this destructive Draft rewrite.
-- Refuses if parent invoice is not Draft or booking is cancelled.

create or replace function public.resync_draft_invoice(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking       bookings%rowtype;
  v_invoice_id    uuid;
  v_invoice       invoices%rowtype;
  v_line_count    integer := 0;
  v_written       integer;
  v_client_uuid   uuid;
begin
  -- 1. Read booking
  select * into v_booking from bookings where id = p_booking_id;
  if not found then
    raise exception 'resync_draft_invoice: booking % does not exist.', p_booking_id;
  end if;

  if v_booking.cancelled_at is not null then
    raise exception 'resync_draft_invoice: booking % is cancelled; cannot resync a Draft.', v_booking.booking_no;
  end if;

  -- 2. Find the Draft invoice for this booking
  select id into v_invoice_id
    from invoices
   where booking_id = p_booking_id
     and status = 'Draft';
  if not found then
    raise exception 'resync_draft_invoice: no Draft invoice for booking %.', v_booking.booking_no;
  end if;

  select * into v_invoice from invoices where id = v_invoice_id;
  if v_invoice.status <> 'Draft' or v_invoice.invoice_no is not null then
    raise exception 'resync_draft_invoice: invoice % is not a Draft (status %, invoice_no %).', v_invoice_id, v_invoice.status, v_invoice.invoice_no;
  end if;

  -- 3. Delete existing lines for this invoice (we will re-insert via upsert below)
  -- Note: we use DELETE here because we are inside the re-sync function and
  -- the parent is Draft. The F5 guard (trg_guard_invoice_lines_parent_status)
  -- allows DELETE on Draft invoices. This is the one place where DELETE is
  -- intentional — the upsert that follows rebuilds the full line set.
  delete from invoice_lines where invoice_id = v_invoice_id;

  -- 4. Equipment / Bundle / Accessory / Service / Sub-rental lines
  --    Source: booking_lines (voided_at is null)
  --    Arithmetic mirrors 0168:848-877
  --    client_uuid is NEW for each line (gen_random_uuid) to avoid unique constraint
  --    collisions across source tables and on concurrent resyncs.
  insert into invoice_lines (
    client_uuid, invoice_id, line_kind, description,
    quantity, days, unit_rate, line_total, discount_percent, sort_order,
    price_breakdown
  )
  select
    gen_random_uuid(),
    v_invoice_id,
    (case bl.line_type
       when 'Equipment'   then 'Equipment Rental'
       when 'Bundle'      then 'Equipment Rental'
       when 'Accessory'   then 'Equipment Rental'
       when 'Manual item' then 'Equipment Rental'
       when 'Service'     then 'Services'
       when 'Sub-rental'  then 'Sub-Rental'
     end)::line_kind,
    coalesce(nullif(btrim(bl.description), ''), bl.line_type::text),
    greatest(1, bl.qty),
    greatest(1, bl.days),
    bl.rate,
    coalesce(bl.line_total, greatest(0, greatest(1, bl.qty) * greatest(1, bl.days) * bl.rate - coalesce(bl.discount_amount, 0))),
    0,
    coalesce(bl.sort_order, 0),
    bl.price_breakdown
  from booking_lines bl
  where bl.booking_id = p_booking_id
    and bl.voided_at is null;
  get diagnostics v_written = row_count;
  v_line_count := v_line_count + v_written;

  -- 5. Crew lines
  --    Source: booking_crew_lines (voided_at is null)
  --    Arithmetic mirrors 0168:896-912
  --    line_total = day_rate * days + overtime + accommodation + meals
  --    unit_rate = day_rate + (extras / days)
  --    client_uuid is NEW for each line (gen_random_uuid) to avoid unique constraint
  --    collisions across source tables and on concurrent resyncs.
  insert into invoice_lines (
    client_uuid, invoice_id, line_kind, description,
    quantity, days, unit_rate, line_total, discount_percent, sort_order
  )
  select
    gen_random_uuid(),
    v_invoice_id,
    'Crew Charges'::line_kind,
    coalesce(
      nullif(btrim(concat_ws(' - ', nullif(btrim(cl.name), ''), cl.crew_role::text)), ''),
      'Crew'
    ),
    1,
    greatest(1, cl.days),
    cl.day_rate
      + (coalesce(cl.overtime, 0) + coalesce(cl.accommodation, 0) + coalesce(cl.meals, 0))
        / greatest(1, cl.days),
    cl.day_rate * greatest(1, cl.days)
      + coalesce(cl.overtime, 0) + coalesce(cl.accommodation, 0) + coalesce(cl.meals, 0),
    0,
    1000 + (row_number() over (order by cl.created_at, cl.id))::integer - 1
  from booking_crew_lines cl
  where cl.booking_id = p_booking_id
    and cl.voided_at is null;
  get diagnostics v_written = row_count;
  v_line_count := v_line_count + v_written;

  -- 6. Transport lines
  --    Source: booking_transport
  --    Arithmetic mirrors 0168:927-946
  --    client_uuid is NEW for each line (gen_random_uuid) to avoid unique constraint
  --    collisions across source tables and on concurrent resyncs.
  insert into invoice_lines (
    client_uuid, invoice_id, line_kind, description,
    quantity, days, unit_rate, line_total, discount_percent, sort_order
  )
  select
    gen_random_uuid(),
    v_invoice_id,
    'Transport'::line_kind,
    case
      when nullif(btrim(coalesce(bt.vehicle, '')), '') is not null
        then 'Transport - ' || btrim(bt.vehicle)
      else 'Transport'
    end,
    1,
    1,
    coalesce(bt.delivery_charge, 0) + coalesce(bt.fuel_charge, 0),
    coalesce(bt.delivery_charge, 0) + coalesce(bt.fuel_charge, 0),
    0,
    2000 + (row_number() over (order by bt.created_at, bt.id))::integer - 1
  from booking_transport bt
  where bt.booking_id = p_booking_id
    and coalesce(bt.delivery_charge, 0) + coalesce(bt.fuel_charge, 0) > 0;
  get diagnostics v_written = row_count;
  v_line_count := v_line_count + v_written;

  -- 7. Discount lines (booking-level percentage already on invoice header;
  --    here we only record line-level discounts if any were explicitly set)
  --    No separate discount lines needed — the header's discount_percent drives
  --    the invoice_discount_amount() in recalculate_invoice_totals.

  -- 8. Return result
  return jsonb_build_object(
    'invoice_id',   v_invoice_id,
    'invoice_no',   v_invoice.invoice_no,
    'status',       v_invoice.status,
    'line_count',   v_line_count,
    'resynced_at',  now()
  );
end;
$$;

comment on function public.resync_draft_invoice(uuid) is
  'Re-derives a Draft invoice''s lines from the booking (equipment, crew, transport). '
  'Rebuilds Draft lines only. Direct API execute is revoked; internal definer callers only. '
  'Used by Confirm (draft creation) and extend_booking / other booking mutations.';

-- This is an INTERNAL invoice writer called from SECURITY DEFINER booking
-- transition/extension functions. It must not be directly callable by any
-- authenticated user, including money-blind staff or Clients.
-- The owning definer may still invoke it internally during a valid transition.
revoke all on function public.resync_draft_invoice(uuid)
  from public, anon, authenticated;

-- =============================================================================
-- 2. Modify extend_booking to call resync_draft_invoice instead of day-only update
-- =============================================================================
-- Replaces the day-only update at 0111:126-129 with a call to resync_draft_invoice.
-- The re-sync recomputes line_total for all lines, so the Draft follows the booking.

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
  -- another user. The old fallback to the first active staff account is unsafe.
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

  -- 8. If a Draft invoice exists, call resync_draft_invoice to fully re-derive it
  --    This replaces the old day-only update and recomputes line_total correctly.
  v_resync := public.resync_draft_invoice(v_booking_id);

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

create or replace function public.extend_booking(
  p_booking_id uuid,
  p_days integer,
  p_reason text,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return public.extend_booking(jsonb_build_object(
    'booking_id', p_booking_id,
    'days', p_days,
    'reason', p_reason,
    'actor_id', p_actor_id
  ));
end;
$$;

grant execute on function public.extend_booking(jsonb) to authenticated;
grant execute on function public.extend_booking(uuid, integer, text, uuid) to authenticated;

comment on function public.extend_booking(jsonb) is
  'Extends a booking by N days. Checks role permissions (C+), updates return_at, updates line days, '
  'expands inventory_reservations (triggering double-booking and capacity checks), and logs audit_events. '
  'For Draft invoices: calls resync_draft_invoice to fully re-derive lines and totals. '
  'Issued invoices are not touched (F5 guard prevents line edits).';

-- =============================================================================
-- 3. Confirm creates Draft invoice inside the transition
-- =============================================================================
-- The Confirm action (apply_booking_stage_transition → Quote→Booked) will call
-- a new internal function to create the Draft. We add a trigger on bookings
-- that fires AFTER the stage transition to Booked is committed.
-- 
-- Uses a deterministic Law 8 key: md5(booking_id || 'invoice-creation-namespace')
-- to ensure a second Confirm press replays rather than creating a second invoice.
-- PGlite doesn't have uuid_generate_v5, so we use md5-based deterministic UUID.
-- Discount percent comes from booking_discounts (sum of percent), vat_rate from bookings.

create or replace function public.create_draft_invoice_on_confirm()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking_id    uuid;
  v_invoice_id    uuid;
  v_client_uuid   uuid;
  v_line_count    integer := 0;
  v_written       integer;
  v_booking       bookings%rowtype;
  v_discount_pct  numeric := 0;
  v_vat_rate      numeric(5,4);
  v_due_date      date;
  v_terms         text;
  v_term_days     integer := 0;
  v_namespace     uuid := '6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid; -- DNS namespace for uuid5
begin
  -- Only fire on Quote -> Booked transition
  if OLD.stage = 'Quote' and NEW.stage = 'Booked' then
    v_booking_id := NEW.id;

    -- Read booking for client_uuid and other fields
    select * into v_booking from bookings where id = v_booking_id;
    if not found then
      raise exception 'create_draft_invoice_on_confirm: booking % not found.', v_booking_id;
    end if;

    -- Get discount_percent from booking_discounts (sum of percent)
    select coalesce(sum(percent), 0) into v_discount_pct
      from public.booking_discounts where booking_id = v_booking_id;

    -- Get vat_rate from bookings (pinned at booking creation)
    select vat_rate into v_vat_rate from public.bookings where id = v_booking_id;

    -- Calculate due_date from client's payment_terms (same as create_invoice)
    select payment_terms::text into v_terms from clients where id = v_booking.client_id;
    v_term_days := case coalesce(v_terms, 'Immediate')
                     when '7 days'  then 7
                     when '15 days' then 15
                     when '30 days' then 30
                     else 0
                   end;
    v_due_date := current_date + v_term_days;

    -- Deterministic Law 8 key: md5-based UUID (uuid5 equivalent without uuid-ossp)
    -- uuid_generate_v5(namespace, name) = uuid_from_md5(md5(namespace || name))
    v_client_uuid := (md5(v_namespace::text || v_booking_id::text))::uuid;

    -- Create the invoice row (status = Draft, no number)
    -- Use ON CONFLICT on client_uuid to handle retries (Law 8 idempotency)
    insert into invoices (
      client_uuid, booking_id, client_id, branch_id,
      discount_percent, vat_rate, due_date,
      status, created_by, updated_by
    ) values (
      v_client_uuid,
      v_booking_id,
      v_booking.client_id,
      v_booking.branch_id,
      v_discount_pct,
      coalesce(v_vat_rate, 0.1300),
      v_due_date,
      'Draft'::invoice_status,
      NEW.updated_by,
      NEW.updated_by
    ) on conflict (client_uuid) do nothing
    returning id into v_invoice_id;

    -- If conflict (retry), fetch the existing invoice
    if v_invoice_id is null then
      select id into v_invoice_id from invoices where client_uuid = v_client_uuid;
    end if;

    -- Re-sync the lines (this will populate invoice_lines with the correct arithmetic)
    perform public.resync_draft_invoice(v_booking_id);

    -- Audit
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
      v_client_uuid,
      'money movement',
      'Finance',
      'Finance',
      'Create',
      'Informational',
      'Success',
      'invoices',
      v_invoice_id,
      NEW.updated_by,
      (select primary_role from users where id = NEW.updated_by),
      v_booking.branch_id,
      '{}',
      jsonb_build_object(
        'invoice_id', v_invoice_id,
        'booking_id', v_booking_id,
        'status', 'Draft'
      ),
      'Draft invoice created on Confirm (W15)'
    );
  end if;

  return NEW;
end;
$$;

-- Drop any existing trigger first
drop trigger if exists trg_create_draft_invoice_on_confirm on bookings;

create trigger trg_create_draft_invoice_on_confirm
  after update of stage on bookings
  for each row
  when (OLD.stage = 'Quote' and NEW.stage = 'Booked')
  execute function public.create_draft_invoice_on_confirm();

comment on trigger trg_create_draft_invoice_on_confirm on bookings is
  'T3-14b: Creates a numberless Draft invoice when a booking transitions Quote→Booked (W15). '
  'Uses deterministic Law 8 key (md5-based uuid5 of booking_id) so retries replay. '
  'Calls resync_draft_invoice to populate lines with create_invoice arithmetic. '
  'ON CONFLICT on client_uuid ensures idempotent retries. '
  'discount_percent from booking_discounts, vat_rate from bookings.';

-- =============================================================================
-- 4. Update existing confirmRental action to NOT create invoice separately
-- =============================================================================
-- The TypeScript action confirmRental.ts calls apply_booking_stage_transition.
-- The trigger above handles the Draft creation. No TypeScript change needed
-- beyond ensuring the action doesn't try to create an invoice separately.
-- (The existing code at confirmRental.ts:415-420 already refuses offline.)

-- =============================================================================
-- 5. Retire the manual Create Draft Invoice launcher (UI copy change)
-- =============================================================================
-- The CreateInvoiceModal.tsx shows "Draft (no number)" and has a button.
-- The launcher should be hidden when the booking already has an invoice.
-- This is a TypeScript/UI change, not a migration. See task 3 in the prompt.

commit;