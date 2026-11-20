-- Migration 0247: Client accounts and portal binding (T7-03)
-- Authority: docs/ONLINE_BOOKING_SPEC.md §4, §5.5, §9; docs/PERMISSIONS.md §7; Rulings D2, D29, W50, W51, W84.

-- 1. Create table public.online_profiles
create table if not exists public.online_profiles (
  auth_uid uuid not null primary key references auth.users (id) on delete cascade,
  name text not null,
  phone text not null,
  company text,
  pan text,
  id_doc_type text,
  id_doc_number text,
  id_doc_path text,
  id_doc_uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint online_profiles_phone_len check (char_length(btrim(phone)) >= 10)
);

-- Add auth and client linking columns to booking_requests (T7-03 / T7-04)
alter table public.booking_requests
  add column if not exists requester_auth_uid uuid references auth.users (id) on delete set null,
  add column if not exists client_id uuid references public.clients (id) on delete set null,
  add column if not exists portal_user_id uuid references public.portal_users (id) on delete set null;

create index if not exists idx_booking_requests_requester_auth on public.booking_requests(requester_auth_uid);
create index if not exists idx_booking_requests_client on public.booking_requests(client_id);

comment on table public.online_profiles is
  'Client self-registration profiles with contact metadata and ID-on-file reference (T7-03).';

alter table public.online_profiles enable row level security;

-- Client reads and writes own profile
drop policy if exists online_profiles_self on public.online_profiles;
create policy online_profiles_self on public.online_profiles
  for all to authenticated
  using (auth_uid = auth.uid())
  with check (auth_uid = auth.uid());

-- Staff reads all client profiles
drop policy if exists online_profiles_staff_select on public.online_profiles;
create policy online_profiles_staff_select on public.online_profiles
  for select to authenticated
  using (public.auth_is_staff());

-- 2. View public.online_profiles_v with Law 6 money and PII masking
create or replace view public.online_profiles_v as
select
  op.auth_uid,
  op.name,
  op.phone,
  op.company,
  case
    when public.auth_can_view_money() or op.auth_uid = auth.uid()
    then op.pan
    else null
  end as pan,
  op.id_doc_type,
  case
    when public.auth_user_role() in ('Owner', 'Admin', 'Manager') or op.auth_uid = auth.uid()
    then op.id_doc_number
    when op.id_doc_number is not null
    then '••••-••••-' || right(op.id_doc_number, 4)
    else null
  end as id_doc_number,
  case
    when public.auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator') or op.auth_uid = auth.uid()
    then op.id_doc_path
    else null
  end as id_doc_path,
  op.id_doc_uploaded_at,
  op.created_at,
  op.updated_at
from public.online_profiles op
where op.auth_uid = auth.uid() or public.auth_is_staff();

comment on view public.online_profiles_v is
  'Secure view of online profiles with PAN and ID document masking for unauthorized roles (T7-03).';

revoke all on public.online_profiles_v from public, anon;
grant select on public.online_profiles_v to authenticated;

-- 3. Private storage bucket request-ids for KYC documents
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name)
    values ('request-ids', 'request-ids')
    on conflict (id) do nothing;

    if exists (select 1 from information_schema.columns
      where table_schema = 'storage' and table_name = 'buckets' and column_name = 'public') then
      execute 'update storage.buckets set public = false where id = ''request-ids''';
    end if;
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    begin
      alter table storage.objects enable row level security;
    exception when insufficient_privilege then
      null;
    end;

    -- Client can insert into own folder in request-ids bucket
    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects' and policyname = 'request_ids_client_insert'
    ) then
      create policy "request_ids_client_insert"
        on storage.objects for insert
        to authenticated
        with check (
          bucket_id = 'request-ids'
          and (string_to_array(name, '/'))[1] = auth.uid()::text
        );
    end if;

    -- Client can select own files; staff can select all request-ids objects
    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects' and policyname = 'request_ids_select'
    ) then
      create policy "request_ids_select"
        on storage.objects for select
        to authenticated
        using (
          bucket_id = 'request-ids'
          and (
            (string_to_array(name, '/'))[1] = auth.uid()::text
            or public.auth_is_staff()
          )
        );
    end if;
  end if;
end $$;

-- 4. RPC online_profile_save
create or replace function public.online_profile_save(
  p_name text,
  p_phone text,
  p_company text default null,
  p_pan text default null,
  p_id_doc_type text default null,
  p_id_doc_number text default null,
  p_id_doc_path text default null
)
returns public.online_profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_auth_uid uuid;
  v_rec public.online_profiles;
begin
  v_auth_uid := auth.uid();
  if v_auth_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_name is null or char_length(btrim(p_name)) = 0 then
    raise exception 'name is required' using errcode = '23502';
  end if;
  if p_phone is null or char_length(btrim(p_phone)) < 10 then
    raise exception 'valid phone number is required' using errcode = '23514';
  end if;

  insert into public.online_profiles (
    auth_uid,
    name,
    phone,
    company,
    pan,
    id_doc_type,
    id_doc_number,
    id_doc_path,
    id_doc_uploaded_at,
    updated_at
  )
  values (
    v_auth_uid,
    btrim(p_name),
    btrim(p_phone),
    nullif(btrim(p_company), ''),
    nullif(btrim(p_pan), ''),
    nullif(btrim(p_id_doc_type), ''),
    nullif(btrim(p_id_doc_number), ''),
    nullif(btrim(p_id_doc_path), ''),
    case when p_id_doc_path is not null then now() else null end,
    now()
  )
  on conflict (auth_uid) do update set
    name = excluded.name,
    phone = excluded.phone,
    company = coalesce(excluded.company, online_profiles.company),
    pan = coalesce(excluded.pan, online_profiles.pan),
    id_doc_type = coalesce(excluded.id_doc_type, online_profiles.id_doc_type),
    id_doc_number = coalesce(excluded.id_doc_number, online_profiles.id_doc_number),
    id_doc_path = coalesce(excluded.id_doc_path, online_profiles.id_doc_path),
    id_doc_uploaded_at = case
      when excluded.id_doc_path is not null then now()
      else online_profiles.id_doc_uploaded_at
    end,
    updated_at = now()
  returning * into v_rec;

  return v_rec;
end;
$$;

revoke all on function public.online_profile_save(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.online_profile_save(text, text, text, text, text, text, text) to authenticated;

-- 5. RPC bind_online_account_to_client (Coordinator+ hand-bind or confirm-bind)
create or replace function public.bind_online_account_to_client(
  p_auth_uid uuid,
  p_client_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_staff_id uuid;
  v_user_email text;
  v_portal_user_id uuid;
  v_client_name text;
begin
  v_role := public.auth_user_role();
  if v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise exception 'access denied: Coordinator or above required' using errcode = '42501';
  end if;

  if p_reason is null or char_length(btrim(p_reason)) < 10 then
    raise exception 'reason must be at least 10 characters' using errcode = '23514';
  end if;

  select email into v_user_email from auth.users where id = p_auth_uid;
  if v_user_email is null then
    raise exception 'auth user not found' using errcode = 'P0002';
  end if;

  select name into v_client_name from public.clients where id = p_client_id;
  if v_client_name is null then
    raise exception 'client not found' using errcode = 'P0002';
  end if;

  v_staff_id := auth.uid();

  -- Upsert portal_users binding
  insert into public.portal_users (
    client_uuid,
    client_id,
    auth_user_id,
    email,
    email_verified_at,
    invited_by_staff_id,
    role
  )
  values (
    gen_random_uuid(),
    p_client_id,
    p_auth_uid,
    v_user_email,
    now(),
    v_staff_id,
    'Member'
  )
  on conflict (auth_user_id) where auth_user_id is not null
  do update set
    client_id = excluded.client_id
  returning id into v_portal_user_id;

  -- Resolve any pending portal link request
  update public.portal_link_requests
  set resolved_at = now(),
      portal_user_id = v_portal_user_id
  where auth_user_id = p_auth_uid
    and resolved_at is null;

  -- Link unassigned booking requests for this auth user to this client
  update public.booking_requests
  set client_id = p_client_id,
      portal_user_id = v_portal_user_id,
      updated_at = now()
  where requester_auth_uid = p_auth_uid
    and client_id is null;

  -- Audit event
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
    new_values
  )
  values (
    gen_random_uuid(),
    'session',
    'Users',
    'Clients',
    'Update',
    'Informational',
    'Success',
    'portal_users',
    v_portal_user_id,
    coalesce(v_staff_id, auth.uid()),
    jsonb_build_object(
      'auth_uid', p_auth_uid,
      'client_id', p_client_id,
      'client_name', v_client_name,
      'reason', btrim(p_reason)
    )
  );

  return jsonb_build_object(
    'success', true,
    'portal_user_id', v_portal_user_id,
    'client_id', p_client_id
  );
end;
$$;

revoke all on function public.bind_online_account_to_client(uuid, uuid, text) from public, anon;
grant execute on function public.bind_online_account_to_client(uuid, uuid, text) to authenticated;

-- 6. Policies for client self-service on booking_requests
drop policy if exists booking_requests_client_select on public.booking_requests;
create policy booking_requests_client_select on public.booking_requests
  for select
  to authenticated
  using (
    requester_auth_uid = auth.uid()
  );

drop policy if exists booking_request_lines_client_select on public.booking_request_lines;
create policy booking_request_lines_client_select on public.booking_request_lines
  for select
  to authenticated
  using (
    exists (
      select 1 from public.booking_requests r
      where r.id = booking_request_lines.request_id
        and r.requester_auth_uid = auth.uid()
    )
  );

-- Update public.booking_requests_v with auth and client binding columns
drop view if exists public.booking_requests_v cascade;
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
  r.requester_auth_uid,
  r.client_id,
  r.portal_user_id,
  case when auth_can_view_money() or r.requester_auth_uid = auth.uid() then r.total_paisa else null end as total_paisa,
  case when auth_can_view_money() or r.requester_auth_uid = auth.uid() then r.vat_paisa else null end as vat_paisa,
  case when auth_can_view_money() or r.requester_auth_uid = auth.uid() then r.advance_due_paisa else null end as advance_due_paisa,
  r.created_at,
  r.updated_at
from public.booking_requests r;

revoke all on public.booking_requests_v from public, anon;
grant select on public.booking_requests_v to authenticated;

-- 7. Update submit_booking_request to automatically bind authenticated requests to requester_auth_uid
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
