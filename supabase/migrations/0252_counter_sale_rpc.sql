-- Forward-only migration 0252: Counter Sale RPC, stock deduction, and cancellation (T3-31, B46, B51, W16)
--
-- A walk-in buys consumables without renting (B46). Anyone can start it (B51):
--   - Floor roles pick items and quantities (no prices shown, Law 6) and hand them over;
--   - The desk takes payment (or cancels before payment).
--   - One atomic server action creates the sale, deducts stock, and drafts the invoice.
--   - No Pack, Handover or Return steps or photos (consumables permanently leave).
--   - Cancel before payment restores stock and voids draft invoice.

begin;

-- =============================================================================
-- 1. Schema Extensions
-- =============================================================================

alter table public.bookings
  add column if not exists is_counter_sale boolean not null default false;

create table if not exists public.counter_sale_movements (
  id              uuid          not null default gen_random_uuid() primary key,
  client_uuid     uuid          not null unique,
  booking_id      uuid          not null references public.bookings(id),
  booking_line_id uuid          not null references public.booking_lines(id),
  product_id      uuid          not null references public.products(id),
  movement_type   text          not null check (movement_type in ('sale', 'reversal')),
  qty             integer       not null check (qty > 0),
  quantity_before integer       not null check (quantity_before >= 0),
  quantity_after  integer       not null check (quantity_after >= 0),
  created_at      timestamptz   not null default now(),
  created_by      uuid          not null references public.users(id)
);

create index if not exists idx_counter_sale_movements_booking
  on public.counter_sale_movements (booking_id);

create index if not exists idx_counter_sale_movements_product
  on public.counter_sale_movements (product_id, created_at desc);

alter table public.counter_sale_movements enable row level security;

create policy counter_sale_movements_select on public.counter_sale_movements
  for select to authenticated using (true);

revoke all on public.counter_sale_movements from public, anon;
grant select on public.counter_sale_movements to authenticated;

-- =============================================================================
-- 2. create_counter_sale(p_payload jsonb) RPC
-- =============================================================================
create or replace function public.create_counter_sale(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_uuid       uuid := nullif(p_payload ->> 'client_uuid', '')::uuid;
  v_actor             uuid := auth_user_id();
  v_role              system_role := auth_user_role();
  v_client_id         uuid := nullif(p_payload ->> 'client_id', '')::uuid;
  v_branch_id         uuid := nullif(p_payload ->> 'branch_id', '')::uuid;
  v_notes             text := btrim(coalesce(p_payload ->> 'notes', 'Counter Sale'));
  v_lines             jsonb := coalesce(p_payload -> 'lines', '[]'::jsonb);
  v_booking_id        uuid;
  v_booking_no        text;
  v_invoice_id        uuid;
  v_now               timestamptz := now();
  v_can_see_money     boolean := auth_can_view_money();
  v_elem              jsonb;
  v_prod              public.products%rowtype;
  v_line_qty          integer;
  v_line_rate         numeric(14,2);
  v_line_total        numeric(14,2);
  v_line_uuid         uuid;
  v_booking_line_id   uuid;
  v_stock_before      integer;
  v_stock_after       integer;
  v_lines_count       integer := 0;
  v_total_amount      numeric(14,2) := 0;
begin
  if v_client_uuid is null then
    raise exception 'create_counter_sale: client_uuid is required (Law 8).' using errcode = 'P0001';
  end if;

  if v_actor is null then
    raise exception 'create_counter_sale: authenticated user required.' using errcode = '42501';
  end if;

  -- Anyone on staff can start a counter sale (B51)
  if v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician') then
    raise exception 'create_counter_sale: permission denied for role %.', v_role using errcode = '42501';
  end if;

  if jsonb_array_length(v_lines) = 0 then
    raise exception 'create_counter_sale: at least one consumable item line is required.' using errcode = 'P0001';
  end if;

  -- Set transaction flag so get_model_daily_rate and line price guards accept server-side pricing
  perform set_config('app.in_create_booking', 'on', true);

  -- Default client if not provided
  if v_client_id is null then
    select id into v_client_id from public.clients where status = 'Active' order by created_at asc limit 1;
    if v_client_id is null then
      raise exception 'create_counter_sale: no active client found.' using errcode = 'P0001';
    end if;
  end if;

  -- Default branch if not provided
  if v_branch_id is null then
    v_branch_id := auth_user_branch_id();
    if v_branch_id is null then
      select id into v_branch_id from public.branches order by created_at asc limit 1;
    end if;
  end if;

  -- Idempotency check: if booking already exists with this client_uuid, return it
  select id, booking_no into v_booking_id, v_booking_no
    from public.bookings
   where client_uuid = v_client_uuid;

  if v_booking_id is not null then
    select id into v_invoice_id from public.invoices where booking_id = v_booking_id limit 1;
    return jsonb_build_object(
      'success', true,
      'booking_id', v_booking_id,
      'booking_no', v_booking_no,
      'invoice_id', v_invoice_id,
      'is_counter_sale', true,
      'replayed', true
    );
  end if;

  -- Generate document numbers
  v_booking_no := next_document_number('booking');
  v_booking_id := gen_random_uuid();

  -- 1. Create booking (stage = Returned, skip custody stages)
  insert into public.bookings (
    id,
    client_uuid,
    booking_no,
    branch_id,
    client_id,
    stage,
    delivery_type,
    pickup_at,
    return_at,
    is_counter_sale,
    project_name,
    created_by,
    updated_by
  ) values (
    v_booking_id,
    v_client_uuid,
    v_booking_no,
    v_branch_id,
    v_client_id,
    'Returned'::booking_stage,
    'Client Pickup'::delivery_type,
    v_now,
    v_now + interval '1 day',
    true,
    coalesce(nullif(v_notes, ''), 'Counter Sale'),
    v_actor,
    v_actor
  );

  -- 2. Process each line
  for v_elem in select * from jsonb_array_elements(v_lines) loop
    v_line_qty := coalesce((v_elem ->> 'qty')::integer, 1);
    if v_line_qty <= 0 then
      raise exception 'create_counter_sale: item quantity must be positive.' using errcode = 'P0001';
    end if;

    select * into v_prod from public.products where id = (v_elem ->> 'product_id')::uuid for update;
    if not found then
      raise exception 'create_counter_sale: product % not found.', (v_elem ->> 'product_id') using errcode = 'P0001';
    end if;

    if v_prod.tracking_mode <> 'Consumable' then
      raise exception 'create_counter_sale: product % is not a consumable item.', v_prod.name using errcode = 'P0001';
    end if;

    if coalesce(v_prod.total_quantity, 0) < v_line_qty then
      raise exception 'create_counter_sale: insufficient stock for product % (available: %, requested: %).',
        v_prod.name, coalesce(v_prod.total_quantity, 0), v_line_qty
        using errcode = 'P0001';
    end if;

    -- Resolve unit rate (server-side pricing)
    v_line_rate := get_model_daily_rate(v_prod.id, null);
    v_line_total := v_line_rate * v_line_qty;
    v_total_amount := v_total_amount + v_line_total;

    v_line_uuid := coalesce(nullif(v_elem ->> 'client_uuid', '')::uuid, gen_random_uuid());
    v_booking_line_id := gen_random_uuid();

    -- Insert booking line
    insert into public.booking_lines (
      id,
      client_uuid,
      booking_id,
      line_type,
      product_id,
      description,
      qty,
      days,
      rate,
      line_total,
      created_by
    ) values (
      v_booking_line_id,
      v_line_uuid,
      v_booking_id,
      'Equipment'::booking_line_type,
      v_prod.id,
      v_prod.name,
      v_line_qty,
      1,
      v_line_rate,
      v_line_total,
      v_actor
    );

    -- Deduct stock
    v_stock_before := v_prod.total_quantity;
    v_stock_after := v_stock_before - v_line_qty;

    update public.products
       set total_quantity = v_stock_after,
           updated_at = v_now
     where id = v_prod.id;

    -- Record in counter_sale_movements
    insert into public.counter_sale_movements (
      client_uuid,
      booking_id,
      booking_line_id,
      product_id,
      movement_type,
      qty,
      quantity_before,
      quantity_after,
      created_by
    ) values (
      gen_random_uuid(),
      v_booking_id,
      v_booking_line_id,
      v_prod.id,
      'sale',
      v_line_qty,
      v_stock_before,
      v_stock_after,
      v_actor
    );

    v_lines_count := v_lines_count + 1;
  end loop;

  -- 3. Create Draft Invoice
  v_invoice_id := gen_random_uuid();
  insert into public.invoices (
    id,
    client_uuid,
    booking_id,
    client_id,
    branch_id,
    status,
    due_date,
    created_by,
    updated_by
  ) values (
    v_invoice_id,
    gen_random_uuid(),
    v_booking_id,
    v_client_id,
    v_branch_id,
    'Draft'::invoice_status,
    current_date,
    v_actor,
    v_actor
  );

  -- Re-sync draft invoice to populate lines and calculate VAT/totals
  perform public.resync_draft_invoice(v_booking_id);

  -- 4. Audit Event
  insert into public.audit_events (
    client_uuid,
    table_name,
    record_id,
    action,
    actor_id,
    branch_id,
    reason,
    new_values
  ) values (
    gen_random_uuid(),
    'bookings',
    v_booking_id,
    'Create'::audit_action,
    v_actor,
    v_branch_id,
    'Counter sale initiated at desk',
    jsonb_build_object(
      'booking_no', v_booking_no,
      'line_count', v_lines_count,
      'is_counter_sale', true
    )
  );

  return jsonb_build_object(
    'success',          true,
    'booking_id',       v_booking_id,
    'booking_no',       v_booking_no,
    'invoice_id',       v_invoice_id,
    'line_count',       v_lines_count,
    'is_counter_sale',  true,
    'total_amount',     case when v_can_see_money then v_total_amount else null end
  );
end;
$$;

revoke all on function public.create_counter_sale(jsonb) from public, anon;
grant execute on function public.create_counter_sale(jsonb) to authenticated;

-- =============================================================================
-- 3. cancel_counter_sale(p_payload jsonb) RPC
-- =============================================================================
create or replace function public.cancel_counter_sale(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking_id      uuid := nullif(p_payload ->> 'booking_id', '')::uuid;
  v_reason          text := btrim(coalesce(p_payload ->> 'reason', ''));
  v_actor           uuid := auth_user_id();
  v_role            system_role := auth_user_role();
  v_booking         public.bookings%rowtype;
  v_line            record;
  v_stock_before    integer;
  v_stock_after     integer;
  v_now             timestamptz := now();
begin
  if v_booking_id is null then
    raise exception 'cancel_counter_sale: booking_id is required.' using errcode = 'P0001';
  end if;

  if char_length(v_reason) < 10 then
    raise exception 'cancel_counter_sale: cancellation reason must be at least 10 characters.' using errcode = 'P0001';
  end if;

  if v_actor is null then
    raise exception 'cancel_counter_sale: authenticated user required.' using errcode = '42501';
  end if;

  if v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Accounts') then
    raise exception 'GATE:gate.counter_sale.cancel_role|Only Manager, Admin, Owner, or Accounts may cancel a counter sale.' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = v_booking_id for update;
  if not found then
    raise exception 'cancel_counter_sale: booking % not found.', v_booking_id using errcode = 'P0001';
  end if;

  if not coalesce(v_booking.is_counter_sale, false) then
    raise exception 'cancel_counter_sale: booking % is not a counter sale.', v_booking.booking_no using errcode = 'P0001';
  end if;

  if v_booking.cancelled_at is not null then
    return jsonb_build_object('success', true, 'booking_id', v_booking_id, 'already_cancelled', true);
  end if;

  -- Assure no payments have been recorded on this sale's invoice
  if exists (
    select 1
      from public.payments p
      join public.invoices inv on inv.id = p.invoice_id
     where inv.booking_id = v_booking_id
       and p.status = 'Received'
  ) then
    raise exception 'GATE:gate.counter_sale.has_payment|Cannot cancel a counter sale with recorded payments. Issue a refund/credit note instead.' using errcode = 'P0001';
  end if;

  -- 1. Void draft invoice
  update public.invoices
     set status = 'Void',
         void_reason = v_reason,
         voided_at = v_now,
         voided_by = v_actor
   where booking_id = v_booking_id
     and status = 'Draft';

  -- 2. Restore stock for each consumable line
  for v_line in
    select bl.id as line_id, bl.product_id, bl.qty
      from public.booking_lines bl
     where bl.booking_id = v_booking_id
       and bl.voided_at is null
  loop
    select total_quantity into v_stock_before from public.products where id = v_line.product_id for update;
    v_stock_after := v_stock_before + v_line.qty;

    update public.products
       set total_quantity = v_stock_after,
           updated_at = v_now
     where id = v_line.product_id;

    insert into public.counter_sale_movements (
      client_uuid,
      booking_id,
      booking_line_id,
      product_id,
      movement_type,
      qty,
      quantity_before,
      quantity_after,
      created_by
    ) values (
      gen_random_uuid(),
      v_booking_id,
      v_line.line_id,
      v_line.product_id,
      'reversal',
      v_line.qty,
      v_stock_before,
      v_stock_after,
      v_actor
    );
  end loop;

  -- 3. Mark booking Cancelled via cancelled_at
  update public.bookings
     set cancelled_at = v_now,
         cancelled_by = v_actor,
         cancellation_reason = v_reason,
         updated_at = v_now,
         updated_by = v_actor
   where id = v_booking_id;

  -- 4. Audit Event
  insert into public.audit_events (
    client_uuid,
    table_name,
    record_id,
    action,
    actor_id,
    branch_id,
    reason,
    new_values
  ) values (
    gen_random_uuid(),
    'bookings',
    v_booking_id,
    'Update'::audit_action,
    v_actor,
    v_booking.branch_id,
    v_reason,
    jsonb_build_object(
      'booking_no', v_booking.booking_no,
      'reason', v_reason,
      'restored', true
    )
  );

  return jsonb_build_object(
    'success',      true,
    'booking_id',   v_booking_id,
    'cancelled_at', v_now,
    'restored',     true
  );
end;
$$;

revoke all on function public.cancel_counter_sale(jsonb) from public, anon;
grant execute on function public.cancel_counter_sale(jsonb) to authenticated;

commit;
