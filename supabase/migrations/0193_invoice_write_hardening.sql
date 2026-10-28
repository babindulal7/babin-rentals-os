-- =============================================================================
-- Migration 0193: Harden the invoice write path (T3-14a)
--
-- Fixes three defects found in the T3-14 readiness audit (27 Oct 2026):
-- F2: issue_invoice reads the invoice without FOR UPDATE, so concurrent issues
--     both pass the Draft check, both mint numbers, and the first number is
--     burned — a gap in INV- which 0086:88-91 forbids.
-- F5: invoice_lines has no parent-status guard, so an issued invoice's lines
--     can be rewritten while line_total (and therefore the total) stays
--     identical, so nothing raises.
-- F4: extend_booking increments invoice_lines.days on Draft invoices but
--     line_total is a stored column; recalculate_invoice_totals only sums it,
--     so drafts do not reprice — contradicting 0111:9 and extendRental.ts:16.
--
-- N-5: Written, numbered, tested locally under PGlite. Babin applies after backup.
-- =============================================================================

begin;

-- =============================================================================
-- F2 PART 1: issue_invoice — lock the invoice row with FOR UPDATE before check
-- =============================================================================

create or replace function public.issue_invoice(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invoice_id   uuid    := (p_payload ->> 'invoice_id')::uuid;
  v_actor        uuid    := nullif(coalesce(p_payload ->> 'issued_by', p_payload ->> 'actor_id', ''), '')::uuid;
  v_issue_date   date    := nullif(coalesce(p_payload ->> 'issue_date', ''), '')::date;
  v_role         system_role;
  v_invoice      invoices%rowtype;
  v_line_count   integer := 0;
  v_invoice_no   text;
  v_terms        text;
  v_term_days    integer := 0;
  v_due_date     date;
  v_new_status   invoice_status;
begin
  -- 1. Role & authorization checks (R-05)
  v_role := auth_user_role();
  if v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Accounts') then
    raise exception
      'issue_invoice: this session (%) may not issue an invoice. R-05 gives that to Owner, Admin, Manager and Accounts.',
      coalesce(v_role::text, 'unidentified')
      using errcode = '42501';
  end if;

  if not auth_can_view_money() then
    raise exception
      'issue_invoice: this session cannot read money (Law 6), so it cannot issue an invoice.'
      using errcode = '42501';
  end if;

  if v_invoice_id is null then
    raise exception 'issue_invoice: invoice_id is required.';
  end if;

  -- 2. Verify invoice existence and eligibility — FOR UPDATE locks the row
  --    so a second concurrent caller blocks here, then re-checks under the lock
  select * into v_invoice from invoices where id = v_invoice_id for update;
  if not found then
    raise exception 'issue_invoice: invoice % does not exist.', v_invoice_id;
  end if;

  if v_invoice.voided_at is not null or v_invoice.status = 'Void' then
    raise exception 'issue_invoice: invoice % is voided and cannot be issued.', v_invoice_id;
  end if;

  if v_invoice.status <> 'Draft' or v_invoice.invoice_no is not null then
    raise exception
      'issue_invoice: invoice % is already issued (status %, invoice_no %). Only a Draft can be issued.',
      v_invoice_id, v_invoice.status, v_invoice.invoice_no;
  end if;

  select count(*) into v_line_count from invoice_lines where invoice_id = v_invoice_id;
  if v_line_count = 0 then
    raise exception 'issue_invoice: invoice % has no lines. An empty invoice cannot be issued.', v_invoice_id;
  end if;

  -- 3. Mint invoice number (R-15) — still inside the same transaction/lock
  v_invoice_no := next_document_number('invoice');
  if v_invoice_no is null then
    raise exception 'issue_invoice: next_document_number failed to mint an invoice number.';
  end if;

  -- 4. Date calculation
  v_issue_date := coalesce(v_issue_date, current_date);

  select payment_terms::text into v_terms from clients where id = v_invoice.client_id;
  v_term_days := case coalesce(v_terms, 'Immediate')
                   when '7 days'  then 7
                   when '15 days' then 15
                   when '30 days' then 30
                   else 0
                 end;
  v_due_date := v_issue_date + v_term_days;

  -- 5. Determine status
  if v_invoice.outstanding_amount = 0 and v_invoice.total_amount > 0 then
    v_new_status := 'Paid'::invoice_status;
  elsif v_invoice.paid_amount > 0 then
    v_new_status := 'Partially Paid'::invoice_status;
  else
    v_new_status := 'Sent'::invoice_status;
  end if;

  -- 6. Update the invoice row
  update invoices
     set invoice_no = v_invoice_no,
         issue_date = v_issue_date,
         due_date   = coalesce(v_due_date, due_date),
         status     = v_new_status,
         updated_at = now(),
         updated_by = coalesce(v_actor, v_invoice.updated_by)
   where id = v_invoice_id;

  -- 7. Read back updated invoice
  select * into v_invoice from invoices where id = v_invoice_id;

  return jsonb_build_object(
    'invoice_id',         v_invoice.id,
    'invoice_no',         v_invoice.invoice_no,
    'status',             v_invoice.status,
    'issue_date',         v_invoice.issue_date,
    'due_date',           v_invoice.due_date,
    'booking_id',         v_invoice.booking_id,
    'client_id',          v_invoice.client_id,
    'line_count',         v_line_count,
    'subtotal',           v_invoice.subtotal,
    'discount_amount',    v_invoice.discount_amount,
    'taxable_amount',     v_invoice.taxable_amount,
    'vat_amount',         v_invoice.vat_amount,
    'total_amount',       v_invoice.total_amount,
    'paid_amount',        v_invoice.paid_amount,
    'outstanding_amount', v_invoice.outstanding_amount
  );
end;
$$;

create or replace function public.issue_invoice(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return issue_invoice(jsonb_build_object('invoice_id', p_invoice_id));
end;
$$;

comment on function public.issue_invoice(jsonb) is
  'Issues a Draft invoice: mints invoice_no via next_document_number(''invoice'') (R-15), '
  'sets issue_date, derives due_date from client terms, sets status (Sent/Paid), and locks figures '
  'under reject_invoice_edit_after_issue(). R-05 role check enforced. Row is locked with FOR UPDATE '
  'so concurrent issues serialize and only one mints a number.';

comment on function public.issue_invoice(uuid) is
  'Convenience overload of issue_invoice(jsonb).';

revoke execute on function public.issue_invoice(jsonb) from public;
grant execute on function public.issue_invoice(jsonb) to authenticated;

revoke execute on function public.issue_invoice(uuid) from public;
grant execute on function public.issue_invoice(uuid) to authenticated;

-- =============================================================================
-- F2 PART 2: Make invoice_no and issue_date immutable on issued invoices
-- =============================================================================
-- The existing trigger reject_invoice_edit_after_issue() protects seven money
-- columns but NOT invoice_no or issue_date. Add them to the guard.

create or replace function reject_invoice_edit_after_issue()
returns trigger
language plpgsql
as $$
begin
  -- Draft invoices are still being assembled — nothing is "issued" yet to protect.
  if OLD.status = 'Draft' then
    return NEW;
  end if;

  -- The Void + Credit Note path is the one lawful way to touch an issued invoice's own row:
  -- voided_at/voided_by/void_reason/credit_note_no move together (already required by
  -- invoices_void_requires_reason above), and the figures must travel unchanged with it.
  if NEW.voided_at is not null and OLD.voided_at is null then
    if NEW.subtotal is distinct from OLD.subtotal
      or NEW.discount_amount is distinct from OLD.discount_amount
      or NEW.discount_percent is distinct from OLD.discount_percent
      or NEW.taxable_amount is distinct from OLD.taxable_amount
      or NEW.vat_amount is distinct from OLD.vat_amount
      or NEW.total_amount is distinct from OLD.total_amount
      or NEW.due_date is distinct from OLD.due_date
      or NEW.invoice_no is distinct from OLD.invoice_no
      or NEW.issue_date is distinct from OLD.issue_date
    then
      raise exception 'Law 4/finance: invoice % cannot change its own figures while being voided — void it as issued, correct with a credit note or a new invoice.', OLD.invoice_no;
    end if;
    return NEW;
  end if;

  if NEW.subtotal is distinct from OLD.subtotal
    or NEW.discount_amount is distinct from OLD.discount_amount
    or NEW.discount_percent is distinct from OLD.discount_percent
    or NEW.taxable_amount is distinct from OLD.taxable_amount
    or NEW.vat_amount is distinct from OLD.vat_amount
    or NEW.total_amount is distinct from OLD.total_amount
    or NEW.due_date is distinct from OLD.due_date
    or NEW.invoice_no is distinct from OLD.invoice_no
    or NEW.issue_date is distinct from OLD.issue_date
  then
    raise exception 'Law 4/finance: invoice % is issued (status %) — its figures are immutable. Corrections take Void + Credit Note, never a direct edit.', OLD.invoice_no, OLD.status;
  end if;

  return NEW;
end;
$$;

-- =============================================================================
-- F5: invoice_lines — parent status guard
-- =============================================================================
-- Add a BEFORE INSERT OR UPDATE OR DELETE trigger that raises unless the
-- parent invoice is still Draft and not voided. The message must name the
-- invoice and say what to do instead.

create or replace function guard_invoice_lines_parent_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_parent_status invoice_status;
  v_parent_voided timestamptz;
  v_parent_no text;
begin
  -- DELETE uses OLD, INSERT/UPDATE use NEW
  if TG_OP = 'DELETE' then
    select status, voided_at, invoice_no into v_parent_status, v_parent_voided, v_parent_no
      from invoices where id = OLD.invoice_id;
  else
    select status, voided_at, invoice_no into v_parent_status, v_parent_voided, v_parent_no
      from invoices where id = NEW.invoice_id;
  end if;

  if not found then
    -- Parent invoice deleted (should not happen with FK) — allow for safety
    return NEW;
  end if;

  if v_parent_status <> 'Draft' or v_parent_voided is not null then
    raise exception
      'invoice_lines: invoice % is not a Draft (status %, voided_at %). An issued invoice''s lines are immutable — correct it with a credit note.',
      v_parent_no, v_parent_status, v_parent_voided
      using errcode = 'P0001';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_guard_invoice_lines_parent_status on invoice_lines;
create trigger trg_guard_invoice_lines_parent_status
  before insert or update or delete on invoice_lines
  for each row execute function guard_invoice_lines_parent_status();

comment on trigger trg_guard_invoice_lines_parent_status on invoice_lines is
  'F5: Prevents insert/update/delete on invoice_lines when parent invoice is not Draft. '
  'Issued invoices must be corrected with a credit note, not by editing lines.';

-- =============================================================================
-- F4: extend_booking — recompute line_total for Draft invoice lines
-- =============================================================================
-- The existing code at lines 126-129 only increments days. line_total is a
-- stored column (not GENERATED) so recalculate_invoice_totals only sums it.
-- We must recompute line_total using the same arithmetic create_invoice uses:
--   Equipment/Accessory/Service: qty * days * rate - discount
--   Crew: day_rate * days + overtime + accommodation + meals
--   Transport: delivery_charge + fuel_charge
-- Crew lines are per-engagement totals, not per-day; an extension must not
-- silently multiply accommodation or meals.

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
  if current_user not in ('postgres', 'supabase_admin', 'service_role') then
    if v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
      raise exception
        'extend_booking: this session (%) may not extend a booking. Coordinator, Manager, Admin and Owner only.',
        coalesce(v_role::text, 'unidentified')
        using errcode = '42501';
    end if;
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
     set period = tstzrange(lower(period), v_new_return, '[)'),
         updated_at = v_now
   where booking_id = v_booking_id
     and released_at is null;

  -- 8. If a Draft invoice exists, increment invoice_lines.days AND recompute line_total
  --    for the affected lines, using the same arithmetic as create_invoice (0168:871).
  --
  --    Equipment / Services / Sub-Rental: line_total = qty * days * rate - discount.
  --    Crew: line_total = day_rate * days + extras (extras = overtime + accommodation + meals).
  --          unit_rate = day_rate + extras/days, so line_total = unit_rate * days.
  --          Extension should add day_rate * v_days, NOT multiply extras.
  --          Since we only store unit_rate (which includes pro-rated extras), we cannot
  --          perfectly separate day_rate from extras without a schema change.
  --          For now: increment line_total by unit_rate * v_days (adds pro-rated extras).
  --          This is a known limitation — crew lines need day_rate stored separately
  --          for exact extension math (MONEY-07 related).
  --    Transport: days is always 1, line_total unchanged.
  update invoice_lines il
     set days = days + v_days,
         line_total = case il.line_kind
           when 'Equipment Rental' then
             greatest(0, il.quantity * (il.days + v_days) * il.unit_rate - coalesce(il.discount_percent, 0) / 100.0 * il.quantity * (il.days + v_days) * il.unit_rate)
           when 'Services' then
             greatest(0, il.quantity * (il.days + v_days) * il.unit_rate - coalesce(il.discount_percent, 0) / 100.0 * il.quantity * (il.days + v_days) * il.unit_rate)
           when 'Sub-Rental' then
             greatest(0, il.quantity * (il.days + v_days) * il.unit_rate - coalesce(il.discount_percent, 0) / 100.0 * il.quantity * (il.days + v_days) * il.unit_rate)
           when 'Crew Charges' then
             -- LIMITATION: unit_rate includes pro-rated extras; this adds them again.
             -- Correct fix requires storing day_rate and extras separately (MONEY-07).
             il.line_total + il.unit_rate * v_days
           when 'Transport' then
             -- Transport days stays 1, line_total unchanged
             il.line_total
           else
             -- Unknown kind: fallback to qty * days * rate (should not happen with enum)
             greatest(0, il.quantity * (il.days + v_days) * il.unit_rate - coalesce(il.discount_percent, 0) / 100.0 * il.quantity * (il.days + v_days) * il.unit_rate)
         end
   where il.invoice_id in (select id from invoices where booking_id = v_booking_id and status = 'Draft');

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
    'days_added', v_days
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
  'For Draft invoices: increments days AND recomputes line_total using create_invoice arithmetic '
  '(Equipment/Service/Sub-Rental = qty*days*rate - discount; Crew = unit_rate*days with extras already folded in; Transport unchanged). '
  'Issued invoices are not touched (F5 guard prevents line edits).';

commit;