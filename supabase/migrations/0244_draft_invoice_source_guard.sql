-- T3-14: fail closed on invoice lines without verified resync provenance.
-- Existing rows are intentionally unclassified; no inference from category or text.
begin;
alter table public.invoice_lines add column resync_managed boolean not null default false;
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

  select * into v_invoice from invoices where id = v_invoice_id for update;
  if v_invoice.status <> 'Draft' or v_invoice.invoice_no is not null then
    raise exception 'resync_draft_invoice: invoice % is not a Draft (status %, invoice_no %).', v_invoice_id, v_invoice.status, v_invoice.invoice_no;
  end if;

  -- Old invoice lines have no reliable provenance. Refuse before any deletion;
  -- the caller transaction rolls back its booking change as well.
  if exists (select 1 from invoice_lines where invoice_id = v_invoice_id and not resync_managed) then
    raise exception 'GATE:gate.invoice.unclassified_lines|Invoice lines require review before changing this booking.';
  end if;
  delete from invoice_lines where invoice_id = v_invoice_id and resync_managed;
  update invoices set
    discount_percent = (select coalesce(sum(percent), 0) from booking_discounts where booking_id = p_booking_id),
    vat_rate = coalesce(v_booking.vat_rate, 0.1300)
  where id = v_invoice_id;

  -- 4. Equipment / Bundle / Accessory / Service / Sub-rental lines
  --    Source: booking_lines (voided_at is null)
  --    Arithmetic mirrors 0168:848-877
  --    client_uuid is NEW for each line (gen_random_uuid) to avoid unique constraint
  --    collisions across source tables and on concurrent resyncs.
  insert into invoice_lines (
    client_uuid, invoice_id, line_kind, description, resync_managed,
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
    true,
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
    client_uuid, invoice_id, line_kind, description, resync_managed,
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
    true,
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
    client_uuid, invoice_id, line_kind, description, resync_managed,
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
    true,
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


commit;
