-- =============================================================================
-- Migration 0255: Draft invoice resync integrity + settlement numbering (T3-14)
--
-- Implements W15/W16:
-- 1. charges.invoice_line_id FK on delete set null:
--    - Ensures that deleting lines on draft invoices during resync does not fail
--      with foreign key violation charges_invoice_line_id_fkey.
-- 2. resync_draft_invoice header synchronization & clean line rebuild:
--    - Synchronizes discount_percent from booking_discounts and vat_rate from bookings.
--    - Unlinks draft charge references and cleans existing draft lines.
--    - Re-inserts current billable booking lines, crew, and transport with canonical arithmetic.
-- 3. Numbering on full settlement (W16):
--    - When a Draft invoice is fully settled (outstanding_amount = 0 and total_amount > 0),
--      recompute_invoice_payment_state mints a monotonic invoice_no via next_document_number('invoice')
--      and advances status to 'Paid' inside the SAME database transaction.
--    - Unsettled or partially paid Draft invoices remain Draft with invoice_no IS NULL.
--
-- N-5: Written, numbered, tested locally under PGlite. Babin applies after backup.
-- =============================================================================

begin;

-- =============================================================================
-- 0. charges_invoice_line_id_fkey: ON DELETE SET NULL
-- =============================================================================

alter table public.charges
  drop constraint if exists charges_invoice_line_id_fkey,
  add constraint charges_invoice_line_id_fkey
    foreign key (invoice_line_id) references public.invoice_lines(id)
    on delete set null;

-- =============================================================================
-- 1. resync_draft_invoice — hardened against charge FKs and syncs header discount/VAT
-- =============================================================================

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
  v_discount_pct  numeric := 0;
  v_vat_rate      numeric(5,4);
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

  -- 3. Synchronize invoice header (discount & VAT) from booking
  select coalesce(sum(percent), 0) into v_discount_pct
    from public.booking_discounts where booking_id = p_booking_id;
  v_vat_rate := coalesce(v_booking.vat_rate, 0.1300);

  update invoices
     set discount_percent = v_discount_pct,
         vat_rate         = v_vat_rate,
         updated_at       = now()
   where id = v_invoice_id;

  -- 4. Delete existing automatically generated lines for this invoice.
  --    Any charges referencing these draft lines are cleanly unlinked by ON DELETE SET NULL.
  update public.charges
     set invoice_line_id = null
   where invoice_line_id in (select id from public.invoice_lines where invoice_id = v_invoice_id);

  delete from invoice_lines
   where invoice_id = v_invoice_id;

  -- 5. Equipment / Bundle / Accessory / Service / Sub-rental lines
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

  -- 6. Crew lines
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

  -- 7. Transport lines
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

revoke all on function public.resync_draft_invoice(uuid) from public, anon, authenticated;

-- =============================================================================
-- 2. Number on full settlement (W16, T3-14)
-- =============================================================================

create or replace function public.recompute_invoice_payment_state(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_total_amount  numeric(14,2);
  v_total_paid    numeric(14,2);
  v_reversed      numeric(14,2);
  v_outstanding   numeric(14,2);
  v_status        invoice_status;
  v_voided        timestamptz;
  v_invoice_no    text;
  v_issue_date    date;
  v_due_date      date;
  v_terms         text;
  v_term_days     integer := 0;
  v_client_id     uuid;
  v_branch_id     uuid;
  v_line_count    integer := 0;
begin
  select total_amount, status, voided_at, invoice_no, client_id, branch_id
    into v_total_amount, v_status, v_voided, v_invoice_no, v_client_id, v_branch_id
    from invoices
   where id = p_invoice_id;

  if not found then
    return;
  end if;

  if v_voided is not null then
    return;
  end if;

  select coalesce(sum(p.amount), 0)
    into v_total_paid
    from payments p
   where p.invoice_id = p_invoice_id
     and p.status = 'Received'
     and p.payment_type = 'Advance Payment';

  select coalesce(sum(r.amount), 0)
    into v_reversed
    from payment_reversals r
    join payments p on p.id = r.original_payment_id
   where p.invoice_id = p_invoice_id
     and p.status = 'Received'
     and p.payment_type = 'Advance Payment';

  v_total_paid  := greatest(0, v_total_paid - v_reversed);
  v_outstanding := greatest(0, v_total_amount - v_total_paid);

  -- W16 / T3-14: Numbering on full settlement
  -- When a Draft invoice is fully paid (v_outstanding = 0 and v_total_amount > 0),
  -- mint monotonic invoice_no in the same transaction and advance status to 'Paid'.
  if v_status = 'Draft'::invoice_status and v_outstanding = 0 and v_total_amount > 0 then
    select count(*) into v_line_count from invoice_lines where invoice_id = p_invoice_id;
    if v_line_count > 0 then
      v_invoice_no := next_document_number('invoice');
      v_issue_date := current_date;

      select payment_terms::text into v_terms from clients where id = v_client_id;
      v_term_days := case coalesce(v_terms, 'Immediate')
                       when '7 days'  then 7
                       when '15 days' then 15
                       when '30 days' then 30
                       else 0
                     end;
      v_due_date := v_issue_date + v_term_days;

      update invoices
         set invoice_no         = v_invoice_no,
             issue_date         = v_issue_date,
             due_date           = coalesce(v_due_date, due_date),
             status             = 'Paid'::invoice_status,
             paid_amount        = v_total_paid,
             outstanding_amount = 0,
             updated_at         = now()
       where id = p_invoice_id;

      -- Audit issuance on full settlement
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
        gen_random_uuid(),
        'money movement',
        'Finance',
        'Finance',
        'Update',
        'Informational',
        'Success',
        'invoices',
        p_invoice_id,
        auth.uid(),
        auth_user_role(),
        v_branch_id,
        jsonb_build_object('status', 'Draft', 'invoice_no', null),
        jsonb_build_object(
          'status', 'Paid',
          'invoice_no', v_invoice_no,
          'issue_date', v_issue_date,
          'paid_amount', v_total_paid
        ),
        'Invoice numbered on full settlement (W16, T3-14)'
      );
      return;
    end if;
  end if;

  update invoices
     set paid_amount        = v_total_paid,
         outstanding_amount = v_outstanding,
         status = case
           /* R-14: Unsettled Draft stays Draft */
           when v_status = 'Draft'::invoice_status then v_status
           /* Fully settled issued invoice */
           when v_outstanding = 0 and v_total_amount > 0 then 'Paid'::invoice_status
           when v_total_paid > 0 then 'Partially Paid'::invoice_status
           /* Reversal case: back to Sent, never back to Draft */
           when v_status in ('Paid'::invoice_status, 'Partially Paid'::invoice_status)
             then 'Sent'::invoice_status
           else v_status
         end,
         updated_at = now()
   where id = p_invoice_id;
end;
$function$;

-- =============================================================================
-- 3. issue_invoice idempotency (Law 8)
-- =============================================================================
-- If an invoice was already issued (e.g. numbered on full settlement under W16),
-- calling issue_invoice returns the existing issued invoice instead of raising
-- an exception. This guarantees idempotent retry without burning document numbers.

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
  select * into v_invoice from invoices where id = v_invoice_id for update;
  if not found then
    raise exception 'issue_invoice: invoice % does not exist.', v_invoice_id;
  end if;

  if v_invoice.voided_at is not null or v_invoice.status = 'Void' then
    raise exception 'issue_invoice: invoice % is voided and cannot be issued.', v_invoice_id;
  end if;

  -- Idempotency (Law 8): If already issued, return existing state
  if v_invoice.invoice_no is not null then
    select count(*) into v_line_count from invoice_lines where invoice_id = v_invoice_id;
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
  end if;

  if v_invoice.status <> 'Draft' then
    raise exception
      'issue_invoice: invoice % has status %. Only a Draft can be issued.',
      v_invoice_id, v_invoice.status;
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

revoke execute on function public.issue_invoice(jsonb) from public;
grant execute on function public.issue_invoice(jsonb) to authenticated;

-- =============================================================================
-- 4. Fix guard_invoice_lines_parent_status BEFORE DELETE return
-- =============================================================================
-- In Postgres, a BEFORE DELETE trigger returning NULL silently aborts the DELETE.
-- Migration 0193 returned NEW (which is NULL during DELETE), causing DELETEs on
-- Draft invoices to be silently cancelled and duplicating lines on resync.
-- Returning OLD allows DELETEs on Draft invoices while still blocking non-Drafts.

create or replace function public.guard_invoice_lines_parent_status()
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
  if TG_OP = 'DELETE' then
    select status, voided_at, invoice_no into v_parent_status, v_parent_voided, v_parent_no
      from invoices where id = OLD.invoice_id;
  else
    select status, voided_at, invoice_no into v_parent_status, v_parent_voided, v_parent_no
      from invoices where id = NEW.invoice_id;
  end if;

  if not found then
    if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
  end if;

  if v_parent_status <> 'Draft' or v_parent_voided is not null then
    raise exception
      'invoice_lines: invoice % is not a Draft (status %, voided_at %). An issued invoice''s lines are immutable — correct it with a credit note.',
      v_parent_no, v_parent_status, v_parent_voided
      using errcode = 'P0001';
  end if;

  if TG_OP = 'DELETE' then
    return OLD;
  else
    return NEW;
  end if;
end;
$$;

commit;
