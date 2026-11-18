-- 0243_change_confirmed_booking.sql
-- T3-18 / W87, W88: Change a confirmed booking
--
-- 1. Adds public.bookings.parent_booking_id for linked bookings (W87).
-- 2. Grants select (parent_booking_id) to authenticated.
-- 3. Updates create_booking to persist and return parent_booking_id.
-- 4. Updates read_booking_for_change to include parent_booking_id.
-- 5. Authors change_booking(p_id, p_revision, p_key, p_payload) and change_booking(p_payload)
--    RPCs: atomic, revision-locked, GiST double-booking protected, packed-line guarded,
--    idempotent via record_editor_private.receipts, and resyncs Draft invoices.

-- -----------------------------------------------------------------------------
-- 1. Schema: parent_booking_id on public.bookings
-- -----------------------------------------------------------------------------
alter table public.bookings
  add column if not exists parent_booking_id uuid references public.bookings(id) on delete set null;

comment on column public.bookings.parent_booking_id is
  'T3-18 / W87: References the parent booking when additional gear is taken as a linked booking mid-rental.';

create index if not exists idx_bookings_parent_booking_id
  on public.bookings (parent_booking_id);

grant select (parent_booking_id) on public.bookings to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Update create_booking to support parent_booking_id
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
  /* 0238 */
  v_rental_day_start          integer;
  v_existing_rental_day_start integer;
  v_setting_val               text;
  /* T3-30 */
  v_is_consumable     boolean;
  /* T3-18 */
  v_parent_booking_id  uuid := nullif(p_payload ->> 'parent_booking_id', '')::uuid;
  v_existing_parent_id uuid;
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

  -- ── 0238: Resolve rental_day_start ───────────────────────────────────────
  if p_payload ? 'rental_day_start' and (p_payload ->> 'rental_day_start') is not null then
    v_rental_day_start := (p_payload ->> 'rental_day_start')::integer;
  else
    select s.value #>> '{}' into v_setting_val
      from settings s
     where s.key = 'operationalDayStart'
       and (s.location_id = v_branch or s.location_id is null)
     order by s.location_id nulls last
     limit 1;

    if v_setting_val is not null and v_setting_val ~ '^([01][0-9]|2[0-3]):(00|15|30|45)$' then
      v_rental_day_start := split_part(v_setting_val, ':', 1)::integer * 60 + split_part(v_setting_val, ':', 2)::integer;
    else
      v_rental_day_start := 360; -- 06:00 default
    end if;
  end if;

  if v_rental_day_start is null or v_rental_day_start < 0 or v_rental_day_start >= 1440 or (v_rental_day_start % 15) <> 0 then
    raise exception 'create_booking: rental_day_start must be between 0 and 1439 in 15-minute increments. Nothing was created.'
      using errcode = '22026';
  end if;

  -- ── 0144: Validate project_type ──────────────────────────────────────────
  if v_project_type is not null and v_project_type not in (
    'Feature Film',
    'Documentary',
    'Commercial / Ad',
    'Music Video',
    'Corporate Video',
    'Wedding / Event',
    'Short Film',
    'Television / Series',
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
  select id, booking_no, stage::text, rental_day_start, parent_booking_id
    into v_existing_id, v_existing_no, v_existing_stage, v_existing_rental_day_start, v_existing_parent_id
    from bookings
   where client_uuid = v_client_uuid;
  if found then
    return jsonb_build_object(
      'booking_id',        v_existing_id,
      'booking_no',        v_existing_no,
      'stage',             v_existing_stage,
      'project_name',      v_project_name,
      'shoot_location',    v_shoot_location,
      'rental_day_start',  v_existing_rental_day_start,
      'parent_booking_id', v_existing_parent_id,
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
    vat_rate, rental_day_start, parent_booking_id, created_by, updated_by
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
    v_rental_day_start,
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

      -- ── S1-10: Total and breakdown ─────────────────────────────────────────
      v_payload_total := (v_line ->> 'line_total')::numeric;
      v_payload_breakdown := v_line -> 'price_breakdown';
      v_line_qty := coalesce((v_line ->> 'qty')::integer, 1);
      v_line_days := coalesce((v_line ->> 'days')::integer, 1);
      v_line_discount := coalesce((v_line ->> 'discount_amount')::numeric, 0);

      -- T3-30: Consumables do not multiply by days
      if v_is_consumable then
        v_computed_total := greatest(0, (v_line_qty * coalesce(v_final_rate, 0)) - v_line_discount);
      else
        v_computed_total := greatest(0, (v_line_qty * v_line_days * coalesce(v_final_rate, 0)) - v_line_discount);
      end if;

      if auth_can_view_money() and v_payload_total is not null then
        v_final_total := v_payload_total;
      else
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
        coalesce((v_line ->> 'line_type')::booking_line_type, 'Equipment'::booking_line_type),
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

    if v_wrote = 0 and jsonb_array_length(v_pending) > 0 then
      raise exception 'create_booking: cyclic or unresolvable parent_client_uuid in lines payload. Nothing was created.';
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
    'rental_day_start',  v_rental_day_start,
    'parent_booking_id', v_parent_booking_id,
    'replayed',          false
  );
end;
$$;

revoke all on function public.create_booking(jsonb) from public, anon;
grant execute on function public.create_booking(jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Update read_booking_for_change RPC to include parent_booking_id
-- -----------------------------------------------------------------------------
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
    'rental_day_start', b.rental_day_start,
    'values', record_editor_private.pick(to_jsonb(b), array[
      'client_id', 'contact_id', 'branch_id', 'project', 'project_name', 'shoot_location',
      'project_type', 'project_type_other', 'pickup_at', 'return_at',
      'delivery_type', 'pickup_location', 'return_location', 'deposit_required',
      'parent_booking_id', 'rental_day_start'
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

-- -----------------------------------------------------------------------------
-- 4. change_booking RPC (T3-18 / W87, W88)
-- -----------------------------------------------------------------------------
create or replace function public.change_booking(
  p_id uuid,
  p_revision text,
  p_key uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_actor uuid;
  b bookings;
  req jsonb;
  receipt record;
  result jsonb;
  row_data jsonb;
  patch jsonb;
  existing jsonb;
  row_id uuid;
  kept uuid[] := '{}';
  kept_crew uuid[] := '{}';
  mapping jsonb := '{}';
  parent_id uuid;
  transport_id uuid;
  audit_id uuid := gen_random_uuid();
  first_discount uuid;
  discount_pct numeric;
  rate numeric;
  base_rate numeric;
  v_pickup timestamptz;
  v_return timestamptz;
  v_dates_changed boolean := false;
  v_now timestamptz := clock_timestamp();
  v_packed_unit_count integer;
  v_existing_line record;
begin
  -- 1. Authorization: C+ only (Owner, Admin, Manager, Coordinator)
  v_role := auth_user_role();
  if auth.uid() is null or v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise exception 'You cannot edit this booking.' using errcode = '42501';
  end if;
  v_actor := auth.uid();

  if p_key is null or p_revision is null then
    raise exception 'Reload this booking before saving.';
  end if;

  -- 2. Idempotency & Concurrency lock
  req := jsonb_build_object('booking', p_id, 'revision', p_revision, 'payload', p_payload);
  perform pg_advisory_xact_lock(hashtextextended(p_key::text, 0));

  select * into receipt from record_editor_private.receipts where key = p_key;
  if found then
    if receipt.actor <> v_actor or receipt.request <> req then
      raise exception 'This save key belongs to another change.';
    end if;
    return receipt.response;
  end if;

  -- 3. Lock booking and child rows
  select * into b from bookings where id = p_id for update;
  if b.id is null then
    raise exception 'Booking not found.';
  end if;

  if b.cancelled_at is not null then
    raise exception 'Cancelled bookings cannot be edited.';
  end if;

  if b.stage in ('Returned', 'Closed') or b.closed_at is not null then
    raise exception 'Returned or closed bookings cannot be edited. Use operational corrections.';
  end if;

  if v_role = 'Coordinator' and (auth_user_branch_id() is null or b.branch_id is distinct from auth_user_branch_id()) then
    raise exception 'You cannot edit a booking from another branch.' using errcode = '42501';
  end if;

  perform 1 from booking_lines where booking_id = p_id for update;
  perform 1 from booking_crew_lines where booking_id = p_id for update;
  perform 1 from booking_transport where booking_id = p_id for update;
  perform 1 from booking_discounts where booking_id = p_id for update;
  perform 1 from invoices where booking_id = p_id for update;

  if exists (select 1 from invoices where booking_id = p_id and status::text not in ('Draft', 'Void')) then
    raise exception 'This booking has an issued financial document. Use the finance correction workflow.';
  end if;

  -- 4. Revision check (Law 8 / concurrency)
  if (read_booking_for_change(p_id::text) ->> 'revision') <> p_revision then
    raise exception 'GATE:gate.booking.concurrent_change|This booking changed since you opened it. Reload the latest record before saving.'
      using errcode = '40001';
  end if;

  if jsonb_typeof(p_payload -> 'lines') <> 'array' or jsonb_typeof(p_payload -> 'crew') <> 'array' then
    raise exception 'Invalid booking lines.';
  end if;

  patch := p_payload -> 'values';
  if exists (
    select 1 from jsonb_object_keys(patch) k
     where not k = any(array[
       'client_id', 'contact_id', 'branch_id', 'project', 'project_name', 'shoot_location',
       'project_type', 'project_type_other', 'pickup_at', 'return_at',
       'delivery_type', 'pickup_location', 'return_location', 'deposit_required',
       'parent_booking_id', 'rental_day_start'
     ])
  ) then
    raise exception 'This booking field cannot be edited.';
  end if;

  if patch ? 'client_id' and (patch ->> 'client_id')::uuid is distinct from b.client_id and exists (select 1 from invoices where booking_id = p_id) then
    raise exception 'The client cannot change after a financial document has been created.';
  end if;

  -- 5. Date validation and change detection
  v_pickup := coalesce((patch ->> 'pickup_at')::timestamptz, b.pickup_at);
  v_return := coalesce((patch ->> 'return_at')::timestamptz, b.return_at);
  if v_pickup is null or v_return is null or v_return <= v_pickup then
    raise exception 'Choose valid pickup and return dates.';
  end if;
  if v_pickup <> b.pickup_at or v_return <> b.return_at then
    v_dates_changed := true;
  end if;

  -- 6. Packed units removal guard (W88 / gate.booking.packed_line_removed)
  for v_existing_line in
    select bl.id, bl.description, bl.qty,
           coalesce((select count(*) from packing_lines pl where pl.booking_line_id = bl.id and pl.state = 'Packed'), 0) as packed_count,
           coalesce((select count(*) from booking_line_units blu where blu.booking_line_id = bl.id and blu.released_at is null), 0) as assigned_count
      from booking_lines bl
     where bl.booking_id = p_id and bl.voided_at is null
  loop
    v_packed_unit_count := case
      when b.stage in ('Packed', 'On Rent') then greatest(v_existing_line.packed_count, v_existing_line.assigned_count)
      else v_existing_line.packed_count
    end;

    if v_packed_unit_count > 0 then
      select value into row_data
        from jsonb_array_elements(p_payload -> 'lines')
       where (value ->> 'id')::uuid = v_existing_line.id;

      if row_data is null or (row_data ->> 'qty')::integer < v_packed_unit_count then
        raise exception 'GATE:gate.booking.packed_line_removed|Packed items cannot be silently removed. Unpack them on the floor first.'
          using errcode = 'P0001';
      end if;
    end if;
  end loop;

  -- 7. Update bookings header row
  perform record_editor_private.write_row('bookings', p_id, patch || jsonb_build_object('updated_at', v_now, 'updated_by', v_actor));

  -- 8. Upsert booking lines
  for row_data in select value from jsonb_array_elements(p_payload -> 'lines') loop
    row_id := (row_data ->> 'id')::uuid;
    if row_id is not null then
      select to_jsonb(l) into existing from booking_lines l where id = row_id and booking_id = p_id and voided_at is null;
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
      rate := 0;
      base_rate := 0;
    else
      base_rate := get_model_daily_rate((patch ->> 'product_id')::uuid, (patch ->> 'bundle_id')::uuid);
      rate := coalesce((patch ->> 'rate')::numeric, base_rate, 0);
    end if;

    patch := patch || jsonb_build_object('rate', rate, 'rate_overridden', base_rate is not null and rate <> base_rate);
    if row_id is null then
      patch := patch || jsonb_build_object('booking_id', p_id, 'client_uuid', row_data ->> 'client_uuid', 'created_by', v_actor);
    end if;

    row_id := record_editor_private.write_row('booking_lines', row_id, patch);
    if row_id = any(kept) then
      raise exception 'A booking line appears twice.';
    end if;

    kept := array_append(kept, row_id);
    mapping := mapping || jsonb_build_object(row_data ->> 'client_uuid', row_id);
  end loop;

  -- 9. Resolve parent_line_id
  for row_data in select value from jsonb_array_elements(p_payload -> 'lines') loop
    row_id := (mapping ->> (row_data ->> 'client_uuid'))::uuid;
    parent_id := (mapping ->> (row_data ->> 'parent_client_uuid'))::uuid;
    if row_data ->> 'parent_client_uuid' is not null and parent_id is null then
      raise exception 'The bundle parent is missing.';
    end if;
    update booking_lines set parent_line_id = parent_id where id = row_id;
  end loop;

  -- 10. Void unkept lines and release their holds
  update booking_lines
     set voided_at = v_now,
         voided_reason = 'Removed while changing booking'
   where booking_id = p_id
     and voided_at is null
     and not id = any(kept);

  update inventory_reservations
     set released_at = v_now,
         released_reason = 'Released: booking line removed'
   where booking_id = p_id
     and booking_line_id is not null
     and booking_line_id not in (select unnest(kept))
     and released_at is null;

  -- Quantity check: assigned units cannot exceed new quantity
  if exists (
    select 1 from booking_lines l
     where l.id = any(kept)
       and (select count(*) from booking_line_units u where u.booking_line_id = l.id and u.released_at is null) > l.qty
  ) then
    raise exception 'Release assigned units before reducing this quantity.';
  end if;

  -- 11. Inventory reservations updates (GiST exclusion enforces no double booking)
  if b.stage in ('Booked', 'Packed', 'On Rent') then
    -- If dates changed, update period on all active reservations
    if v_dates_changed then
      update inventory_reservations r
         set period = public.get_effective_rental_window(v_pickup, v_return, p.prep_time_minutes, p.cleaning_time_minutes)
        from booking_lines bl
        left join products p on p.id = bl.product_id
       where r.booking_id = p_id
         and r.booking_line_id = bl.id
         and r.released_at is null;

      update inventory_reservations
         set period = tstzrange(v_pickup, v_return, '[)')
       where booking_id = p_id
         and booking_line_id is null
         and released_at is null;
    end if;

    -- Adjust quantity reservations if line quantity was decreased
    update inventory_reservations r
       set qty = bl.qty - coalesce((select count(*) from booking_line_units blu where blu.booking_line_id = bl.id and blu.released_at is null), 0)
      from booking_lines bl
     where r.booking_id = p_id
       and r.booking_line_id = bl.id
       and r.asset_id is null
       and r.released_at is null
       and (bl.qty - coalesce((select count(*) from booking_line_units blu where blu.booking_line_id = bl.id and blu.released_at is null), 0)) > 0
       and r.qty > (bl.qty - coalesce((select count(*) from booking_line_units blu where blu.booking_line_id = bl.id and blu.released_at is null), 0));

    -- Release excess quantity reservations if line quantity is now completely satisfied by units
    update inventory_reservations r
       set released_at = v_now,
           released_reason = 'Released: line quantity covered by assigned units'
      from booking_lines bl
     where r.booking_id = p_id
       and r.booking_line_id = bl.id
       and r.asset_id is null
       and r.released_at is null
       and bl.qty <= coalesce((select count(*) from booking_line_units blu where blu.booking_line_id = bl.id and blu.released_at is null), 0);

    -- Insert quantity holds for any line item not yet fully reserved
    insert into inventory_reservations
      (client_uuid, booking_id, booking_line_id, product_id, qty, period, created_by, hold_state)
    select gen_random_uuid(), p_id, bl.id, bl.product_id,
           bl.qty - coalesce(u.n, 0) - coalesce(res.n, 0),
           public.get_effective_rental_window(v_pickup, v_return, p.prep_time_minutes, p.cleaning_time_minutes),
           v_actor, 'confirmed'
      from booking_lines bl
      join products p on p.id = bl.product_id
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
     where bl.booking_id = p_id
       and bl.id = any(kept)
       and bl.voided_at is null
       and bl.product_id is not null
       and (bl.qty - coalesce(u.n, 0) - coalesce(res.n, 0)) > 0;
  end if;

  -- 12. Crew lines
  for row_data in select value from jsonb_array_elements(p_payload -> 'crew') loop
    row_id := (row_data ->> 'id')::uuid;
    if row_id is not null and not exists (select 1 from booking_crew_lines where id = row_id and booking_id = p_id and voided_at is null) then
      raise exception 'This crew row does not belong to the booking.';
    end if;

    patch := record_editor_private.pick(row_data, array[
      'crew_member_id', 'name', 'crew_role', 'phone', 'day_rate', 'days', 'overtime', 'accommodation', 'meals'
    ]);

    if row_id is null then
      patch := patch || jsonb_build_object('booking_id', p_id, 'client_uuid', gen_random_uuid(), 'created_by', v_actor);
    end if;

    row_id := record_editor_private.write_row('booking_crew_lines', row_id, patch);
    kept_crew := array_append(kept_crew, row_id);
  end loop;

  update booking_crew_lines
     set voided_at = v_now
   where booking_id = p_id
     and voided_at is null
     and not id = any(kept_crew);

  -- 13. Transport
  select id into transport_id from booking_transport where booking_id = p_id;
  patch := record_editor_private.pick(coalesce(p_payload -> 'transport', '{}'::jsonb), array[
    'vehicle', 'number_plate', 'driver_contact', 'delivery_charge', 'fuel_charge', 'special_instructions'
  ]);

  if transport_id is not null or patch <> '{}'::jsonb then
    if transport_id is null then
      patch := patch || jsonb_build_object('booking_id', p_id, 'client_uuid', gen_random_uuid(), 'created_by', v_actor);
    end if;
    perform record_editor_private.write_row('booking_transport', transport_id, patch);
  end if;

  -- 14. Audit event
  insert into audit_events (
    id, client_uuid, event_class, category, module, action, severity, status,
    table_name, record_id, actor_id, actor_role, branch_id, old_values, new_values
  ) values (
    audit_id, p_key, 'status change', 'Rentals', 'Rentals', 'Update', 'Informational', 'Success',
    'bookings', p_id, v_actor, v_role, b.branch_id,
    jsonb_build_object('revision', p_revision),
    jsonb_build_object('edited', b.stage)
  );

  -- 15. Discounts
  discount_pct := (p_payload ->> 'discount_percent')::numeric;
  if discount_pct is not null then
    if discount_pct < 0 or discount_pct > 100 then
      raise exception 'Discount must be between 0 and 100 percent.';
    end if;

    if discount_pct is distinct from (select coalesce(sum(percent), 0) from booking_discounts where booking_id = p_id) then
      select id into first_discount from booking_discounts where booking_id = p_id order by id limit 1;
      if first_discount is null and discount_pct > 0 then
        insert into booking_discounts (client_uuid, booking_id, branch_id, discount_source, percent, reason, applied_by, audit_event_id)
        values (gen_random_uuid(), p_id, b.branch_id, 'Manual', discount_pct, 'Booking changed', v_actor, audit_id);
      else
        update booking_discounts
           set percent = case when id = first_discount then discount_pct else 0 end,
               reason = 'Booking changed',
               audit_event_id = audit_id
         where booking_id = p_id;
      end if;
    end if;
  end if;

  -- 16. Draft invoice resync (T3-14 / T3-18)
  if exists (select 1 from invoices where booking_id = p_id and status = 'Draft') then
    perform public.resync_draft_invoice(p_id);
  end if;

  -- 17. Snapshot and receipt
  result := read_booking_for_change(p_id::text);
  insert into record_editor_private.receipts (key, actor, request, response)
  values (p_key, v_actor, req, result);

  return result;
end;
$$;

revoke all on function public.change_booking(uuid, text, uuid, jsonb) from public, anon;
grant execute on function public.change_booking(uuid, text, uuid, jsonb) to authenticated;

-- Overload taking single jsonb object for flexible RPC invocation
create or replace function public.change_booking(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := coalesce((p_payload ->> 'booking_id')::uuid, (p_payload ->> 'id')::uuid);
  v_revision text := coalesce(p_payload ->> 'revision', p_payload ->> 'expected_revision');
  v_key uuid := coalesce((p_payload ->> 'key')::uuid, (p_payload ->> 'client_uuid')::uuid);
  v_inner_payload jsonb := case
    when p_payload ? 'payload' and jsonb_typeof(p_payload -> 'payload') = 'object' then p_payload -> 'payload'
    else p_payload
  end;
begin
  return public.change_booking(v_id, v_revision, v_key, v_inner_payload);
end;
$$;

revoke all on function public.change_booking(jsonb) from public, anon;
grant execute on function public.change_booking(jsonb) to authenticated;
