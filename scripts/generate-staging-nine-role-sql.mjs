import { writeFileSync, readFileSync } from 'node:fs'

const roles = ['Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician', 'Accounts', 'Driver', 'Client']
const fixtures = JSON.parse(readFileSync('docs/verification/STAGING_ROLE_FIXTURES.json', 'utf8'))

let sql = `-- =============================================================================
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
  v_product_id uuid := '${fixtures.productId}';
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
`

for (let i = 0; i < roles.length; i++) {
  const role = roles[i]
  const f = fixtures.roles[role]
  const email = `staging-${role.toLowerCase()}@babinrentals.test`
  const code = `EMP-STG-${(i + 1).toString().padStart(3, '0')}`
  const fullName = `Staging ${role}`

  sql += `
  -- ---------------------------------------------------------------------------
  -- Role: ${role}
  -- ---------------------------------------------------------------------------
  v_user_id := '${f.userId}';
  v_booking_id := '${f.bookingId}';
  v_line_id := '${f.lineId}';
  v_role := '${role}';

  -- A. Create or update in auth.users
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (
    v_user_id,
    '${email}',
    extensions.crypt('StagingPass2026!', extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object('full_name', '${fullName}', 'role', v_role),
    now(),
    now()
  )
  on conflict (id) do update set email = '${email}', email_confirmed_at = now();
`

  if (role !== 'Client') {
    sql += `
  -- B. Create in public.users
  insert into public.users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active)
  values (v_user_id, gen_random_uuid(), '${code}', '${email}', '${fullName}', '+977981000000${i + 1}', v_role::system_role, v_branch_id, true)
  on conflict (id) do update set primary_role = v_role::system_role, branch_id = v_branch_id, is_active = true;

  -- C. Automatic Boudha site grant (Ruling D27)
  insert into operations_grants (client_uuid, user_id, branch_id, operation, granted_by, granted_at)
  select gen_random_uuid(), v_user_id, v_branch_id, op, v_user_id, now()
  from unnest(array['pack', 'handover', 'return', 'reset']) as op
  where not exists (
    select 1 from operations_grants
    where user_id = v_user_id and branch_id = v_branch_id and operation = op and revoked_at is null
  );
`
  } else {
    sql += `
  -- Link Client auth user to portal_users
  insert into portal_users (client_uuid, client_id, auth_user_id, email, status, self_registered_at)
  values (gen_random_uuid(), v_client_id, v_user_id, '${email}', 'Active', now())
  on conflict do nothing;
`
  }

  const bookingOwner = 'v_client_id'
  const bookingNo = `9900${i + 1}`
  const creatorActor = role === 'Client' ? `'${fixtures.roles.Owner.userId}'` : 'v_user_id'

  sql += `
  -- D. Positive booking fixture for ${role} (canonical stage: Booked)
  insert into bookings (id, client_uuid, booking_no, client_id, branch_id, pickup_at, return_at, delivery_type, stage, created_by, updated_by)
  values (v_booking_id, gen_random_uuid(), '${bookingNo}', ${bookingOwner}, v_branch_id, now() + interval '1 day', now() + interval '3 days', 'Client Pickup', 'Booked', ${creatorActor}, ${creatorActor})
  on conflict (id) do update set stage = 'Booked';

  -- E. Positive line fixture for ${role} (canonical line_type: Equipment)
  insert into booking_lines (id, client_uuid, booking_id, line_type, product_id, qty, days, rate, created_by)
  values (v_line_id, gen_random_uuid(), v_booking_id, 'Equipment', v_product_id, 1, 2, 500000, ${creatorActor})
  on conflict (id) do nothing;
`

  if (role === 'Driver') {
    sql += `
  -- Driver delivery job to open booking visibility
  insert into delivery_jobs (client_uuid, booking_id, branch_id, leg, scheduled_at, status, assigned_driver_id, created_by, updated_by)
  values (gen_random_uuid(), v_booking_id, v_branch_id, 'Outbound', now() + interval '1 day', 'Scheduled', v_user_id, v_user_id, v_user_id)
  on conflict (booking_id, leg) do update set assigned_driver_id = v_user_id, status = 'Scheduled';

  -- Driver transport fixture
  insert into booking_transport (id, client_uuid, booking_id, vehicle, number_plate, driver_id, delivery_charge, fuel_charge, created_by)
  values (gen_random_uuid(), gen_random_uuid(), v_booking_id, 'Delivery Van', 'BA 1 PA 9999', v_user_id, 0, 0, v_user_id)
  on conflict (booking_id) do update set driver_id = v_user_id;
`
  }

  if (role === 'Client') {
    sql += `
  -- Other client booking fixture for Client cross-tenant isolation negative assertion
  insert into bookings (id, client_uuid, booking_no, client_id, branch_id, pickup_at, return_at, delivery_type, stage, created_by, updated_by)
  values ('${f.otherBookingId}', gen_random_uuid(), '99099', v_other_client_id, v_branch_id, now() + interval '2 days', now() + interval '4 days', 'Client Pickup', 'Booked', ${creatorActor}, ${creatorActor})
  on conflict (id) do nothing;
`
  }
}

sql += `
end $$;

commit;
`

writeFileSync('docs/verification/STAGING_NINE_ROLE_SEATS_SETUP.sql', sql, 'utf8')
console.log('Successfully re-generated docs/verification/STAGING_NINE_ROLE_SEATS_SETUP.sql')
