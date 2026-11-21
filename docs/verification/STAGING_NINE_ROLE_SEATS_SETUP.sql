-- =============================================================================
-- STAGING_NINE_ROLE_SEATS_SETUP.sql
-- Idempotent creation of 9 test role accounts and read-only verification fixtures
-- Target Project: klhmsrunqrdxjudyhnkm (babin-staging)
-- Card: T1-05 (Nine role seats + read-only role harness)
-- Rulings: D27 (Boudha site grant), Law 6 (money blindness), Law 8 (client_uuid)
-- Identifier formats:
--   - products:   ^EQ[0-9]{6}$  (e.g. EQ000999)
--   - bookings:   ^[0-9]+$      (digits only, migration 0085, e.g. 99001)
--   - clients:    ^C-[0-9]+$    (migration 0055, e.g. C-9901)
--   - stages:     Quote | Booked | Packed | On Rent | Returned | Closed
--   - line types: Equipment | Bundle | Accessory | Service | Sub-rental | Manual item
-- =============================================================================

begin;

-- Allow fixture insertion into booking_lines with rate figures and access to extensions
set local "app.in_create_booking" = 'on';
set local search_path = public, extensions;

do $$
declare
  v_branch_id uuid;
  v_wh_id uuid;
  v_cat_id uuid;
  v_client_id uuid := 'e0000000-0000-4000-8000-000000000001';
  v_other_client_id uuid := 'e0000000-0000-4000-8000-000000000002';
  v_product_id uuid := '10000000-0000-4000-8000-000000000001';
  v_booking_id uuid;
  v_line_id uuid;
  v_user_id uuid;
  v_role text;
begin
  -- Ensure app.in_create_booking is on for this session
  perform set_config('app.in_create_booking', 'on', true);

  -- 1. Find or insert primary branch (Boudha HQ)
  select id into v_branch_id from branches order by created_at limit 1;
  if v_branch_id is null then
    v_branch_id := '00000000-0000-0000-0000-000000000001';
    insert into branches (id, client_uuid, branch_code, name, address, phone, email, pan_vat_no, is_headquarters, is_active)
    values (v_branch_id, gen_random_uuid(), 'BR-KTM-01', 'Babin Rentals Boudha', 'Boudha, Kathmandu', '+977-1-4770000', 'hq@babinrentals.com', '623587106', true, true)
    on conflict (branch_code) do update set name = 'Babin Rentals Boudha';
  end if;

  -- 2. Find or insert primary warehouse
  select id into v_wh_id from warehouses where branch_id = v_branch_id limit 1;
  if v_wh_id is null then
    v_wh_id := '00000000-0000-0000-0000-000000000011';
    insert into warehouses (id, client_uuid, warehouse_code, branch_id, name, address, status, is_primary, is_active)
    values (v_wh_id, gen_random_uuid(), 'WH-KTM-MAIN', v_branch_id, 'Boudha Main Vault', 'Boudha, Kathmandu', 'Active', true, true)
    on conflict (warehouse_code) do nothing;
  end if;

  -- 3. Find or insert inventory category
  select id into v_cat_id from inventory_categories limit 1;
  if v_cat_id is null then
    v_cat_id := gen_random_uuid();
    insert into inventory_categories (id, client_uuid, code, name, is_active)
    values (v_cat_id, gen_random_uuid(), 'CAT-CAM', 'Cinema Cameras', true);
  end if;

  -- 4. Ensure test Product exists (asset_code format: ^EQ[0-9]{6}$)
  insert into products (id, client_uuid, asset_code, name, category_id, brand, tracking_mode, total_quantity, daily_rate, created_by)
  values (v_product_id, gen_random_uuid(), 'EQ000999', 'Staging Sony FX6 Cinema Camera', v_cat_id, 'Sony', 'Serialised', 5, 500000, null)
  on conflict (id) do update set daily_rate = 500000;

  -- 5. Ensure primary and secondary test Clients exist
  insert into clients (id, client_uuid, client_code, name, phone, email)
  values (v_client_id, gen_random_uuid(), 'C-9901', 'Staging Production Client Pvt Ltd', '+9779800000001', 'staging-client@babinrentals.test')
  on conflict (id) do nothing;

  insert into clients (id, client_uuid, client_code, name, phone, email)
  values (v_other_client_id, gen_random_uuid(), 'C-9902', 'Other Production House Pvt Ltd', '+9779800000002', 'other-client@babinrentals.test')
  on conflict (id) do nothing;

  -- ---------------------------------------------------------------------------
  -- Role: Owner
  -- ---------------------------------------------------------------------------
  v_user_id := 'a0000000-0000-4000-8000-000000000001';
  v_booking_id := 'b0000000-0000-4000-8000-000000000001';
  v_line_id := 'c0000000-0000-4000-8000-000000000001';
  v_role := 'Owner';

  -- A. Create or update in auth.users
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (
    v_user_id,
    'staging-owner@babinrentals.test',
    extensions.crypt('StagingPass2026!', extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object('full_name', 'Staging Owner', 'role', v_role),
    now(),
    now()
  )
  on conflict (id) do update set email = 'staging-owner@babinrentals.test', email_confirmed_at = now();

  -- B. Create in public.users
  insert into public.users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active)
  values (v_user_id, gen_random_uuid(), 'EMP-STG-001', 'staging-owner@babinrentals.test', 'Staging Owner', '+9779810000001', v_role::system_role, v_branch_id, true)
  on conflict (id) do update set primary_role = v_role::system_role, branch_id = v_branch_id, is_active = true;

  -- C. Automatic Boudha site grant (Ruling D27)
  insert into operations_grants (client_uuid, user_id, branch_id, operation, granted_by, granted_at)
  select gen_random_uuid(), v_user_id, v_branch_id, op, v_user_id, now()
  from unnest(array['pack', 'handover', 'return', 'reset']) as op
  where not exists (
    select 1 from operations_grants
    where user_id = v_user_id and branch_id = v_branch_id and operation = op and revoked_at is null
  );

  -- D. Positive booking fixture for Owner (canonical stage: Booked)
  insert into bookings (id, client_uuid, booking_no, client_id, branch_id, pickup_at, return_at, delivery_type, stage, created_by, updated_by)
  values (v_booking_id, gen_random_uuid(), '99001', v_client_id, v_branch_id, now() + interval '1 day', now() + interval '3 days', 'Client Pickup', 'Booked', v_user_id, v_user_id)
  on conflict (id) do update set stage = 'Booked';

  -- E. Positive line fixture for Owner (canonical line_type: Equipment)
  insert into booking_lines (id, client_uuid, booking_id, line_type, product_id, qty, days, rate, created_by)
  values (v_line_id, gen_random_uuid(), v_booking_id, 'Equipment', v_product_id, 1, 2, 500000, v_user_id)
  on conflict (id) do nothing;

  -- ---------------------------------------------------------------------------
  -- Role: Admin
  -- ---------------------------------------------------------------------------
  v_user_id := 'a0000000-0000-4000-8000-000000000002';
  v_booking_id := 'b0000000-0000-4000-8000-000000000002';
  v_line_id := 'c0000000-0000-4000-8000-000000000002';
  v_role := 'Admin';

  -- A. Create or update in auth.users
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (
    v_user_id,
    'staging-admin@babinrentals.test',
    extensions.crypt('StagingPass2026!', extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object('full_name', 'Staging Admin', 'role', v_role),
    now(),
    now()
  )
  on conflict (id) do update set email = 'staging-admin@babinrentals.test', email_confirmed_at = now();

  -- B. Create in public.users
  insert into public.users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active)
  values (v_user_id, gen_random_uuid(), 'EMP-STG-002', 'staging-admin@babinrentals.test', 'Staging Admin', '+9779810000002', v_role::system_role, v_branch_id, true)
  on conflict (id) do update set primary_role = v_role::system_role, branch_id = v_branch_id, is_active = true;

  -- C. Automatic Boudha site grant (Ruling D27)
  insert into operations_grants (client_uuid, user_id, branch_id, operation, granted_by, granted_at)
  select gen_random_uuid(), v_user_id, v_branch_id, op, v_user_id, now()
  from unnest(array['pack', 'handover', 'return', 'reset']) as op
  where not exists (
    select 1 from operations_grants
    where user_id = v_user_id and branch_id = v_branch_id and operation = op and revoked_at is null
  );

  -- D. Positive booking fixture for Admin (canonical stage: Booked)
  insert into bookings (id, client_uuid, booking_no, client_id, branch_id, pickup_at, return_at, delivery_type, stage, created_by, updated_by)
  values (v_booking_id, gen_random_uuid(), '99002', v_client_id, v_branch_id, now() + interval '1 day', now() + interval '3 days', 'Client Pickup', 'Booked', v_user_id, v_user_id)
  on conflict (id) do update set stage = 'Booked';

  -- E. Positive line fixture for Admin (canonical line_type: Equipment)
  insert into booking_lines (id, client_uuid, booking_id, line_type, product_id, qty, days, rate, created_by)
  values (v_line_id, gen_random_uuid(), v_booking_id, 'Equipment', v_product_id, 1, 2, 500000, v_user_id)
  on conflict (id) do nothing;

  -- ---------------------------------------------------------------------------
  -- Role: Manager
  -- ---------------------------------------------------------------------------
  v_user_id := 'a0000000-0000-4000-8000-000000000003';
  v_booking_id := 'b0000000-0000-4000-8000-000000000003';
  v_line_id := 'c0000000-0000-4000-8000-000000000003';
  v_role := 'Manager';

  -- A. Create or update in auth.users
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (
    v_user_id,
    'staging-manager@babinrentals.test',
    extensions.crypt('StagingPass2026!', extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object('full_name', 'Staging Manager', 'role', v_role),
    now(),
    now()
  )
  on conflict (id) do update set email = 'staging-manager@babinrentals.test', email_confirmed_at = now();

  -- B. Create in public.users
  insert into public.users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active)
  values (v_user_id, gen_random_uuid(), 'EMP-STG-003', 'staging-manager@babinrentals.test', 'Staging Manager', '+9779810000003', v_role::system_role, v_branch_id, true)
  on conflict (id) do update set primary_role = v_role::system_role, branch_id = v_branch_id, is_active = true;

  -- C. Automatic Boudha site grant (Ruling D27)
  insert into operations_grants (client_uuid, user_id, branch_id, operation, granted_by, granted_at)
  select gen_random_uuid(), v_user_id, v_branch_id, op, v_user_id, now()
  from unnest(array['pack', 'handover', 'return', 'reset']) as op
  where not exists (
    select 1 from operations_grants
    where user_id = v_user_id and branch_id = v_branch_id and operation = op and revoked_at is null
  );

  -- D. Positive booking fixture for Manager (canonical stage: Booked)
  insert into bookings (id, client_uuid, booking_no, client_id, branch_id, pickup_at, return_at, delivery_type, stage, created_by, updated_by)
  values (v_booking_id, gen_random_uuid(), '99003', v_client_id, v_branch_id, now() + interval '1 day', now() + interval '3 days', 'Client Pickup', 'Booked', v_user_id, v_user_id)
  on conflict (id) do update set stage = 'Booked';

  -- E. Positive line fixture for Manager (canonical line_type: Equipment)
  insert into booking_lines (id, client_uuid, booking_id, line_type, product_id, qty, days, rate, created_by)
  values (v_line_id, gen_random_uuid(), v_booking_id, 'Equipment', v_product_id, 1, 2, 500000, v_user_id)
  on conflict (id) do nothing;

  -- ---------------------------------------------------------------------------
  -- Role: Coordinator
  -- ---------------------------------------------------------------------------
  v_user_id := 'a0000000-0000-4000-8000-000000000004';
  v_booking_id := 'b0000000-0000-4000-8000-000000000004';
  v_line_id := 'c0000000-0000-4000-8000-000000000004';
  v_role := 'Coordinator';

  -- A. Create or update in auth.users
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (
    v_user_id,
    'staging-coordinator@babinrentals.test',
    extensions.crypt('StagingPass2026!', extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object('full_name', 'Staging Coordinator', 'role', v_role),
    now(),
    now()
  )
  on conflict (id) do update set email = 'staging-coordinator@babinrentals.test', email_confirmed_at = now();

  -- B. Create in public.users
  insert into public.users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active)
  values (v_user_id, gen_random_uuid(), 'EMP-STG-004', 'staging-coordinator@babinrentals.test', 'Staging Coordinator', '+9779810000004', v_role::system_role, v_branch_id, true)
  on conflict (id) do update set primary_role = v_role::system_role, branch_id = v_branch_id, is_active = true;

  -- C. Automatic Boudha site grant (Ruling D27)
  insert into operations_grants (client_uuid, user_id, branch_id, operation, granted_by, granted_at)
  select gen_random_uuid(), v_user_id, v_branch_id, op, v_user_id, now()
  from unnest(array['pack', 'handover', 'return', 'reset']) as op
  where not exists (
    select 1 from operations_grants
    where user_id = v_user_id and branch_id = v_branch_id and operation = op and revoked_at is null
  );

  -- D. Positive booking fixture for Coordinator (canonical stage: Booked)
  insert into bookings (id, client_uuid, booking_no, client_id, branch_id, pickup_at, return_at, delivery_type, stage, created_by, updated_by)
  values (v_booking_id, gen_random_uuid(), '99004', v_client_id, v_branch_id, now() + interval '1 day', now() + interval '3 days', 'Client Pickup', 'Booked', v_user_id, v_user_id)
  on conflict (id) do update set stage = 'Booked';

  -- E. Positive line fixture for Coordinator (canonical line_type: Equipment)
  insert into booking_lines (id, client_uuid, booking_id, line_type, product_id, qty, days, rate, created_by)
  values (v_line_id, gen_random_uuid(), v_booking_id, 'Equipment', v_product_id, 1, 2, 500000, v_user_id)
  on conflict (id) do nothing;

  -- ---------------------------------------------------------------------------
  -- Role: Warehouse
  -- ---------------------------------------------------------------------------
  v_user_id := 'a0000000-0000-4000-8000-000000000005';
  v_booking_id := 'b0000000-0000-4000-8000-000000000005';
  v_line_id := 'c0000000-0000-4000-8000-000000000005';
  v_role := 'Warehouse';

  -- A. Create or update in auth.users
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (
    v_user_id,
    'staging-warehouse@babinrentals.test',
    extensions.crypt('StagingPass2026!', extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object('full_name', 'Staging Warehouse', 'role', v_role),
    now(),
    now()
  )
  on conflict (id) do update set email = 'staging-warehouse@babinrentals.test', email_confirmed_at = now();

  -- B. Create in public.users
  insert into public.users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active)
  values (v_user_id, gen_random_uuid(), 'EMP-STG-005', 'staging-warehouse@babinrentals.test', 'Staging Warehouse', '+9779810000005', v_role::system_role, v_branch_id, true)
  on conflict (id) do update set primary_role = v_role::system_role, branch_id = v_branch_id, is_active = true;

  -- C. Automatic Boudha site grant (Ruling D27)
  insert into operations_grants (client_uuid, user_id, branch_id, operation, granted_by, granted_at)
  select gen_random_uuid(), v_user_id, v_branch_id, op, v_user_id, now()
  from unnest(array['pack', 'handover', 'return', 'reset']) as op
  where not exists (
    select 1 from operations_grants
    where user_id = v_user_id and branch_id = v_branch_id and operation = op and revoked_at is null
  );

  -- D. Positive booking fixture for Warehouse (canonical stage: Booked)
  insert into bookings (id, client_uuid, booking_no, client_id, branch_id, pickup_at, return_at, delivery_type, stage, created_by, updated_by)
  values (v_booking_id, gen_random_uuid(), '99005', v_client_id, v_branch_id, now() + interval '1 day', now() + interval '3 days', 'Client Pickup', 'Booked', v_user_id, v_user_id)
  on conflict (id) do update set stage = 'Booked';

  -- E. Positive line fixture for Warehouse (canonical line_type: Equipment)
  insert into booking_lines (id, client_uuid, booking_id, line_type, product_id, qty, days, rate, created_by)
  values (v_line_id, gen_random_uuid(), v_booking_id, 'Equipment', v_product_id, 1, 2, 500000, v_user_id)
  on conflict (id) do nothing;

  -- ---------------------------------------------------------------------------
  -- Role: Technician
  -- ---------------------------------------------------------------------------
  v_user_id := 'a0000000-0000-4000-8000-000000000006';
  v_booking_id := 'b0000000-0000-4000-8000-000000000006';
  v_line_id := 'c0000000-0000-4000-8000-000000000006';
  v_role := 'Technician';

  -- A. Create or update in auth.users
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (
    v_user_id,
    'staging-technician@babinrentals.test',
    extensions.crypt('StagingPass2026!', extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object('full_name', 'Staging Technician', 'role', v_role),
    now(),
    now()
  )
  on conflict (id) do update set email = 'staging-technician@babinrentals.test', email_confirmed_at = now();

  -- B. Create in public.users
  insert into public.users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active)
  values (v_user_id, gen_random_uuid(), 'EMP-STG-006', 'staging-technician@babinrentals.test', 'Staging Technician', '+9779810000006', v_role::system_role, v_branch_id, true)
  on conflict (id) do update set primary_role = v_role::system_role, branch_id = v_branch_id, is_active = true;

  -- C. Automatic Boudha site grant (Ruling D27)
  insert into operations_grants (client_uuid, user_id, branch_id, operation, granted_by, granted_at)
  select gen_random_uuid(), v_user_id, v_branch_id, op, v_user_id, now()
  from unnest(array['pack', 'handover', 'return', 'reset']) as op
  where not exists (
    select 1 from operations_grants
    where user_id = v_user_id and branch_id = v_branch_id and operation = op and revoked_at is null
  );

  -- D. Positive booking fixture for Technician (canonical stage: Booked)
  insert into bookings (id, client_uuid, booking_no, client_id, branch_id, pickup_at, return_at, delivery_type, stage, created_by, updated_by)
  values (v_booking_id, gen_random_uuid(), '99006', v_client_id, v_branch_id, now() + interval '1 day', now() + interval '3 days', 'Client Pickup', 'Booked', v_user_id, v_user_id)
  on conflict (id) do update set stage = 'Booked';

  -- E. Positive line fixture for Technician (canonical line_type: Equipment)
  insert into booking_lines (id, client_uuid, booking_id, line_type, product_id, qty, days, rate, created_by)
  values (v_line_id, gen_random_uuid(), v_booking_id, 'Equipment', v_product_id, 1, 2, 500000, v_user_id)
  on conflict (id) do nothing;

  -- ---------------------------------------------------------------------------
  -- Role: Accounts
  -- ---------------------------------------------------------------------------
  v_user_id := 'a0000000-0000-4000-8000-000000000007';
  v_booking_id := 'b0000000-0000-4000-8000-000000000007';
  v_line_id := 'c0000000-0000-4000-8000-000000000007';
  v_role := 'Accounts';

  -- A. Create or update in auth.users
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (
    v_user_id,
    'staging-accounts@babinrentals.test',
    extensions.crypt('StagingPass2026!', extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object('full_name', 'Staging Accounts', 'role', v_role),
    now(),
    now()
  )
  on conflict (id) do update set email = 'staging-accounts@babinrentals.test', email_confirmed_at = now();

  -- B. Create in public.users
  insert into public.users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active)
  values (v_user_id, gen_random_uuid(), 'EMP-STG-007', 'staging-accounts@babinrentals.test', 'Staging Accounts', '+9779810000007', v_role::system_role, v_branch_id, true)
  on conflict (id) do update set primary_role = v_role::system_role, branch_id = v_branch_id, is_active = true;

  -- C. Automatic Boudha site grant (Ruling D27)
  insert into operations_grants (client_uuid, user_id, branch_id, operation, granted_by, granted_at)
  select gen_random_uuid(), v_user_id, v_branch_id, op, v_user_id, now()
  from unnest(array['pack', 'handover', 'return', 'reset']) as op
  where not exists (
    select 1 from operations_grants
    where user_id = v_user_id and branch_id = v_branch_id and operation = op and revoked_at is null
  );

  -- D. Positive booking fixture for Accounts (canonical stage: Booked)
  insert into bookings (id, client_uuid, booking_no, client_id, branch_id, pickup_at, return_at, delivery_type, stage, created_by, updated_by)
  values (v_booking_id, gen_random_uuid(), '99007', v_client_id, v_branch_id, now() + interval '1 day', now() + interval '3 days', 'Client Pickup', 'Booked', v_user_id, v_user_id)
  on conflict (id) do update set stage = 'Booked';

  -- E. Positive line fixture for Accounts (canonical line_type: Equipment)
  insert into booking_lines (id, client_uuid, booking_id, line_type, product_id, qty, days, rate, created_by)
  values (v_line_id, gen_random_uuid(), v_booking_id, 'Equipment', v_product_id, 1, 2, 500000, v_user_id)
  on conflict (id) do nothing;

  -- ---------------------------------------------------------------------------
  -- Role: Driver
  -- ---------------------------------------------------------------------------
  v_user_id := 'a0000000-0000-4000-8000-000000000008';
  v_booking_id := 'b0000000-0000-4000-8000-000000000008';
  v_line_id := 'c0000000-0000-4000-8000-000000000008';
  v_role := 'Driver';

  -- A. Create or update in auth.users
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (
    v_user_id,
    'staging-driver@babinrentals.test',
    extensions.crypt('StagingPass2026!', extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object('full_name', 'Staging Driver', 'role', v_role),
    now(),
    now()
  )
  on conflict (id) do update set email = 'staging-driver@babinrentals.test', email_confirmed_at = now();

  -- B. Create in public.users
  insert into public.users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active)
  values (v_user_id, gen_random_uuid(), 'EMP-STG-008', 'staging-driver@babinrentals.test', 'Staging Driver', '+9779810000008', v_role::system_role, v_branch_id, true)
  on conflict (id) do update set primary_role = v_role::system_role, branch_id = v_branch_id, is_active = true;

  -- C. Automatic Boudha site grant (Ruling D27)
  insert into operations_grants (client_uuid, user_id, branch_id, operation, granted_by, granted_at)
  select gen_random_uuid(), v_user_id, v_branch_id, op, v_user_id, now()
  from unnest(array['pack', 'handover', 'return', 'reset']) as op
  where not exists (
    select 1 from operations_grants
    where user_id = v_user_id and branch_id = v_branch_id and operation = op and revoked_at is null
  );

  -- D. Positive booking fixture for Driver (canonical stage: Booked)
  insert into bookings (id, client_uuid, booking_no, client_id, branch_id, pickup_at, return_at, delivery_type, stage, created_by, updated_by)
  values (v_booking_id, gen_random_uuid(), '99008', v_client_id, v_branch_id, now() + interval '1 day', now() + interval '3 days', 'Client Pickup', 'Booked', v_user_id, v_user_id)
  on conflict (id) do update set stage = 'Booked';

  -- E. Positive line fixture for Driver (canonical line_type: Equipment)
  insert into booking_lines (id, client_uuid, booking_id, line_type, product_id, qty, days, rate, created_by)
  values (v_line_id, gen_random_uuid(), v_booking_id, 'Equipment', v_product_id, 1, 2, 500000, v_user_id)
  on conflict (id) do nothing;

  -- Driver delivery job to open booking visibility
  insert into delivery_jobs (client_uuid, booking_id, branch_id, leg, scheduled_at, status, assigned_driver_id, created_by, updated_by)
  values (gen_random_uuid(), v_booking_id, v_branch_id, 'Outbound', now() + interval '1 day', 'Scheduled', v_user_id, v_user_id, v_user_id)
  on conflict (booking_id, leg) do update set assigned_driver_id = v_user_id, status = 'Scheduled';

  -- Driver transport fixture
  insert into booking_transport (id, client_uuid, booking_id, vehicle, number_plate, driver_id, delivery_charge, fuel_charge, created_by)
  values (gen_random_uuid(), gen_random_uuid(), v_booking_id, 'Delivery Van', 'BA 1 PA 9999', v_user_id, 0, 0, v_user_id)
  on conflict (booking_id) do update set driver_id = v_user_id;

  -- ---------------------------------------------------------------------------
  -- Role: Client
  -- ---------------------------------------------------------------------------
  v_user_id := 'a0000000-0000-4000-8000-000000000009';
  v_booking_id := 'b0000000-0000-4000-8000-000000000009';
  v_line_id := 'c0000000-0000-4000-8000-000000000009';
  v_role := 'Client';

  -- A. Create or update in auth.users
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (
    v_user_id,
    'staging-client@babinrentals.test',
    extensions.crypt('StagingPass2026!', extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object('full_name', 'Staging Client', 'role', v_role),
    now(),
    now()
  )
  on conflict (id) do update set email = 'staging-client@babinrentals.test', email_confirmed_at = now();

  -- Link Client auth user to portal_users
  insert into portal_users (client_uuid, client_id, auth_user_id, email, status, self_registered_at)
  values (gen_random_uuid(), v_client_id, v_user_id, 'staging-client@babinrentals.test', 'Active', now())
  on conflict do nothing;

  -- D. Positive booking fixture for Client (canonical stage: Booked)
  insert into bookings (id, client_uuid, booking_no, client_id, branch_id, pickup_at, return_at, delivery_type, stage, created_by, updated_by)
  values (v_booking_id, gen_random_uuid(), '99009', v_client_id, v_branch_id, now() + interval '1 day', now() + interval '3 days', 'Client Pickup', 'Booked', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001')
  on conflict (id) do update set stage = 'Booked';

  -- E. Positive line fixture for Client (canonical line_type: Equipment)
  insert into booking_lines (id, client_uuid, booking_id, line_type, product_id, qty, days, rate, created_by)
  values (v_line_id, gen_random_uuid(), v_booking_id, 'Equipment', v_product_id, 1, 2, 500000, 'a0000000-0000-4000-8000-000000000001')
  on conflict (id) do nothing;

  -- Other client booking fixture for Client cross-tenant isolation negative assertion
  insert into bookings (id, client_uuid, booking_no, client_id, branch_id, pickup_at, return_at, delivery_type, stage, created_by, updated_by)
  values ('b0000000-0000-4000-8000-999999999999', gen_random_uuid(), '99099', v_other_client_id, v_branch_id, now() + interval '2 days', now() + interval '4 days', 'Client Pickup', 'Booked', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001')
  on conflict (id) do nothing;

end $$;

commit;
