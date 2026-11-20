-- Migration 0249: Away switch for online booking (T7-14 / B6)
--
-- Implements the "Away — not taking online requests" control for online booking:
-- - Allows Owner, Admin, and Manager to toggle Away mode, with an optional message and "back on" date.
-- - Public catalogue and rates remain visible and searchable to anon/clients.
-- - Server-side refusal on submit_booking_request when Away mode is active (prior to resumeDate).
-- - Automatic resumption when resumeDate passes.

begin;

-- 1. Helper to retrieve online booking away status (callable by public / anon)
create or replace function public.get_online_booking_away_status()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_away boolean := false;
  v_message text := '';
  v_resume_str text := '';
  v_resume_ts timestamptz;
  v_active boolean := false;
begin
  -- Read setting values
  select coalesce((value #>> '{}')::boolean, false) into v_is_away
  from public.settings
  where key = 'onlineBookingAway' and scope = 'org';

  select coalesce(value #>> '{}', '') into v_message
  from public.settings
  where key = 'onlineBookingAwayMessage' and scope = 'org';

  select coalesce(value #>> '{}', '') into v_resume_str
  from public.settings
  where key = 'onlineBookingAwayResumeDate' and scope = 'org';

  if v_is_away then
    v_active := true;
    if v_resume_str is not null and v_resume_str != '' and v_resume_str != '""' then
      begin
        v_resume_ts := v_resume_str::timestamptz;
        if v_resume_ts is not null and now() >= v_resume_ts then
          -- Expired resume date -> auto disengaged
          v_active := false;
        end if;
      exception when others then
        -- Invalid format: retain active away mode
        v_active := true;
      end;
    end if;
  else
    v_active := false;
  end if;

  if v_message = '' or v_message = '""' then
    v_message := 'Away — not taking online requests';
  end if;

  return jsonb_build_object(
    'is_away', v_active,
    'configured_away', coalesce(v_is_away, false),
    'can_accept_requests', not v_active,
    'message', v_message,
    'resume_date', nullif(v_resume_str, '')
  );
end;
$$;

revoke all on function public.get_online_booking_away_status() from public;
grant execute on function public.get_online_booking_away_status() to anon, authenticated;

-- 2. Configuration RPC: Owner, Admin, and Manager only (B6)
create or replace function public.set_online_booking_away(
  p_is_away boolean,
  p_message text default null,
  p_resume_date timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_role text;
  v_actor_id uuid;
  v_clean_msg text;
  v_resume_str text;
begin
  v_actor_role := auth_user_role();
  v_actor_id := auth_user_id();

  if v_actor_role not in ('Owner', 'Admin', 'Manager') then
    raise exception 'GATE:gate.settings.role|Only Owner, Admin, and Manager may configure online booking away mode.'
      using errcode = 'P0001';
  end if;

  v_clean_msg := coalesce(trim(p_message), '');
  v_resume_str := case when p_resume_date is not null then to_char(p_resume_date, 'YYYY-MM-DD"T"HH24:MI:SSOF') else '' end;

  -- Upsert onlineBookingAway
  insert into public.settings (key, value, scope, is_money, updated_by, updated_at)
  values ('onlineBookingAway', to_jsonb(coalesce(p_is_away, false)), 'org', false, v_actor_id, now())
  on conflict (key, scope, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set
    value = excluded.value,
    updated_by = v_actor_id,
    updated_at = now();

  -- Upsert onlineBookingAwayMessage
  insert into public.settings (key, value, scope, is_money, updated_by, updated_at)
  values ('onlineBookingAwayMessage', to_jsonb(v_clean_msg), 'org', false, v_actor_id, now())
  on conflict (key, scope, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set
    value = excluded.value,
    updated_by = v_actor_id,
    updated_at = now();

  -- Upsert onlineBookingAwayResumeDate
  insert into public.settings (key, value, scope, is_money, updated_by, updated_at)
  values ('onlineBookingAwayResumeDate', to_jsonb(v_resume_str), 'org', false, v_actor_id, now())
  on conflict (key, scope, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set
    value = excluded.value,
    updated_by = v_actor_id,
    updated_at = now();

  return public.get_online_booking_away_status();
end;
$$;

revoke all on function public.set_online_booking_away(boolean, text, timestamptz) from public, anon;
grant execute on function public.set_online_booking_away(boolean, text, timestamptz) to authenticated;

-- 3. Update submit_booking_request to enforce Away Mode check
create or replace function public.submit_booking_request(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_away_status jsonb;
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
  -- Away Mode check (T7-14 / B6)
  v_away_status := public.get_online_booking_away_status();
  if (v_away_status ->> 'can_accept_requests')::boolean is false then
    raise exception 'GATE:gate.booking_request.away_mode|Online booking requests are temporarily disabled: %',
      coalesce(nullif(v_away_status ->> 'message', ''), 'Away — not taking online requests')
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

  -- Rate limit check per email target (max 10 booking requests per 10 minutes)
  if not public.check_rate_limit('req_email:' || md5(lower(v_client_email)), 10, 600) then
    raise exception 'GATE:gate.booking_request.rate_limited|Too many booking requests submitted. Please wait before retrying.';
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

  -- Insert booking request header
  insert into public.booking_requests (
    id,
    request_number,
    requester_auth_uid,
    client_id,
    portal_user_id,
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
    status
  ) values (
    v_request_id,
    v_request_num,
    v_auth_uid,
    v_client_id,
    v_portal_user_id,
    v_client_name,
    v_client_email,
    v_client_phone,
    v_project_name,
    v_shoot_location,
    v_start_date,
    v_end_date,
    v_fulfillment,
    case when v_fulfillment = 'delivery' then v_delivery_zone else null end,
    case when v_fulfillment = 'delivery' then v_delivery_address else null end,
    'pending'
  );

  -- Process request lines
  for v_line in select * from jsonb_array_elements(v_lines)
  loop
    v_product_id := nullif(v_line ->> 'product_id', '')::uuid;
    v_bundle_id := nullif(v_line ->> 'bundle_id', '')::uuid;
    v_quantity := coalesce((v_line ->> 'quantity')::integer, 1);

    if v_quantity <= 0 then
      raise exception 'GATE:gate.booking_request.invalid_quantity|Item quantity must be at least 1.';
    end if;

    v_rate := 0;
    if v_product_id is not null then
      select round(coalesce(daily_rate, 0)::numeric * 100)::bigint into v_rate
      from public.products
      where id = v_product_id;
    elsif v_bundle_id is not null then
      select round(coalesce(daily_rate, 0)::numeric * 100)::bigint into v_rate
      from public.bundles
      where id = v_bundle_id;
    else
      raise exception 'GATE:gate.booking_request.missing_item|Line must specify either product_id or bundle_id.';
    end if;

    v_line_total := v_rate * v_quantity * v_rental_days;
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

  -- Catalogue daily_rate is NPR; request line totals are in integer paisa.
  -- Keep VAT separate from the pretax subtotal to avoid double counting.
  v_vat_paisa := round(v_total_paisa * 0.13);

  -- Approved tiered advance for VAT-inclusive rental:
  -- up to NPR 5,000 full, to NPR 10,000 NPR 5,000, above 50%.
  -- Whole-rupee rounding is centralized in calculate_advance_required.
  v_advance_due_paisa := public.calculate_advance_required(v_total_paisa + v_vat_paisa);

  -- Update calculated totals on header
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
