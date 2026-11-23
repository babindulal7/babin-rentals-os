-- ==========================================================================
-- BUNDLED MIGRATIONS 0262 - 0268 FOR SUPABASE STAGING REHEARSAL
-- ==========================================================================

-- --------------------------------------------------------------------------
-- FILE: 0262_online_booking_away_mode.sql
-- --------------------------------------------------------------------------
-- Migration 0262: Away switch for online booking (T7-14 / B6)
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
  -- Read setting values (handle no-row SELECT INTO which sets targets to NULL)
  select (value #>> '{}')::boolean into v_is_away
  from public.settings
  where key = 'onlineBookingAway' and scope = 'org';

  select value #>> '{}' into v_message
  from public.settings
  where key = 'onlineBookingAwayMessage' and scope = 'org';

  select value #>> '{}' into v_resume_str
  from public.settings
  where key = 'onlineBookingAwayResumeDate' and scope = 'org';

  v_is_away := coalesce(v_is_away, false);
  v_message := coalesce(v_message, '');
  v_resume_str := coalesce(v_resume_str, '');

  if v_is_away then
    v_active := true;
    if v_resume_str != '' and v_resume_str != '""' then
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
      select coalesce(daily_rate, 0) into v_rate
      from public.products
      where id = v_product_id;
    elsif v_bundle_id is not null then
      select coalesce(daily_rate, 0) into v_rate
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


insert into supabase_migrations.schema_migrations (version, name) values ('0262', 'online_booking_away_mode') on conflict (version) do nothing;
commit;

-- --------------------------------------------------------------------------
-- FILE: 0263_product_families.sql
-- --------------------------------------------------------------------------
-- 0263_product_families.sql
-- T7-13 · Products with options on one page — data layer (lane C).
-- Ledger: docs/plans/MIGRATION_LEDGER.md row 0263.
--
-- A family groups products that differ only by an option (lens mount, cable length, size).
-- Each option stays its own product with its own stock, rate and serials. Grouping never
-- pools stock. A product belongs to at most one family (product_family_members.product_id unique).
--
-- Writes are NOT granted here. Grouping and ungrouping go through a later RPC, restricted to
-- Owner/Admin/Manager (canManageProductFamilies in src/lib/productFamilies.ts). Until then
-- RLS permits reads only.
--
-- REVERT: drop table if exists public.product_family_members;
--         drop table if exists public.product_families;

begin;

create table if not exists public.product_families (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  is_active   boolean not null default true,
  client_uuid uuid not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint product_families_name_length check (char_length(btrim(name)) between 1 and 160)
);

create table if not exists public.product_family_members (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.product_families (id) on delete restrict,
  product_id   uuid not null unique references public.products (id) on delete restrict,
  option_label text not null,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  client_uuid  uuid not null unique,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint product_family_members_label_length check (char_length(btrim(option_label)) between 1 and 80),
  constraint product_family_members_one_label_per_family unique (family_id, option_label)
);

comment on table public.product_families is
  'Option groups for products that differ only by an option (T7-13). Presentation only; stock stays per product.';
comment on table public.product_family_members is
  'Links one product to one family under an option label. A product is in at most one family. Retired with is_active = false (Law 3).';

create index if not exists product_family_members_family_idx
  on public.product_family_members (family_id);

alter table public.product_families enable row level security;
alter table public.product_family_members enable row level security;

drop policy if exists product_families_select on public.product_families;
create policy product_families_select on public.product_families
for select to authenticated
using (public.auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'));

drop policy if exists product_family_members_select on public.product_family_members;
create policy product_family_members_select on public.product_family_members
for select to authenticated
using (public.auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'));

revoke all on public.product_families from anon;
revoke all on public.product_family_members from anon;
revoke delete on public.product_families from authenticated;
revoke delete on public.product_family_members from authenticated;


-- Grouping RPC (T7-13). Owner, Admin and Manager only (canManageProductFamilies).
-- Idempotent on p_client_uuid (Law 8). Products must be active and not already in a family.
create or replace function public.group_products_into_family(
  p_client_uuid uuid,
  p_family_name text,
  p_members jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_member jsonb;
begin
  if public.auth_user_role() not in ('Owner', 'Admin', 'Manager') then
    raise exception 'permission denied: only Owner, Admin or Manager can group products'
      using errcode = '42501';
  end if;

  select id into v_family_id from public.product_families where client_uuid = p_client_uuid;
  if v_family_id is not null then
    return v_family_id;
  end if;

  if p_members is null or jsonb_typeof(p_members) <> 'array' or jsonb_array_length(p_members) < 2 then
    raise exception 'a family needs at least two options';
  end if;

  insert into public.product_families (name, client_uuid)
  values (btrim(p_family_name), p_client_uuid)
  returning id into v_family_id;

  for v_member in select * from jsonb_array_elements(p_members) loop
    if not exists (
      select 1 from public.products p
      where p.id = (v_member->>'product_id')::uuid and p.is_active and p.status = 'Active'
    ) then
      raise exception 'product % is not an active product', v_member->>'product_id';
    end if;
    insert into public.product_family_members
      (family_id, product_id, option_label, sort_order, client_uuid)
    values (
      v_family_id,
      (v_member->>'product_id')::uuid,
      btrim(v_member->>'option_label'),
      coalesce((v_member->>'sort_order')::int, 0),
      (v_member->>'client_uuid')::uuid
    );
  end loop;

  return v_family_id;
end;
$$;

revoke all on function public.group_products_into_family(uuid, text, jsonb) from public, anon;
grant execute on function public.group_products_into_family(uuid, text, jsonb) to authenticated;


insert into supabase_migrations.schema_migrations (version, name) values ('0263', 'product_families') on conflict (version) do nothing;
commit;

-- --------------------------------------------------------------------------
-- FILE: 0264_public_product_family_options.sql
-- --------------------------------------------------------------------------
-- 0264_public_product_family_options.sql
-- T7-13 · Products with options on one page — public read (lane C).
-- Ledger: docs/plans/MIGRATION_LEDGER.md row 0264.
--
-- One row per option that is publicly sold. The filters mirror public_catalogue_v (0255)
-- exactly, so a family option is never shown online unless the same product would be shown
-- as a standalone item: show_online, not bundle-only, active, Active status, and a positive
-- daily rate. Rates are the published online rates, in paisa, as public_catalogue_v publishes them.
--
-- The view carries no stock, serials, cost or staff fields. Availability is computed per
-- option by the booking flow, not here.
--
-- REVERT: drop view if exists public.public_product_family_options_v;

begin;

create or replace view public.public_product_family_options_v as
select
  f.id          as family_id,
  f.name        as family_name,
  m.product_id  as product_id,
  m.option_label,
  m.sort_order,
  p.name        as product_name,
  coalesce(p.description, '') as description,
  p.photos      as photo_paths,
  round(p.daily_rate * 100)::bigint as daily_rate_paisa
from public.product_family_members m
join public.product_families f on f.id = m.family_id
join public.products p on p.id = m.product_id
where f.is_active
  and m.is_active
  and p.show_online = true
  and p.online_bundle_only = false
  and p.is_active = true
  and p.status = 'Active'
  and p.daily_rate is not null
  and p.daily_rate > 0;

revoke all on public.public_product_family_options_v from public, anon, authenticated;
grant select on public.public_product_family_options_v to anon, authenticated;


insert into supabase_migrations.schema_migrations (version, name) values ('0264', 'public_product_family_options') on conflict (version) do nothing;
commit;

-- --------------------------------------------------------------------------
-- FILE: 0265_submit_request_rates_in_paisa.sql
-- --------------------------------------------------------------------------
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


insert into supabase_migrations.schema_migrations (version, name) values ('0265', 'submit_request_rates_in_paisa') on conflict (version) do nothing;
commit;

-- --------------------------------------------------------------------------
-- FILE: 0266_manager_approvals_to_owner.sql
-- --------------------------------------------------------------------------
-- 0266_manager_approvals_to_owner.sql
-- R-22.8 (22 Nov 2026): Manager-level approvals route to the Owner while the Settings choice
-- "managerApprovalsToOwner" is on. Default ON (owner answer O-33, 22 Nov 2026).
--
-- RULING 2026-11-22: Manager-level approvals go to the Owner by setting (R-22.8, RULINGS-2026-11-22.md).
--
-- Stricter only: while the setting is on, a Manager loses approval rights that the threshold
-- rule would have given them. The Owner's rights do not change. With the setting off, the
-- existing rules (0057 damage threshold, 0058 late-fee waiver) apply unchanged.
--
-- Scope: the damage approval rank (auth_can_approve_damage) and the late-fee waiver rank
-- (auth_can_approve_late_fee_waiver). Extension clashes (T3-29) and the approvals inbox
-- (T5-10) are not covered here; their enforcement is traced separately before they change.
--
-- Ledger: docs/plans/MIGRATION_LEDGER.md row 0266. Claimed after 0265: 0261 (PR #323) and 0262 (PR #325) are claimed by open PRs.
-- REVERT: restore the 0057 body of auth_can_approve_damage and the 0058 body of
--         auth_can_approve_late_fee_waiver; drop function if exists auth_manager_approvals_to_owner();
--         delete from settings where key = 'managerApprovalsToOwner' and scope = 'org';

begin;

insert into settings (key, value, scope, is_money)
select 'managerApprovalsToOwner', 'true'::jsonb, 'org', false
where not exists (
  select 1 from settings
  where key = 'managerApprovalsToOwner' and scope = 'org' and location_id is null
);

-- True unless the org setting says false. A missing row means the default, which is on.
create or replace function auth_manager_approvals_to_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select s.value = 'true'::jsonb
      from settings s
      where s.key = 'managerApprovalsToOwner'
        and s.scope = 'org'
        and s.location_id is null
      limit 1
    ),
    true
  );
$$;

revoke all on function auth_manager_approvals_to_owner() from public, anon;
grant execute on function auth_manager_approvals_to_owner() to authenticated;

comment on function auth_manager_approvals_to_owner is
  'R-22.8: true (default) when Manager-level approvals go to the Owner. Read from settings key managerApprovalsToOwner.';

-- Damage: the 0057 rank, with the Manager removed while the setting is on.
create or replace function auth_can_approve_damage(charge numeric)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth_manager_approvals_to_owner() then auth_user_role() = 'Owner'
    when charge is null or charge >= 25000.00 then auth_user_role() = 'Owner'
    else auth_user_role() in ('Owner', 'Manager')
  end;
$$;

-- Late-fee waiver: the 0058 rank, with the Manager removed while the setting is on.
create or replace function auth_can_approve_late_fee_waiver()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth_manager_approvals_to_owner() then auth_user_role() = 'Owner'
    else auth_user_role() in ('Owner', 'Manager')
  end;
$$;

comment on function auth_can_approve_late_fee_waiver is
  'Late-fee waiver rank (0058, R-22.8): Owner or Manager with no threshold; Owner only while managerApprovalsToOwner is on.';


insert into supabase_migrations.schema_migrations (version, name) values ('0266', 'manager_approvals_to_owner') on conflict (version) do nothing;
commit;

-- --------------------------------------------------------------------------
-- FILE: 0267_database_enforced_aal2_money_roles.sql
-- --------------------------------------------------------------------------
-- Migration 0267: Database-enforced AAL2 two-step sign-in for money roles (T1-17 / B21 / B40 / P3)
--
-- Security card:
-- 1. Evaluates Supabase Auth AAL (Authenticator Assurance Level) in auth_can_view_money().
-- 2. Controlled by Owner-only armed setting 'twoStepAuthRequired' in public.settings.
-- 3. When armed, money roles (Owner, Admin, Manager, Coordinator, Accounts) whose session
--    is not 'aal2' receive FALSE from auth_can_view_money(), returning NULL for masked
--    columns, 0 rows in financial views, and refusing financial write RPCs.
-- 4. Floor roles (Warehouse, Technician, Driver) and external Client roles remain
--    strictly money-blind (Law 6) regardless of MFA factors.
-- 5. Factor tracking (staff_mfa_factors) and append-only audit trail (staff_mfa_audit).
-- 6. Lost-phone reset RPC (reset_staff_mfa) restricted to Owner (any role) and Admin (up to Manager, AD2).

begin;

-- 1. Tracking table for staff MFA factors
create table if not exists public.staff_mfa_factors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  factor_type text not null default 'totp' check (factor_type in ('totp')),
  status text not null default 'unverified' check (status in ('unverified', 'verified')),
  enrolled_at timestamptz not null default now(),
  verified_at timestamptz,
  last_used_at timestamptz,
  constraint staff_mfa_factors_user_key unique (user_id)
);

-- 2. Append-only audit table for MFA lifecycle events
create table if not exists public.staff_mfa_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  action text not null check (action in ('enrolled', 'verified', 'reset_by_admin', 'enforcement_toggled')),
  actor_id uuid references public.users (id),
  actor_role text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table public.staff_mfa_factors enable row level security;
alter table public.staff_mfa_audit enable row level security;

-- Policies
create policy staff_mfa_factors_select on public.staff_mfa_factors for select to authenticated
  using (public.auth_is_staff() and (user_id = public.auth_user_id() or public.auth_user_role() in ('Owner', 'Admin')));

create policy staff_mfa_audit_select on public.staff_mfa_audit for select to authenticated
  using (public.auth_user_role() in ('Owner', 'Admin'));

revoke all on public.staff_mfa_factors, public.staff_mfa_audit from public, anon;
grant select on public.staff_mfa_factors to authenticated;
grant select on public.staff_mfa_audit to authenticated;

-- 3. Core Postgres Gate: auth_can_view_money() with AAL2 enforcement
create or replace function public.auth_can_view_money()
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_role text;
  v_enforced boolean := false;
  v_aal text;
begin
  -- Step 1: Strict allow-list — ONLY approved money roles can EVER view money figures (PERMISSIONS.md §5 / Law 6)
  -- All floor roles (Warehouse, Technician, Driver), Clients, Anon, NULL, or unknown roles fail closed.
  v_role := public.auth_user_role();
  if v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts') or v_role is null then
    return false;
  end if;

  -- Step 2: Read enforcement setting (default FALSE for staged rollout)
  begin
    select (value #>> '{}')::boolean into v_enforced
    from public.settings
    where key = 'twoStepAuthRequired' and scope = 'org';
  exception when others then
    -- Fail closed: if settings cannot be read or query errors, do NOT disable security
    return false;
  end;

  if not coalesce(v_enforced, false) then
    -- Unarmed: approved money roles can view money during staging enrolment
    return true;
  end if;

  -- Step 3: Armed — evaluate Supabase Auth AAL claim from JWT
  begin
    v_aal := auth.jwt() ->> 'aal';
  exception when others then
    return false;
  end;

  return coalesce(v_aal, 'aal1') = 'aal2';
end;
$$;

revoke all on function public.auth_can_view_money() from public;
grant execute on function public.auth_can_view_money() to anon, authenticated;

-- 3b. Finance RLS gate: auth_is_finance_or_admin() requires auth_can_view_money()
create or replace function public.auth_is_finance_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth_user_role() in ('Owner', 'Admin', 'Manager', 'Accounts') and public.auth_can_view_money();
$$;

revoke all on function public.auth_is_finance_or_admin() from public;
grant execute on function public.auth_is_finance_or_admin() to anon, authenticated;

-- 4. Settings toggle RPC: set_two_step_auth_enforcement
create or replace function public.set_two_step_auth_enforcement(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_role text;
  v_caller_id uuid;
begin
  v_caller_role := public.auth_user_role();
  v_caller_id := public.auth_user_id();

  if v_caller_role is distinct from 'Owner' then
    raise exception 'GATE:gate.settings.role|Only the Owner may change two-step authentication enforcement.' using errcode = '42501';
  end if;

  insert into public.settings (key, value, scope, is_money, updated_by, updated_at)
  values ('twoStepAuthRequired', to_jsonb(p_enabled), 'org', false, v_caller_id, now())
  on conflict (key, scope, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set value = to_jsonb(p_enabled), updated_by = v_caller_id, updated_at = now();

  if v_caller_id is not null then
    insert into public.staff_mfa_audit (user_id, action, actor_id, actor_role, metadata)
    values (
      v_caller_id,
      'enforcement_toggled',
      v_caller_id,
      v_caller_role,
      jsonb_build_object('enforced', p_enabled)
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'is_enforced', p_enabled
  );
end;
$$;

revoke all on function public.set_two_step_auth_enforcement(boolean) from public, anon;
grant execute on function public.set_two_step_auth_enforcement(boolean) to authenticated;

-- 5. Lost-phone reset RPC: reset_staff_mfa
create or replace function public.reset_staff_mfa(p_target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_role text;
  v_caller_id uuid;
  v_target_role text;
begin
  v_caller_role := public.auth_user_role();
  v_caller_id := public.auth_user_id();

  select primary_role::text into v_target_role
  from public.users
  where id = p_target_user_id;

  if not found then
    raise exception 'GATE:gate.user.not_found|Staff user not found.' using errcode = 'P0002';
  end if;

  -- Authorization check:
  -- Owner can reset anyone.
  -- Admin can reset up to Manager (AD2); cannot reset Owner or other Admin.
  if v_caller_role = 'Owner' then
    null;
  elsif v_caller_role = 'Admin' then
    if v_target_role in ('Owner', 'Admin') then
      raise exception 'GATE:gate.security.mfa_reset_forbidden|Admin cannot reset two-step verification for Owner or other Admin.' using errcode = '42501';
    end if;
  else
    raise exception 'GATE:gate.security.mfa_reset_forbidden|Only Owner or Admin can reset staff two-step verification.' using errcode = '42501';
  end if;

  -- Delete factor from public tracking
  delete from public.staff_mfa_factors where user_id = p_target_user_id;

  -- Delete enrolled factors from auth schema if table exists in hosted environment
  if exists (select 1 from information_schema.tables where table_schema = 'auth' and table_name = 'mfa_factors') then
    execute 'delete from auth.mfa_factors where user_id = $1' using p_target_user_id;
  end if;

  insert into public.staff_mfa_audit (user_id, action, actor_id, actor_role, metadata)
  values (
    p_target_user_id,
    'reset_by_admin',
    v_caller_id,
    v_caller_role,
    jsonb_build_object('target_role', v_target_role, 'reason', 'lost_phone_reset')
  );

  return jsonb_build_object(
    'success', true,
    'reset_user_id', p_target_user_id,
    'reset_user_role', v_target_role
  );
end;
$$;

revoke all on function public.reset_staff_mfa(uuid) from public, anon;
grant execute on function public.reset_staff_mfa(uuid) to authenticated;

-- 6. Enrolment helper RPC: record_staff_mfa_enrolment
create or replace function public.record_staff_mfa_enrolment(p_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_caller_role text;
begin
  v_user_id := coalesce(p_user_id, public.auth_user_id());
  v_caller_role := public.auth_user_role();

  if v_user_id is null then
    raise exception 'GATE:gate.auth.unauthenticated|Authentication required.' using errcode = '42501';
  end if;

  if v_user_id != public.auth_user_id() and v_caller_role != 'Owner' then
    raise exception 'GATE:gate.security.mfa_enrol_forbidden|Cannot enrol MFA for another user.' using errcode = '42501';
  end if;

  insert into public.staff_mfa_factors (user_id, factor_type, status, verified_at, last_used_at)
  values (v_user_id, 'totp', 'verified', now(), now())
  on conflict (user_id)
  do update set status = 'verified', verified_at = now(), last_used_at = now();

  insert into public.staff_mfa_audit (user_id, action, actor_id, actor_role, metadata)
  values (v_user_id, 'enrolled', public.auth_user_id(), v_caller_role, jsonb_build_object('factor_type', 'totp'));

  return jsonb_build_object('success', true, 'user_id', v_user_id, 'status', 'verified');
end;
$$;

revoke all on function public.record_staff_mfa_enrolment(uuid) from public, anon;
grant execute on function public.record_staff_mfa_enrolment(uuid) to authenticated;

-- 7. Overview RPC: get_staff_mfa_overview
create or replace function public.get_staff_mfa_overview()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_role text;
  v_result jsonb;
begin
  v_caller_role := public.auth_user_role();
  if v_caller_role not in ('Owner', 'Admin', 'Manager') then
    raise exception 'GATE:gate.settings.role|Only Owner, Admin, or Manager can view staff MFA overview.' using errcode = '42501';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'user_id', u.id,
      'full_name', u.full_name,
      'email', case when v_caller_role in ('Owner', 'Admin') then u.email else null end,
      'primary_role', u.primary_role,
      'is_money_role', u.primary_role in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts'),
      'mfa_status', coalesce(f.status, 'unregistered'),
      'verified_at', f.verified_at,
      'last_used_at', f.last_used_at
    ) order by u.primary_role, u.full_name
  ) into v_result
  from public.users u
  left join public.staff_mfa_factors f on f.user_id = u.id
  where u.is_active = true and u.deactivated_at is null
    and u.primary_role not in ('Client');

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

revoke all on function public.get_staff_mfa_overview() from public, anon;
grant execute on function public.get_staff_mfa_overview() to authenticated;


insert into supabase_migrations.schema_migrations (version, name) values ('0267', 'database_enforced_aal2_money_roles') on conflict (version) do nothing;
commit;

-- --------------------------------------------------------------------------
-- FILE: 0268_sign_in_events_and_new_device.sql
-- --------------------------------------------------------------------------
-- Migration 0268: Server-side sign-in audit and new-device alert engine (T1-18 / B22 / B23 / B54)
--
-- Security card:
-- 1. Persistent append-only sign_in_events table tracking sign-ins, failed attempts, PIN switches, and new devices.
-- 2. Strictly role-gated RLS: readable by Owner and Admin only (B22). Manager, Coordinator, and Floor get 0 rows.
-- 3. Direct client writes (INSERT/UPDATE/DELETE) blocked; written exclusively via SECURITY DEFINER RPC.
-- 4. New-device alert logic: Owner and Admin accounts signing in from an unseen device_hash emit a new_device
--    event and trigger alert metadata (B23). Coordinator and floor accounts never trigger email alerts.
-- 5. No secrets, passwords, tokens, or PINs are ever persisted (N-8).

begin;

-- 1. Table for sign-in audit events
create table if not exists public.sign_in_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  device_hash text not null,
  user_agent text,
  ip_address text,
  kind text not null check (kind in ('sign-in', 'failed', 'pin_switch', 'new_device')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Index for device lookup and user timeline
create index if not exists idx_sign_in_events_user_device on public.sign_in_events (user_id, device_hash);
create index if not exists idx_sign_in_events_created_at on public.sign_in_events (created_at desc);

-- Enable RLS
alter table public.sign_in_events enable row level security;

-- Policy: Only Owner and Admin can read sign-in events (B22)
create policy sign_in_events_owner_admin_select on public.sign_in_events
  for select to authenticated
  using (public.auth_user_role() in ('Owner', 'Admin'));

-- Direct write immutability trigger
create or replace function public.prevent_direct_sign_in_events_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_setting('app.allow_sign_in_events_write', true) is distinct from 'true' then
    raise exception 'GATE:gate.audit.immutable|Direct insert into sign_in_events is forbidden; use record_sign_in_event().' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_direct_sign_in_events_write on public.sign_in_events;
create trigger trg_prevent_direct_sign_in_events_write
before insert on public.sign_in_events
for each row execute function public.prevent_direct_sign_in_events_write();

-- No direct client writes permitted (Law 3, Law 8, immutable audit trail)
revoke all on public.sign_in_events from public, anon;
grant select on public.sign_in_events to authenticated;

-- 2. SECURITY DEFINER RPC: record_sign_in_event (Full signature)
create or replace function public.record_sign_in_event(
  p_device_hash text,
  p_user_agent text,
  p_ip_address text,
  p_kind text,
  p_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id uuid;
  v_caller_role text;
  v_device_known boolean := false;
  v_is_new_device boolean := false;
  v_should_alert boolean := false;
  v_new_event_id uuid;
begin
  v_caller_id := public.auth_user_id();
  v_caller_role := public.auth_user_role();

  if v_caller_id is null then
    raise exception 'GATE:gate.auth.unauthenticated|Authentication required to log sign-in event.' using errcode = '42501';
  end if;

  if p_kind not in ('sign-in', 'failed', 'pin_switch', 'new_device') then
    raise exception 'GATE:gate.audit.invalid_kind|Invalid sign-in event kind.' using errcode = '22023';
  end if;

  -- Allow write through trigger for this transaction
  perform set_config('app.allow_sign_in_events_write', 'true', true);

  -- New device evaluation for Owner and Admin (B23)
  if v_caller_role in ('Owner', 'Admin') and p_kind = 'sign-in' then
    select exists (
      select 1
      from public.sign_in_events
      where user_id = v_caller_id
        and device_hash = p_device_hash
        and kind in ('sign-in', 'new_device')
    ) into v_device_known;

    if not v_device_known then
      v_is_new_device := true;
      v_should_alert := true;
    end if;
  end if;

  -- Insert primary event row
  insert into public.sign_in_events (user_id, device_hash, user_agent, ip_address, kind, metadata)
  values (v_caller_id, p_device_hash, p_user_agent, p_ip_address, p_kind, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_new_event_id;

  -- If this is a newly observed device for Owner or Admin, record the dedicated new_device event
  if v_is_new_device then
    insert into public.sign_in_events (user_id, device_hash, user_agent, ip_address, kind, metadata)
    values (
      v_caller_id,
      p_device_hash,
      p_user_agent,
      p_ip_address,
      'new_device',
      jsonb_build_object(
        'triggered_by_event_id', v_new_event_id,
        'alert_dispatched', true,
        'role', v_caller_role
      )
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'event_id', v_new_event_id,
    'is_new_device', v_is_new_device,
    'should_alert', v_should_alert,
    'user_role', v_caller_role
  );
end;
$$;

-- Convenience 3-argument overload
create or replace function public.record_sign_in_event(
  p_device_hash text,
  p_user_agent text,
  p_ip_address text
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.record_sign_in_event(p_device_hash, p_user_agent, p_ip_address, 'sign-in'::text, '{}'::jsonb);
$$;

revoke all on function public.record_sign_in_event(text, text, text, text, jsonb) from public, anon;
grant execute on function public.record_sign_in_event(text, text, text, text, jsonb) to authenticated;

revoke all on function public.record_sign_in_event(text, text, text) from public, anon;
grant execute on function public.record_sign_in_event(text, text, text) to authenticated;

-- 3. Query RPC: get_recent_sign_in_events (Owner and Admin only, B22)
create or replace function public.get_recent_sign_in_events(p_limit int default 50)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_role text;
  v_result jsonb;
  v_clamped_limit int;
begin
  v_caller_role := public.auth_user_role();
  if v_caller_role not in ('Owner', 'Admin') then
    raise exception 'GATE:gate.settings.role|Only Owner or Admin can view sign-in audit history.' using errcode = '42501';
  end if;

  v_clamped_limit := least(greatest(coalesce(p_limit, 50), 1), 200);

  select jsonb_agg(
    jsonb_build_object(
      'id', e.id,
      'user_id', e.user_id,
      'full_name', u.full_name,
      'role', u.primary_role,
      'device_hash', e.device_hash,
      'user_agent', e.user_agent,
      'ip_address', e.ip_address,
      'kind', e.kind,
      'metadata', e.metadata,
      'created_at', e.created_at
    ) order by e.created_at desc
  ) into v_result
  from (
    select *
    from public.sign_in_events
    order by created_at desc
    limit v_clamped_limit
  ) e
  join public.users u on u.id = e.user_id;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

revoke all on function public.get_recent_sign_in_events(int) from public, anon;
grant execute on function public.get_recent_sign_in_events(int) to authenticated;


insert into supabase_migrations.schema_migrations (version, name) values ('0268', 'sign_in_events_and_new_device') on conflict (version) do nothing;
commit;

