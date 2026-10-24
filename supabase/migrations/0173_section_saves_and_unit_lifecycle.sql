-- =============================================================================
-- Migration 0173: Unified Section Saves, Equipment Unit Lifecycle (Intake & Retirement),
-- and Client Membership Enrollment / Tier Supersession
-- =============================================================================
-- 1. save_record_section: transactional, allowlisted per-section save for clients,
--    equipment, and bundles, with optimistic concurrency (revision check), advisory locks,
--    and idempotency.
-- 2. add_equipment_units: post-creation serialized unit intake with automatic asset tag
--    generation, unique serial check, warehouse validation, and products.total_quantity sync.
-- 3. retire_equipment_unit: audited unit retirement enforcing reasons (>= 10 chars),
--    refusing retirement on active rentals/reservations/maintenance, and syncing total_quantity.
-- 4. enroll_client_membership: transactional membership enrollment and tier changes,
--    superseding previous active memberships to enforce exactly one live membership per client.
-- =============================================================================

begin;

-- Helper function: Returns allowlisted fields for a specific record section.
create or replace function record_editor_private.section_fields(p_kind text, p_section text)
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
select case p_kind
  when 'client' then
    case p_section
      when 'identity' then array['type_parent', 'org_subtype', 'name', 'pan_vat', 'business_registration', 'website']
      when 'contact' then array['phone', 'email']
      when 'address' then array['address_line', 'city', 'district', 'postal_code', 'country', 'billing_address']
      when 'notes' then array['notes']
      when 'commercial' then array[]::text[]
      else null
    end
  when 'equipment' then
    case p_section
      when 'identity' then array['name', 'short_name', 'category_id', 'brand', 'model', 'manufacturer', 'description']
      when 'location' then array['warehouse_id', 'rack', 'shelf', 'bin']
      when 'relationships' then array[]::text[]
      when 'purchase' then array['purchase_date', 'purchase_price', 'replacement_value']
      when 'pricing' then array['daily_rate', 'weekly_rate', 'monthly_rate', 'hourly_rate', 'weekend_rate', 'deposit_percent', 'deposit_fixed', 'min_rental_days', 'rental_enabled']
      when 'maintenance' then array['prep_time_minutes', 'cleaning_time_minutes', 'inspection_required', 'packing_required', 'notes_internal', 'notes_warehouse']
      else null
    end
  when 'bundle' then
    case p_section
      when 'identity' then array['name', 'description', 'category_id']
      when 'rates' then array['daily_rate', 'weekly_rate']
      else null
    end
  else null
end;
$$;
revoke all on function record_editor_private.section_fields(text, text) from public, anon;
grant execute on function record_editor_private.section_fields(text, text) to authenticated;

-- 1. save_record_section RPC
create or replace function public.save_record_section(
  p_kind text,
  p_id uuid,
  p_section text,
  p_revision text,
  p_key uuid,
  p_values jsonb,
  p_rows jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  tab text;
  child_tab text;
  fk text;
  allowed text[];
  child_allowed text[];
  existing jsonb;
  request jsonb;
  saved record;
  current_snapshot jsonb;
  patch jsonb;
  response jsonb;
  row_data jsonb;
  child_id uuid;
begin
  -- Role authorization
  if auth.uid() is null or not coalesce(
    auth_user_role()::text = any(
      case when p_kind = 'client' then array['Owner', 'Admin', 'Manager', 'Coordinator']
      else array['Owner', 'Admin', 'Manager'] end
    ), false
  ) then
    raise exception 'Permission denied for this record.' using errcode = '42501';
  end if;

  if p_key is null then raise exception 'A save key is required.'; end if;
  if p_id is null then raise exception 'Record ID is required for section saving.'; end if;
  if p_revision is null then raise exception 'Expected revision is required for section saving.'; end if;
  if jsonb_typeof(p_values) <> 'object' then raise exception 'Invalid section payload.'; end if;

  request := jsonb_build_object('kind', p_kind, 'id', p_id, 'section', p_section, 'revision', p_revision, 'values', p_values, 'rows', p_rows);
  perform pg_advisory_xact_lock(hashtextextended(p_key::text, 0));

  select * into saved from record_editor_private.receipts where key = p_key;
  if found then
    if saved.actor <> auth.uid() or saved.request <> request then
      raise exception 'This save key belongs to a different change.';
    end if;
    return saved.response;
  end if;

  allowed := record_editor_private.section_fields(p_kind, p_section);
  if allowed is null then
    raise exception 'Unknown section % for record kind %.', p_section, p_kind;
  end if;

  tab := case p_kind when 'client' then 'clients' when 'equipment' then 'products' else 'bundles' end;

  -- Validate field allowlist
  if exists (select 1 from jsonb_object_keys(p_values) k where not (k = any(allowed))) then
    raise exception 'One or more fields cannot be edited in section %.', p_section;
  end if;

  -- Lock parent record and verify optimistic concurrency revision
  execute format('select to_jsonb(t) from public.%I t where id = $1 for update', tab) into existing using p_id;
  if existing is null then raise exception 'Record not found.'; end if;

  current_snapshot := record_editor_private.read_snapshot(p_kind, p_id::text);
  if p_revision is distinct from (current_snapshot->>'revision') then
    raise exception 'This record changed since you opened it. Reload the latest record before saving. Your changes have not been saved.' using errcode = '40001';
  end if;

  patch := p_values;
  if p_kind = 'client' then
    if patch ? 'country' and patch->>'country' is null then patch := patch || '{"country":"Nepal"}'; end if;
    if patch ? 'type_parent' and patch->>'type_parent' <> 'Organisation' then patch := patch || '{"org_subtype":null}'; end if;
  end if;

  if patch ? 'name' and nullif(btrim(patch->>'name'), '') is null then
    raise exception 'Name is required.';
  end if;

  patch := patch || jsonb_build_object('updated_at', clock_timestamp());

  -- Update parent table
  begin
    perform record_editor_private.write_row(tab, p_id, patch);
  exception when unique_violation then
    raise exception '%', case when p_kind = 'client' then 'A client with this phone number already exists. Open the existing client instead. Your changes have not been saved.' else 'A record with these details already exists. Your changes have not been saved.' end using errcode = '23505';
  end;

  -- Optional child row processing for sections that manage specific child rows
  if p_kind = 'client' and p_section = 'contact' and jsonb_array_length(p_rows) > 0 then
    child_allowed := array['full_name', 'designation', 'phone', 'email'];
    for row_data in select value from jsonb_array_elements(p_rows) loop
      child_id := (row_data->>'id')::uuid;
      if child_id is not null then
        execute 'select to_jsonb(t) from public.client_contacts t where id = $1 and client_id = $2' into existing using child_id, p_id;
        if existing is null then raise exception 'Contact does not belong to this client.'; end if;
        perform record_editor_private.write_row('client_contacts', child_id, record_editor_private.pick(row_data, child_allowed));
      else
        perform record_editor_private.write_row('client_contacts', null, record_editor_private.pick(row_data, child_allowed) || jsonb_build_object('client_id', p_id, 'is_primary', true, 'client_uuid', gen_random_uuid(), 'created_by', auth.uid()));
      end if;
    end loop;
  end if;

  response := record_editor_private.read_snapshot(p_kind, p_id::text);
  insert into audit_events(client_uuid, event_class, category, module, action, severity, status, table_name, record_id, actor_id, actor_role, new_values)
  values(p_key, 'status change', (case when p_kind = 'client' then 'Administration' else 'Inventory' end)::audit_category, (case when p_kind = 'client' then 'Clients' else 'Inventory' end)::audit_module, 'Update', 'Informational', 'Success', tab, p_id, auth.uid(), auth_user_role(), jsonb_build_object('section', p_section, 'revision', response->>'revision'));

  insert into record_editor_private.receipts(key, actor, request, response) values(p_key, auth.uid(), request, response);
  return response;
end;
$$;
revoke all on function public.save_record_section(text, uuid, text, text, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_record_section(text, uuid, text, text, uuid, jsonb, jsonb) to authenticated;

-- 2. add_equipment_units RPC
create or replace function public.add_equipment_units(
  p_product_id uuid,
  p_units jsonb,
  p_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prod record;
  v_unit_data jsonb;
  v_serial text;
  v_wh uuid;
  v_branch uuid;
  v_cond unit_condition;
  v_tag text;
  v_unit_seq int;
  v_unit_id uuid;
  v_inserted_ids uuid[] := '{}';
  v_total int;
  v_receipt record;
  v_request jsonb;
  v_response jsonb;
begin
  if auth.uid() is null or not coalesce(auth_user_role()::text in ('Owner', 'Admin', 'Manager'), false) then
    raise exception 'Permission denied to add equipment units.' using errcode = '42501';
  end if;

  if p_key is null then raise exception 'A client key is required.'; end if;
  if p_units is null or jsonb_typeof(p_units) <> 'array' or jsonb_array_length(p_units) = 0 then
    raise exception 'At least one unit is required.';
  end if;

  v_request := jsonb_build_object('product_id', p_product_id, 'units', p_units);
  perform pg_advisory_xact_lock(hashtextextended(p_key::text, 0));

  select * into v_receipt from record_editor_private.receipts where key = p_key;
  if found then
    if v_receipt.actor <> auth.uid() or v_receipt.request <> v_request then
      raise exception 'This save key belongs to a different change.';
    end if;
    return v_receipt.response;
  end if;

  select * into v_prod from public.products where id = p_product_id for update;
  if not found then raise exception 'Product not found.'; end if;
  if v_prod.tracking_mode <> 'Serialised' then
    raise exception 'Units can only be added to Serialised products. For quantity products, use Adjust Stock.';
  end if;

  -- Current total unit count for numbering
  select count(*) into v_unit_seq from public.product_units where product_id = p_product_id;

  for v_unit_data in select value from jsonb_array_elements(p_units) loop
    v_serial := nullif(btrim(v_unit_data->>'serial_no'), '');
    v_wh := (v_unit_data->>'warehouse_id')::uuid;

    if v_wh is null then raise exception 'Warehouse is required for every unit.'; end if;
    select branch_id into v_branch from public.warehouses where id = v_wh;
    if v_branch is null then raise exception 'Invalid warehouse specified.'; end if;

    if v_serial is not null and exists (select 1 from public.product_units where serial_no = v_serial) then
      raise exception 'Serial number % is already in use by another unit.', v_serial;
    end if;

    v_unit_seq := v_unit_seq + 1;
    v_tag := coalesce(v_prod.asset_code, 'EQ') || '-' || lpad(v_unit_seq::text, 2, '0');
    v_cond := coalesce((v_unit_data->>'condition')::unit_condition, 'Good'::unit_condition);

    insert into public.product_units (
      client_uuid,
      product_id,
      serial_no,
      asset_tag,
      status,
      condition,
      branch_id,
      warehouse_id,
      rack,
      shelf,
      bin,
      purchase_date,
      created_by
    ) values (
      gen_random_uuid(),
      p_product_id,
      v_serial,
      v_tag,
      'In Stock',
      v_cond,
      v_branch,
      v_wh,
      nullif(btrim(v_unit_data->>'rack'), ''),
      nullif(btrim(v_unit_data->>'shelf'), ''),
      nullif(btrim(v_unit_data->>'bin'), ''),
      nullif(v_unit_data->>'purchase_date', '')::date,
      auth.uid()
    ) returning id into v_unit_id;

    v_inserted_ids := array_append(v_inserted_ids, v_unit_id);
  end loop;

  -- Synchronize total_quantity
  select count(*) into v_total from public.product_units where product_id = p_product_id and status <> 'Retired';
  update public.products set total_quantity = v_total, updated_at = clock_timestamp() where id = p_product_id;

  v_response := jsonb_build_object(
    'product_id', p_product_id,
    'added_count', jsonb_array_length(p_units),
    'total_quantity', v_total,
    'unit_ids', to_jsonb(v_inserted_ids)
  );

  insert into audit_events(client_uuid, event_class, category, module, action, severity, status, table_name, record_id, actor_id, actor_role, new_values)
  values(p_key, 'status change', 'Inventory'::audit_category, 'Inventory'::audit_module, 'Create', 'Informational', 'Success', 'product_units', p_product_id, auth.uid(), auth_user_role(), v_response);

  insert into record_editor_private.receipts(key, actor, request, response) values(p_key, auth.uid(), v_request, v_response);
  return v_response;
end;
$$;
revoke all on function public.add_equipment_units(uuid, jsonb, uuid) from public, anon;
grant execute on function public.add_equipment_units(uuid, jsonb, uuid) to authenticated;

-- 3. retire_equipment_unit RPC
create or replace function public.retire_equipment_unit(
  p_unit_id uuid,
  p_reason text,
  p_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_unit record;
  v_total int;
  v_receipt record;
  v_request jsonb;
  v_response jsonb;
begin
  if auth.uid() is null or not coalesce(auth_user_role()::text in ('Owner', 'Admin', 'Manager'), false) then
    raise exception 'Permission denied to retire equipment units.' using errcode = '42501';
  end if;

  if p_key is null then raise exception 'A client key is required.'; end if;
  if p_reason is null or length(btrim(p_reason)) < 10 then
    raise exception 'Retirement requires an explanation of at least 10 characters.';
  end if;

  v_request := jsonb_build_object('unit_id', p_unit_id, 'reason', btrim(p_reason));
  perform pg_advisory_xact_lock(hashtextextended(p_key::text, 0));

  select * into v_receipt from record_editor_private.receipts where key = p_key;
  if found then
    if v_receipt.actor <> auth.uid() or v_receipt.request <> v_request then
      raise exception 'This save key belongs to a different change.';
    end if;
    return v_receipt.response;
  end if;

  select * into v_unit from public.product_units where id = p_unit_id for update;
  if not found then raise exception 'Unit not found.'; end if;
  if v_unit.status = 'Retired' then raise exception 'This unit is already retired.'; end if;

  -- Safety Refusals
  if v_unit.status in ('On Rent', 'Reserved', 'Packed', 'Returning', 'Inspection', 'Cleaning', 'Maintenance') then
    raise exception 'GATE:unit.retire.active_status|Unit % is currently in % state and cannot be retired safely. Resolve active operational holds first.', v_unit.asset_tag, v_unit.status;
  end if;

  if exists (select 1 from public.inventory_reservations where unit_id = p_unit_id and status = 'active') then
    raise exception 'GATE:unit.retire.active_reservation|Unit % has an active booking reservation and cannot be retired.', v_unit.asset_tag;
  end if;

  if exists (
    select 1 from public.booking_lines bl
    join public.bookings b on b.id = bl.booking_id
    where bl.unit_id = p_unit_id and b.stage in ('Booked', 'Packed', 'On Rent')
  ) then
    raise exception 'GATE:unit.retire.active_booking|Unit % is assigned to an active booking and cannot be retired.', v_unit.asset_tag;
  end if;

  -- Apply soft retirement
  update public.product_units
     set status = 'Retired',
         retired_at = clock_timestamp(),
         retired_by = auth.uid(),
         retirement_reason = btrim(p_reason),
         updated_at = clock_timestamp()
   where id = p_unit_id;

  -- Synchronize total_quantity
  select count(*) into v_total from public.product_units where product_id = v_unit.product_id and status <> 'Retired';
  update public.products set total_quantity = v_total, updated_at = clock_timestamp() where id = v_unit.product_id;

  v_response := jsonb_build_object(
    'unit_id', p_unit_id,
    'asset_tag', v_unit.asset_tag,
    'product_id', v_unit.product_id,
    'status', 'Retired',
    'total_quantity', v_total,
    'retired_at', clock_timestamp()
  );

  insert into audit_events(client_uuid, event_class, category, module, action, severity, status, table_name, record_id, actor_id, actor_role, new_values)
  values(p_key, 'status change', 'Inventory'::audit_category, 'Inventory'::audit_module, 'Retire', 'Warning', 'Success', 'product_units', p_unit_id, auth.uid(), auth_user_role(), v_response);

  insert into record_editor_private.receipts(key, actor, request, response) values(p_key, auth.uid(), v_request, v_response);
  return v_response;
end;
$$;
revoke all on function public.retire_equipment_unit(uuid, text, uuid) from public, anon;
grant execute on function public.retire_equipment_unit(uuid, text, uuid) to authenticated;

-- 4. enroll_client_membership RPC
create or replace function public.enroll_client_membership(
  p_client_id uuid,
  p_plan_id uuid,
  p_join_date date,
  p_fee_paid numeric,
  p_notes text,
  p_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client record;
  v_plan record;
  v_existing_id uuid;
  v_new_id uuid := gen_random_uuid();
  v_receipt record;
  v_request jsonb;
  v_response jsonb;
begin
  if auth.uid() is null or not coalesce(auth_user_role()::text in ('Owner', 'Admin', 'Manager', 'Coordinator'), false) then
    raise exception 'Permission denied to enroll membership.' using errcode = '42501';
  end if;

  if p_key is null then raise exception 'A client key is required.'; end if;
  if p_client_id is null then raise exception 'Client is required.'; end if;
  if p_plan_id is null then raise exception 'Plan is required.'; end if;

  v_request := jsonb_build_object('client_id', p_client_id, 'plan_id', p_plan_id, 'join_date', p_join_date, 'fee_paid', p_fee_paid, 'notes', p_notes);
  perform pg_advisory_xact_lock(hashtextextended(p_key::text, 0));

  select * into v_receipt from record_editor_private.receipts where key = p_key;
  if found then
    if v_receipt.actor <> auth.uid() or v_receipt.request <> v_request then
      raise exception 'This save key belongs to a different change.';
    end if;
    return v_receipt.response;
  end if;

  select * into v_client from public.clients where id = p_client_id for update;
  if not found then raise exception 'Client not found.'; end if;

  select * into v_plan from public.membership_plans where id = p_plan_id;
  if not found then raise exception 'Membership plan not found.'; end if;

  -- Lock and supersede any active live membership for this client
  select id into v_existing_id
    from public.client_memberships
   where client_id = p_client_id and superseded_at is null
     for update;

  if v_existing_id is not null then
    update public.client_memberships
       set superseded_at = clock_timestamp(),
           superseded_by_id = v_new_id
     where id = v_existing_id;
  end if;

  insert into public.client_memberships (
    id,
    client_uuid,
    client_id,
    plan_id,
    join_date,
    fee_paid,
    created_by
  ) values (
    v_new_id,
    p_key,
    p_client_id,
    p_plan_id,
    coalesce(p_join_date, current_date),
    p_fee_paid,
    auth.uid()
  );

  v_response := jsonb_build_object(
    'id', v_new_id,
    'client_id', p_client_id,
    'plan_id', p_plan_id,
    'level', v_plan.level,
    'plan_label', v_plan.label,
    'join_date', coalesce(p_join_date, current_date),
    'fee_paid', p_fee_paid,
    'superseded_membership_id', v_existing_id
  );

  insert into audit_events(client_uuid, event_class, category, module, action, severity, status, table_name, record_id, actor_id, actor_role, new_values)
  values(p_key, 'status change', 'Clients'::audit_category, 'Clients'::audit_module, 'EnrollMembership', 'Informational', 'Success', 'client_memberships', v_new_id, auth.uid(), auth_user_role(), v_response);

  insert into record_editor_private.receipts(key, actor, request, response) values(p_key, auth.uid(), v_request, v_response);
  return v_response;
end;
$$;
revoke all on function public.enroll_client_membership(uuid, uuid, date, numeric, text, uuid) from public, anon;
grant execute on function public.enroll_client_membership(uuid, uuid, date, numeric, text, uuid) to authenticated;

commit;
