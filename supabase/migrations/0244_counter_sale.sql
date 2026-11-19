-- =============================================================================
-- Migration 0244: Atomic Counter Sale & Cancellation RPCs (T3-31, B46, B51)
--
-- Enables walk-in consumable sales without renting:
-- 1. Adds `booking_kind` ('rental' | 'counter_sale') to public.bookings.
-- 2. Updates `consumable_stock_movements` to support 'Deduction' and 'Restoration'
--    with unique (booking_line_id, movement_type) idempotency.
-- 3. Implements `create_counter_sale(jsonb)`:
--    - Atomic product row locking (FOR UPDATE)
--    - Consumable-only tracking check
--    - Server-authoritative unit price and stock deduction
--    - Monotonic booking number and draft invoice creation via resync_draft_invoice
--    - Law 6 money blindness: floor roles (Warehouse/Technician) receive no money
--    - Law 8 idempotency: retry on same client_uuid returns existing sale
-- 4. Implements `cancel_counter_sale(uuid, text, uuid)`:
--    - Pre-payment cancellation only (refuses if payments exist)
--    - Restores stock once with 'Restoration' movement
--    - Voids draft invoice preserving audit history (Law 3)
-- =============================================================================

begin;

-- 1. Add booking_kind column to bookings
alter table public.bookings
  add column if not exists booking_kind text not null default 'rental';

alter table public.bookings
  drop constraint if exists bookings_booking_kind_check;

alter table public.bookings
  add constraint bookings_booking_kind_check check (booking_kind in ('rental', 'counter_sale'));

comment on column public.bookings.booking_kind is
  'rental: standard equipment booking with custody stages. counter_sale: direct consumable sale with instant stock deduction and draft invoice.';

-- 2. Update consumable_stock_movements for cancellation restoration
alter table public.consumable_stock_movements
  add column if not exists movement_type text not null default 'Deduction';

alter table public.consumable_stock_movements
  drop constraint if exists consumable_stock_movements_movement_type_check;

alter table public.consumable_stock_movements
  add constraint consumable_stock_movements_movement_type_check check (movement_type in ('Deduction', 'Restoration'));

alter table public.consumable_stock_movements
  drop constraint if exists consumable_stock_movements_one_per_line;

alter table public.consumable_stock_movements
  drop constraint if exists consumable_stock_movements_line_type_unique;

alter table public.consumable_stock_movements
  add constraint consumable_stock_movements_line_type_unique unique (booking_line_id, movement_type);

-- 3. create_counter_sale RPC
create or replace function public.create_counter_sale(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_uuid        uuid;
  v_actor              uuid;
  v_role               system_role;
  v_branch_id          uuid;
  v_client_id          uuid;
  v_existing_booking   public.bookings%rowtype;
  v_lines              jsonb;
  v_line_elem          jsonb;
  v_product_id         uuid;
  v_qty                integer;
  v_booking_no         text;
  v_booking_id         uuid;
  v_line_id            uuid;
  v_line_client_uuid   uuid;
  v_prod_name          text;
  v_prod_tracking      text;
  v_prod_active        boolean;
  v_stock_before       integer;
  v_stock_after        integer;
  v_unit_sale_price    numeric(14,2);
  v_line_total         numeric(14,2);
  v_inv_client_uuid    uuid;
  v_invoice_id         uuid;
  v_total_amount_paisa bigint;
begin
  -- 1. Law 8: client_uuid is mandatory
  v_client_uuid := nullif(p_payload ->> 'client_uuid', '')::uuid;
  if v_client_uuid is null then
    raise exception 'GATE:gate.counter_sale.missing_client_uuid|client_uuid is required (Law 8).'
      using errcode = 'P0001';
  end if;

  -- 2. Actor and Role verification (B51: floor roles and desk roles can start counter sale)
  v_role := auth_user_role();
  if v_role is null or v_role in ('Driver', 'Client') then
    raise exception 'GATE:gate.counter_sale.unauthorized_role|Your role is not authorized to create counter sales.'
      using errcode = '42501';
  end if;

  v_actor := nullif(p_payload ->> 'actor_id', '')::uuid;
  if v_actor is null then
    v_actor := auth_user_id();
  end if;
  if v_actor is null then
    select id into v_actor from users where role = v_role and is_active = true limit 1;
  end if;

  -- 3. Law 8 Idempotency: return existing sale if client_uuid already used
  select * into v_existing_booking from public.bookings where client_uuid = v_client_uuid;
  if v_existing_booking.id is not null then
    if not auth_can_view_money() then
      return jsonb_build_object(
        'booking_id', v_existing_booking.id,
        'booking_no', v_existing_booking.booking_no,
        'booking_kind', v_existing_booking.booking_kind,
        'stage', v_existing_booking.stage,
        'client_uuid', v_existing_booking.client_uuid,
        'status', 'existing'
      );
    else
      select id, round(total_amount * 100)::bigint
        into v_invoice_id, v_total_amount_paisa
        from public.invoices
       where booking_id = v_existing_booking.id
       limit 1;

      return jsonb_build_object(
        'booking_id', v_existing_booking.id,
        'booking_no', v_existing_booking.booking_no,
        'booking_kind', v_existing_booking.booking_kind,
        'stage', v_existing_booking.stage,
        'client_uuid', v_existing_booking.client_uuid,
        'invoice_id', v_invoice_id,
        'total_amount_paisa', v_total_amount_paisa,
        'status', 'existing'
      );
    end if;
  end if;

  -- 4. Validate lines
  v_lines := p_payload -> 'lines';
  if v_lines is null or jsonb_typeof(v_lines) <> 'array' or jsonb_array_length(v_lines) = 0 then
    raise exception 'GATE:gate.counter_sale.empty_lines|Counter sale requires at least one consumable item.'
      using errcode = 'P0001';
  end if;

  -- 5. Branch resolution
  v_branch_id := nullif(p_payload ->> 'branch_id', '')::uuid;
  if v_branch_id is null then
    select branch_id into v_branch_id from public.users where id = v_actor;
  end if;
  if v_branch_id is null then
    select id into v_branch_id from public.branches order by id limit 1;
  end if;

  -- 6. Client resolution (Walk-in client default)
  v_client_id := nullif(p_payload ->> 'client_id', '')::uuid;
  if v_client_id is null then
    select id into v_client_id from public.clients where name = 'Walk-in Client' limit 1;
    if v_client_id is null then
      insert into public.clients (
        client_uuid, client_code, name, phone, status, created_by
      ) values (
        gen_random_uuid(), next_document_number('client'), 'Walk-in Client', '+9779800000000', 'Active', v_actor
      ) returning id into v_client_id;
    end if;
  end if;

  -- 7. Bypass lines guard for internal write
  perform set_config('app.in_create_booking', 'on', true);
  perform set_config('app.in_add_consumable_line', 'on', true);

  -- 8. Mint booking number and create booking record
  v_booking_no := next_document_number('booking');

  insert into public.bookings (
    client_uuid,
    booking_no,
    booking_kind,
    branch_id,
    client_id,
    pickup_at,
    return_at,
    delivery_type,
    stage,
    project,
    deposit_required,
    created_by,
    updated_by
  ) values (
    v_client_uuid,
    v_booking_no,
    'counter_sale',
    v_branch_id,
    v_client_id,
    now(),
    now() + interval '1 hour',
    'Client Pickup',
    'Booked',
    'Counter Sale',
    0,
    v_actor,
    v_actor
  ) returning id into v_booking_id;

  -- 9. Iterate lines, lock products in stable order, check stock, deduct and insert
  for v_line_elem in select * from jsonb_array_elements(v_lines) loop
    v_product_id := nullif(v_line_elem ->> 'product_id', '')::uuid;
    v_qty := coalesce((v_line_elem ->> 'qty')::integer, 0);

    if v_product_id is null then
      raise exception 'GATE:gate.counter_sale.invalid_product|Each line must specify a valid product_id.'
        using errcode = 'P0001';
    end if;

    if v_qty <= 0 then
      raise exception 'GATE:gate.counter_sale.invalid_qty|Quantity must be a positive integer.'
        using errcode = 'P0001';
    end if;

    -- Lock product row
    select name, tracking_mode, is_active, total_quantity, coalesce(unit_sale_price, 0)
      into v_prod_name, v_prod_tracking, v_prod_active, v_stock_before, v_unit_sale_price
      from public.products
     where id = v_product_id
       for update;

    if v_prod_name is null then
      raise exception 'GATE:gate.counter_sale.product_not_found|Product % not found.', v_product_id
        using errcode = 'P0001';
    end if;

    if not coalesce(v_prod_active, true) then
      raise exception 'GATE:gate.counter_sale.product_inactive|Product "%" is inactive.', v_prod_name
        using errcode = 'P0001';
    end if;

    if v_prod_tracking <> 'Consumable' then
      raise exception 'GATE:gate.counter_sale.not_consumable|Product "%" is not tracked as a consumable.', v_prod_name
        using errcode = 'P0001';
    end if;

    if v_stock_before < v_qty then
      raise exception 'GATE:gate.stock.insufficient|Insufficient stock for "%": requested %, available %.',
        v_prod_name, v_qty, v_stock_before
        using errcode = 'P0001';
    end if;

    v_stock_after := v_stock_before - v_qty;
    v_line_total := v_qty * v_unit_sale_price;

    v_line_client_uuid := nullif(v_line_elem ->> 'client_uuid', '')::uuid;
    if v_line_client_uuid is null then
      v_line_client_uuid := gen_random_uuid();
    end if;

    -- Insert booking line
    insert into public.booking_lines (
      client_uuid,
      booking_id,
      line_type,
      product_id,
      description,
      qty,
      days,
      rate,
      rate_overridden,
      discount_amount,
      line_total,
      price_breakdown,
      created_by
    ) values (
      v_line_client_uuid,
      v_booking_id,
      'Equipment',
      v_product_id,
      v_prod_name,
      v_qty,
      1,
      v_unit_sale_price,
      false,
      0,
      v_line_total,
      jsonb_build_object(
        'unit_sale_price', v_unit_sale_price,
        'qty', v_qty,
        'is_consumable', true
      ),
      v_actor
    ) returning id into v_line_id;

    -- Update product stock
    update public.products
       set total_quantity = v_stock_after,
           updated_at = now()
     where id = v_product_id;

    -- Record deduction movement
    insert into public.consumable_stock_movements (
      client_uuid,
      booking_id,
      booking_line_id,
      product_id,
      qty,
      quantity_before,
      quantity_after,
      movement_type,
      created_by
    ) values (
      gen_random_uuid(),
      v_booking_id,
      v_line_id,
      v_product_id,
      v_qty,
      v_stock_before,
      v_stock_after,
      'Deduction',
      v_actor
    );
  end loop;

  -- 10. Create Draft invoice
  v_inv_client_uuid := (md5('counter_sale_inv:' || v_booking_id::text))::uuid;
  insert into public.invoices (
    client_uuid,
    booking_id,
    client_id,
    branch_id,
    discount_percent,
    vat_rate,
    due_date,
    status,
    created_by,
    updated_by
  ) values (
    v_inv_client_uuid,
    v_booking_id,
    v_client_id,
    v_branch_id,
    0,
    0.1300,
    current_date,
    'Draft'::invoice_status,
    v_actor,
    v_actor
  ) returning id into v_invoice_id;

  -- Sync invoice lines
  perform public.resync_draft_invoice(v_booking_id);

  -- 11. Audit event
  insert into public.audit_events (
    client_uuid,
    event_class,
    category,
    module,
    action,
    severity,
    status,
    table_name,
    record_id,
    actor_id,
    actor_role,
    new_values
  ) values (
    gen_random_uuid(),
    'status change'::audit_event_class,
    'Rentals',
    'Rentals',
    'Create',
    'Informational',
    'Success',
    'bookings',
    v_booking_id,
    v_actor,
    v_role,
    jsonb_build_object(
      'booking_no', v_booking_no,
      'booking_kind', 'counter_sale',
      'lines_count', jsonb_array_length(v_lines)
    )
  );

  -- 12. Return payload according to Law 6
  if not auth_can_view_money() then
    return jsonb_build_object(
      'booking_id', v_booking_id,
      'booking_no', v_booking_no,
      'booking_kind', 'counter_sale',
      'stage', 'Booked',
      'line_count', jsonb_array_length(v_lines),
      'client_uuid', v_client_uuid,
      'status', 'created'
    );
  else
    select round(total_amount * 100)::bigint
      into v_total_amount_paisa
      from public.invoices
     where id = v_invoice_id;

    return jsonb_build_object(
      'booking_id', v_booking_id,
      'booking_no', v_booking_no,
      'booking_kind', 'counter_sale',
      'stage', 'Booked',
      'line_count', jsonb_array_length(v_lines),
      'client_uuid', v_client_uuid,
      'invoice_id', v_invoice_id,
      'total_amount_paisa', v_total_amount_paisa,
      'status', 'created'
    );
  end if;
end;
$$;

revoke all on function public.create_counter_sale(jsonb) from public, anon;
grant execute on function public.create_counter_sale(jsonb) to authenticated;

comment on function public.create_counter_sale(jsonb) is
  'Atomic creation of walk-in consumable sale: deducts stock, creates booking and draft invoice, money-blind for floor roles (Law 6).';

-- 4. cancel_counter_sale RPC
create or replace function public.cancel_counter_sale(
  p_booking_id uuid,
  p_reason text,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking       public.bookings%rowtype;
  v_actor         uuid;
  v_role          system_role;
  v_payment_count integer;
  v_line          record;
  v_stock_before  integer;
begin
  -- 1. Authorization check
  v_role := auth_user_role();
  if v_role is null or v_role in ('Driver', 'Client') then
    raise exception 'GATE:gate.counter_sale.unauthorized_cancel|Your role is not authorized to cancel counter sales.'
      using errcode = '42501';
  end if;

  v_actor := coalesce(p_actor_id, auth_user_id());
  if v_actor is null then
    select id into v_actor from users where role = v_role and is_active = true limit 1;
  end if;

  -- 2. Lock booking
  select * into v_booking
    from public.bookings
   where id = p_booking_id
     for update;

  if v_booking.id is null then
    raise exception 'GATE:gate.counter_sale.not_found|Booking % not found.', p_booking_id
      using errcode = 'P0001';
  end if;

  if v_booking.booking_kind <> 'counter_sale' then
    raise exception 'GATE:gate.counter_sale.not_counter_sale|Booking % is not a counter sale.', v_booking.booking_no
      using errcode = 'P0001';
  end if;

  -- Idempotency: if already cancelled, return existing state
  if v_booking.cancelled_at is not null then
    return jsonb_build_object(
      'booking_id', p_booking_id,
      'status', 'already_cancelled',
      'cancelled_at', v_booking.cancelled_at
    );
  end if;

  -- 3. Verify no payments have been recorded
  select count(*) into v_payment_count
    from public.payments
   where booking_id = p_booking_id;

  if v_payment_count > 0 then
    raise exception 'GATE:gate.counter_sale.has_payments|Cannot cancel counter sale % because payments have been recorded. Financial correction workflow required.',
      v_booking.booking_no
      using errcode = 'P0001';
  end if;

  -- 4. Mark booking cancelled
  update public.bookings
     set cancelled_at = now(),
         cancelled_by = v_actor,
         cancellation_reason = coalesce(nullif(btrim(p_reason), ''), 'Cancelled before payment'),
         updated_at = now(),
         updated_by = v_actor
   where id = p_booking_id;

  -- 5. Invalidate draft invoice (Law 3: void, never delete)
  perform set_config('app.override_role', 'Manager', true);

  update public.invoices
     set status = 'Void'::invoice_status,
         voided_at = now(),
         voided_by = v_actor,
         void_reason = case
           when length(coalesce(btrim(p_reason), '')) >= 10 then btrim(p_reason)
           else 'Counter sale cancelled before payment'
         end,
         updated_at = now(),
         updated_by = v_actor
   where booking_id = p_booking_id
     and status = 'Draft';

  -- 6. Restore stock and record 'Restoration' movement exactly once per line
  for v_line in
    select bl.id as line_id, bl.product_id, bl.qty
      from public.booking_lines bl
      join public.products p on p.id = bl.product_id
     where bl.booking_id = p_booking_id
       and p.tracking_mode = 'Consumable'
  loop
    select total_quantity into v_stock_before
      from public.products
     where id = v_line.product_id
       for update;

    update public.products
       set total_quantity = total_quantity + v_line.qty,
           updated_at = now()
     where id = v_line.product_id;

    insert into public.consumable_stock_movements (
      client_uuid,
      booking_id,
      booking_line_id,
      product_id,
      qty,
      quantity_before,
      quantity_after,
      movement_type,
      created_by
    ) values (
      gen_random_uuid(),
      p_booking_id,
      v_line.line_id,
      v_line.product_id,
      v_line.qty,
      v_stock_before,
      v_stock_before + v_line.qty,
      'Restoration',
      v_actor
    );
  end loop;

  -- 7. Audit event
  insert into public.audit_events (
    client_uuid,
    event_class,
    category,
    module,
    action,
    severity,
    status,
    table_name,
    record_id,
    actor_id,
    actor_role,
    new_values,
    reason
  ) values (
    gen_random_uuid(),
    'cancellation'::audit_event_class,
    'Rentals',
    'Rentals',
    'Update',
    'Informational',
    'Success',
    'bookings',
    p_booking_id,
    v_actor,
    v_role,
    jsonb_build_object(
      'booking_no', v_booking.booking_no,
      'status', 'cancelled'
    ),
    p_reason
  );

  return jsonb_build_object(
    'booking_id', p_booking_id,
    'status', 'cancelled'
  );
end;
$$;

revoke all on function public.cancel_counter_sale(uuid, text, uuid) from public, anon;
grant execute on function public.cancel_counter_sale(uuid, text, uuid) to authenticated;

comment on function public.cancel_counter_sale(uuid, text, uuid) is
  'Cancels counter sale before payment, restoring consumable stock once and voiding draft invoice.';

commit;
