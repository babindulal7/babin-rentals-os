-- =============================================================================
-- Babin Rentals OS — Staging Stage 1: Synthetic Test Roles & Client A/B Seed
-- Target: babin-staging (klhmsrunqrdxjudyhnkm, Singapore)
-- Scope: Synthetic accounts only (0 PII, inert phone numbers, test domains)
-- Purpose: Establish test identities for Stage 2 hosted PostgREST & Storage checks
-- Paste into Supabase SQL Editor for klhmsrunqrdxjudyhnkm and run.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_branch_id uuid;
BEGIN
  -- 1. Resolve Primary Branch (Kathmandu Main)
  SELECT id INTO v_branch_id FROM branches ORDER BY is_headquarters DESC, created_at ASC LIMIT 1;
  IF v_branch_id IS NULL THEN
    v_branch_id := '00000000-0000-0000-0000-000000000001';
    INSERT INTO branches (id, client_uuid, branch_code, name, address, phone, email, is_headquarters, is_active)
    VALUES (v_branch_id, gen_random_uuid(), 'BR-KTM-01', 'Kathmandu Main HQ', 'Anamnagar, Kathmandu', '+977-1-0000000', 'staging-hq@example.invalid', true, true)
    ON CONFLICT (branch_code) DO NOTHING;
  END IF;

  -- 2. Seed Synthetic Clients A and B in clients table
  INSERT INTO clients (id, client_uuid, client_code, name, email, phone, type_parent)
  VALUES
    ('c0000000-0000-4000-8000-000000000001', gen_random_uuid(), 'C-9901', 'Synthetic Client Alpha', 'client-a@babinrentals.test', '+9779800000009', 'Individual'),
    ('c0000000-0000-4000-8000-000000000002', gen_random_uuid(), 'C-9902', 'Synthetic Client Beta', 'client-b@babinrentals.test', '+9779800000099', 'Individual')
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, phone = EXCLUDED.phone;

  -- 3. Seed Auth and Public Users for All 9 Roles + Client B
  -- Role: Owner
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at, created_at, updated_at)
  VALUES ('a0000000-0000-4000-8000-000000000001', 'owner@babinrentals.test', '{"full_name":"Test Owner"}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), now())
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  INSERT INTO users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
  VALUES ('a0000000-0000-4000-8000-000000000001', gen_random_uuid(), 'EMP-STG-OWNER', 'owner@babinrentals.test', 'Test Owner', '+977-9800000000', 'Owner', v_branch_id, true, 'a0000000-0000-4000-8000-000000000001')
  ON CONFLICT (id) DO UPDATE SET primary_role = 'Owner', email = 'owner@babinrentals.test', is_active = true;

  -- Role: Admin
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at, created_at, updated_at)
  VALUES ('a0000000-0000-4000-8000-000000000002', 'admin@babinrentals.test', '{"full_name":"Test Admin"}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), now())
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  INSERT INTO users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
  VALUES ('a0000000-0000-4000-8000-000000000002', gen_random_uuid(), 'EMP-STG-ADMIN', 'admin@babinrentals.test', 'Test Admin', '+977-9800000000', 'Admin', v_branch_id, true, 'a0000000-0000-4000-8000-000000000001')
  ON CONFLICT (id) DO UPDATE SET primary_role = 'Admin', email = 'admin@babinrentals.test', is_active = true;

  -- Role: Manager
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at, created_at, updated_at)
  VALUES ('a0000000-0000-4000-8000-000000000003', 'manager@babinrentals.test', '{"full_name":"Test Manager"}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), now())
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  INSERT INTO users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
  VALUES ('a0000000-0000-4000-8000-000000000003', gen_random_uuid(), 'EMP-STG-MANAGER', 'manager@babinrentals.test', 'Test Manager', '+977-9800000000', 'Manager', v_branch_id, true, 'a0000000-0000-4000-8000-000000000001')
  ON CONFLICT (id) DO UPDATE SET primary_role = 'Manager', email = 'manager@babinrentals.test', is_active = true;

  -- Role: Coordinator
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at, created_at, updated_at)
  VALUES ('a0000000-0000-4000-8000-000000000004', 'coordinator@babinrentals.test', '{"full_name":"Test Coordinator"}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), now())
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  INSERT INTO users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
  VALUES ('a0000000-0000-4000-8000-000000000004', gen_random_uuid(), 'EMP-STG-COORD', 'coordinator@babinrentals.test', 'Test Coordinator', '+977-9800000000', 'Coordinator', v_branch_id, true, 'a0000000-0000-4000-8000-000000000001')
  ON CONFLICT (id) DO UPDATE SET primary_role = 'Coordinator', email = 'coordinator@babinrentals.test', is_active = true;

  -- Role: Warehouse
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at, created_at, updated_at)
  VALUES ('a0000000-0000-4000-8000-000000000005', 'warehouse@babinrentals.test', '{"full_name":"Test Warehouse"}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), now())
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  INSERT INTO users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
  VALUES ('a0000000-0000-4000-8000-000000000005', gen_random_uuid(), 'EMP-STG-WH', 'warehouse@babinrentals.test', 'Test Warehouse', '+977-9800000000', 'Warehouse', v_branch_id, true, 'a0000000-0000-4000-8000-000000000001')
  ON CONFLICT (id) DO UPDATE SET primary_role = 'Warehouse', email = 'warehouse@babinrentals.test', is_active = true;

  -- Role: Technician
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at, created_at, updated_at)
  VALUES ('a0000000-0000-4000-8000-000000000006', 'technician@babinrentals.test', '{"full_name":"Test Technician"}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), now())
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  INSERT INTO users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
  VALUES ('a0000000-0000-4000-8000-000000000006', gen_random_uuid(), 'EMP-STG-TECH', 'technician@babinrentals.test', 'Test Technician', '+977-9800000000', 'Technician', v_branch_id, true, 'a0000000-0000-4000-8000-000000000001')
  ON CONFLICT (id) DO UPDATE SET primary_role = 'Technician', email = 'technician@babinrentals.test', is_active = true;

  -- Role: Accounts
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at, created_at, updated_at)
  VALUES ('a0000000-0000-4000-8000-000000000007', 'accounts@babinrentals.test', '{"full_name":"Test Accounts"}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), now())
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  INSERT INTO users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
  VALUES ('a0000000-0000-4000-8000-000000000007', gen_random_uuid(), 'EMP-STG-ACCOUNTS', 'accounts@babinrentals.test', 'Test Accounts', '+977-9800000000', 'Accounts', v_branch_id, true, 'a0000000-0000-4000-8000-000000000001')
  ON CONFLICT (id) DO UPDATE SET primary_role = 'Accounts', email = 'accounts@babinrentals.test', is_active = true;

  -- Role: Driver
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at, created_at, updated_at)
  VALUES ('a0000000-0000-4000-8000-000000000008', 'driver@babinrentals.test', '{"full_name":"Test Driver"}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), now())
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  INSERT INTO users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
  VALUES ('a0000000-0000-4000-8000-000000000008', gen_random_uuid(), 'EMP-STG-DRIVER', 'driver@babinrentals.test', 'Test Driver', '+977-9800000000', 'Driver', v_branch_id, true, 'a0000000-0000-4000-8000-000000000001')
  ON CONFLICT (id) DO UPDATE SET primary_role = 'Driver', email = 'driver@babinrentals.test', is_active = true;

  -- Role: Client A
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at, created_at, updated_at)
  VALUES ('a0000000-0000-4000-8000-000000000009', 'client-a@babinrentals.test', '{"full_name":"Test Client Alpha"}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), now())
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  INSERT INTO users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
  VALUES ('a0000000-0000-4000-8000-000000000009', gen_random_uuid(), 'EMP-STG-CLIENT-A', 'client-a@babinrentals.test', 'Test Client Alpha', '+977-9800000000', 'Client', v_branch_id, true, 'a0000000-0000-4000-8000-000000000001')
  ON CONFLICT (id) DO UPDATE SET primary_role = 'Client', email = 'client-a@babinrentals.test', is_active = true;

  -- Role: Client B
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at, created_at, updated_at)
  VALUES ('a0000000-0000-4000-8000-000000000099', 'client-b@babinrentals.test', '{"full_name":"Test Client Beta"}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), now())
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  INSERT INTO users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
  VALUES ('a0000000-0000-4000-8000-000000000099', gen_random_uuid(), 'EMP-STG-CLIENT-B', 'client-b@babinrentals.test', 'Test Client Beta', '+977-9800000000', 'Client', v_branch_id, true, 'a0000000-0000-4000-8000-000000000001')
  ON CONFLICT (id) DO UPDATE SET primary_role = 'Client', email = 'client-b@babinrentals.test', is_active = true;

  -- 4. Seed Portal Users link for Client A and Client B
  INSERT INTO portal_users (id, client_uuid, client_id, auth_user_id, email, phone, display_name, status, self_registered_at, created_at)
  VALUES
    ('a0000000-0000-4000-8000-000000000009', gen_random_uuid(), 'c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000009', 'client-a@babinrentals.test', '+9779800000009', 'Test Client Alpha', 'Active', now(), now()),
    ('a0000000-0000-4000-8000-000000000099', gen_random_uuid(), 'c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000099', 'client-b@babinrentals.test', '+9779800000099', 'Test Client Beta', 'Active', now(), now())
  ON CONFLICT (id) DO UPDATE SET status = 'Active';

END $$;

COMMIT;

-- Verification output for operator
SELECT u.id, u.email, u.primary_role, u.is_active
FROM public.users u
WHERE u.email LIKE '%@babinrentals.test'
ORDER BY u.email;
