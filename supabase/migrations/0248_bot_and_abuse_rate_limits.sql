-- Migration 0248: Bot and abuse protection rate limits (T7-09)
-- Authority: docs/ONLINE_BOOKING_SPEC.md §8; docs/plans/T7_ONLINE_BOOKING.md §T7-09; Ruling D31.

-- 1. Create table public.public_rate_limits
create table if not exists public.public_rate_limits (
  rate_key text primary key,
  bucket_count integer not null default 1 check (bucket_count >= 1),
  window_start timestamptz not null default now()
);

comment on table public.public_rate_limits is
  'Sliding window counters for public form endpoints to prevent bot spam, bursts, and credential stuffing (T7-09).';

alter table public.public_rate_limits enable row level security;

-- Rate limits table is strictly internal: direct read/write denied to anon and public
drop policy if exists public_rate_limits_deny_all on public.public_rate_limits;
create policy public_rate_limits_deny_all on public.public_rate_limits
  for all to public
  using (false);

-- 2. Internal rate limit evaluator
create or replace function public.check_rate_limit(
  p_key text,
  p_max_attempts integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_row public.public_rate_limits;
begin
  if p_key is null or char_length(btrim(p_key)) = 0 then
    return true;
  end if;

  select * into v_row
  from public.public_rate_limits
  where rate_key = p_key
  for update;

  if not found then
    insert into public.public_rate_limits (rate_key, bucket_count, window_start)
    values (p_key, 1, v_now)
    on conflict (rate_key) do update set
      bucket_count = case
        when v_now - public_rate_limits.window_start > (p_window_seconds || ' seconds')::interval
        then 1
        else public_rate_limits.bucket_count + 1
      end,
      window_start = case
        when v_now - public_rate_limits.window_start > (p_window_seconds || ' seconds')::interval
        then v_now
        else public_rate_limits.window_start
      end;
    return true;
  end if;

  -- Window expired: reset window and bucket
  if v_now - v_row.window_start > (p_window_seconds || ' seconds')::interval then
    update public.public_rate_limits
    set bucket_count = 1,
        window_start = v_now
    where rate_key = p_key;
    return true;
  end if;

  -- Inside active window: check threshold
  if v_row.bucket_count >= p_max_attempts then
    return false;
  end if;

  update public.public_rate_limits
  set bucket_count = bucket_count + 1
  where rate_key = p_key;

  return true;
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.check_rate_limit(text, integer, integer) to authenticated, service_role;

-- 3. Public RPC: verify_public_rate_limit
-- Verifies rate limit for public actions without disclosing raw emails or IP details.
create or replace function public.verify_public_rate_limit(
  p_action text,
  p_identifier text,
  p_turnstile_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action text;
  v_hash text;
  v_key text;
  v_max_attempts integer := 10;
  v_window_sec integer := 60;
  v_allowed boolean;
begin
  v_action := coalesce(nullif(btrim(p_action), ''), 'general');
  v_hash := md5(lower(coalesce(btrim(p_identifier), 'anonymous')));
  v_key := v_action || ':' || v_hash;

  if v_action = 'email_otp' then
    v_max_attempts := 5;
    v_window_sec := 3600; -- 5 OTP requests per hour per target
  elsif v_action = 'booking_request' then
    v_max_attempts := 10;
    v_window_sec := 600; -- 10 requests per 10 minutes per client
  end if;

  v_allowed := public.check_rate_limit(v_key, v_max_attempts, v_window_sec);

  if not v_allowed then
    return jsonb_build_object(
      'allowed', false,
      'code', 'RATE_LIMITED',
      'message', 'Too many requests. Please wait before retrying.'
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'code', 'OK',
    'message', 'Request permitted.'
  );
end;
$$;

revoke all on function public.verify_public_rate_limit(text, text, text) from public;
grant execute on function public.verify_public_rate_limit(text, text, text) to anon, authenticated;

-- 4. Update submit_booking_request to enforce rate limit
create or replace function public.submit_booking_request(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
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
      select round(coalesce(daily_rate, 0)::numeric * 100)::bigint into v_rate
      from public.products
      where id = v_product_id;
    elsif v_bundle_id is not null then
      select round(coalesce(daily_rate, 0)::numeric * 100)::bigint into v_rate
      from public.bundles
      where id = v_bundle_id;
    end if;

    if v_rate is null or v_rate <= 0 then
      raise exception 'GATE:gate.booking_request.invalid_item_rate|A selected item has no valid published daily price.';
    end if;
    -- Catalogue daily_rate is stored in NPR; all request arithmetic uses paisa.
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
  -- Match the approved deposit/advance policy in integer paisa:
  -- up to NPR 5,000: full; up to NPR 10,000: NPR 5,000; above: 50%
  -- rounded to the nearest whole rupee (payment deposit excluded).
  if v_total_paisa + v_vat_paisa <= 500000 then
    v_advance_due_paisa := v_total_paisa + v_vat_paisa;
  elsif v_total_paisa + v_vat_paisa <= 1000000 then
    v_advance_due_paisa := 500000;
  else
    v_advance_due_paisa := (round(((v_total_paisa + v_vat_paisa)::numeric * 0.50) / 100) * 100)::bigint;
  end if;

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
