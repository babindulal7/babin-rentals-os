-- =============================================================================
-- STAGING_SYNCHRONIZE_NINE_ROLES.sql
-- Idempotent creation & password synchronization for the 9 staging roles
-- Target: klhmsrunqrdxjudyhnkm (babin-staging)
-- Password for all 9 test accounts: StagingPass2026!
-- =============================================================================

begin;

-- 1. Upsert all 9 staging test seats into auth.users with active GoTrue password credentials
insert into auth.users (
  id, 
  email, 
  encrypted_password, 
  email_confirmed_at, 
  raw_app_meta_data, 
  raw_user_meta_data, 
  aud, 
  role, 
  is_sso_user, 
  created_at, 
  updated_at
)
values
  ('a0000000-0000-4000-8000-000000000001', 'staging-owner@babinrentals.test', extensions.crypt('StagingPass2026!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Staging Owner","role":"Owner"}'::jsonb, 'authenticated', 'authenticated', false, now(), now()),
  ('a0000000-0000-4000-8000-000000000002', 'staging-admin@babinrentals.test', extensions.crypt('StagingPass2026!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Staging Admin","role":"Admin"}'::jsonb, 'authenticated', 'authenticated', false, now(), now()),
  ('a0000000-0000-4000-8000-000000000003', 'staging-manager@babinrentals.test', extensions.crypt('StagingPass2026!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Staging Manager","role":"Manager"}'::jsonb, 'authenticated', 'authenticated', false, now(), now()),
  ('a0000000-0000-4000-8000-000000000004', 'staging-coordinator@babinrentals.test', extensions.crypt('StagingPass2026!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Staging Coordinator","role":"Coordinator"}'::jsonb, 'authenticated', 'authenticated', false, now(), now()),
  ('a0000000-0000-4000-8000-000000000005', 'staging-warehouse@babinrentals.test', extensions.crypt('StagingPass2026!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Staging Warehouse","role":"Warehouse"}'::jsonb, 'authenticated', 'authenticated', false, now(), now()),
  ('a0000000-0000-4000-8000-000000000006', 'staging-technician@babinrentals.test', extensions.crypt('StagingPass2026!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Staging Technician","role":"Technician"}'::jsonb, 'authenticated', 'authenticated', false, now(), now()),
  ('a0000000-0000-4000-8000-000000000007', 'staging-accounts@babinrentals.test', extensions.crypt('StagingPass2026!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Staging Accounts","role":"Accounts"}'::jsonb, 'authenticated', 'authenticated', false, now(), now()),
  ('a0000000-0000-4000-8000-000000000008', 'staging-driver@babinrentals.test', extensions.crypt('StagingPass2026!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Staging Driver","role":"Driver"}'::jsonb, 'authenticated', 'authenticated', false, now(), now()),
  ('a0000000-0000-4000-8000-000000000009', 'staging-client@babinrentals.test', extensions.crypt('StagingPass2026!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Staging Client","role":"Client"}'::jsonb, 'authenticated', 'authenticated', false, now(), now())
on conflict (id) do update set
  email = excluded.email,
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = coalesce(auth.users.email_confirmed_at, now()),
  raw_app_meta_data = excluded.raw_app_meta_data,
  raw_user_meta_data = excluded.raw_user_meta_data,
  aud = 'authenticated',
  role = 'authenticated',
  is_sso_user = false,
  updated_at = now();

-- 2. Upsert identities into auth.identities
delete from auth.identities 
where user_id between 'a0000000-0000-4000-8000-000000000001' and 'a0000000-0000-4000-8000-000000000009';

insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
select 
  id, 
  id, 
  jsonb_build_object('sub', id::text, 'email', email), 
  'email', 
  id::text, 
  now(), 
  now(), 
  now()
from auth.users
where id between 'a0000000-0000-4000-8000-000000000001' and 'a0000000-0000-4000-8000-000000000009';

-- 3. Sync staff seats into public.users with assigned system_role
do $$
declare
  v_branch_id uuid;
  v_wh_id uuid;
  v_cat_id uuid;
begin
  select id into v_branch_id from branches order by created_at limit 1;
  if v_branch_id is null then
    v_branch_id := '00000000-0000-0000-0000-000000000001';
  end if;

  select id into v_wh_id from warehouses where branch_id = v_branch_id limit 1;
  if v_wh_id is null then
    v_wh_id := '00000000-0000-0000-0000-000000000011';
    insert into warehouses (id, client_uuid, warehouse_code, branch_id, name, address, status, is_primary, is_active)
    values (v_wh_id, gen_random_uuid(), 'WH-KTM-MAIN', v_branch_id, 'Boudha Main Vault', 'Boudha, Kathmandu', 'Active', true, true)
    on conflict (warehouse_code) do nothing;
  end if;

  select id into v_cat_id from inventory_categories limit 1;
  if v_cat_id is null then
    v_cat_id := gen_random_uuid();
    insert into inventory_categories (id, client_uuid, code, name, is_active)
    values (v_cat_id, gen_random_uuid(), 'CAT-CAM', 'Cinema Cameras', true);
  end if;

  insert into public.users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active)
  values
    ('a0000000-0000-4000-8000-000000000001', gen_random_uuid(), 'EMP-STG-001', 'staging-owner@babinrentals.test', 'Staging Owner', '+9779810000001', 'Owner'::system_role, v_branch_id, true),
    ('a0000000-0000-4000-8000-000000000002', gen_random_uuid(), 'EMP-STG-002', 'staging-admin@babinrentals.test', 'Staging Admin', '+9779810000002', 'Admin'::system_role, v_branch_id, true),
    ('a0000000-0000-4000-8000-000000000003', gen_random_uuid(), 'EMP-STG-003', 'staging-manager@babinrentals.test', 'Staging Manager', '+9779810000003', 'Manager'::system_role, v_branch_id, true),
    ('a0000000-0000-4000-8000-000000000004', gen_random_uuid(), 'EMP-STG-004', 'staging-coordinator@babinrentals.test', 'Staging Coordinator', '+9779810000004', 'Coordinator'::system_role, v_branch_id, true),
    ('a0000000-0000-4000-8000-000000000005', gen_random_uuid(), 'EMP-STG-005', 'staging-warehouse@babinrentals.test', 'Staging Warehouse', '+9779810000005', 'Warehouse'::system_role, v_branch_id, true),
    ('a0000000-0000-4000-8000-000000000006', gen_random_uuid(), 'EMP-STG-006', 'staging-technician@babinrentals.test', 'Staging Technician', '+9779810000006', 'Technician'::system_role, v_branch_id, true),
    ('a0000000-0000-4000-8000-000000000007', gen_random_uuid(), 'EMP-STG-007', 'staging-accounts@babinrentals.test', 'Staging Accounts', '+9779810000007', 'Accounts'::system_role, v_branch_id, true),
    ('a0000000-0000-4000-8000-000000000008', gen_random_uuid(), 'EMP-STG-008', 'staging-driver@babinrentals.test', 'Staging Driver', '+9779810000008', 'Driver'::system_role, v_branch_id, true)
  on conflict (id) do update set
    primary_role = excluded.primary_role,
    branch_id = excluded.branch_id,
    email = excluded.email,
    full_name = excluded.full_name,
    is_active = true;

  -- 4. Grant floor operations to staff seats (Ruling D27)
  insert into operations_grants (client_uuid, user_id, branch_id, operation, granted_by, granted_at)
  select gen_random_uuid(), u.id, v_branch_id, op, u.id, now()
  from unnest(array[
    'a0000000-0000-4000-8000-000000000001'::uuid,
    'a0000000-0000-4000-8000-000000000004'::uuid,
    'a0000000-0000-4000-8000-000000000005'::uuid,
    'a0000000-0000-4000-8000-000000000006'::uuid
  ]) as u(id)
  cross join unnest(array['pack', 'handover', 'return', 'reset']) as op
  where not exists (
    select 1 from operations_grants
    where user_id = u.id and branch_id = v_branch_id and operation = op and revoked_at is null
  );

  -- 5. Seed test product and unit if missing
  insert into products (id, client_uuid, asset_code, name, category_id, brand, tracking_mode, total_quantity, daily_rate)
  values ('10000000-0000-4000-8000-000000000001', gen_random_uuid(), 'EQ000999', 'Staging Sony FX6 Cinema Camera', v_cat_id, 'Sony', 'Serialised', 5, 500000)
  on conflict (id) do update set daily_rate = 500000, category_id = v_cat_id;

  insert into product_units (id, client_uuid, product_id, serial_no, asset_tag, barcode, status, condition, branch_id, warehouse_id)
  values ('7c75ea7f-6e07-43ed-b8ec-a66efceecb88', gen_random_uuid(), '10000000-0000-4000-8000-000000000001', 'FX6-STAGING-001', 'FX6-STG-001', 'FX6-STG-001', 'In Stock'::inventory_state, 'Good'::unit_condition, v_branch_id, v_wh_id)
  on conflict (id) do update set status = 'In Stock'::inventory_state;

  -- 6. Seed test client if missing
  if not exists (select 1 from clients where id = 'e0000000-0000-4000-8000-000000000001' or client_code = 'C-9901' or phone = '+9779800000001') then
    insert into clients (id, client_uuid, client_code, name, phone, email)
    values ('e0000000-0000-4000-8000-000000000001', gen_random_uuid(), 'C-9901', 'Staging Production Client Pvt Ltd', '+9779800000001', 'staging-client@babinrentals.test');
  end if;
end $$;

commit;
