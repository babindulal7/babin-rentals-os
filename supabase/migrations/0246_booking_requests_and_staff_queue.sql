-- 0246_booking_requests_and_staff_queue.sql
-- T7-04: Online booking requests, line items, staff queue, and atomic confirmation/decline RPCs.

-- 1. Request number generator sequence
create sequence if not exists public.booking_request_seq start with 1001;

-- 2. Table: public.booking_requests
create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text not null unique,
  client_name text not null,
  client_email text not null,
  client_phone text not null,
  project_name text,
  shoot_location text,
  start_date date not null,
  end_date date not null,
  fulfillment_type text not null check (fulfillment_type in ('pickup', 'delivery')),
  delivery_zone_id text,
  delivery_address text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'declined', 'cancelled')),
  decline_reason text,
  booking_id uuid references public.bookings(id) on delete set null,
  total_paisa bigint not null default 0 check (total_paisa >= 0),
  vat_paisa bigint not null default 0 check (vat_paisa >= 0),
  advance_due_paisa bigint not null default 0 check (advance_due_paisa >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_requests_dates_valid check (end_date >= start_date)
);

create index if not exists idx_booking_requests_status on public.booking_requests(status);
create index if not exists idx_booking_requests_created_at on public.booking_requests(created_at desc);

-- 3. Table: public.booking_request_lines
create table if not exists public.booking_request_lines (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.booking_requests(id) on delete cascade,
  product_id uuid references public.products(id) on delete restrict,
  bundle_id uuid references public.bundles(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  daily_rate_paisa bigint not null default 0 check (daily_rate_paisa >= 0),
  line_total_paisa bigint not null default 0 check (line_total_paisa >= 0),
  constraint request_line_item_target check (
    (product_id is not null and bundle_id is null) or
    (product_id is null and bundle_id is not null)
  )
);

create index if not exists idx_booking_request_lines_request on public.booking_request_lines(request_id);

-- 4. Enable RLS
alter table public.booking_requests enable row level security;
alter table public.booking_request_lines enable row level security;

-- Policies for booking_requests
create policy booking_requests_staff_select on public.booking_requests
  for select
  to authenticated
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts')
  );

create policy booking_requests_staff_update on public.booking_requests
  for update
  to authenticated
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator')
  );

-- Policies for booking_request_lines
create policy booking_request_lines_staff_select on public.booking_request_lines
  for select
  to authenticated
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts')
  );

-- 5. Secure view masking money columns for floor roles (Law 6)
create or replace view public.booking_requests_v with (security_invoker = true) as
select
  r.id,
  r.request_number,
  r.client_name,
  r.client_email,
  r.client_phone,
  r.project_name,
  r.shoot_location,
  r.start_date,
  r.end_date,
  r.fulfillment_type,
  r.delivery_zone_id,
  r.delivery_address,
  r.status,
  r.decline_reason,
  r.booking_id,
  case when auth_can_view_money() then r.total_paisa else null end as total_paisa,
  case when auth_can_view_money() then r.vat_paisa else null end as vat_paisa,
  case when auth_can_view_money() then r.advance_due_paisa else null end as advance_due_paisa,
  r.created_at,
  r.updated_at
from public.booking_requests r;

revoke all on public.booking_requests_v from public, anon;
grant select on public.booking_requests_v to authenticated;

-- 6. RPC: submit_booking_request (callable by anon & authenticated)
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

  -- Generate request number: REQ-YYYYMMDD-XXXX
  v_request_num := 'REQ-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.booking_request_seq')::text, 4, '0');
  v_request_id := gen_random_uuid();

  -- Insert header first
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
    status
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
    'pending'
  );

  -- Process and insert each line
  for v_line in select * from jsonb_array_elements(v_lines)
  loop
    v_product_id := (v_line ->> 'product_id')::uuid;
    v_bundle_id := (v_line ->> 'bundle_id')::uuid;
    v_quantity := coalesce((v_line ->> 'quantity')::integer, 1);

    if v_quantity <= 0 then
      v_quantity := 1;
    end if;

    v_rate := 0;
    if v_product_id is not null then
      select coalesce(daily_rate, 0) into v_rate from public.products where id = v_product_id;
    elsif v_bundle_id is not null then
      select coalesce(daily_rate, 0) into v_rate from public.bundles where id = v_bundle_id;
    end if;

    -- Calculate line total in paisa: daily_rate * days * quantity
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

  -- 13% VAT
  v_vat_paisa := round(v_total_paisa * 0.13);
  -- 50% advance due standard
  v_advance_due_paisa := round((v_total_paisa + v_vat_paisa) * 0.50);

  update public.booking_requests set
    total_paisa = v_total_paisa,
    vat_paisa = v_vat_paisa,
    advance_due_paisa = v_advance_due_paisa,
    updated_at = now()
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

grant execute on function public.submit_booking_request(jsonb) to anon, authenticated;

-- 7. RPC: confirm_booking_request (Coordinator+)
create or replace function public.confirm_booking_request(p_request_id uuid, p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req public.booking_requests;
begin
  if auth_user_role() not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise exception 'GATE:gate.auth.unauthorized|Only coordinator or higher can confirm online requests.';
  end if;

  select * into v_req from public.booking_requests where id = p_request_id for update;
  if not found then
    raise exception 'GATE:gate.booking_request.not_found|Booking request not found.';
  end if;

  -- Idempotency: if already confirmed with the same booking_id, return success
  if v_req.status = 'confirmed' then
    return jsonb_build_object(
      'success', true,
      'request_id', p_request_id,
      'booking_id', v_req.booking_id,
      'already_confirmed', true
    );
  end if;

  if v_req.status in ('declined', 'cancelled') then
    raise exception 'GATE:gate.booking_request.invalid_status|Cannot confirm a request that has been %.', v_req.status;
  end if;

  update public.booking_requests set
    status = 'confirmed',
    booking_id = p_booking_id,
    updated_at = now()
  where id = p_request_id;

  return jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'booking_id', p_booking_id
  );
end;
$$;

revoke all on function public.confirm_booking_request(uuid, uuid) from public, anon;
grant execute on function public.confirm_booking_request(uuid, uuid) to authenticated;

-- 8. RPC: decline_booking_request (Coordinator+)
create or replace function public.decline_booking_request(p_request_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req public.booking_requests;
  v_clean_reason text;
begin
  if auth_user_role() not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise exception 'GATE:gate.auth.unauthorized|Only coordinator or higher can decline online requests.';
  end if;

  v_clean_reason := nullif(trim(p_reason), '');
  if v_clean_reason is null then
    raise exception 'GATE:gate.booking_request.decline_reason_required|A reason is required to decline a request.';
  end if;

  select * into v_req from public.booking_requests where id = p_request_id for update;
  if not found then
    raise exception 'GATE:gate.booking_request.not_found|Booking request not found.';
  end if;

  if v_req.status = 'confirmed' then
    raise exception 'GATE:gate.booking_request.already_confirmed|Cannot decline an already confirmed request.';
  end if;

  update public.booking_requests set
    status = 'declined',
    decline_reason = v_clean_reason,
    updated_at = now()
  where id = p_request_id;

  return jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'status', 'declined'
  );
end;
$$;

revoke all on function public.decline_booking_request(uuid, text) from public, anon;
grant execute on function public.decline_booking_request(uuid, text) to authenticated;
