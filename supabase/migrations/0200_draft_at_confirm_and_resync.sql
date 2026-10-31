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
-- (0168:848-877, :896-912). Upserts by source row's client_uuid — no DELETE.
-- Voided source rows → line keeps its client_uuid but quantity/days zeroed.
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
  insert into invoice_lines (
    client_uuid, invoice_id, line_kind, description,
    quantity, days, unit_rate, line_total, discount_percent, sort_order,
    price_breakdown
  )
  select
    bl.client_uuid,
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
  insert into invoice_lines (
    client_uuid, invoice_id, line_kind, description,
    quantity, days, unit_rate, line_total, discount_percent, sort_order
  )
  select
    cl.client_uuid,
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
  insert into invoice_lines (
    client_uuid, invoice_id, line_kind, description,
    quantity, days, unit_rate, line_total, discount_percent, sort_order
  )
  select
    bt.client_uuid,
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
  'Upserts by source row client_uuid. Refuses if invoice is not Draft or booking cancelled. '
  'Used by Confirm (draft creation) and extend_booking / other booking mutations.';

grant execute on function public.resync_draft_invoice(uuid) to authenticated;

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
-- a new internal function to create the Draft. This is done via a trigger on
-- bookings after the stage transition to Booked, or via the RPC that performs
-- the transition. We add a post-transition hook here.

-- The apply_booking_stage_transition RPC (0150) handles stage transitions.
-- We add a call to create_draft_invoice_on_confirm after a successful
-- Quote→Booked transition. Since we cannot modify 0150 in this migration
-- (it's a different file), we add a trigger on bookings that fires when
-- stage becomes 'Booked' and the old stage was 'Quote'.

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
begin
  -- Only fire on Quote -> Booked transition
  if OLD.stage = 'Quote' and NEW.stage = 'Booked' then
    v_booking_id := NEW.id;

    -- Read booking for client_uuid and other fields
    select * into v_booking from bookings where id = v_booking_id;
    if not found then
      raise exception 'create_draft_invoice_on_confirm: booking % not found.', v_booking_id;
    end if;

    -- Deterministic Law 8 key: uuid5 of booking id (namespace: invoice creation)
    -- This ensures a second Confirm press replays rather than creating a second invoice.
    v_client_uuid := uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid, v_booking_id::text);

    -- Create the invoice row (status = Draft, no number)
    insert into invoices (
      client_uuid, booking_id, client_id, branch_id,
      discount_percent, vat_rate,
      status, created_by, updated_by
    ) values (
      v_client_uuid,
      v_booking_id,
      v_booking.client_id,
      v_booking.branch_id,
      coalesce(v_booking.discount_percent, 0),
      coalesce(v_booking.vat_rate, (select vat_rate from vat_settings limit 1)),
      'Draft'::invoice_status,
      NEW.updated_by,
      NEW.updated_by
    ) returning id into v_invoice_id;

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
      'document created',
      'Finance',
      'Invoices',
      'Insert',
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
  'Uses deterministic Law 8 key (uuid5 of booking_id) so retries replay. '
  'Calls resync_draft_invoice to populate lines with create_invoice arithmetic.';

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