-- 0237_rental_day_start_setting.sql
-- T3-28: Rental day start as an operational setting (B24, B25, B26, K3)
--
-- 1. bookings.rental_day_start: integer minutes after Kathmandu midnight (+05:45). Default 360 (06:00).
--    Immutable per booking: existing bookings retain their stored day start.
-- 2. set_setting RPC: Owner and Admin can set operational settings (B26).
--    operationalDayStart validated at 15-minute increments (00:00, 00:15, ..., 23:45).
-- 3. create_booking RPC: resolves rental_day_start from payload or settings table, defaults to 360,
--    records it on bookings, returns it in result object.
-- 4. read_booking_for_change RPC: includes rental_day_start in snapshot.

-- 1. Table schema
alter table public.bookings
  add column if not exists rental_day_start integer not null default 360,
  add constraint bookings_rental_day_start_valid
    check (rental_day_start >= 0 and rental_day_start < 1440 and (rental_day_start % 15) = 0);

comment on column public.bookings.rental_day_start is
  'Rental day start boundary for this booking, in minutes after Kathmandu midnight (+05:45). Default 360 (06:00). Immutable per booking (B25, K3).';

-- Law 6 column-level SELECT grant (rental_day_start is non-money operational metadata)
grant select (rental_day_start) on public.bookings to authenticated;

-- 2. Update set_setting function to permit Admin in addition to Owner (B26) and validate operationalDayStart
create or replace function public.set_setting(
  p_client_uuid uuid,
  p_key text,
  p_value jsonb,
  p_scope text default 'org',
  p_location_id uuid default null
) returns table (setting_id uuid, value jsonb)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing_hist settings_history%rowtype;
  v_row settings%rowtype;
  v_scope text := coalesce(p_scope, 'org');
  v_val_text text;
begin
  -- B26: Owner and Admin change operational settings; Manager is refused
  if auth_user_role() not in ('Owner', 'Admin') then
    raise exception 'GATE:gate.settings.role|Only Owner and Admin may change operational settings.' using errcode = 'P0001';
  end if;
  if p_client_uuid is null then
    raise exception 'GATE:gate.settings.idempotency|A settings change requires a client UUID.' using errcode = 'P0001';
  end if;
  if p_key is null or p_key !~ '^[A-Za-z][A-Za-z0-9]{0,63}$' then
    raise exception 'GATE:gate.settings.key|Not a valid setting key.' using errcode = 'P0001';
  end if;
  if p_value is null or jsonb_typeof(p_value) not in ('string', 'number', 'boolean') then
    raise exception 'GATE:gate.settings.value|A setting is a single text, number or yes/no value.' using errcode = 'P0001';
  end if;
  if v_scope not in ('org', 'location') then
    raise exception 'GATE:gate.settings.scope|Scope must be org or location.' using errcode = 'P0001';
  end if;
  if v_scope = 'location' and (p_location_id is null or not settings_location_overridable(p_key)) then
    raise exception 'GATE:gate.settings.not_overridable|This setting applies to the whole business and has no per-location override.' using errcode = 'P0001';
  end if;
  if v_scope = 'org' and p_location_id is not null then
    raise exception 'GATE:gate.settings.scope|An org setting carries no location.' using errcode = 'P0001';
  end if;

  -- Validate operationalDayStart: quarter-hour increments in HH:mm
  if p_key = 'operationalDayStart' then
    v_val_text := p_value #>> '{}';
    if v_val_text is null or v_val_text !~ '^([01][0-9]|2[0-3]):(00|15|30|45)$' then
      raise exception 'GATE:gate.settings.operational_day_start|Rental day start must be in HH:mm format at 15-minute increments.' using errcode = '22026';
    end if;
  end if;

  select * into v_existing_hist from settings_history h where h.client_uuid = p_client_uuid;
  if found then
    if v_existing_hist.key <> p_key or v_existing_hist.new_value <> p_value
       or v_existing_hist.scope <> v_scope or v_existing_hist.location_id is distinct from p_location_id then
      raise exception 'GATE:gate.settings.idempotency_conflict|Client UUID already belongs to a different change.' using errcode = 'P0001';
    end if;
    return query select v_existing_hist.setting_id, v_existing_hist.new_value;
    return;
  end if;

  select * into v_row from settings s
   where s.key = p_key and s.scope = v_scope
     and coalesce(s.location_id, '00000000-0000-0000-0000-000000000000'::uuid)
       = coalesce(p_location_id, '00000000-0000-0000-0000-000000000000'::uuid)
   for update;

  if found then
    if v_row.value = p_value then
      return query select v_row.id, v_row.value;   -- no change, no history row
      return;
    end if;
    update settings
       set value = p_value, last_client_uuid = p_client_uuid, updated_by = auth_user_id(), updated_at = now()
     where id = v_row.id;
    return query select v_row.id, p_value;
  else
    insert into settings (key, value, scope, location_id, is_money, last_client_uuid, updated_by)
    values (p_key, p_value, v_scope, p_location_id, settings_is_money_key(p_key), p_client_uuid, auth_user_id())
    returning id into v_row.id;
    return query select v_row.id, p_value;
  end if;
end;
$$;

-- 3. Update create_booking RPC to record rental_day_start
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

  -- 0237 rental_day_start resolution
  if p_payload ? 'rental_day_start' and p_payload ->> 'rental_day_start' is not null then
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
  select id, booking_no, stage::text, rental_day_start
    into v_existing_id, v_existing_no, v_existing_stage, v_existing_rental_day_start
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
    vat_rate, rental_day_start, created_by, updated_by
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
        select id into v_parent_id from booking_lines
         where booking_id = v_booking_id and client_uuid = v_parent_key;
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

      for v_unit in select * from jsonb_array_elements(coalesce(v_line -> 'units', '[]'::jsonb))
      loop
        select product_id into v_asset_product from product_units where id = (v_unit ->> 'asset_id')::uuid;
        if v_asset_product is distinct from (v_line ->> 'product_id')::uuid then
          raise exception 'create_booking: asset % does not belong to product %. Nothing was created.',
            v_unit ->> 'asset_id', v_line ->> 'product_id';
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

    if v_wrote = 0 and jsonb_array_length(v_next) > 0 then
      raise exception 'create_booking: unresolved parent_client_uuid references in lines payload (possible circular reference)';
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
    'rental_day_start',  v_rental_day_start,
    'replayed',          false
  );
end;
$$;

-- 4. Update read_booking_for_change RPC to include rental_day_start
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
    'rental_day_start', b.rental_day_start,
    'values', record_editor_private.pick(to_jsonb(b), array[
      'client_id', 'contact_id', 'branch_id', 'project', 'project_name', 'shoot_location',
      'project_type', 'project_type_other', 'pickup_at', 'return_at',
      'delivery_type', 'pickup_location', 'return_location', 'deposit_required',
      'rental_day_start'
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
