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

  return result || jsonb_build_object(
    'revision', md5((result || jsonb_build_object('updated_at', b.updated_at, 'version', b.version))::text)
  );
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
begin
  -- 1. Role verification (W88: Any desk staff — Owner, Admin, Manager, Coordinator, Warehouse)
  v_role := auth_user_role();
  if v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse') then
    raise exception 'Permission denied: role % cannot change bookings.', coalesce(v_role, 'unidentified')
      using errcode = '42501';
  end if;

  if v_booking_id is null then
    raise exception 'change_booking: booking_id is required.';
  end if;

  if v_key is null or v_revision is null then
    raise exception 'Reload this booking before saving.';
  end if;

  v_actor := coalesce(nullif(p_payload ->> 'actor_id', '')::uuid, auth.uid());
  if v_actor is null then
    select id into v_actor
      from users
     where primary_role in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse')
       and is_active
     order by created_at
     limit 1;
  end if;

  req := jsonb_build_object('booking', v_booking_id, 'revision', v_revision, 'payload', p_payload);

  -- Law 8 idempotency receipt check under advisory lock
  perform pg_advisory_xact_lock(hashtextextended(v_key::text, 0));
  select * into receipt from record_editor_private.receipts where key = v_key;
  if found then
    if receipt.actor <> auth.uid() or receipt.request <> req then
      raise exception 'This save key belongs to another change.';
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

  -- 3. Revision check
  v_old_snapshot := read_booking_for_change(v_booking_id::text);
  if (v_old_snapshot ->> 'revision') <> v_revision then
    raise exception 'This booking changed since you opened it. Reload the latest record before saving.'
      using errcode = '40001';
  end if;

  if jsonb_typeof(p_payload -> 'lines') <> 'array' then
    raise exception 'Invalid booking lines.';
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
    else
      existing := null;
    end if;

    if row_data ->> 'client_uuid' is null then
      raise exception 'Every line needs a stable key.';
    end if;

    patch := record_editor_private.pick(row_data, array[
      'line_type', 'product_id', 'bundle_id', 'description', 'qty', 'days',
      'rate', 'discount_amount', 'is_included', 'service_basis', 'line_note', 'sort_order'
    ]);

    if row_data ->> 'parent_client_uuid' is not null or coalesce((patch ->> 'is_included')::boolean, false) then
      rate := 0; base_rate := 0;
    else
      base_rate := get_model_daily_rate((patch ->> 'product_id')::uuid, (patch ->> 'bundle_id')::uuid);
      rate := coalesce((patch ->> 'rate')::numeric, base_rate, 0);
    end if;

    patch := patch || jsonb_build_object('rate', rate, 'rate_overridden', base_rate is not null and rate <> base_rate);

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

  -- 10. Discounts
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

  -- 11. Resync Draft invoice if one exists (T3-14 / W15)
  if exists (select 1 from invoices where booking_id = v_booking_id and status = 'Draft') then
    perform public.resync_draft_invoice(v_booking_id);
  end if;

  -- 12. Audit event
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
