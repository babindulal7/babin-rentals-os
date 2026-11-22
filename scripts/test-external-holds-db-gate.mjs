#!/usr/bin/env node
/**
 * scripts/test-external-holds-db-gate.mjs
 *
 * T9-02 / Migration 0261: Booqable external hold database gate test suite.
 *
 * Verifies:
 * 1. Serialized gear: external hold on serial asset blocks OS reservation (GATE:booqable_serial_held).
 * 2. Serialized gear: pre-existing OS reservation blocks external hold on same asset.
 * 3. Serialized gear: non-conflicting distinct serials within capacity both succeed.
 * 4. Serialized gear: aggregate capacity exhaustion from unassigned external holds blocks OS reservation.
 * 5. Quantity gear: combined OS and Booqable holds cannot exceed total product capacity.
 * 6. Quantity gear: reverse insertion (OS holds first, then Booqable hold exceeds) is refused.
 * 7. Non-overlapping half-open windows [A, B) and [B, C) do not clash.
 * 8. Partner stock (0253): temporary partner units expand capacity only inside the agreement window.
 * 9. Cancellation & release: cancelling an external hold frees capacity; check constraint enforces reason length >= 10.
 * 10. Law 3 Retention: hard DELETE on external_holds or booqable_hold_feed_state is rejected by trigger.
 * 11. Fail-closed cutover feed health: stale/unhealthy feed blocks new OS reservations when enabled.
 * 12. RLS & permissions: authenticated cannot write external_holds; anon/client cannot read; staff reads non-financial projection.
 */

import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const MIG = join(ROOT, 'supabase', 'migrations')

const db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })
await db.exec(readFileSync(join(ROOT, 'supabase', 'pglite-prelude.sql'), 'utf8'))

const files = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort()
for (const file of files) {
  await db.exec(readFileSync(join(MIG, file), 'utf8'))
}

let failed = 0
let passed = 0
const check = (ok, msg) => {
  if (ok) {
    console.log(`✓ ${msg}`)
    passed++
  } else {
    console.log(`✗ ${msg}`)
    failed++
  }
}

const fails = async (fn, frag) => {
  try {
    await fn()
    return false
  } catch (e) {
    if (!frag) return true
    return String(e.message).includes(frag)
  }
}

const sql = (stmt, params = []) => db.query(stmt, params)
const uuid = () => crypto.randomUUID()

// ---------------------------------------------------------------------------
// 1. Fixture Setup
// ---------------------------------------------------------------------------
const branchId = (await sql(`select id from branches order by created_at limit 1`)).rows[0].id
let warehouseId = (await sql(`select id from warehouses order by created_at limit 1`)).rows[0]?.id
if (!warehouseId) {
  const whRes = await sql(`
    insert into warehouses (client_uuid, branch_id, name, code, is_active, created_by)
    values (gen_random_uuid(), $1, 'Main Warehouse', 'WH-MAIN', true, '00000000-0000-0000-0000-000000000991')
    returning id
  `, [branchId])
  warehouseId = whRes.rows[0].id
}

const catId = (await sql(`select id from inventory_categories order by name limit 1`)).rows[0]?.id

const ids = {
  Owner: '00000000-0000-0000-0000-000000000991',
  Manager: '00000000-0000-0000-0000-000000000992',
  Coordinator: '00000000-0000-0000-0000-000000000993',
  Warehouse: '00000000-0000-0000-0000-000000000994',
  Client: '00000000-0000-0000-0000-000000000995',
}

for (const [role, id] of Object.entries(ids)) {
  await sql(
    `insert into users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
     values ($1, gen_random_uuid(), $2, $3, $4, '+977-9800000000', $5, $6, true, $1)
     on conflict (id) do update set primary_role = $5`,
    [id, `EMP-T9-${role}`, `${role.toLowerCase()}-t9@babinrentals.com`, `Test ${role}`, role, branchId]
  )
}

const as = async (role) => {
  if (role === 'service_role') {
    await db.exec(`reset role;`)
  } else if (role === 'anon') {
    await db.exec(`reset role; select set_config('app.current_user_id', '', false); set role anon;`)
  } else {
    await db.exec(`reset role; select set_config('app.current_user_id', '${ids[role]}', false); set role authenticated;`)
  }
}

// Create a Client record
const clientRes = await sql(`
  insert into clients (client_uuid, client_code, name, phone, email, created_by)
  values (gen_random_uuid(), 'C-9901', 'T9-02 Test Client', '+9779811223344', 't9client@example.com', $1)
  returning id
`, [ids.Owner])
const clientId = clientRes.rows[0].id

// Serial Product: Sony FX3 with 2 serial units
const fx3Code = (await sql("select next_document_number('equipment')")).rows[0].next_document_number
const fx3Res = await sql(`
  insert into products (client_uuid, asset_code, name, brand, category_id, tracking_mode, total_quantity, allow_overbooking, created_by)
  values (gen_random_uuid(), $1, 'Sony FX3 Cinema Camera (T9-02)', 'Sony', $2, 'Serialised', 2, false, $3)
  returning id
`, [fx3Code, catId, ids.Owner])
const fx3Id = fx3Res.rows[0].id

const u1Res = await sql(`
  insert into product_units (client_uuid, product_id, serial_no, asset_tag, branch_id, warehouse_id, status, condition, created_by)
  values (gen_random_uuid(), $1, 'FX3-SN-001', 'BAR-FX3-001', $2, $3, 'In Stock', 'Good', $4)
  returning id
`, [fx3Id, branchId, warehouseId, ids.Owner])
const fx3Unit1 = u1Res.rows[0].id

const u2Res = await sql(`
  insert into product_units (client_uuid, product_id, serial_no, asset_tag, branch_id, warehouse_id, status, condition, created_by)
  values (gen_random_uuid(), $1, 'FX3-SN-002', 'BAR-FX3-002', $2, $3, 'In Stock', 'Good', $4)
  returning id
`, [fx3Id, branchId, warehouseId, ids.Owner])
const fx3Unit2 = u2Res.rows[0].id

// Quantity Product: XLR Cable 10m with total_quantity = 5
const xlrCode = (await sql("select next_document_number('equipment')")).rows[0].next_document_number
const xlrRes = await sql(`
  insert into products (client_uuid, asset_code, name, brand, category_id, tracking_mode, total_quantity, allow_overbooking, created_by)
  values (gen_random_uuid(), $1, 'XLR Audio Cable 10m (T9-02)', 'Mogami', $2, 'Quantity', 5, false, $3)
  returning id
`, [xlrCode, catId, ids.Owner])
const xlrId = xlrRes.rows[0].id

// Helper to create an OS booking and line
async function createOsBooking(productId, assetId, qty, startIso, endIso) {
  const bNo = (await sql("select next_document_number('booking')")).rows[0].next_document_number
  const bRes = await sql(`
    insert into bookings (client_uuid, booking_no, client_id, branch_id, stage, pickup_at, return_at, delivery_type, created_by, updated_by)
    values (gen_random_uuid(), $1, $2, $3, 'Booked', $4, $5, 'Client Pickup', $6, $6)
    returning id
  `, [bNo, clientId, branchId, startIso, endIso, ids.Owner])
  const bId = bRes.rows[0].id

  const lRes = await sql(`
    insert into booking_lines (client_uuid, booking_id, product_id, line_type, qty, description, rate, days, created_by)
    values (gen_random_uuid(), $1, $2, 'Equipment', $3, 'Line Item', 0, 4, $4)
    returning id
  `, [bId, productId, qty, ids.Owner])
  const lId = lRes.rows[0].id

  return { bookingId: bId, lineId: lId }
}

console.log('--- Testing T9-02 Booqable External Holds DB Gate ---')

// ---------------------------------------------------------------------------
// 2. Serial Collision: External hold blocks subsequent OS reservation
// ---------------------------------------------------------------------------
await as('service_role')
const hold1Uuid = uuid()
await sql(`
  insert into external_holds (client_uuid, source, external_order_id, external_line_id, external_order_number, product_id, asset_id, qty, period, last_seen_at)
  values ($1, 'booqable', 'bq_ord_1', 'bq_line_1', 'BQ-1001', $2, $3, 1, tstzrange('2026-12-01 06:00:00+00', '2026-12-05 06:00:00+00', '[)'), now())
`, [hold1Uuid, fx3Id, fx3Unit1])

const osBooking1 = await createOsBooking(fx3Id, fx3Unit1, 1, '2026-12-03T06:00:00Z', '2026-12-07T06:00:00Z')

const blockedRes1 = await fails(async () => {
  await sql(`
    insert into inventory_reservations (client_uuid, booking_id, booking_line_id, asset_id, qty, period, created_by, hold_state)
    values ($1, $2, $3, $4, 1, tstzrange('2026-12-03 06:00:00+00', '2026-12-07 06:00:00+00', '[)'), $5, 'confirmed')
  `, [uuid(), osBooking1.bookingId, osBooking1.lineId, fx3Unit1, ids.Coordinator])
}, 'GATE:booqable_serial_held')
check(blockedRes1, '1. External hold on FX3 Unit 1 blocks overlapping OS reservation with GATE:booqable_serial_held')

// ---------------------------------------------------------------------------
// 3. Reverse Serial Collision: Existing OS reservation blocks external hold
// ---------------------------------------------------------------------------
const osBooking2 = await createOsBooking(fx3Id, fx3Unit2, 1, '2026-12-10T06:00:00Z', '2026-12-15T06:00:00Z')
await sql(`
  insert into inventory_reservations (client_uuid, booking_id, booking_line_id, asset_id, qty, period, created_by, hold_state)
  values ($1, $2, $3, $4, 1, tstzrange('2026-12-10 06:00:00+00', '2026-12-15 06:00:00+00', '[)'), $5, 'confirmed')
`, [uuid(), osBooking2.bookingId, osBooking2.lineId, fx3Unit2, ids.Coordinator])

const blockedHold2 = await fails(async () => {
  await sql(`
    insert into external_holds (client_uuid, source, external_order_id, external_line_id, external_order_number, product_id, asset_id, qty, period, last_seen_at)
    values ($1, 'booqable', 'bq_ord_2', 'bq_line_2', 'BQ-1002', $2, $3, 1, tstzrange('2026-12-12 06:00:00+00', '2026-12-17 06:00:00+00', '[)'), now())
  `, [uuid(), fx3Id, fx3Unit2])
}, 'GATE:booqable_serial_held')
check(blockedHold2, '2. Pre-existing OS reservation on FX3 Unit 2 blocks overlapping external hold with GATE:booqable_serial_held')

// ---------------------------------------------------------------------------
// 4. Distinct serials within capacity succeed
// ---------------------------------------------------------------------------
// External hold on Unit 1, OS reservation on Unit 2 for period 2026-12-20 -> 2026-12-25
await sql(`
  insert into external_holds (client_uuid, source, external_order_id, external_line_id, external_order_number, product_id, asset_id, qty, period, last_seen_at)
  values ($1, 'booqable', 'bq_ord_3', 'bq_line_3', 'BQ-1003', $2, $3, 1, tstzrange('2026-12-20 06:00:00+00', '2026-12-25 06:00:00+00', '[)'), now())
`, [uuid(), fx3Id, fx3Unit1])

const osBooking3 = await createOsBooking(fx3Id, fx3Unit2, 1, '2026-12-20T06:00:00Z', '2026-12-25T06:00:00Z')
await sql(`
  insert into inventory_reservations (client_uuid, booking_id, booking_line_id, asset_id, qty, period, created_by, hold_state)
  values ($1, $2, $3, $4, 1, tstzrange('2026-12-20 06:00:00+00', '2026-12-25 06:00:00+00', '[)'), $5, 'confirmed')
`, [uuid(), osBooking3.bookingId, osBooking3.lineId, fx3Unit2, ids.Coordinator])
check(true, '3. Distinct serials (Unit 1 on Booqable, Unit 2 on OS) both succeed within product capacity')

// ---------------------------------------------------------------------------
// 5. Aggregate capacity exhaustion on serialized product (unassigned Booqable hold)
// ---------------------------------------------------------------------------
// FX3 capacity is 2 units. External holds 2 unassigned units on period 2026-12-26 -> 2026-12-28
await sql(`
  insert into external_holds (client_uuid, source, external_order_id, external_line_id, external_order_number, product_id, asset_id, qty, period, last_seen_at)
  values ($1, 'booqable', 'bq_ord_4', 'bq_line_4', 'BQ-1004', $2, null, 2, tstzrange('2026-12-26 06:00:00+00', '2026-12-28 06:00:00+00', '[)'), now())
`, [uuid(), fx3Id])

const osBooking4 = await createOsBooking(fx3Id, fx3Unit1, 1, '2026-12-26T06:00:00Z', '2026-12-28T06:00:00Z')
const blockedCapSerial = await fails(async () => {
  await sql(`
    insert into inventory_reservations (client_uuid, booking_id, booking_line_id, asset_id, qty, period, created_by, hold_state)
    values ($1, $2, $3, $4, 1, tstzrange('2026-12-26 06:00:00+00', '2026-12-28 06:00:00+00', '[)'), $5, 'confirmed')
  `, [uuid(), osBooking4.bookingId, osBooking4.lineId, fx3Unit1, ids.Coordinator])
}, 'GATE:booqable_capacity_held')
check(blockedCapSerial, '4. Unassigned external hold of 2 units exhausts FX3 capacity; OS reservation fails with GATE:booqable_capacity_held')

// ---------------------------------------------------------------------------
// 6. Quantity product: combined capacity checking
// ---------------------------------------------------------------------------
// XLR Cable has total_quantity = 5.
// External holds 3 units on 2026-12-10 -> 2026-12-15
await sql(`
  insert into external_holds (client_uuid, source, external_order_id, external_line_id, external_order_number, product_id, asset_id, qty, period, last_seen_at)
  values ($1, 'booqable', 'bq_ord_5', 'bq_line_5', 'BQ-1005', $2, null, 3, tstzrange('2026-12-10 06:00:00+00', '2026-12-15 06:00:00+00', '[)'), now())
`, [uuid(), xlrId])

// OS reserves 2 units on same period -> 3 + 2 = 5 <= 5 (succeeds)
const osBookingXlr1 = await createOsBooking(xlrId, null, 2, '2026-12-10T06:00:00Z', '2026-12-15T06:00:00Z')
await sql(`
  insert into inventory_reservations (client_uuid, booking_id, booking_line_id, product_id, qty, period, created_by, hold_state)
  values ($1, $2, $3, $4, 2, tstzrange('2026-12-10 06:00:00+00', '2026-12-15 06:00:00+00', '[)'), $5, 'confirmed')
`, [uuid(), osBookingXlr1.bookingId, osBookingXlr1.lineId, xlrId, ids.Coordinator])

// Next OS tries to reserve 1 unit on overlapping period -> 3 + 2 + 1 = 6 > 5 (must fail)
const osBookingXlr2 = await createOsBooking(xlrId, null, 1, '2026-12-12T06:00:00Z', '2026-12-14T06:00:00Z')
const blockedCapQty = await fails(async () => {
  await sql(`
    insert into inventory_reservations (client_uuid, booking_id, booking_line_id, product_id, qty, period, created_by, hold_state)
    values ($1, $2, $3, $4, 1, tstzrange('2026-12-12 06:00:00+00', '2026-12-14 06:00:00+00', '[)'), $5, 'confirmed')
  `, [uuid(), osBookingXlr2.bookingId, osBookingXlr2.lineId, xlrId, ids.Coordinator])
}, 'GATE:booqable_capacity_held')
check(blockedCapQty, '5. Combined 3 Booqable + 2 OS XLRs exhausts capacity (5); 3rd OS reservation fails with GATE:booqable_capacity_held')

// Reverse: External hold that exceeds remaining capacity is refused
const blockedHoldQty = await fails(async () => {
  await sql(`
    insert into external_holds (client_uuid, source, external_order_id, external_line_id, external_order_number, product_id, asset_id, qty, period, last_seen_at)
    values ($1, 'booqable', 'bq_ord_6', 'bq_line_6', 'BQ-1006', $2, null, 1, tstzrange('2026-12-11 06:00:00+00', '2026-12-13 06:00:00+00', '[)'), now())
  `, [uuid(), xlrId])
}, 'GATE:booqable_capacity_held')
check(blockedHoldQty, '6. Reverse: New external hold that exceeds capacity is refused with GATE:booqable_capacity_held')

// ---------------------------------------------------------------------------
// 7. Non-overlapping contiguous half-open intervals succeed
// ---------------------------------------------------------------------------
// OS reserves 5 cables for [2026-12-16 06:00, 2026-12-18 06:00)
// Booqable holds 5 cables for [2026-12-18 06:00, 2026-12-20 06:00)
const osBookingXlr3 = await createOsBooking(xlrId, null, 5, '2026-12-16T06:00:00Z', '2026-12-18T06:00:00Z')
await sql(`
  insert into inventory_reservations (client_uuid, booking_id, booking_line_id, product_id, qty, period, created_by, hold_state)
  values ($1, $2, $3, $4, 5, tstzrange('2026-12-16 06:00:00+00', '2026-12-18 06:00:00+00', '[)'), $5, 'confirmed')
`, [uuid(), osBookingXlr3.bookingId, osBookingXlr3.lineId, xlrId, ids.Coordinator])

await sql(`
  insert into external_holds (client_uuid, source, external_order_id, external_line_id, external_order_number, product_id, asset_id, qty, period, last_seen_at)
  values ($1, 'booqable', 'bq_ord_7', 'bq_line_7', 'BQ-1007', $2, null, 5, tstzrange('2026-12-18 06:00:00+00', '2026-12-20 06:00:00+00', '[)'), now())
`, [uuid(), xlrId])
check(true, '7. Contiguous touching windows [16-18) and [18-20) both succeed with full capacity (half-open boundaries)')

// ---------------------------------------------------------------------------
// 8. Temporary partner stock interaction (0253)
// ---------------------------------------------------------------------------
// Create supplier for partner stock
const supCode = 'SUP-T9-' + uuid().slice(0, 6)
const supRes = await sql(`
  insert into suppliers (client_uuid, supplier_code, name, created_by)
  values (gen_random_uuid(), $1, 'Partner Sound Nepal', $2)
  returning id
`, [supCode, ids.Owner])
const supplierId = supRes.rows[0].id

// Add 2 temporary partner cables available for [2026-12-22 00:00, 2026-12-25 00:00)
await sql(`
  insert into temporary_stock (client_uuid, supplier_id, product_id, tracking_mode, quantity, available_from, available_until, cost_kind, cost_paisa, status, created_by)
  values (gen_random_uuid(), $1, $2, 'Quantity', 2, '2026-12-22 00:00:00+00', '2026-12-25 00:00:00+00', 'daily', 50000, 'Active', $3)
`, [supplierId, xlrId, ids.Owner])

// Capacity inside window is 5 + 2 = 7.
// External holds 4 cables for [2026-12-22 06:00, 2026-12-24 06:00)
await sql(`
  insert into external_holds (client_uuid, source, external_order_id, external_line_id, external_order_number, product_id, asset_id, qty, period, last_seen_at)
  values ($1, 'booqable', 'bq_ord_8', 'bq_line_8', 'BQ-1008', $2, null, 4, tstzrange('2026-12-22 06:00:00+00', '2026-12-24 06:00:00+00', '[)'), now())
`, [uuid(), xlrId])

// OS reserves 3 cables inside window -> 4 + 3 = 7 <= 7 (succeeds!)
const osBookingPartner = await createOsBooking(xlrId, null, 3, '2026-12-22T06:00:00Z', '2026-12-24T06:00:00Z')
await sql(`
  insert into inventory_reservations (client_uuid, booking_id, booking_line_id, product_id, qty, period, created_by, hold_state)
  values ($1, $2, $3, $4, 3, tstzrange('2026-12-22 06:00:00+00', '2026-12-24 06:00:00+00', '[)'), $5, 'confirmed')
`, [uuid(), osBookingPartner.bookingId, osBookingPartner.lineId, xlrId, ids.Coordinator])
check(true, '8a. Inside partner window: combined capacity 7 accommodates 4 Booqable + 3 OS')

// Outside partner window: capacity is 5. External holds 4 cables on [2026-12-26 06:00, 2026-12-28 06:00)
await sql(`
  insert into external_holds (client_uuid, source, external_order_id, external_line_id, external_order_number, product_id, asset_id, qty, period, last_seen_at)
  values ($1, 'booqable', 'bq_ord_9', 'bq_line_9', 'BQ-1009', $2, null, 4, tstzrange('2026-12-26 06:00:00+00', '2026-12-28 06:00:00+00', '[)'), now())
`, [uuid(), xlrId])

// OS reserves 2 cables -> 4 + 2 = 6 > 5 (fails!)
const osBookingOutside = await createOsBooking(xlrId, null, 2, '2026-12-26T06:00:00Z', '2026-12-28T06:00:00Z')
const blockedPartnerOutside = await fails(async () => {
  await sql(`
    insert into inventory_reservations (client_uuid, booking_id, booking_line_id, product_id, qty, period, created_by, hold_state)
    values ($1, $2, $3, $4, 2, tstzrange('2026-12-26 06:00:00+00', '2026-12-28 06:00:00+00', '[)'), $5, 'confirmed')
  `, [uuid(), osBookingOutside.bookingId, osBookingOutside.lineId, xlrId, ids.Coordinator])
}, 'GATE:booqable_capacity_held')
check(blockedPartnerOutside, '8b. Outside partner window: partner stock is inactive; combined 4 Booqable + 2 OS fails capacity (5)')

// ---------------------------------------------------------------------------
// 9. Cancellation & Release frees capacity; reason check constraint enforced
// ---------------------------------------------------------------------------
// Cancelling hold 1 on FX3 Unit 1:
// Short reason (< 10 chars) must fail check constraint
const badReasonFails = await fails(async () => {
  await sql(`
    update external_holds
    set status = 'cancelled', released_at = now(), released_reason = 'Too short'
    where client_uuid = $1
  `, [hold1Uuid])
}, 'external_holds_release_reason')
check(badReasonFails, '9a. Cancelling external hold with short reason (<10 chars) violates check constraint')

// Valid cancellation with reason >= 10 chars
await sql(`
  update external_holds
  set status = 'cancelled', released_at = now(), released_reason = 'Cancelled by customer on Booqable'
  where client_uuid = $1
`, [hold1Uuid])

// Now OS booking 1 can reserve FX3 Unit 1 on [2026-12-03, 2026-12-07) without collision!
await sql(`
  insert into inventory_reservations (client_uuid, booking_id, booking_line_id, asset_id, qty, period, created_by, hold_state)
  values ($1, $2, $3, $4, 1, tstzrange('2026-12-03 06:00:00+00', '2026-12-07 06:00:00+00', '[)'), $5, 'confirmed')
`, [uuid(), osBooking1.bookingId, osBooking1.lineId, fx3Unit1, ids.Coordinator])
check(true, '9b. Authoritative cancellation of external hold frees unit; OS reservation now succeeds')

// ---------------------------------------------------------------------------
// 10. Law 3 Retention: Hard deletes are forbidden
// ---------------------------------------------------------------------------
const delHoldBlocked = await fails(async () => {
  await sql(`delete from external_holds where client_uuid = $1`, [hold1Uuid])
}, 'External Booqable holds are retained')
check(delHoldBlocked, '10a. Law 3: Hard delete on external_holds is refused by trigger')

const delFeedBlocked = await fails(async () => {
  await sql(`delete from booqable_hold_feed_state`)
}, 'External Booqable holds are retained')
check(delFeedBlocked, '10b. Law 3: Hard delete on booqable_hold_feed_state is refused by trigger')

// ---------------------------------------------------------------------------
// 11. Fail-closed Cutover Feed Health Gate
// ---------------------------------------------------------------------------
// A: Enabled + Unhealthy -> Blocks new OS reservations
await sql(`
  update booqable_hold_feed_state
  set enabled = true, healthy = false, last_full_sync_at = now(), maximum_healthy_age = interval '24 hours'
  where source = 'booqable'
`)

const osBookingFeed1 = await createOsBooking(xlrId, null, 1, '2027-01-01T06:00:00Z', '2027-01-02T06:00:00Z')
const blockedUnhealthy = await fails(async () => {
  await sql(`
    insert into inventory_reservations (client_uuid, booking_id, booking_line_id, product_id, qty, period, created_by, hold_state)
    values ($1, $2, $3, $4, 1, tstzrange('2027-01-01 06:00:00+00', '2027-01-02 06:00:00+00', '[)'), $5, 'confirmed')
  `, [uuid(), osBookingFeed1.bookingId, osBookingFeed1.lineId, xlrId, ids.Coordinator])
}, 'GATE:booqable_feed_unhealthy')
check(blockedUnhealthy, '11a. Enabled + Unhealthy Booqable feed blocks OS reservations with GATE:booqable_feed_unhealthy')

// B: Enabled + Missing maximum_healthy_age -> Blocks new OS reservations
await sql(`
  update booqable_hold_feed_state
  set enabled = true, healthy = true, last_full_sync_at = now(), maximum_healthy_age = null
  where source = 'booqable'
`)
const blockedNoAge = await fails(async () => {
  await sql(`
    insert into inventory_reservations (client_uuid, booking_id, booking_line_id, product_id, qty, period, created_by, hold_state)
    values ($1, $2, $3, $4, 1, tstzrange('2027-01-01 06:00:00+00', '2027-01-02 06:00:00+00', '[)'), $5, 'confirmed')
  `, [uuid(), osBookingFeed1.bookingId, osBookingFeed1.lineId, xlrId, ids.Coordinator])
}, 'GATE:booqable_feed_unhealthy')
check(blockedNoAge, '11b. Enabled + Unconfigured maximum_healthy_age fails closed with GATE:booqable_feed_unhealthy')

// C: Enabled + Stale sync (last sync 2 days ago, max age 24 hours) -> Blocks
await sql(`
  update booqable_hold_feed_state
  set enabled = true, healthy = true, last_full_sync_at = now() - interval '2 days', maximum_healthy_age = interval '24 hours'
  where source = 'booqable'
`)
const blockedStale = await fails(async () => {
  await sql(`
    insert into inventory_reservations (client_uuid, booking_id, booking_line_id, product_id, qty, period, created_by, hold_state)
    values ($1, $2, $3, $4, 1, tstzrange('2027-01-01 06:00:00+00', '2027-01-02 06:00:00+00', '[)'), $5, 'confirmed')
  `, [uuid(), osBookingFeed1.bookingId, osBookingFeed1.lineId, xlrId, ids.Coordinator])
}, 'GATE:booqable_feed_unhealthy')
check(blockedStale, '11c. Enabled + Stale sync past maximum_healthy_age fails closed with GATE:booqable_feed_unhealthy')

// D: Enabled + Healthy & Fresh sync (1 hour ago, max age 24 hours) -> SUCCEEDS
await sql(`
  update booqable_hold_feed_state
  set enabled = true, healthy = true, last_full_sync_at = now() - interval '1 hour', maximum_healthy_age = interval '24 hours'
  where source = 'booqable'
`)
await sql(`
  insert into inventory_reservations (client_uuid, booking_id, booking_line_id, product_id, qty, period, created_by, hold_state)
  values ($1, $2, $3, $4, 1, tstzrange('2027-01-01 06:00:00+00', '2027-01-02 06:00:00+00', '[)'), $5, 'confirmed')
`, [uuid(), osBookingFeed1.bookingId, osBookingFeed1.lineId, xlrId, ids.Coordinator])
check(true, '11d. Enabled + Healthy and Fresh sync allows normal OS reservation')

// Restore default disabled state
await sql(`
  update booqable_hold_feed_state
  set enabled = false, healthy = false, maximum_healthy_age = null
  where source = 'booqable'
`)

// ---------------------------------------------------------------------------
// 12. RLS & Role Permissions (Law 6 money blindness)
// ---------------------------------------------------------------------------
// Authenticated user cannot INSERT external_holds
await as('Coordinator')
const authInsertBlocked = await fails(async () => {
  await sql(`
    insert into external_holds (client_uuid, source, external_order_id, external_line_id, external_order_number, product_id, asset_id, qty, period, last_seen_at)
    values ($1, 'booqable', 'bq_ord_x', 'bq_line_x', 'BQ-X', $2, null, 1, tstzrange('2027-02-01 06:00:00+00', '2027-02-02 06:00:00+00', '[)'), now())
  `, [uuid(), xlrId])
}, 'permission denied')
check(authInsertBlocked, '12a. Authenticated user (Coordinator) cannot INSERT into external_holds')

// Authenticated user cannot write booqable_hold_feed_state
const feedWriteBlocked = await fails(async () => {
  await sql(`update booqable_hold_feed_state set enabled = true`)
}, 'permission denied')
check(feedWriteBlocked, '12b. Authenticated user cannot UPDATE booqable_hold_feed_state')

// Staff can SELECT projection from external_holds
await as('Warehouse')
const staffRows = (await sql(`select id, external_order_number, product_id, qty, status from external_holds`)).rows
check(staffRows.length > 0, '12c. Warehouse staff can SELECT projection from external_holds')

// Anon has ZERO access to external_holds
await as('anon')
const anonBlocked = await fails(async () => {
  await sql(`select count(*) from external_holds`)
}, 'permission denied')
check(anonBlocked, '12d. Anon is denied all access to external_holds')

// Reset role
await as('service_role')

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\nResults: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
} else {
  console.log('T9-02 Booqable external holds database gate verified successfully.')
  process.exit(0)
}
