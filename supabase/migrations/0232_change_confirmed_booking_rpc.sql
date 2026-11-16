-- =============================================================================
-- Migration 0232: Change confirmed booking RPC + linked booking parent (T3-18)
--
-- Implements W87, W88:
-- 1. Any desk staff (Owner, Admin, Manager, Coordinator, Warehouse) may change
--    items and dates after Confirm:
--    - before Pack: add, remove or swap lines and move dates, with reservations
--      updated in the same transaction (GiST-checked: no double-booking).
--    - after Pack: a packed unit cannot be silently removed (asks Warehouse
--      to unpack it first).
--    - after Handover: "Add gear" allows adding to this booking or starting a new
--      booking linked to it (carrying parent_booking_id).
-- 2. linked-booking column: bookings.parent_booking_id
-- 3. Atomic, revision-locked, GiST-checked change_booking(jsonb) RPC.
-- 4. Draft invoice resync follows booking changes (W15 / T3-14).
--
-- N-5: Written, numbered, tested locally under PGlite. Babin applies after backup.
-- =============================================================================

begin;


-- Draft resync previously attempted DELETE, but the parent-status trigger returned
-- NEW (NULL on DELETE), silently retaining every old line and doubling charges.
-- Keep old revisions as immutable history (Law 3), never as current charges.
alter table public.invoice_lines add column superseded_at timestamptz;
comment on column public.invoice_lines.superseded_at is
  'Draft resync history: retained with original values, excluded from active invoice lines.';
create index invoice_lines_active_invoice_idx on public.invoice_lines(invoice_id)
  where superseded_at is null;
create policy invoice_lines_active_select on public.invoice_lines
  as restrictive for select to authenticated using (superseded_at is null);

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
  if TG_OP = 'DELETE' then
    raise exception 'Law 3: invoice lines must be retained, not deleted.';
  end if;
  if TG_OP = 'UPDATE' and OLD.superseded_at is not null then
    raise exception 'Superseded invoice lines are immutable history.';
  end if;
  -- Check both parents when moving a line; an issued line cannot be moved out.
  if TG_OP = 'UPDATE' and OLD.invoice_id is distinct from NEW.invoice_id then
    raise exception 'Invoice lines cannot be moved between invoices.';
  end if;
  -- DELETE uses OLD, INSERT/UPDATE use NEW
  if TG_OP = 'DELETE' then
    select status, voided_at, invoice_no into v_parent_status, v_parent_voided, v_parent_no
      from invoices where id = OLD.invoice_id;
  else
    select status, voided_at, invoice_no into v_parent_status, v_parent_voided, v_parent_no
      from invoices where id = NEW.invoice_id;
  end if;

  if not found then
    raise exception 'Invoice line parent does not exist.';
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

create or replace function public.recalculate_invoice_totals()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_subtotal numeric(14,2);
  v_discount_pct numeric(5,2);
  v_vat_rate numeric(5,4);
  v_discount numeric(14,2);
  v_taxable numeric(14,2);
  v_vat numeric(14,2);
  v_total numeric(14,2);
  v_paid numeric(14,2);
  v_target_invoice_id uuid;
begin
  if (TG_OP = 'DELETE') then
    v_target_invoice_id := OLD.invoice_id;
  else
    v_target_invoice_id := NEW.invoice_id;
  end if;

  -- 1. The subtotal is the sum of the lines. Not rounded — money.ts does not
  --    round it either, and rounding it here would silently move money that no
  --    line accounts for.
  select coalesce(sum(line_total), 0)
    into v_subtotal
    from invoice_lines
   where invoice_id = v_target_invoice_id and superseded_at is null;

  -- 2. The header inputs. STRICT: a missing invoice raises rather than pricing
  --    at zero VAT (0079's reasoning, kept). vat_rate is NOT NULL, so it needs
  --    no fallback — see §2 of the header.
  --
  --    `paid_amount` is READ here, not re-derived from `payments`. That is
  --    deliberate and it matters: this function is invoker-rights and runs as
  --    whoever wrote the line. Under Law 6 the floor roles are held off the
  --    money tables, so calling invoice_paid_net() here would make appending a
  --    damage line at return (R-03) fail with `permission denied for table
  --    payments` for exactly the staff who append it. The stored column is
  --    authoritative because 0087 rewrites it on every payment and every
  --    reversal; this path consumes it rather than competing with it.
  select discount_percent, vat_rate, coalesce(paid_amount, 0)
    into strict v_discount_pct, v_vat_rate, v_paid
    from invoices
   where id = v_target_invoice_id;

  -- 3. money.ts `price()`, step for step. Two rounds, not four: `taxable` and
  --    `total` are exact sums of already-rounded terms in the engine and are
  --    exact sums here. See the header for why this departs from §2.2's sketch.
  v_discount := invoice_discount_amount(v_subtotal, v_discount_pct);
  v_taxable  := v_subtotal - v_discount;
  v_vat      := invoice_vat_amount(v_taxable, v_vat_rate);
  v_total    := v_taxable + v_vat;

  -- 4. MONEY-04. Split the subtraction into its two floored halves, through the
  --    same two functions the payment path uses, so an overpayment neither
  --    vanishes nor trips invoices_amounts_non_negative. Before this, live ran
  --    `v_outstanding := v_total - v_paid` unfloored and an overpaid invoice
  --    raised 23514 HERE, refusing the line — including the damage line at
  --    return, which is the charge R-03 exists to add.
  --
  -- 5. One UPDATE, so the row is never briefly inconsistent and the audit trail
  --    carries one event per line change rather than two.
  --    `paid_amount` is not written: it is the payment path's column (0087).
  --    `status` is not written either — R-14 (a Draft is sticky) and R-04 (an
  --    issued invoice's figures are immutable) both live elsewhere, and a line
  --    edit is not an issue action.
  update invoices
     set subtotal           = v_subtotal,
         discount_amount    = v_discount,
         taxable_amount     = v_taxable,
         vat_amount         = v_vat,
         total_amount       = v_total,
         outstanding_amount = invoice_outstanding(v_total, v_paid),
         credit_amount      = invoice_credit(v_total, v_paid),
         updated_at         = now()
   where id = v_target_invoice_id;

  return null;
end;
$fn$;

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

  select count(*) into v_line_count from invoice_lines where invoice_id = v_invoice_id and superseded_at is null;
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
     and status = 'Draft'
     and voided_at is null
   for update;
  if not found then
    raise exception 'resync_draft_invoice: no Draft invoice for booking %.', v_booking.booking_no;
  end if;

  select * into v_invoice from invoices where id = v_invoice_id;
  if v_invoice.status <> 'Draft' or v_invoice.invoice_no is not null then
    raise exception 'resync_draft_invoice: invoice % is not a Draft (status %, invoice_no %).', v_invoice_id, v_invoice.status, v_invoice.invoice_no;
  end if;

  -- Preserve each old revision's exact quantities, prices and breakdown.
  -- Only active lines contribute to the invoice or appear in staff queries.
  update invoice_lines set superseded_at = now()
   where invoice_id = v_invoice_id and superseded_at is null;

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

  -- Booking-level discounts follow the booking too. The existing header trigger
  -- applies the same half-up discount/VAT arithmetic as the line-total trigger.
  update invoices
     set discount_percent = (select coalesce(sum(percent), 0) from booking_discounts where booking_id = p_booking_id)
   where id = v_invoice_id;

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
  'Rebuilds active Draft lines under an invoice lock; retains superseded revisions unchanged. '
  'Issued, voided or cancelled records cannot be resynced.';

-- 1. Add parent_booking_id to bookings
alter table public.bookings
  add column if not exists parent_booking_id uuid references public.bookings(id);

create index if not exists idx_bookings_parent_booking_id
  on public.bookings (parent_booking_id);

comment on column public.bookings.parent_booking_id is
  'Parent booking when this booking was created as an add-gear linked booking (W87)';

grant select (parent_booking_id) on public.bookings to authenticated;

-- 2. Update create_booking(jsonb) to support parent_booking_id
create or replace function public.create_booking(p_payload jsonb)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_client_uuid     uuid := (p_payload ->> 'client_uuid')::uuid;
  v_existing_id     uuid;
  v_existing_no     text;
  v_existing_stage  text;
  v_booking_id      uuid;
  v_booking_no      text;
  v_actor           uuid := (p_payload ->> 'created_by')::uuid;
  v_branch          uuid := (p_payload ->> 'branch_id')::uuid;
  v_lines           jsonb;
  v_line            jsonb;
  v_discount        jsonb;
  v_audit_id        uuid;
  v_line_count      integer := 0;
  v_unit_count      integer := 0;
  v_pending         jsonb;
  v_next            jsonb;
  v_parent_key      uuid;
  v_parent_id       uuid;
  v_wrote           integer;
  v_line_id         uuid;
  v_unit            jsonb;
  v_asset_product   uuid;
  v_dupe_assets     integer;
  v_base_rate       numeric;
  v_payload_rate    numeric;
  v_final_rate      numeric;
  v_rate_overridden boolean;
  /* 0168 */
  v_payload_total     numeric;
  v_payload_breakdown jsonb;
  v_final_total       numeric;
  v_line_qty          integer;
  v_line_days         integer;
  v_line_discount     numeric;
  v_computed_total    numeric;
  /* 0132 */
  v_crew            jsonb;
  v_transport       jsonb;
  v_crew_count      integer := 0;
  v_transport_written boolean := false;
  /* 0144 */
  v_project_type       text := nullif(btrim(p_payload ->> 'project_type'), '');
  v_project_type_other text := nullif(btrim(p_payload ->> 'project_type_other'), '');
  /* 0229 */
  v_project_name       text := nullif(btrim(coalesce(p_payload ->> 'project_name', p_payload ->> 'project', '')), '');
  v_shoot_location     text := nullif(btrim(coalesce(p_payload ->> 'shoot_location', '')), '');
  /* 0232 */
  v_parent_booking_id  uuid := nullif(coalesce(p_payload ->> 'parent_booking_id', p_payload ->> 'linked_booking_id', ''), '')::uuid;
begin
  if v_client_uuid is null then
    raise exception 'create_booking: client_uuid is required (Law 8 — every write carries one)';
  end if;
  if v_actor is null then
    raise exception 'create_booking: created_by is required; there is no system actor';
  end if;

  /* 0229 length validation */
  if length(v_project_name) > 120 then
    raise exception 'create_booking: project_name must be 120 characters or fewer. Nothing was created.'
      using errcode = '22026';
  end if;
  if length(v_shoot_location) > 120 then
    raise exception 'create_booking: shoot_location must be 120 characters or fewer. Nothing was created.'
      using errcode = '22026';
  end if;

  -- ── 0144 project-type validation, BEFORE anything is written ──────────────
  if v_project_type is not null and v_project_type not in (
    'Feature Film',
    'Short Film',
    'Documentary',
    'Commercial / Advertisement',
    'Music Video',
    'Corporate',
    'Wedding',
    'Event',
    'TV / Broadcast',
    'Web / Digital Content',
    'Photography',
    'Student Project',
    'Personal / Test Shoot',
    'Rental House / Sub-rental',
    'Other'
  ) then
    raise exception 'create_booking: project_type "%" is not an allowed value. Nothing was created.', v_project_type;
  end if;
  if v_project_type_other is not null and v_project_type <> 'Other' then
    raise exception 'create_booking: project_type_other is only used with project_type Other. Nothing was created.';
  end if;
  if v_project_type = 'Other' and v_project_type_other is null then
    raise exception 'create_booking: project_type Other requires project_type_other. Nothing was created.';
  end if;

  -- ── Law 8 replay check, BEFORE anything is written or any counter moves ──
  select id, booking_no, stage::text
    into v_existing_id, v_existing_no, v_existing_stage
    from bookings
   where client_uuid = v_client_uuid;
  if found then
    return jsonb_build_object(
      'booking_id',        v_existing_id,
      'booking_no',        v_existing_no,
      'stage',             v_existing_stage,
      'project_name',      v_project_name,
      'shoot_location',    v_shoot_location,
      'parent_booking_id', v_parent_booking_id,
      'replayed',          true
    );
  end if;

  -- Mark transaction as inside create_booking so the lines guard admits our writes
  perform set_config('app.in_create_booking', 'on', true);

  -- Never let money-blind callers override VAT (including selecting 0%).
  if p_payload ? 'vat_rate' and not coalesce(auth_can_view_money(), false) then
    raise exception 'GATE:gate.vat.money_blind|Only authorized money-visible staff can select a booking VAT rate'
      using errcode = '42501';
  end if;

  -- ── Discount gate for money-blind callers (Law 6) ─────────────────────────
  if jsonb_array_length(coalesce(p_payload -> 'discounts', '[]'::jsonb)) > 0 and not auth_can_view_money() then
    raise exception 'GATE:gate.discount.money_blind|Money-blind callers may not apply discounts (Law 6)'
      using errcode = 'P0001';
  end if;

  v_booking_no := next_document_number('booking');

  insert into bookings (
    client_uuid, booking_no, branch_id, client_id, contact_id,
    project, project_name, shoot_location, project_type, project_type_other, pickup_at, return_at, delivery_type,
    pickup_location, return_location, quote_expires_at, deposit_required,
    vat_rate, parent_booking_id, created_by, updated_by
  )
  values (
    v_client_uuid,
    v_booking_no,
    v_branch,
    (p_payload ->> 'client_id')::uuid,
    (p_payload ->> 'contact_id')::uuid,
    coalesce(v_project_name, p_payload ->> 'project'),
    v_project_name,
    v_shoot_location,
    v_project_type,
    v_project_type_other,
    (p_payload ->> 'pickup_at')::timestamptz,
    (p_payload ->> 'return_at')::timestamptz,
    (p_payload ->> 'delivery_type')::delivery_type,
    p_payload ->> 'pickup_location',
    p_payload ->> 'return_location',
    (p_payload ->> 'quote_expires_at')::timestamptz,
    coalesce((p_payload ->> 'deposit_required')::numeric, 0),
    case when p_payload ? 'vat_rate' then (p_payload ->> 'vat_rate')::numeric else null end,
    v_parent_booking_id,
    v_actor,
    v_actor
  )
  returning id into v_booking_id;

  -- ── Lines, in dependency order ────────────────────────────────────────────
  v_lines := coalesce(p_payload -> 'lines', '[]'::jsonb);

  for v_line in select * from jsonb_array_elements(v_lines)
  loop
    if v_line ->> 'client_uuid' is null then
      raise exception 'create_booking: every line needs its own client_uuid (one per ROW, not per action)';
    end if;
    if v_line ->> 'days' is null then
      raise exception 'create_booking: line % has no days; Law 9 requires it stated, not defaulted', v_line ->> 'client_uuid';
    end if;

    if jsonb_array_length(coalesce(v_line -> 'units', '[]'::jsonb))
         > coalesce((v_line ->> 'qty')::integer, 1) then
      raise exception
        'create_booking: line % carries more units (%) than its qty (%). Nothing was created.',
        v_line ->> 'client_uuid',
        jsonb_array_length(v_line -> 'units'),
        coalesce((v_line ->> 'qty')::integer, 1);
    end if;

    for v_unit in select * from jsonb_array_elements(coalesce(v_line -> 'units', '[]'::jsonb))
    loop
      if v_unit ->> 'client_uuid' is null then
        raise exception 'create_booking: every unit needs its own client_uuid (Law 8, one per ROW)';
      end if;
      if v_unit ->> 'asset_id' is null then
        raise exception 'create_booking: a unit entry on line % names no asset_id', v_line ->> 'client_uuid';
      end if;
    end loop;
  end loop;

  select count(*) - count(distinct u ->> 'asset_id')
    into v_dupe_assets
    from jsonb_array_elements(v_lines) l,
         jsonb_array_elements(coalesce(l -> 'units', '[]'::jsonb)) u;
  if coalesce(v_dupe_assets, 0) > 0 then
    raise exception 'create_booking: the same asset cannot be assigned to multiple lines. Nothing was created.';
  end if;

  v_pending := v_lines;

  while jsonb_array_length(v_pending) > 0 loop
    v_next := '[]'::jsonb;
    v_wrote := 0;

    for v_line in select * from jsonb_array_elements(v_pending)
    loop
      v_parent_key := (v_line ->> 'parent_client_uuid')::uuid;

      if v_parent_key is null then
        v_parent_id := null;
      else
        select id into v_parent_id
          from booking_lines
         where client_uuid = v_parent_key
           and booking_id = v_booking_id;

        if v_parent_id is null then
          v_next := v_next || jsonb_build_array(v_line);
          continue;
        end if;
      end if;

      -- ── S1-7: Line pricing calculation ─────────────────────────────────────
      if v_parent_id is not null or coalesce((v_line ->> 'is_included')::boolean, false) then
        v_base_rate := 0;
      elsif (v_line ->> 'product_id') is not null or (v_line ->> 'bundle_id') is not null then
        v_base_rate := get_model_daily_rate((v_line ->> 'product_id')::uuid, (v_line ->> 'bundle_id')::uuid);
      else
        v_base_rate := coalesce((v_line ->> 'rate')::numeric, 0);
      end if;

      v_payload_rate := (v_line ->> 'rate')::numeric;
      v_rate_overridden := false;

      if auth_can_view_money() then
        if v_payload_rate is not null then
          v_final_rate := v_payload_rate;
          if v_base_rate is not null and v_final_rate <> v_base_rate then
            v_rate_overridden := true;
          end if;
        else
          v_final_rate := coalesce(v_base_rate, 0);
        end if;
      else
        -- Money-blind caller: silently use server price
        v_final_rate := coalesce(v_base_rate, 0);
        v_rate_overridden := false;

        if v_payload_rate is not null and v_payload_rate <> v_final_rate then
          insert into audit_events (
            id, client_uuid, event_class, category, module, action, severity, status,
            table_name, record_id, actor_id, branch_id, reason, new_values
          )
          values (
            gen_random_uuid(),
            gen_random_uuid(),
            'override',
            'Rentals',
            'Rentals',
            'price.server_applied',
            'Informational',
            'Success',
            'booking_lines',
            v_booking_id,
            v_actor,
            v_branch,
            'Server-side price applied for money-blind caller (Law 6)',
            jsonb_build_object(
              'booking_no',   v_booking_no,
              'product_id',   v_line ->> 'product_id',
              'payload_rate', v_payload_rate,
              'applied_rate', v_final_rate
            )
          );
        end if;
      end if;

      -- ── 0168: Line total + price breakdown (G3) ──────────────────────────
      v_line_qty      := greatest(1, coalesce((v_line ->> 'qty')::integer, 1));
      v_line_days     := greatest(1, (v_line ->> 'days')::integer);
      v_line_discount := case when auth_can_view_money() then coalesce((v_line ->> 'discount_amount')::numeric, 0) else 0 end;
      v_computed_total := greatest(0, v_line_qty * v_line_days * v_final_rate - v_line_discount);

      v_payload_total := (v_line ->> 'line_total')::numeric;
      v_payload_breakdown := v_line -> 'price_breakdown';

      if not auth_can_view_money() then
        v_final_total := v_computed_total;
        v_payload_breakdown := null;
      elsif v_payload_total is not null then
        if v_payload_total < 0 then
          raise exception 'create_booking: line % carries a negative line_total %. Nothing was created.', v_line ->> 'client_uuid', v_payload_total;
        end if;
        if v_payload_total <> round(v_payload_total, 2) then
          raise exception 'create_booking: line % line_total % is not a whole-paisa figure. Nothing was created.', v_line ->> 'client_uuid', v_payload_total;
        end if;
        if v_payload_breakdown is not null and jsonb_typeof(v_payload_breakdown) <> 'object' then
          raise exception 'create_booking: line % price_breakdown must be a JSON object. Nothing was created.', v_line ->> 'client_uuid';
        end if;
        v_final_total := v_payload_total;
      else
        if v_payload_breakdown is not null then
          raise exception 'create_booking: line % carries a price_breakdown with no line_total. Nothing was created.', v_line ->> 'client_uuid';
        end if;
        v_final_total := v_computed_total;
      end if;

      insert into booking_lines (
        client_uuid, booking_id, line_type, parent_line_id, product_id, bundle_id,
        description, qty, days, rate, discount_amount, is_included, service_basis,
        supplier_id, supplier_cost, markup_amount, line_note, sort_order, created_by,
        rate_overridden, line_total, price_breakdown
      )
      values (
        (v_line ->> 'client_uuid')::uuid,
        v_booking_id,
        (v_line ->> 'line_type')::booking_line_type,
        v_parent_id,
        (v_line ->> 'product_id')::uuid,
        (v_line ->> 'bundle_id')::uuid,
        v_line ->> 'description',
        coalesce((v_line ->> 'qty')::integer, 1),
        (v_line ->> 'days')::integer,
        v_final_rate,
        case when auth_can_view_money() then coalesce((v_line ->> 'discount_amount')::numeric, 0) else 0 end,
        coalesce((v_line ->> 'is_included')::boolean, false),
        (v_line ->> 'service_basis')::service_basis,
        (v_line ->> 'supplier_id')::uuid,
        case when auth_can_view_money() then (v_line ->> 'supplier_cost')::numeric else null end,
        case when auth_can_view_money() then (v_line ->> 'markup_amount')::numeric else null end,
        v_line ->> 'line_note',
        coalesce((v_line ->> 'sort_order')::integer, v_line_count),
        v_actor,
        v_rate_overridden,
        v_final_total,
        v_payload_breakdown
      )
      returning id into v_line_id;

      -- ── D5: creation-time unit assignment ───────────────────────────────
      for v_unit in select * from jsonb_array_elements(coalesce(v_line -> 'units', '[]'::jsonb))
      loop
        if v_line ->> 'product_id' is not null then
          select product_id into v_asset_product
            from product_units
           where id = (v_unit ->> 'asset_id')::uuid;
          if v_asset_product is null then
            raise exception 'create_booking: unit % on line % names no known product_unit',
              v_unit ->> 'asset_id', v_line ->> 'client_uuid';
          end if;
          if v_asset_product <> (v_line ->> 'product_id')::uuid then
            raise exception
              'create_booking: unit % belongs to a different product than line %. Nothing was created.',
              v_unit ->> 'asset_id', v_line ->> 'client_uuid';
          end if;
        end if;

        insert into booking_line_units (client_uuid, booking_line_id, asset_id, qty, created_by)
        values (
          (v_unit ->> 'client_uuid')::uuid,
          v_line_id,
          (v_unit ->> 'asset_id')::uuid,
          1,
          v_actor
        );
        v_unit_count := v_unit_count + 1;
      end loop;

      v_line_count := v_line_count + 1;
      v_wrote := v_wrote + 1;
    end loop;

    if v_wrote = 0 then
      raise exception
        'create_booking: % line(s) name a parent_client_uuid that is not on this booking (or the parents form a cycle). Nothing was created.',
        jsonb_array_length(v_next);
    end if;

    v_pending := v_next;
  end loop;

  -- ── Discounts ────────────────────────────────────────────────────────────
  for v_discount in select * from jsonb_array_elements(coalesce(p_payload -> 'discounts', '[]'::jsonb))
  loop
    v_audit_id := gen_random_uuid();

    insert into audit_events (
      id, client_uuid, event_class, category, module, action, severity, status,
      table_name, record_id, actor_id, branch_id, reason, new_values
    )
    values (
      v_audit_id,
      coalesce((v_discount ->> 'audit_client_uuid')::uuid, gen_random_uuid()),
      'discount',
      'Rentals',
      'Rentals',
      'Create',
      'Informational',
      'Success',
      'booking_discounts',
      v_booking_id,
      v_actor,
      v_branch,
      v_discount ->> 'reason',
      jsonb_build_object(
        'discount_source', v_discount ->> 'discount_source',
        'percent',         v_discount ->> 'percent',
        'booking_no',      v_booking_no
      )
    );

    insert into booking_discounts (
      client_uuid, booking_id, branch_id, discount_source, percent,
      reason, approver_id, applied_by, coupon_id, audit_event_id
    )
    values (
      (v_discount ->> 'client_uuid')::uuid,
      v_booking_id,
      v_branch,
      coalesce((v_discount ->> 'discount_source')::discount_source, 'Manual'::discount_source),
      (v_discount ->> 'percent')::numeric,
      v_discount ->> 'reason',
      (v_discount ->> 'approver_id')::uuid,
      v_actor,
      (v_discount ->> 'coupon_id')::uuid,
      v_audit_id
    );
  end loop;

  -- ── Crew (0132) ───────────────────────────────────────────────────────────
  for v_crew in select * from jsonb_array_elements(coalesce(p_payload -> 'crew', '[]'::jsonb))
  loop
    if v_crew ->> 'client_uuid' is null then
      raise exception 'create_booking: every crew row needs its own client_uuid (Law 8, one per ROW)';
    end if;

    insert into booking_crew_lines (
      client_uuid, booking_id, crew_member_id, name, crew_role, phone,
      day_rate, days, overtime, accommodation, meals, created_by
    )
    values (
      (v_crew ->> 'client_uuid')::uuid,
      v_booking_id,
      (v_crew ->> 'crew_member_id')::uuid,
      v_crew ->> 'name',
      (v_crew ->> 'crew_role')::crew_role,
      v_crew ->> 'phone',
      coalesce((v_crew ->> 'day_rate')::numeric, 0),
      (v_crew ->> 'days')::integer,
      coalesce((v_crew ->> 'overtime')::numeric, 0),
      coalesce((v_crew ->> 'accommodation')::numeric, 0),
      coalesce((v_crew ->> 'meals')::numeric, 0),
      v_actor
    );
    v_crew_count := v_crew_count + 1;
  end loop;

  -- ── Transport (0132) ──────────────────────────────────────────────────────
  if jsonb_typeof(p_payload -> 'transport') = 'object' then
    v_transport := p_payload -> 'transport';
    if v_transport ->> 'client_uuid' is null then
      raise exception 'create_booking: the transport row needs its own client_uuid (Law 8)';
    end if;

    insert into booking_transport (
      client_uuid, booking_id, delivery_charge, fuel_charge,
      vehicle, number_plate, driver_contact, special_instructions, created_by
    )
    values (
      (v_transport ->> 'client_uuid')::uuid,
      v_booking_id,
      coalesce((v_transport ->> 'delivery_charge')::numeric, 0),
      coalesce((v_transport ->> 'fuel_charge')::numeric, 0),
      v_transport ->> 'vehicle',
      v_transport ->> 'number_plate',
      v_transport ->> 'driver_contact',
      v_transport ->> 'special_instructions',
      v_actor
    );
    v_transport_written := true;
  end if;

  return jsonb_build_object(
    'booking_id',        v_booking_id,
    'booking_no',        v_booking_no,
    'stage',             'Quote',
    'line_count',        v_line_count,
    'unit_count',        v_unit_count,
    'crew_lines',        v_crew_count,
    'transport_written', v_transport_written,
    'project_name',      v_project_name,
    'shoot_location',    v_shoot_location,
    'parent_booking_id', v_parent_booking_id,
    'replayed',          false
  );
end;
$$;

comment on function public.create_booking(jsonb) is
'0232: Atomic booking insertion supporting project_name, shoot_location, and parent_booking_id (W87 linked booking).';

revoke execute on function public.create_booking(jsonb) from public, anon;
grant execute on function public.create_booking(jsonb) to authenticated;

-- 3. read_booking_for_change(text)
create or replace function public.read_booking_for_change(p_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  b bookings;
  result jsonb;
  line_rows jsonb;
  crew_rows jsonb;
  transport_row jsonb;
  discounts jsonb;
  v_role text;
begin
  v_role := auth_user_role();
  if v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse') then
    raise exception 'You cannot edit this booking.' using errcode = '42501';
  end if;

  select * into b from bookings where id::text = p_id or booking_no = p_id;
  if b.id is null then
    raise exception 'Booking not found.';
  end if;

  if b.cancelled_at is not null then
    raise exception 'Cancelled bookings cannot be edited.';
  end if;

  if b.stage in ('Returned', 'Closed') or b.closed_at is not null then
    raise exception 'Returned or closed bookings cannot be edited. Use operational corrections.';
  end if;

  select coalesce(jsonb_agg(
    record_editor_private.pick(to_jsonb(l), array[
      'id', 'client_uuid', 'parent_line_id', 'line_type', 'product_id', 'bundle_id',
      'description', 'qty', 'days', 'rate', 'discount_amount', 'is_included',
      'service_basis', 'line_note', 'sort_order'
    ]) || jsonb_build_object(
      'name', coalesce(l.description, p.name, k.name),
      'parent_client_uuid', parent.client_uuid,
      'is_packed', exists (
        select 1 from packing_lines pl
         where pl.booking_line_id = l.id and pl.state = 'Packed'
      ) or (
        b.stage in ('Packed', 'On Rent') and exists (
          select 1 from booking_line_units blu
           where blu.booking_line_id = l.id and blu.released_at is null
        )
      )
    ) order by l.sort_order, l.id
  ), '[]'::jsonb) into line_rows
  from booking_lines l
  left join products p on p.id = l.product_id
  left join bundles k on k.id = l.bundle_id
  left join booking_lines parent on parent.id = l.parent_line_id
  where l.booking_id = b.id and l.voided_at is null;

  select coalesce(jsonb_agg(
    record_editor_private.pick(to_jsonb(c), array[
      'id', 'client_uuid', 'crew_member_id', 'name', 'crew_role', 'phone',
      'day_rate', 'days', 'overtime', 'accommodation', 'meals'
    ]) order by c.id
  ), '[]'::jsonb) into crew_rows
  from booking_crew_lines c
  where c.booking_id = b.id and c.voided_at is null;

  select record_editor_private.pick(to_jsonb(t), array[
    'id', 'vehicle', 'number_plate', 'driver_contact', 'delivery_charge', 'fuel_charge', 'special_instructions'
  ]) into transport_row
  from booking_transport t
  where t.booking_id = b.id;

  select coalesce(jsonb_agg(
    jsonb_build_object('id', id, 'percent', percent) order by id
  ), '[]'::jsonb) into discounts
  from booking_discounts
  where booking_id = b.id;

  result := jsonb_build_object(
    'id', b.id,
    'code', b.booking_no,
    'stage', b.stage,
    'parent_booking_id', b.parent_booking_id,
    'money_visible', coalesce(auth_can_view_money(), false),
    'values', record_editor_private.pick(to_jsonb(b), array[
      'client_id', 'contact_id', 'branch_id', 'project', 'project_name', 'shoot_location',
      'project_type', 'project_type_other', 'pickup_at', 'return_at',
      'delivery_type', 'pickup_location', 'return_location', 'deposit_required'
    ]),
    'lines', line_rows,
    'crew', crew_rows,
    'transport', transport_row,
    'discounts', discounts
  );

  result := result || jsonb_build_object(
    'revision', md5((result || jsonb_build_object('updated_at', b.updated_at, 'version', b.version))::text)
  );
  if not coalesce(auth_can_view_money(), false) then
    result := result || jsonb_build_object(
      'values', (result -> 'values') - 'deposit_required',
      'lines', coalesce((select jsonb_agg(x - 'rate' - 'discount_amount') from jsonb_array_elements(result -> 'lines') x), '[]'::jsonb),
      'crew', coalesce((select jsonb_agg(x - 'day_rate' - 'accommodation' - 'meals') from jsonb_array_elements(result -> 'crew') x), '[]'::jsonb),
      'transport', case when result -> 'transport' is null or result -> 'transport' = 'null'::jsonb then null else
        ((result -> 'transport') - 'delivery_charge' - 'fuel_charge') || jsonb_build_object(
          'special_instructions', regexp_replace(result -> 'transport' ->> 'special_instructions', ' \(Return Pickup Fee: Rs [0-9,.]+\)', '', 'g')
        ) end,
      'discounts', '[]'::jsonb
    );
  end if;
  return result;
end;
$$;

revoke all on function public.read_booking_for_change(text) from public, anon;
grant execute on function public.read_booking_for_change(text) to authenticated;

-- 4. change_booking(jsonb)
create or replace function public.change_booking(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking_id    uuid := (p_payload ->> 'booking_id')::uuid;
  v_key           uuid := nullif(coalesce(p_payload ->> 'client_uuid', p_payload ->> 'key', ''), '')::uuid;
  v_revision      text := p_payload ->> 'revision';
  v_role          text;
  v_actor         uuid;
  b               bookings%rowtype;
  req             jsonb;
  receipt         record;
  result          jsonb;
  row_data        jsonb;
  patch           jsonb;
  existing        jsonb;
  row_id          uuid;
  kept            uuid[] := '{}';
  kept_crew       uuid[] := '{}';
  mapping         jsonb := '{}';
  parent_id       uuid;
  transport_id    uuid;
  audit_id        uuid := gen_random_uuid();
  first_discount  uuid;
  discount_pct    numeric;
  rate            numeric;
  base_rate       numeric;
  v_new_pickup    timestamptz;
  v_new_return    timestamptz;
  v_dates_moved   boolean := false;
  v_period        tstzrange;
  v_old_snapshot  jsonb;
  v_protected_price boolean;
  v_line_qty      integer;
  v_line_days     integer;
  v_line_discount numeric(14,2);
  v_line_total    numeric(14,2);
begin
  -- 1. Role verification (W88: Any desk staff — Owner, Admin, Manager, Coordinator, Warehouse)
  v_role := auth_user_role();
  if v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse') then
    raise exception 'Permission denied: role % cannot change bookings.', coalesce(v_role, 'unidentified')
      using errcode = '42501';
  end if;

  if not coalesce(auth_can_view_money(), false) and (
    coalesce(p_payload -> 'values', '{}'::jsonb) ? 'deposit_required'
    or p_payload ? 'discount_percent' or p_payload ? 'crew' or p_payload ? 'transport'
    or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(p_payload -> 'lines') = 'array' then p_payload -> 'lines' else '[]'::jsonb end) x
               where x ?| array['rate', 'discount_amount', 'line_total', 'price_breakdown', 'supplier_cost', 'markup_amount'])
  ) then
    raise exception 'Money fields cannot be changed by this role.' using errcode = '42501';
  end if;

  if v_booking_id is null then
    raise exception 'change_booking: booking_id is required.';
  end if;

  if v_key is null or v_revision is null then
    raise exception 'Reload this booking before saving.';
  end if;

  v_actor := auth.uid();
  if v_actor is null or (nullif(p_payload ->> 'actor_id', '') is not null
      and (p_payload ->> 'actor_id')::uuid <> v_actor) then
    raise exception 'The save actor must be the signed-in user.' using errcode = '42501';
  end if;

  req := jsonb_build_object('booking', v_booking_id, 'revision', v_revision, 'payload', p_payload);

  -- Law 8 idempotency receipt check under advisory lock
  perform pg_advisory_xact_lock(hashtextextended(v_key::text, 0));
  select * into receipt from record_editor_private.receipts where key = v_key;
  if found then
    if receipt.actor <> auth.uid() or receipt.request <> req then
      raise exception 'This save key belongs to another change.';
    end if;
    if not coalesce(auth_can_view_money(), false) and coalesce((receipt.response ->> 'money_visible')::boolean, true) then
      raise exception 'Reload this booking before retrying after a role change.' using errcode = '42501';
    end if;
    return receipt.response;
  end if;

  -- 2. Lock booking and child rows
  select * into b from bookings where id = v_booking_id for update;
  if b.id is null then
    raise exception 'Booking not found.';
  end if;

  if b.cancelled_at is not null then
    raise exception 'change_booking: booking % is cancelled and cannot be changed.', b.booking_no;
  end if;

  if b.closed_at is not null or b.stage in ('Returned', 'Closed') then
    raise exception 'change_booking: booking % has stage % and cannot be changed.', b.booking_no, b.stage;
  end if;

  if b.stage not in ('Quote', 'Booked', 'Packed', 'On Rent') then
    raise exception 'change_booking: booking % is at stage % and cannot be changed.', b.booking_no, b.stage;
  end if;

  perform 1 from booking_lines where booking_id = v_booking_id for update;
  perform 1 from booking_crew_lines where booking_id = v_booking_id for update;
  perform 1 from booking_transport where booking_id = v_booking_id for update;
  perform 1 from booking_discounts where booking_id = v_booking_id for update;
  perform 1 from invoices where booking_id = v_booking_id for update;
  perform 1 from inventory_reservations where booking_id = v_booking_id for update;

  -- T3-14/O-14: a numbered invoice cannot silently diverge from its booking.
  if exists (select 1 from invoices where booking_id = v_booking_id
              and invoice_no is not null and status <> 'Void' and voided_at is null) then
    raise exception 'This booking has a numbered invoice. Changes are blocked pending the accountant-approved correction workflow.';
  end if;

  -- 3. Revision check
  v_old_snapshot := read_booking_for_change(v_booking_id::text);
  if (v_old_snapshot ->> 'revision') <> v_revision then
    raise exception 'This booking changed since you opened it. Reload the latest record before saving.'
      using errcode = '40001';
  end if;

  if jsonb_typeof(p_payload -> 'lines') <> 'array' then
    raise exception 'Invalid booking lines.';
  end if;

  if (p_payload -> 'values') ? 'client_id' and (p_payload -> 'values' ->> 'client_id') is distinct from b.client_id::text then
    raise exception 'The client cannot be changed on this booking. Keep the original client or create a new booking.';
  end if;

  -- 4. Check for packed units being silently removed (W88 / Step L73)
  -- "after Pack — removing an item asks Warehouse to unpack it (a floor session)"
  -- "lifecycle step: a packed unit cannot be silently removed"
  if b.stage in ('Packed', 'On Rent') then
    if exists (
      select 1 from booking_lines bl
       where bl.booking_id = v_booking_id
         and bl.voided_at is null
         and (
           exists (
             select 1 from packing_lines pl
              where pl.booking_line_id = bl.id
                and pl.state = 'Packed'
           ) or exists (
             select 1 from booking_line_units blu
              where blu.booking_line_id = bl.id
                and blu.released_at is null
           )
         )
         and not exists (
           select 1 from jsonb_array_elements(p_payload -> 'lines') pline
            where (pline ->> 'id')::uuid = bl.id
         )
    ) then
      raise exception 'A packed unit cannot be silently removed. Unpack the unit in Warehouse before removing it.';
    end if;
  end if;

  -- 5. Dates and header fields update
  patch := coalesce(p_payload -> 'values', '{}'::jsonb);
  if not coalesce(auth_can_view_money(), false) and patch ? 'delivery_type'
     and (patch ->> 'delivery_type') is distinct from b.delivery_type::text then
    raise exception 'Ask the booking desk to change delivery details.' using errcode = '42501';
  end if;
  v_new_pickup := coalesce((patch ->> 'pickup_at')::timestamptz, b.pickup_at);
  v_new_return := coalesce((patch ->> 'return_at')::timestamptz, b.return_at);

  if v_new_return < v_new_pickup then
    raise exception 'Return date cannot be earlier than pickup date.';
  end if;

  v_dates_moved := (v_new_pickup <> b.pickup_at or v_new_return <> b.return_at);
  v_period := tstzrange(v_new_pickup, v_new_return, '[)');

  update bookings
     set pickup_at          = v_new_pickup,
         return_at          = v_new_return,
         project            = coalesce(patch ->> 'project', project),
         project_name       = coalesce(patch ->> 'project_name', patch ->> 'project', project_name),
         shoot_location     = coalesce(patch ->> 'shoot_location', shoot_location),
         project_type       = coalesce(patch ->> 'project_type', project_type),
         project_type_other = case when patch ? 'project_type_other' then patch ->> 'project_type_other' else project_type_other end,
         delivery_type      = coalesce((patch ->> 'delivery_type')::delivery_type, delivery_type),
         pickup_location    = coalesce(patch ->> 'pickup_location', pickup_location),
         return_location    = coalesce(patch ->> 'return_location', return_location),
         deposit_required   = coalesce((patch ->> 'deposit_required')::numeric, deposit_required),
         updated_at         = clock_timestamp(),
         updated_by         = v_actor
   where id = v_booking_id;

  -- 6. Upsert Lines
  for row_data in select value from jsonb_array_elements(p_payload -> 'lines') loop
    row_id := (row_data ->> 'id')::uuid;
    if row_id is not null then
      select to_jsonb(l) into existing from booking_lines l where id = row_id and booking_id = v_booking_id and voided_at is null;
      if existing is null then
        raise exception 'A line no longer belongs to this booking. Reload before saving.';
      end if;
      if row_data ->> 'client_uuid' is distinct from existing ->> 'client_uuid' then
        raise exception 'A line identity cannot change.';
      end if;
      if b.stage in ('Packed', 'On Rent') and (
        exists (select 1 from packing_lines pl where pl.booking_line_id = row_id and pl.state = 'Packed')
        or exists (select 1 from booking_line_units blu where blu.booking_line_id = row_id and blu.released_at is null)
      ) and (
        (row_data ->> 'product_id') is distinct from (existing ->> 'product_id')
        or (row_data ->> 'bundle_id') is distinct from (existing ->> 'bundle_id')
        or (row_data ->> 'line_type') is distinct from (existing ->> 'line_type')
        or (row_data ->> 'qty')::integer is distinct from (existing ->> 'qty')::integer
        or (row_data ->> 'parent_client_uuid') is distinct from (
          select parent.client_uuid::text from booking_lines parent
           where parent.id = (existing ->> 'parent_line_id')::uuid
        )
      ) then
        raise exception 'Unpack the unit in Warehouse before changing its identity or quantity.';
      end if;
    else
      existing := null;
    end if;

    if row_data ->> 'client_uuid' is null then
      raise exception 'Every line needs a stable key.';
    end if;
    if not coalesce(auth_can_view_money(), false) and existing is null
       and (row_data ->> 'parent_client_uuid' is not null or coalesce((row_data ->> 'is_included')::boolean, false)) then
      raise exception 'A money-visible desk user must add bundle components.' using errcode = '42501';
    end if;

    -- Ordinary daily lines also store a total (0168). Reprice only when the
    -- previous total matches its arithmetic; keep structure/custom snapshots.
    v_protected_price := existing is not null and (
      coalesce(existing -> 'price_breakdown', 'null'::jsonb) <> 'null'::jsonb
      or ((existing ->> 'line_total') is not null and (existing ->> 'line_total')::numeric <>
        greatest(0, (existing ->> 'qty')::integer * (existing ->> 'days')::integer
          * (existing ->> 'rate')::numeric - coalesce((existing ->> 'discount_amount')::numeric, 0)))
    );
    if v_protected_price
       and (v_dates_moved
         or (row_data ->> 'qty')::integer is distinct from (existing ->> 'qty')::integer
         or (row_data ->> 'days')::integer is distinct from (existing ->> 'days')::integer
         or (row_data ->> 'product_id') is distinct from (existing ->> 'product_id')
         or (row_data ->> 'bundle_id') is distinct from (existing ->> 'bundle_id')
         or (row_data ->> 'line_type') is distinct from (existing ->> 'line_type')
         or (row_data ->> 'service_basis') is distinct from (existing ->> 'service_basis')
         or (row_data ->> 'parent_client_uuid') is distinct from (
           select parent.client_uuid::text from booking_lines parent where parent.id = (existing ->> 'parent_line_id')::uuid
         )
         or coalesce((row_data ->> 'is_included')::boolean, false) is distinct from coalesce((existing ->> 'is_included')::boolean, false)
         or (coalesce(auth_can_view_money(), false) and (
           (row_data ? 'rate' and (row_data ->> 'rate')::numeric is distinct from (existing ->> 'rate')::numeric)
           or (row_data ? 'discount_amount' and coalesce((row_data ->> 'discount_amount')::numeric, 0) is distinct from coalesce((existing ->> 'discount_amount')::numeric, 0))
         ))) then
      raise exception 'This line has stored pricing and cannot be changed until it is repriced safely.';
    end if;
    if existing is not null and (row_data ->> 'qty')::integer < (
      select count(*) from booking_line_units where booking_line_id = row_id and released_at is null
    ) then
      raise exception 'Unassign units before reducing the quantity.';
    end if;

    if existing is not null and (
      (row_data ->> 'product_id') is distinct from (existing ->> 'product_id')
      or (row_data ->> 'qty')::integer is distinct from (existing ->> 'qty')::integer
    ) then
      if (row_data ->> 'product_id') is distinct from (existing ->> 'product_id') and exists (
        select 1 from booking_line_units where booking_line_id = row_id and released_at is null
      ) then
        raise exception 'Unassign the units before changing the item.';
      end if;
      update inventory_reservations set released_at = now(), released_reason = 'Booking line changed'
       where booking_line_id = row_id and released_at is null and asset_id is null;
    end if;

    patch := record_editor_private.pick(row_data, array[
      'line_type', 'product_id', 'bundle_id', 'description', 'qty', 'days',
      'rate', 'discount_amount', 'is_included', 'service_basis', 'line_note', 'sort_order'
    ]);

    if not coalesce(auth_can_view_money(), false) and existing is not null and (
      (patch ->> 'product_id') is distinct from (existing ->> 'product_id')
      or (patch ->> 'bundle_id') is distinct from (existing ->> 'bundle_id')
      or (patch ->> 'line_type') is distinct from (existing ->> 'line_type')
      or coalesce((patch ->> 'is_included')::boolean, false) is distinct from coalesce((existing ->> 'is_included')::boolean, false)
    ) then
      raise exception 'Remove and add an item to change its identity.';
    end if;
    if not coalesce(auth_can_view_money(), false) and existing is not null then
      -- Preserve the existing negotiated rate and discount; never accept money from the caller.
      rate := (existing ->> 'rate')::numeric;
      patch := patch || jsonb_build_object('rate', rate, 'rate_overridden', coalesce((existing ->> 'rate_overridden')::boolean, false));
    elsif row_data ->> 'parent_client_uuid' is not null or coalesce((patch ->> 'is_included')::boolean, false) then
      rate := 0; base_rate := 0;
      patch := patch || jsonb_build_object('rate', rate, 'rate_overridden', false);
    else
      base_rate := get_model_daily_rate((patch ->> 'product_id')::uuid, (patch ->> 'bundle_id')::uuid);
      if not coalesce(auth_can_view_money(), false) and base_rate is null then
        raise exception 'A priced catalogue item is required.';
      end if;
      rate := coalesce((patch ->> 'rate')::numeric, base_rate, 0);
      patch := patch || jsonb_build_object('rate', rate, 'rate_overridden', base_rate is not null and rate <> base_rate);
    end if;

    if not v_protected_price then
      v_line_qty := coalesce((patch ->> 'qty')::integer, (existing ->> 'qty')::integer, 1);
      v_line_days := coalesce((patch ->> 'days')::integer, (existing ->> 'days')::integer, 1);
      if v_line_qty < 1 or v_line_days < 1 then
        raise exception 'Quantity and charged days must be at least one.';
      end if;
      if coalesce(patch ->> 'service_basis', existing ->> 'service_basis') = 'Flat' and v_line_days <> 1 then
        raise exception 'A flat charge must have one charged day.';
      end if;
      rate := rate::numeric(14,2);
      v_line_discount := coalesce((patch ->> 'discount_amount')::numeric, (existing ->> 'discount_amount')::numeric, 0);
      v_line_total := v_line_qty * v_line_days * rate - v_line_discount;
      if v_line_discount < 0 or v_line_total < 0 then
        raise exception 'A line discount cannot exceed its charge.';
      end if;
      patch := patch || jsonb_build_object('line_total', v_line_total, 'price_breakdown', null);
    end if;

    if row_id is null then
      patch := patch || jsonb_build_object('booking_id', v_booking_id, 'client_uuid', row_data ->> 'client_uuid', 'created_by', v_actor);
    end if;

    row_id := record_editor_private.write_row('booking_lines', row_id, patch);
    if row_id = any(kept) then
      raise exception 'A booking line appears twice.';
    end if;
    kept := array_append(kept, row_id);
    mapping := mapping || jsonb_build_object(row_data ->> 'client_uuid', row_id);
  end loop;

  -- Link parent lines (for bundles)
  for row_data in select value from jsonb_array_elements(p_payload -> 'lines') loop
    row_id := (mapping ->> (row_data ->> 'client_uuid'))::uuid;
    parent_id := (mapping ->> (row_data ->> 'parent_client_uuid'))::uuid;
    if row_data ->> 'parent_client_uuid' is not null and parent_id is null then
      raise exception 'The bundle parent is missing.';
    end if;
    update booking_lines set parent_line_id = parent_id where id = row_id;
  end loop;

  -- Void lines not kept
  update booking_lines
     set voided_at = now(),
         voided_reason = 'Removed while changing booking'
   where booking_id = v_booking_id
     and voided_at is null
     and not id = any(kept);

  -- Release reservations for voided lines
  update inventory_reservations
     set released_at = now(),
         released_reason = 'Line removed from booking'
   where booking_id = v_booking_id
     and released_at is null
     and not booking_line_id = any(kept);

  -- 7. Update reservations for confirmed bookings (Booked, Packed, On Rent)
  if b.stage in ('Booked', 'Packed', 'On Rent') then
    -- If dates moved, update period on existing reservations
    -- GiST exclusion constraint on inventory_reservations fires here if there is a clash!
    if v_dates_moved then
      update inventory_reservations
         set period = v_period
       where booking_id = v_booking_id
         and released_at is null;
    end if;

    -- 7a. Serialised units (if any live assigned unit exists without a reservation)
    insert into inventory_reservations (
      client_uuid, booking_id, booking_line_id, asset_id, qty, period, created_by, hold_state
    )
    select gen_random_uuid(), v_booking_id, bl.id, blu.asset_id, 1, v_period, v_actor, 'confirmed'
      from booking_lines bl
      join booking_line_units blu on blu.booking_line_id = bl.id
     where bl.booking_id = v_booking_id
       and bl.id = any(kept)
       and bl.voided_at is null
       and blu.released_at is null
       and not exists (
         select 1 from inventory_reservations r
          where r.booking_id = v_booking_id
            and r.asset_id = blu.asset_id
            and r.released_at is null
       );

    -- 7b. Quantity items: ensure quantity holds cover bl.qty
    insert into inventory_reservations (
      client_uuid, booking_id, booking_line_id, product_id, qty, period, created_by, hold_state
    )
    select gen_random_uuid(), v_booking_id, bl.id, bl.product_id,
           bl.qty - coalesce(u.n, 0) - coalesce(res.n, 0),
           v_period, v_actor, 'confirmed'
      from booking_lines bl
      left join lateral (
        select count(*) as n
          from booking_line_units blu
         where blu.booking_line_id = bl.id
           and blu.released_at is null
      ) u on true
      left join lateral (
        select coalesce(sum(r.qty), 0) as n
          from inventory_reservations r
         where r.booking_line_id = bl.id
           and r.product_id = bl.product_id
           and r.asset_id is null
           and r.released_at is null
      ) res on true
     where bl.booking_id = v_booking_id
       and bl.id = any(kept)
       and bl.voided_at is null
       and bl.product_id is not null
       and (bl.qty - coalesce(u.n, 0) - coalesce(res.n, 0)) > 0;
  end if;

  -- 8. Crew lines
  if p_payload ? 'crew' and jsonb_typeof(p_payload -> 'crew') = 'array' then
    for row_data in select value from jsonb_array_elements(p_payload -> 'crew') loop
      row_id := (row_data ->> 'id')::uuid;
      if row_id is not null and not exists (
        select 1 from booking_crew_lines where id = row_id and booking_id = v_booking_id and voided_at is null
      ) then
        raise exception 'This crew row does not belong to the booking.';
      end if;
      patch := record_editor_private.pick(row_data, array[
        'crew_member_id', 'name', 'crew_role', 'phone', 'day_rate', 'days',
        'overtime', 'accommodation', 'meals'
      ]);
      if row_id is null then
        patch := patch || jsonb_build_object('booking_id', v_booking_id, 'client_uuid', gen_random_uuid(), 'created_by', v_actor);
      end if;
      row_id := record_editor_private.write_row('booking_crew_lines', row_id, patch);
      kept_crew := array_append(kept_crew, row_id);
    end loop;
    update booking_crew_lines
       set voided_at = now()
     where booking_id = v_booking_id
       and voided_at is null
       and not id = any(kept_crew);
  end if;

  -- 9. Transport
  if p_payload ? 'transport' and jsonb_typeof(p_payload -> 'transport') = 'object' then
    select id into transport_id from booking_transport where booking_id = v_booking_id;
    patch := record_editor_private.pick(p_payload -> 'transport', array[
      'vehicle', 'number_plate', 'driver_contact', 'delivery_charge', 'fuel_charge', 'special_instructions'
    ]);
    if transport_id is not null or patch <> '{}'::jsonb then
      if transport_id is null then
        patch := patch || jsonb_build_object('booking_id', v_booking_id, 'client_uuid', gen_random_uuid(), 'created_by', v_actor);
      end if;
      perform record_editor_private.write_row('booking_transport', transport_id, patch);
    end if;
  end if;

  -- 10. Audit event (inserted before child references like booking_discounts)
  insert into audit_events (
    id, client_uuid, event_class, category, module, action, severity, status,
    table_name, record_id, actor_id, actor_role, branch_id, old_values, new_values, reason
  ) values (
    audit_id, v_key, 'status change', 'Rentals', 'Rentals', 'Update', 'Informational', 'Success',
    'bookings', v_booking_id, v_actor, v_role::system_role, b.branch_id,
    jsonb_build_object('revision', v_revision, 'stage', b.stage),
    jsonb_build_object('edited', b.stage, 'lines_count', array_length(kept, 1)),
    coalesce(p_payload ->> 'reason', 'Changed confirmed booking')
  );

  -- 11. Discounts
  if p_payload ? 'discount_percent' then
    discount_pct := (p_payload ->> 'discount_percent')::numeric;
    if discount_pct is not null and (discount_pct < 0 or discount_pct > 100) then
      raise exception 'Discount must be between 0 and 100 percent.';
    end if;
    if discount_pct is not null and discount_pct is distinct from (select coalesce(sum(percent), 0) from booking_discounts where booking_id = v_booking_id) then
      select id into first_discount from booking_discounts where booking_id = v_booking_id order by id limit 1;
      if first_discount is null and discount_pct > 0 then
        insert into booking_discounts (
          client_uuid, booking_id, branch_id, discount_source, percent, reason, applied_by, audit_event_id
        ) values (
          gen_random_uuid(), v_booking_id, b.branch_id, 'Manual', discount_pct, 'Booking changed', v_actor, audit_id
        );
      else
        update booking_discounts
           set percent = case when id = first_discount then discount_pct else 0 end,
               reason = 'Booking changed',
               audit_event_id = audit_id
         where booking_id = v_booking_id;
      end if;
    end if;
  end if;

  -- 12. Resync Draft invoice if one exists (T3-14 / W15)
  if exists (select 1 from invoices where booking_id = v_booking_id and status = 'Draft') then
    perform public.resync_draft_invoice(v_booking_id);
  end if;

  -- 13. Read updated booking and record receipt
  result := read_booking_for_change(v_booking_id::text);
  insert into record_editor_private.receipts (key, actor, request, response)
  values (v_key, auth.uid(), req, result);

  return result;
end;
$$;

revoke all on function public.change_booking(jsonb) from public, anon;
grant execute on function public.change_booking(jsonb) to authenticated;

commit;
