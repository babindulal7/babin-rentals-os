-- =============================================================================
-- Babin Rentals OS — Staging Stage 2: Synthetic Test Fixtures & Auth Setup
-- Target: babin-staging (klhmsrunqrdxjudyhnkm, Singapore)
-- Scope: Synthetic test fixtures (Product, Bookings, Line, Driver Assignment)
--        and password initialization for the 10 synthetic identities
-- Purpose: Enable Stage 2 hosted PostgREST and Storage RLS verification
-- Paste into Supabase SQL Editor for klhmsrunqrdxjudyhnkm and run.
-- =============================================================================

BEGIN;

-- 1. Set standard synthetic password for all @babinrentals.test users
UPDATE auth.users
SET encrypted_password = extensions.crypt('BabinSynthetic2026!', extensions.gen_salt('bf', 10)),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
WHERE email LIKE '%@babinrentals.test';

DO $$
DECLARE
  v_branch_id   uuid;
  v_category_id uuid;
  v_client_a_id uuid;
  v_client_b_id uuid;
  v_owner_id    uuid := 'a0000000-0000-4000-8000-000000000001';
  v_driver_id   uuid := 'a0000000-0000-4000-8000-000000000008';
  v_product_id  uuid := '10000000-0000-4000-8000-000000000001';
  v_booking_a   uuid := 'b0000000-0000-4000-8000-000000000001';
  v_booking_b   uuid := 'b0000000-0000-4000-8000-000000000002';
  v_line_a      uuid := 'c0000000-0000-4000-8000-000000000001';
BEGIN
  -- Resolve Branch
  SELECT id INTO v_branch_id FROM branches ORDER BY is_headquarters DESC, created_at ASC LIMIT 1;

  -- Resolve or Create Inventory Category
  SELECT id INTO v_category_id FROM inventory_categories LIMIT 1;
  IF v_category_id IS NULL THEN
    v_category_id := '00000000-0000-4000-8000-000000000001';
    INSERT INTO inventory_categories (id, client_uuid, name, code, is_active, created_by)
    VALUES (v_category_id, gen_random_uuid(), 'Cameras', 'CAM', true, v_owner_id)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Resolve Client IDs
  SELECT id INTO v_client_a_id FROM clients WHERE client_code = 'C-9901';
  SELECT id INTO v_client_b_id FROM clients WHERE client_code = 'C-9902';

  -- 2. Seed Synthetic Product
  INSERT INTO products (
    id, client_uuid, asset_code, name, brand, category_id,
    daily_rate, status, rental_enabled, tracking_mode
  )
  VALUES (
    v_product_id, gen_random_uuid(), 'EQ990001', 'Synthetic Test Cinema Camera',
    'BabinLabs', v_category_id, 500.00, 'Active', true, 'Serialised'
  )
  ON CONFLICT (id) DO UPDATE SET
    daily_rate = 500.00,
    status = 'Active',
    rental_enabled = true;

  -- 3. Seed Synthetic Booking A for Client A
  INSERT INTO bookings (
    id, client_uuid, booking_no, branch_id, client_id,
    stage, pickup_at, return_at, delivery_type,
    created_by, updated_by
  )
  VALUES (
    v_booking_a, gen_random_uuid(), '9901', v_branch_id, v_client_a_id,
    'Booked', now() - interval '1 day', now() + interval '3 days', 'Babin Delivery',
    v_owner_id, v_owner_id
  )
  ON CONFLICT (id) DO UPDATE SET
    stage = 'Booked',
    client_id = v_client_a_id,
    delivery_type = 'Babin Delivery';

  -- 4. Seed Synthetic Booking Line on Booking A
  PERFORM set_config('app.in_create_booking', 'on', true);

  INSERT INTO booking_lines (
    id, client_uuid, booking_id, line_type, product_id,
    qty, days, rate, created_by
  )
  VALUES (
    v_line_a, gen_random_uuid(), v_booking_a, 'Equipment', v_product_id,
    1, 3, 1500.00, v_owner_id
  )
  ON CONFLICT (id) DO UPDATE SET
    rate = 1500.00;

  -- 5. Seed Synthetic Booking B for Client B (Cross-Client Isolation target)
  INSERT INTO bookings (
    id, client_uuid, booking_no, branch_id, client_id,
    stage, pickup_at, return_at, delivery_type,
    created_by, updated_by
  )
  VALUES (
    v_booking_b, gen_random_uuid(), '9902', v_branch_id, v_client_b_id,
    'Booked', now() - interval '1 day', now() + interval '3 days', 'Client Pickup',
    v_owner_id, v_owner_id
  )
  ON CONFLICT (id) DO UPDATE SET
    stage = 'Booked',
    client_id = v_client_b_id;

  -- 6. Seed Scheduled Delivery Job assigning Driver to Booking A
  INSERT INTO delivery_jobs (
    id, client_uuid, booking_id, branch_id, leg,
    scheduled_at, status, assigned_driver_id,
    created_by, updated_by
  )
  VALUES (
    'd0000000-0000-4000-8000-000000000001', gen_random_uuid(), v_booking_a, v_branch_id, 'Outbound',
    now(), 'Scheduled', v_driver_id,
    v_owner_id, v_owner_id
  )
  ON CONFLICT (booking_id, leg) DO UPDATE SET
    assigned_driver_id = v_driver_id,
    status = 'Scheduled';

END $$;

COMMIT;

-- Verification output for operator
SELECT 'Product' AS entity, p.id::text, p.asset_code, p.name FROM public.products p WHERE p.id = '10000000-0000-4000-8000-000000000001'
UNION ALL
SELECT 'Booking A' AS entity, b.id::text, b.booking_no, b.stage::text FROM public.bookings b WHERE b.id = 'b0000000-0000-4000-8000-000000000001'
UNION ALL
SELECT 'Booking B' AS entity, b.id::text, b.booking_no, b.stage::text FROM public.bookings b WHERE b.id = 'b0000000-0000-4000-8000-000000000002'
UNION ALL
SELECT 'Delivery Job' AS entity, j.id::text, j.status, j.leg FROM public.delivery_jobs j WHERE j.id = 'd0000000-0000-4000-8000-000000000001';
