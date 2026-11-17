-- Migration 0239: Consumables pricing, restock movements, add consumable line, and low stock alerts (T3-30)
-- =============================================================================
-- RULINGS: B14, B35, B54; OPEN_DECISIONS #4 (Option A confirmed); Law 1, Law 6, Law 8
--
-- 1. Unit Sale Price on products:
--    products gains unit_sale_price numeric(14,2) (paisa in code, stored in NPR).
--    Column-masked in products_v (null for Warehouse, Technician, Driver, Client).
--
-- 2. Consumable line pricing:
--    create_booking computes consumable lines as: qty * unit_sale_price - discount,
--    NEVER multiplied by days. A 3-day booking with 2 tape rolls charges 2 units, not 6.
--
-- 3. Restocking:
--    Table consumable_restock_movements tracks quantity, supplier, cost (masked), date,
--    staff member, quantity_before and quantity_after.
--    restock_consumable() RPC validates role, updates total_quantity, and logs movement.
--
-- 4. Add Consumable to Booking:
--    add_consumable_line() allows floor and desk roles to add consumable items to a
--    booking. Server-authoritative unit price, idempotent via client_uuid.
--    Returns prices only to authorized money roles (Law 6).
--
-- 5. Low stock alerts:
--    get_low_stock_alerts() returns products at or below reorder_level without money.
--    get_morning_digest() updated to include low stock items.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. products.unit_sale_price and products_v column masking
-- -----------------------------------------------------------------------------
alter table public.products
  add column if not exists unit_sale_price numeric(14,2) check (unit_sale_price is null or unit_sale_price >= 0);

comment on column public.products.unit_sale_price is
  'Server-authoritative unit sale price for consumables (gaffer tape, gels, batteries). Money-masked from floor roles (Law 6).';

-- Rebuild products_v with unit_sale_price masked via auth_can_view_money()
create or replace view public.products_v as
 select id,
    client_uuid,
    asset_code,
    name,
    short_name,
    category_id,
    brand,
    model,
    manufacturer,
    description,
    thumbnail_url,
    tracking_mode,
    status,
    total_quantity,
    reorder_level,
    quantity_unit,
    purchase_date,
        CASE
            WHEN auth_can_view_money() THEN purchase_price
            ELSE NULL::numeric
        END AS purchase_price,
        CASE
            WHEN auth_can_view_money() THEN replacement_value
            ELSE NULL::numeric
        END AS replacement_value,
        CASE
            WHEN auth_can_view_money() THEN daily_rate
            ELSE NULL::numeric
        END AS daily_rate,
        CASE
            WHEN auth_can_view_money() THEN weekly_rate
            ELSE NULL::numeric
        END AS weekly_rate,
        CASE
            WHEN auth_can_view_money() THEN monthly_rate
            ELSE NULL::numeric
        END AS monthly_rate,
        CASE
            WHEN auth_can_view_money() THEN hourly_rate
            ELSE NULL::numeric
        END AS hourly_rate,
        CASE
            WHEN auth_can_view_money() THEN weekend_rate
            ELSE NULL::numeric
        END AS weekend_rate,
        CASE
            WHEN auth_can_view_money() THEN deposit_percent
            ELSE NULL::numeric
        END AS deposit_percent,
        CASE
            WHEN auth_can_view_money() THEN deposit_fixed
            ELSE NULL::numeric
        END AS deposit_fixed,
    min_rental_days,
    rental_enabled,
    prep_time_minutes,
    cleaning_time_minutes,
    inspection_required,
    packing_required,
    is_subrental_only,
    weight_kg,
    case_capacity,
    supplier_id,
    notes_internal,
    notes_warehouse,
    notes_rental,
    is_active,
    created_at,
    created_by,
    updated_at,
    updated_by,
        CASE
            WHEN auth_can_view_money() THEN unit_sale_price
            ELSE NULL::numeric
        END AS unit_sale_price
   FROM products
  where auth_is_staff();

revoke all on public.products_v from public, anon;
grant select on public.products_v to authenticated;

comment on view public.products_v is
  'Column-masked read surface for products — unit_sale_price and rates resolve to NULL for money-blind roles (Law 6).';

-- -----------------------------------------------------------------------------
-- 2. Update get_model_daily_rate to support consumables unit_sale_price
-- -----------------------------------------------------------------------------
create or replace function public.get_model_daily_rate(p_product_id uuid, p_bundle_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not auth_can_view_money() and (auth_user_role() not in ('Warehouse') or current_setting('app.in_create_booking', true) is distinct from 'on') then
    raise exception 'Financial rate access is not permitted' using errcode = '42501';
  end if;

  if p_product_id is not null then
    return (select coalesce(unit_sale_price, daily_rate) from products where id = p_product_id);
  end if;
  if p_bundle_id is not null then
    return (select daily_rate from bundles where id = p_bundle_id);
  end if;
  return null;
end;
$$;

revoke all on function public.get_model_daily_rate(uuid, uuid) from public, anon;
grant execute on function public.get_model_daily_rate(uuid, uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. guard_booking_lines_money_blind update for add_consumable_line bypass
-- -----------------------------------------------------------------------------
create or replace function public.guard_booking_lines_money_blind()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_setting('app.in_create_booking', true) = 'on'
     or current_setting('app.in_add_consumable_line', true) = 'on' then
    return NEW;
  end if;

  if not auth_can_view_money() then
    if (NEW.rate is not null and NEW.rate <> 0)
       or (NEW.discount_amount is not null and NEW.discount_amount <> 0)
       or NEW.supplier_cost is not null
       or NEW.markup_amount is not null
       or NEW.line_total is not null
       or NEW.price_breakdown is not null then
      raise exception 'GATE:gate.booking_lines.money_blind_insert|Money-blind callers cannot insert money figures into booking_lines outside create_booking'
        using errcode = 'P0001';
    end if;
  end if;

  return NEW;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. create_booking update: consumable lines charge qty * unit_sale_price, not * days
-- -----------------------------------------------------------------------------
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
  /* T3-30 */
  v_is_consumable     boolean;
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
      'booking_id',     v_existing_id,
      'booking_no',     v_existing_no,
      'stage',          v_existing_stage,
      'project_name',   v_project_name,
      'shoot_location', v_shoot_location,
      'replayed',       true
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
    vat_rate, created_by, updated_by
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

      -- T3-30: Check consumable tracking mode
      v_is_consumable := false;
      if (v_line ->> 'product_id') is not null then
        select (p.tracking_mode = 'Consumable') into v_is_consumable
          from products p where p.id = (v_line ->> 'product_id')::uuid;
        v_is_consumable := coalesce(v_is_consumable, false);
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

      -- ── 0168 / T3-30: Line total + price breakdown (G3) ──────────────────────
      v_line_qty      := greatest(1, coalesce((v_line ->> 'qty')::integer, 1));
      v_line_days     := greatest(1, (v_line ->> 'days')::integer);
      v_line_discount := case when auth_can_view_money() then coalesce((v_line ->> 'discount_amount')::numeric, 0) else 0 end;

      if v_is_consumable then
        v_computed_total := greatest(0, v_line_qty * v_final_rate - v_line_discount);
      else
        v_computed_total := greatest(0, v_line_qty * v_line_days * v_final_rate - v_line_discount);
      end if;

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
        case when v_is_consumable then 1 else (v_line ->> 'days')::integer end,
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

      -- ── D5: creation-time unit assignment ──────────────────────────────────
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

  -- ── Discounts ─────────────────────────────────────────────────────────────
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
      (v_discount ->> 'discount_source')::discount_source,
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
    'replayed',          false
  );
end;
$$;

revoke all on function public.create_booking(jsonb) from public, anon;
grant execute on function public.create_booking(jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Restock Movements Table and Restock RPC
-- -----------------------------------------------------------------------------
create table if not exists public.consumable_restock_movements (
  id              uuid          not null default gen_random_uuid() primary key,
  client_uuid     uuid          not null unique,
  product_id      uuid          not null references public.products(id),
  qty             integer       not null check (qty > 0),
  supplier        text,
  cost            numeric(14,2) check (cost is null or cost >= 0),
  received_date   date          not null default current_date,
  quantity_before integer       not null check (quantity_before >= 0),
  quantity_after  integer       not null check (quantity_after >= 0),
  created_at      timestamptz   not null default now(),
  created_by      uuid          not null references public.users(id),
  constraint consumable_restock_movements_arithmetic check (quantity_after = quantity_before + qty)
);

create index if not exists idx_consumable_restock_movements_product
  on public.consumable_restock_movements (product_id, created_at desc);

alter table public.consumable_restock_movements enable row level security;

-- Base table direct select: restricted to money-visible management roles
create policy consumable_restock_movements_select on public.consumable_restock_movements
  for select to authenticated
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Accounts'));

revoke all on public.consumable_restock_movements from public, anon;
grant select on public.consumable_restock_movements to authenticated;

-- Masked view: all staff can view restock movements; cost is masked for floor roles (Law 6)
create or replace view public.consumable_restock_movements_v as
select
  id,
  client_uuid,
  product_id,
  qty,
  supplier,
  case when auth_can_view_money() then cost else null::numeric end as cost,
  received_date,
  quantity_before,
  quantity_after,
  created_at,
  created_by
from public.consumable_restock_movements
where auth_is_staff();

revoke all on public.consumable_restock_movements_v from public, anon;
grant select on public.consumable_restock_movements_v to authenticated;

comment on view public.consumable_restock_movements_v is
  'Read view for consumable restock history. cost is NULL for Warehouse, Technician and Driver (Law 6).';

create or replace function public.restock_consumable(
  p_product_id uuid,
  p_qty integer,
  p_supplier text default null,
  p_cost numeric default null,
  p_received_date date default null,
  p_client_uuid uuid default null
)
returns table (
  id uuid,
  product_id uuid,
  qty integer,
  quantity_before integer,
  quantity_after integer,
  supplier text,
  cost numeric,
  received_date date
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role text := auth_user_role();
  v_before integer;
  v_after integer;
  v_tracking product_tracking_mode;
  v_can_money boolean := auth_can_view_money();
  v_effective_cost numeric := null;
  v_date date := coalesce(p_received_date, current_date);
  v_existing public.consumable_restock_movements%rowtype;
  v_inserted_id uuid;
begin
  if not auth_is_staff() or v_role is null then
    raise exception 'GATE:gate.restock.auth_required|Staff authentication is required to restock inventory.' using errcode = '42501';
  end if;

  if p_client_uuid is null then
    raise exception 'GATE:gate.restock.idempotency|Restock requires a client UUID (Law 8).' using errcode = 'P0001';
  end if;

  if p_qty is null or p_qty <= 0 then
    raise exception 'GATE:gate.restock.invalid_qty|Restock quantity must be a positive integer.' using errcode = 'P0001';
  end if;

  -- Lock product
  select p.total_quantity, p.tracking_mode into v_before, v_tracking
    from products p where p.id = p_product_id for update;
  if not found then
    raise exception 'GATE:gate.restock.product_not_found|Product not found.' using errcode = 'P0001';
  end if;

  -- Check existing idempotency
  select * into v_existing from consumable_restock_movements crm where crm.client_uuid = p_client_uuid;
  if found then
    if v_existing.product_id <> p_product_id or v_existing.qty <> p_qty then
      raise exception 'GATE:gate.restock.idempotency_conflict|Client UUID already belongs to a different restock movement.' using errcode = 'P0001';
    end if;
    return query select
      v_existing.id,
      v_existing.product_id,
      v_existing.qty,
      v_existing.quantity_before,
      v_existing.quantity_after,
      v_existing.supplier,
      case when v_can_money then v_existing.cost else null::numeric end,
      v_existing.received_date;
    return;
  end if;

  if v_tracking = 'Serialised' then
    raise exception 'GATE:gate.restock.wrong_tracking_mode|Serialised products must be restocked by adding individual units with serial numbers.' using errcode = 'P0001';
  end if;

  -- Only money-visible roles can record cost (Law 6)
  if v_can_money and p_cost is not null and p_cost >= 0 then
    v_effective_cost := p_cost;
  end if;

  v_after := v_before + p_qty;

  update public.products
     set total_quantity = v_after,
         updated_at = now(),
         updated_by = v_actor_id
   where public.products.id = p_product_id;

  insert into public.consumable_restock_movements (
    client_uuid,
    product_id,
    qty,
    supplier,
    cost,
    received_date,
    quantity_before,
    quantity_after,
    created_by
  ) values (
    p_client_uuid,
    p_product_id,
    p_qty,
    nullif(btrim(p_supplier), ''),
    v_effective_cost,
    v_date,
    v_before,
    v_after,
    v_actor_id
  ) returning consumable_restock_movements.id into v_inserted_id;

  return query select
    v_inserted_id,
    p_product_id,
    p_qty,
    v_before,
    v_after,
    nullif(btrim(p_supplier), ''),
    case when v_can_money then v_effective_cost else null::numeric end,
    v_date;
end;
$$;

revoke all on function public.restock_consumable(uuid, integer, text, numeric, date, uuid) from public, anon;
grant execute on function public.restock_consumable(uuid, integer, text, numeric, date, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. add_consumable_line RPC
-- -----------------------------------------------------------------------------
create or replace function public.add_consumable_line(
  p_booking_id uuid,
  p_product_id uuid,
  p_qty integer,
  p_client_uuid uuid,
  p_line_note text default null
)
returns table (
  line_id uuid,
  booking_id uuid,
  product_id uuid,
  product_name text,
  qty integer,
  unit_price numeric,
  line_total numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role text := auth_user_role();
  v_can_money boolean := auth_can_view_money();
  v_stage booking_stage;
  v_booking_no text;
  v_cancelled_at timestamptz;
  v_product_name text;
  v_tracking_mode product_tracking_mode;
  v_stock integer;
  v_unit_price numeric;
  v_existing_line_id uuid;
  v_existing_qty integer;
  v_existing_rate numeric;
  v_existing_line_total numeric;
  v_new_line_id uuid;
  v_stock_before integer;
  v_stock_after integer;
  v_inv_id uuid;
begin
  if not auth_is_staff() or v_role is null then
    raise exception 'GATE:gate.consumable.auth_required|Staff authentication is required to add consumables.' using errcode = '42501';
  end if;

  if v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician') then
    raise exception 'GATE:gate.consumable.unauthorized_role|Your role is not authorized to add consumables to bookings.' using errcode = '42501';
  end if;

  if p_client_uuid is null then
    raise exception 'GATE:gate.consumable.idempotency|Consumable line requires a client UUID (Law 8).' using errcode = 'P0001';
  end if;

  if p_qty is null or p_qty <= 0 then
    raise exception 'GATE:gate.consumable.invalid_quantity|Quantity must be a positive integer.' using errcode = 'P0001';
  end if;

  select b.stage, b.booking_no, b.cancelled_at
    into v_stage, v_booking_no, v_cancelled_at
    from public.bookings b
   where b.id = p_booking_id;
  if not found then
    raise exception 'GATE:gate.consumable.booking_not_found|Booking not found.' using errcode = 'P0001';
  end if;

  if v_stage in ('Returned', 'Closed') or v_cancelled_at is not null then
    raise exception 'GATE:gate.consumable.booking_terminal|Cannot add consumables to a cancelled, returned or closed booking.' using errcode = 'P0001';
  end if;

  select p.name, p.tracking_mode, p.total_quantity, coalesce(p.unit_sale_price, p.daily_rate, 0)
    into v_product_name, v_tracking_mode, v_stock, v_unit_price
    from products p
   where p.id = p_product_id;
  if not found then
    raise exception 'GATE:gate.consumable.product_not_found|Product not found.' using errcode = 'P0001';
  end if;

  if v_tracking_mode <> 'Consumable' then
    raise exception 'GATE:gate.consumable.not_consumable|Product "%" is not tracked as a consumable.', v_product_name using errcode = 'P0001';
  end if;

  -- Idempotency check by client_uuid
  select bl.id, bl.qty, bl.rate, bl.line_total
    into v_existing_line_id, v_existing_qty, v_existing_rate, v_existing_line_total
    from booking_lines bl
   where bl.client_uuid = p_client_uuid;
  if found then
    return query select
      v_existing_line_id,
      p_booking_id,
      p_product_id,
      v_product_name,
      v_existing_qty,
      case when v_can_money then v_existing_rate else null::numeric end,
      case when v_can_money then v_existing_line_total else null::numeric end;
    return;
  end if;

  -- Bypass money-blind line insert guard for this trusted server action
  perform set_config('app.in_add_consumable_line', 'on', true);

  insert into booking_lines (
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
    line_note,
    created_by
  ) values (
    p_client_uuid,
    p_booking_id,
    'Equipment',
    p_product_id,
    v_product_name,
    p_qty,
    1,
    v_unit_price,
    false,
    0,
    p_qty * v_unit_price,
    jsonb_build_object(
      'unit_sale_price', v_unit_price,
      'qty', p_qty,
      'is_consumable', true
    ),
    nullif(btrim(p_line_note), ''),
    v_actor_id
  ) returning booking_lines.id into v_new_line_id;

  -- If booking is already On Rent (Handover was already completed), deduct stock immediately
  if v_stage = 'On Rent' then
    select p.total_quantity into v_stock_before from public.products p where p.id = p_product_id for update;
    v_stock_after := greatest(0, v_stock_before - p_qty);

    update public.products
       set total_quantity = v_stock_after,
           updated_at = now()
     where public.products.id = p_product_id;

    insert into public.consumable_stock_movements (
      client_uuid, booking_id, booking_line_id, product_id,
      qty, quantity_before, quantity_after, created_by
    ) values (
      gen_random_uuid(), p_booking_id, v_new_line_id, p_product_id,
      p_qty, v_stock_before, v_stock_after, v_actor_id
    );
  end if;

  -- If a Draft invoice exists, append invoice line so totals remain synchronised
  for v_inv_id in select inv.id from public.invoices inv where inv.booking_id = p_booking_id and inv.status = 'Draft' loop
    insert into invoice_lines (
      client_uuid,
      invoice_id,
      line_kind,
      description,
      quantity,
      days,
      unit_rate,
      line_total,
      discount_percent,
      sort_order
    ) values (
      gen_random_uuid(),
      v_inv_id,
      'Equipment Rental'::line_kind,
      v_product_name,
      p_qty,
      1,
      v_unit_price,
      p_qty * v_unit_price,
      0,
      100
    );
  end loop;

  return query select
    v_new_line_id,
    p_booking_id,
    p_product_id,
    v_product_name,
    p_qty,
    case when v_can_money then v_unit_price else null::numeric end,
    case when v_can_money then (p_qty * v_unit_price) else null::numeric end;
end;
$$;

revoke all on function public.add_consumable_line(uuid, uuid, integer, uuid, text) from public, anon;
grant execute on function public.add_consumable_line(uuid, uuid, integer, uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Low Stock Alerts Query and Morning Digest Extension
-- -----------------------------------------------------------------------------
create or replace function public.get_low_stock_alerts()
returns table (
  product_id uuid,
  product_name text,
  tracking_mode product_tracking_mode,
  total_quantity integer,
  reorder_level integer,
  quantity_unit product_unit_of_measure
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not auth_is_staff() then
    raise exception 'GATE:gate.stock_alerts.auth_required|Staff authentication required.' using errcode = '42501';
  end if;

  return query
  select
    p.id as product_id,
    p.name as product_name,
    p.tracking_mode,
    p.total_quantity,
    p.reorder_level,
    p.quantity_unit
  from products p
  where p.is_active = true
    and p.reorder_level is not null
    and p.reorder_level > 0
    and p.total_quantity <= p.reorder_level
  order by p.total_quantity asc, p.name asc;
end;
$$;

revoke all on function public.get_low_stock_alerts() from public, anon;
grant execute on function public.get_low_stock_alerts() to authenticated;

-- Update get_morning_digest to include low stock alert items
create or replace function public.get_morning_digest(
  p_user_id uuid,
  p_target_date date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user record;
  v_can_view_money boolean;
  v_npt_now timestamp;
  v_target_date date;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_pickups jsonb := '[]'::jsonb;
  v_returns jsonb := '[]'::jsonb;
  v_overdue jsonb := '[]'::jsonb;
  v_open_damage jsonb := '[]'::jsonb;
  v_shift_handovers jsonb := '[]'::jsonb;
  v_payments_due jsonb := '[]'::jsonb;
  v_low_stock jsonb := '[]'::jsonb;
  v_total_items int := 0;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  select
    u.id,
    u.full_name,
    u.email,
    u.primary_role::text
  into v_user
  from public.users u
  where u.id = p_user_id;

  if not found then
    raise exception 'User % not found', p_user_id;
  end if;

  -- Law 6: Money blindness
  v_can_view_money := lower(coalesce(v_user.primary_role, '')) not in (
    'warehouse', 'technician', 'driver', 'client'
  );

  v_npt_now := (now() at time zone 'Asia/Kathmandu');
  v_target_date := coalesce(p_target_date, v_npt_now::date);

  v_day_start := (v_target_date::text || ' 06:00:00+05:45')::timestamptz;
  v_day_end   := ((v_target_date + 1)::text || ' 05:59:59.999+05:45')::timestamptz;

  -- 1. Pickups scheduled today
  select coalesce(jsonb_agg(item order by (item->>'pickup_at')::timestamptz asc), '[]'::jsonb)
  into v_pickups
  from (
    select jsonb_build_object(
      'id', b.id,
      'booking_no', b.booking_no,
      'client_name', coalesce(c.name, 'Unknown Client'),
      'pickup_at', b.pickup_at,
      'pickup_time', to_char(b.pickup_at at time zone 'Asia/Kathmandu', 'HH24:MI'),
      'delivery_type', b.delivery_type,
      'stage', b.stage::text
    ) as item
    from public.bookings b
    left join public.clients c on c.id = b.client_id
    where b.pickup_at >= v_day_start
      and b.pickup_at <= v_day_end
      and b.cancelled_at is null
  ) q;

  -- 2. Returns scheduled today
  select coalesce(jsonb_agg(item order by (item->>'return_at')::timestamptz asc), '[]'::jsonb)
  into v_returns
  from (
    select jsonb_build_object(
      'id', b.id,
      'booking_no', b.booking_no,
      'client_name', coalesce(c.name, 'Unknown Client'),
      'return_at', b.return_at,
      'return_time', to_char(b.return_at at time zone 'Asia/Kathmandu', 'HH24:MI'),
      'delivery_type', b.delivery_type,
      'stage', b.stage::text
    ) as item
    from public.bookings b
    left join public.clients c on c.id = b.client_id
    where b.return_at >= v_day_start
      and b.return_at <= v_day_end
      and b.cancelled_at is null
  ) q;

  -- 3. Overdue returns
  select coalesce(jsonb_agg(item order by (item->>'return_at')::timestamptz asc), '[]'::jsonb)
  into v_overdue
  from (
    select jsonb_build_object(
      'id', b.id,
      'booking_no', b.booking_no,
      'client_name', coalesce(c.name, 'Unknown Client'),
      'return_at', b.return_at,
      'stage', b.stage::text
    ) as item
    from public.bookings b
    left join public.clients c on c.id = b.client_id
    where b.return_at < v_day_start
      and b.stage in ('On Rent')
      and b.cancelled_at is null
      and b.actual_return_at is null
  ) q;

  -- 4. Open damage findings
  select coalesce(jsonb_agg(item order by (item->>'created_at')::timestamptz desc), '[]'::jsonb)
  into v_open_damage
  from (
    select jsonb_build_object(
      'id', df.id,
      'damage_type', df.damage_type,
      'severity', df.severity,
      'description', df.description,
      'approval_state', df.approval_state::text,
      'created_at', df.created_at,
      'estimated_cost_paisa', case when v_can_view_money then round(coalesce(df.estimated_cost, 0) * 100)::bigint else null end
    ) as item
    from public.damage_findings df
    where df.approval_state = 'Pending Approval'
      and df.voided_at is null
  ) q;

  -- 5. Pending shift handovers
  select coalesce(jsonb_agg(item order by (item->>'created_at')::timestamptz desc), '[]'::jsonb)
  into v_shift_handovers
  from (
    select jsonb_build_object(
      'id', sh.id,
      'shift_code', sh.shift_code,
      'shift_date', sh.shift_date,
      'from_user_name', sh.from_user_name,
      'notes', sh.notes,
      'status', sh.status,
      'created_at', sh.created_at
    ) as item
    from public.shift_handovers sh
    where sh.status = 'pending'
      and sh.archived_at is null
  ) q;

  -- 6. Payments due today (money roles only, Law 6)
  if v_can_view_money then
    select coalesce(jsonb_agg(item order by (item->>'due_date')::date asc), '[]'::jsonb)
    into v_payments_due
    from (
      select jsonb_build_object(
        'id', inv.id,
        'invoice_no', inv.invoice_no,
        'booking_id', inv.booking_id,
        'client_name', coalesce(c.name, 'Unknown Client'),
        'due_date', inv.due_date,
        'outstanding_paisa', round(coalesce(inv.outstanding_amount, 0) * 100)::bigint,
        'status', inv.status::text
      ) as item
      from public.invoices inv
      left join public.clients c on c.id = inv.client_id
      where inv.due_date = v_target_date
        and inv.status in ('Draft', 'Sent', 'Partially Paid')
        and inv.outstanding_amount > 0
        and inv.voided_at is null
    ) q;
  else
    v_payments_due := '[]'::jsonb;
  end if;

  -- 7. Low stock items (at or below reorder_level)
  select coalesce(jsonb_agg(item order by (item->>'total_quantity')::int asc), '[]'::jsonb)
  into v_low_stock
  from (
    select jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'total_quantity', p.total_quantity,
      'reorder_level', p.reorder_level,
      'tracking_mode', p.tracking_mode::text
    ) as item
    from public.products p
    where p.is_active = true
      and p.reorder_level is not null
      and p.reorder_level > 0
      and p.total_quantity <= p.reorder_level
  ) q;

  v_total_items := jsonb_array_length(v_pickups) +
                   jsonb_array_length(v_returns) +
                   jsonb_array_length(v_overdue) +
                   jsonb_array_length(v_open_damage) +
                   jsonb_array_length(v_shift_handovers) +
                   jsonb_array_length(v_payments_due) +
                   jsonb_array_length(v_low_stock);

  return jsonb_build_object(
    'recipient', jsonb_build_object(
      'user_id', v_user.id,
      'full_name', v_user.full_name,
      'email', v_user.email,
      'role', v_user.primary_role
    ),
    'target_date', v_target_date,
    'operational_day_start', v_day_start,
    'operational_day_end', v_day_end,
    'can_view_money', v_can_view_money,
    'has_scheduled_items', (v_total_items > 0),
    'empty_message', case when v_total_items = 0 then 'Nothing scheduled today' else null end,
    'total_items_count', v_total_items,
    'pickups', v_pickups,
    'returns', v_returns,
    'overdue', v_overdue,
    'open_damage', v_open_damage,
    'shift_handovers', v_shift_handovers,
    'payments_due', v_payments_due,
    'low_stock', v_low_stock
  );
end;
$$;

revoke all on function public.get_morning_digest(uuid, date) from public, anon;
grant execute on function public.get_morning_digest(uuid, date) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Post-conditions
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'products'
       and column_name = 'unit_sale_price'
  ) then
    raise exception 'POST-CONDITION FAILED: products.unit_sale_price column missing.';
  end if;

  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public'
       and table_name = 'consumable_restock_movements'
  ) then
    raise exception 'POST-CONDITION FAILED: consumable_restock_movements table missing.';
  end if;

  if not exists (
    select 1 from pg_views
     where schemaname = 'public'
       and viewname = 'consumable_restock_movements_v'
  ) then
    raise exception 'POST-CONDITION FAILED: consumable_restock_movements_v view missing.';
  end if;

  if not exists (
    select 1 from pg_proc
     where proname = 'restock_consumable'
       and prosecdef = true
  ) then
    raise exception 'POST-CONDITION FAILED: restock_consumable RPC missing or not security definer.';
  end if;

  if not exists (
    select 1 from pg_proc
     where proname = 'add_consumable_line'
       and prosecdef = true
  ) then
    raise exception 'POST-CONDITION FAILED: add_consumable_line RPC missing or not security definer.';
  end if;

  if not exists (
    select 1 from pg_proc
     where proname = 'get_low_stock_alerts'
  ) then
    raise exception 'POST-CONDITION FAILED: get_low_stock_alerts function missing.';
  end if;
end;
$$;

commit;
