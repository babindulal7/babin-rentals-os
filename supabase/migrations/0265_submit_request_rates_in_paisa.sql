-- 0265_submit_request_rates_in_paisa.sql
-- T7-13 follow-up (lane C). Fixes a unit error in submit_booking_request (0257).
-- products.daily_rate and bundles.daily_rate are rupees (public_catalogue_v multiplies by 100).
-- 0257 summed those rupee values straight into the *_paisa columns, so every online request
-- total, VAT and advance was 100 times too small. This migration converts each rate to paisa
-- once, at the lookup. Nothing else in the function changes.
--
-- Affects card T7-04 (accepted on main). Needs owner review before it is applied.
-- Ledger: docs/plans/MIGRATION_LEDGER.md row 0265.
--
-- REVERT: re-apply 0257 (create or replace function public.submit_booking_request).

begin;
create or replace function public.submit_booking_request(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_away_active boolean;
  v_away_msg text;
  v_client_name text;
  v_client_email text;
  v_client_phone text;
  v_project_name text;
  v_shoot_location text;
  v_start_date date;
  v_end_date date;
  v_fulfillment text;
  v_delivery_zone text;
  v_delivery_address text;
  v_lines jsonb;
  v_line jsonb;
  v_rental_days integer;
  v_request_id uuid;
  v_request_num text;
  v_total_paisa bigint := 0;
  v_vat_paisa bigint := 0;
  v_advance_due_paisa bigint := 0;
  v_product_id uuid;
  v_bundle_id uuid;
  v_quantity integer;
  v_rate bigint;
  v_line_total bigint;
  v_auth_uid uuid;
  v_client_id uuid;
  v_portal_user_id uuid;
begin
  -- T7-14 Away Mode Refusal Gate
  select coalesce(is_away, false), coalesce(message, 'Away — not taking online requests')
  into v_away_active, v_away_msg
  from jsonb_to_record(public.get_online_booking_away_status()) as (is_away boolean, message text);

  if v_away_active then
    raise exception 'GATE:gate.booking_request.away_mode|Online booking requests are temporarily disabled: %', v_away_msg
      using errcode = 'P0001';
  end if;
  -- Validate client info
  v_client_name := nullif(trim(p_payload ->> 'client_name'), '');
  v_client_email := nullif(trim(p_payload ->> 'client_email'), '');
  v_client_phone := nullif(trim(p_payload ->> 'client_phone'), '');
  v_project_name := nullif(trim(p_payload ->> 'project_name'), '');
  v_shoot_location := nullif(trim(p_payload ->> 'shoot_location'), '');
  v_fulfillment := coalesce(nullif(trim(p_payload ->> 'fulfillment_type'), ''), 'pickup');
  v_delivery_zone := nullif(trim(p_payload ->> 'delivery_zone_id'), '');
  v_delivery_address := nullif(trim(p_payload ->> 'delivery_address'), '');

  if v_client_name is null then
    raise exception 'GATE:gate.booking_request.name_required|Client name is required.';
  end if;
  if v_client_email is null then
    raise exception 'GATE:gate.booking_request.email_required|Client email is required.';
  end if;
  if v_client_phone is null then
    raise exception 'GATE:gate.booking_request.phone_required|Client phone is required.';
  end if;

  -- Validate dates
  begin
    v_start_date := (p_payload ->> 'start_date')::date;
    v_end_date := (p_payload ->> 'end_date')::date;
  exception when others then
    raise exception 'GATE:gate.booking_request.invalid_dates|Valid start and end dates are required.';
  end;

  if v_end_date < v_start_date then
    raise exception 'GATE:gate.booking_request.invalid_date_range|End date must be on or after start date.';
  end if;

  -- 12-hour advance notice check for pickup (W63)
  if v_fulfillment = 'pickup' then
    if v_start_date < (current_date) then
      raise exception 'GATE:gate.booking_request.advance_notice|Pickup must be at least 12 hours after the request.';
    end if;
  end if;

  -- Validate lines
  v_lines := p_payload -> 'lines';
  if v_lines is null or jsonb_array_length(v_lines) = 0 then
    raise exception 'GATE:gate.booking_request.empty_cart|At least one item is required in the booking request.';
  end if;

  v_rental_days := (v_end_date - v_start_date) + 1;
  if v_rental_days <= 0 then
    v_rental_days := 1;
  end if;

  -- Resolve authenticated client identity and existing client/portal bindings
  v_auth_uid := auth.uid();
  if v_auth_uid is not null then
    -- Verify this auth user actually exists in auth.users and is a portal client (not internal staff)
    if exists (select 1 from auth.users where id = v_auth_uid) and not exists (select 1 from public.users where id = v_auth_uid) then
      select pu.id, pu.client_id
      into v_portal_user_id, v_client_id
      from public.portal_users pu
      join public.online_profiles op on op.phone = pu.phone
      where op.auth_uid = v_auth_uid
      order by pu.created_at desc
      limit 1;
    else
      v_auth_uid := null;
    end if;
  end if;

  -- Generate request number: REQ-YYYYMMDD-XXXX
  v_request_num := 'REQ-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.booking_request_seq')::text, 4, '0');
  v_request_id := gen_random_uuid();

  -- Insert header
  insert into public.booking_requests (
    id,
    request_number,
    client_name,
    client_email,
    client_phone,
    project_name,
    shoot_location,
    start_date,
    end_date,
    fulfillment_type,
    delivery_zone_id,
    delivery_address,
    status,
    requester_auth_uid,
    client_id,
    portal_user_id
  ) values (
    v_request_id,
    v_request_num,
    v_client_name,
    v_client_email,
    v_client_phone,
    v_project_name,
    v_shoot_location,
    v_start_date,
    v_end_date,
    v_fulfillment,
    v_delivery_zone,
    v_delivery_address,
    'pending',
    v_auth_uid,
    v_client_id,
    v_portal_user_id
  );

  -- Process and insert each line
  for v_line in select * from jsonb_array_elements(v_lines)
  loop
    v_product_id := (v_line ->> 'product_id')::uuid;
    v_bundle_id := (v_line ->> 'bundle_id')::uuid;
    v_quantity := coalesce((v_line ->> 'quantity')::integer, 1);

    if v_quantity <= 0 then
      raise exception 'GATE:gate.booking_request.invalid_quantity|Quantity must be at least 1.';
    end if;

    if v_product_id is null and v_bundle_id is null then
      raise exception 'GATE:gate.booking_request.item_required|Line must reference a product or bundle.';
    end if;

    v_rate := 0;
    if v_product_id is not null then
      select round(coalesce(daily_rate, 0) * 100)::bigint into v_rate
      from public.products
      where id = v_product_id;
    elsif v_bundle_id is not null then
      select round(coalesce(daily_rate, 0) * 100)::bigint into v_rate
      from public.bundles
      where id = v_bundle_id;
    end if;

    v_line_total := v_rate * v_rental_days * v_quantity;
    v_total_paisa := v_total_paisa + v_line_total;

    insert into public.booking_request_lines (
      request_id,
      product_id,
      bundle_id,
      quantity,
      daily_rate_paisa,
      line_total_paisa
    ) values (
      v_request_id,
      v_product_id,
      v_bundle_id,
      v_quantity,
      v_rate,
      v_line_total
    );
  end loop;

  -- Standard Nepal 13% VAT and 50% advance due
  v_vat_paisa := round(v_total_paisa * 0.13);
  v_advance_due_paisa := round((v_total_paisa + v_vat_paisa) * 0.50);

  update public.booking_requests
  set total_paisa = v_total_paisa,
      vat_paisa = v_vat_paisa,
      advance_due_paisa = v_advance_due_paisa
  where id = v_request_id;

  return jsonb_build_object(
    'request_id', v_request_id,
    'request_number', v_request_num,
    'total_paisa', v_total_paisa,
    'vat_paisa', v_vat_paisa,
    'advance_due_paisa', v_advance_due_paisa,
    'status', 'pending'
  );
end;
$$;

revoke all on function public.submit_booking_request(jsonb) from public;
grant execute on function public.submit_booking_request(jsonb) to anon, authenticated;

commit;
