#!/usr/bin/env node
/**
 * scripts/test-partial-return-reservation-release.mjs
 *
 * Acceptance test suite for RULING 2026-10-24 & Migration 0174:
 * Release reservations on verified physical return.
 *
 * Verifies:
 * 1. Partial return releases verified usable unit hold in inventory_reservations.
 * 2. Unreturned units on the same booking remain held.
 * 3. Overlapping booking rejects unreturned unit (GiST exclusion 23P01).
 * 4. Available returned unit can be reserved by overlapping booking.
 * 5. Pending cleaning queue entry does not block reservation of usable unit.
 * 6. QC defect blocks new reservation (GATE:unit.reserve.qc_defect).
 * 7. Active damage finding blocks new reservation (GATE:unit.reserve.damage_finding).
 * 8. Authoritative repair record / finding resolution clears defect hold.
 * 9. Rollback on failed persistence keeps reservation intact.
 * 10. Signed-in role checks enforce return permissions.
 */

import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })
const sql = (statement, params = []) => db.query(statement, params)

console.log('Bootstrapping PGlite database and migrations 0001 through 0174...')
await db.exec(readFileSync(join(ROOT, 'supabase/pglite-prelude.sql'), 'utf8'))
const migrationDir = join(ROOT, 'supabase/migrations')
for (const file of readdirSync(migrationDir).filter(f => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(join(migrationDir, file), 'utf8'))
}
console.log('Migrations applied successfully. Setting up test fixtures...')

// Fixtures
const ownerId = '00000000-0000-0000-0000-000000000901'
const warehouseId = '00000000-0000-0000-0000-000000000905'
const driverId = '00000000-0000-0000-0000-000000000902'

let branch = (await sql('select id from branches order by created_at limit 1')).rows[0]?.id
if (!branch) {
  const bRes = await sql(`insert into branches (client_uuid, branch_code, name, address, phone, email, pan_vat_no, is_headquarters, is_active)
    values (gen_random_uuid(), 'BR-KTM', 'Kathmandu HQ', 'Kathmandu', '+977-1-4444444', 'hq@babinrentals.com', '123456789', true, true) returning id`)
  branch = bRes.rows[0].id
}

// Users
await sql(`insert into users
  (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
  values ($1, gen_random_uuid(), 'EMP-OWNER-901', 'owner-test@babinrentals.com', 'Owner Tester', '+977-9800000901', 'Owner', $2, true, $1)
  on conflict (id) do update set primary_role = 'Owner'`, [ownerId, branch])

await sql(`insert into users
  (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
  values ($1, gen_random_uuid(), 'EMP-WH-905', 'wh-test@babinrentals.com', 'Warehouse Tester', '+977-9800000905', 'Warehouse', $2, true, $1)
  on conflict (id) do update set primary_role = 'Warehouse'`, [warehouseId, branch])

await sql(`insert into users
  (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
  values ($1, gen_random_uuid(), 'EMP-DRIVER-902', 'driver-test@babinrentals.com', 'Driver Tester', '+977-9800000902', 'Driver', $2, true, $1)
  on conflict (id) do update set primary_role = 'Driver'`, [driverId, branch])

let warehouse = (await sql('select id from warehouses where branch_id = $1 limit 1', [branch])).rows[0]?.id
if (!warehouse) {
  const wRes = await sql(`insert into warehouses (client_uuid, branch_id, warehouse_code, name)
    values (gen_random_uuid(), $1, 'WH-MAIN', 'Main Kathmandu Vault') returning id`, [branch])
  warehouse = wRes.rows[0].id
}

let client = (await sql('select id from clients order by created_at limit 1')).rows[0]?.id
if (!client) {
  const cRes = await sql(`insert into clients (client_uuid, name, type_parent, contact_person, phone, created_by)
    values (gen_random_uuid(), 'Sagarmatha Productions', 'Business', 'Nima Sherpa', '+977-9812345678', $1) returning id`, [ownerId])
  client = cRes.rows[0].id
}

const category = (await sql('select id from inventory_categories order by name limit 1')).rows[0]?.id

// Serialized test product
const prodRes = await sql(`insert into products
  (client_uuid, name, brand, category_id, tracking_mode, asset_code, total_quantity, daily_rate, created_by)
  values (gen_random_uuid(), 'Sony FX6 Cinema Camera', 'Sony', $1, 'Serialised', 'EQ000999', 2, 1500000, $2) returning id`,
  [category, ownerId])
const productId = prodRes.rows[0].id

// Two units: Unit A and Unit B
const uResA = await sql(`insert into product_units
  (client_uuid, product_id, serial_no, asset_tag, branch_id, warehouse_id, status, condition, created_by)
  values (gen_random_uuid(), $1, 'SN-FX6-ALPHA', 'FX6-001', $2, $3, 'In Stock', 'Good', $4) returning id`,
  [productId, branch, warehouse, ownerId])
const unitA = uResA.rows[0].id

const uResB = await sql(`insert into product_units
  (client_uuid, product_id, serial_no, asset_tag, branch_id, warehouse_id, status, condition, created_by)
  values (gen_random_uuid(), $1, 'SN-FX6-BETA', 'FX6-002', $2, $3, 'In Stock', 'Good', $4) returning id`,
  [productId, branch, warehouse, ownerId])
const unitB = uResB.rows[0].id

let assertionsPassed = 0
const assert = (condition, message) => {
  if (!condition) {
    console.error(`FAIL: ${message}`)
    process.exit(1)
  }
  console.log(`  PASS: ${message}`)
  assertionsPassed++
}

console.log('\n--- 1. Create Booking 1 with Unit A and Unit B On Rent ---')
const b1Start = '2026-11-01T04:00:00Z'
const b1End = '2026-11-05T04:00:00Z'

const bRes1 = await sql(`insert into bookings
  (client_uuid, booking_no, client_id, branch_id, pickup_at, return_at, delivery_type, stage, created_by, updated_by)
  values (gen_random_uuid(), '9001', $1, $2, $3, $4, 'Client Pickup', 'Quote', $5, $5) returning id`,
  [client, branch, b1Start, b1End, ownerId])
const booking1 = bRes1.rows[0].id

async function asUser(userId) {
  await sql('select set_config($1, $2, false)', ['app.current_user_id', userId])
  await sql('select set_config($1, $2, false)', ['request.jwt.claim.sub', userId])
}

await asUser(ownerId)

const lRes1 = await sql(`insert into booking_lines
  (client_uuid, booking_id, product_id, line_type, qty, description, rate, days, created_by)
  values (gen_random_uuid(), $1, $2, 'Equipment', 2, '2x Sony FX6', 0, 4, $3) returning id`,
  [booking1, productId, ownerId])
const line1 = lRes1.rows[0].id

const bluResA = await sql(`insert into booking_line_units
  (client_uuid, booking_line_id, asset_id, qty, unit_state, created_by)
  values (gen_random_uuid(), $1, $2, 1, 'Ready', $3) returning id`,
  [line1, unitA, ownerId])
const bluA = bluResA.rows[0].id

const bluResB = await sql(`insert into booking_line_units
  (client_uuid, booking_line_id, asset_id, qty, unit_state, created_by)
  values (gen_random_uuid(), $1, $2, 1, 'Ready', $3) returning id`,
  [line1, unitB, ownerId])
const bluB = bluResB.rows[0].id

// Transition to Booked (this writes the inventory_reservations rows)
await sql(`insert into booking_stage_transitions
  (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role)
  values (gen_random_uuid(), $1, $2, 'Quote', 'Booked', $3, 'Owner')`,
  [booking1, branch, ownerId])

// Pack session & movements
const packSessionId = (await sql(`insert into operation_sessions
  (client_uuid, booking_id, operation, session_no, state, warehouse_staff_id, created_by)
  values (gen_random_uuid(), $1, 'Packing', 1, 'In Progress', $2, $2) returning id`,
  [booking1, ownerId])).rows[0].id

await sql(`insert into session_line_movements
  (client_uuid, session_id, booking_line_id, unit_id, serial, qty, moved_at, created_by)
  values (gen_random_uuid(), $1, $2, $3, 'SN-FX6-ALPHA', 1, now(), $4)`,
  [packSessionId, line1, unitA, ownerId])

await sql(`insert into session_line_movements
  (client_uuid, session_id, booking_line_id, unit_id, serial, qty, moved_at, created_by)
  values (gen_random_uuid(), $1, $2, $3, 'SN-FX6-BETA', 1, now(), $4)`,
  [packSessionId, line1, unitB, ownerId])

await sql(`update booking_line_units set packed = true, packed_at = now(), packed_by = $1, packing_session_id = $2 where booking_line_id = $3`, [ownerId, packSessionId, line1])

await sql(`insert into booking_stage_transitions
  (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role)
  values (gen_random_uuid(), $1, $2, 'Booked', 'Packed', $3, 'Owner')`,
  [booking1, branch, ownerId])

await sql(`update operation_sessions set state = 'Completed' where id = $1`, [packSessionId])

// Handover session & signature
const handoverSessionId = (await sql(`insert into operation_sessions
  (client_uuid, booking_id, operation, session_no, state, delivery_method, warehouse_staff_id, created_by)
  values (gen_random_uuid(), $1, 'Handover', 1, 'In Progress', 'Client Pickup', $2, $2) returning id`,
  [booking1, ownerId])).rows[0].id

await sql(`insert into handover_lines
  (client_uuid, booking_line_id, state, qty_required, first_session_id, completed_session_id, created_by)
  values (gen_random_uuid(), $1, 'Picked Up', 2, $2, $2, $3)`,
  [line1, handoverSessionId, ownerId])

await sql(`insert into signatures
  (client_uuid, session_id, signature_role, signer_name, signed_at, device, is_required, created_by)
  values (gen_random_uuid(), $1, 'Receiver', 'Nima Sherpa', now(), 'iPad-Ops-1', true, $2)`,
  [handoverSessionId, ownerId])

await sql(`insert into booking_stage_transitions
  (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role)
  values (gen_random_uuid(), $1, $2, 'Packed', 'On Rent', $3, 'Owner')`,
  [booking1, branch, ownerId])

await sql(`update operation_sessions set state = 'Completed' where id = $1`, [handoverSessionId])
await sql(`update booking_line_units set unit_state = 'Picked Up', handover_session_id = $1 where booking_line_id = $2`, [handoverSessionId, line1])

const activeHoldsBefore = (await sql(`select asset_id from inventory_reservations where booking_id = $1 and released_at is null`, [booking1])).rows
assert(activeHoldsBefore.length === 2, 'Booking 1 holds both Unit A and Unit B upon reaching On Rent')
assert(activeHoldsBefore.some(r => r.asset_id === unitA), 'Unit A has active reservation hold')
assert(activeHoldsBefore.some(r => r.asset_id === unitB), 'Unit B has active reservation hold')

await sql(`select recompute_unit_status($1)`, [unitA])
await sql(`select recompute_unit_status($1)`, [unitB])
const statusA1 = (await sql(`select status from product_units where id = $1`, [unitA])).rows[0].status
const statusB1 = (await sql(`select status from product_units where id = $1`, [unitB])).rows[0].status
assert(statusA1 === 'On Rent', 'Unit A status is On Rent in inventory engine')
assert(statusB1 === 'On Rent', 'Unit B status is On Rent in inventory engine')

console.log('\n--- 2. Partial Return: Return Unit A only ---')
const returnTime = new Date().toISOString()
await sql(`update booking_line_units
  set returned_at = $1, unit_state = 'Returned', condition = 'Good'
  where id = $2`, [returnTime, bluA])

// Assert parent booking is still On Rent
const b1Stage = (await sql(`select stage from bookings where id = $1`, [booking1])).rows[0].stage
assert(b1Stage === 'On Rent', 'Parent Booking 1 remains On Rent after partial return')

// Assert Unit A hold is RELEASED
const holdA = (await sql(`select released_at, released_reason from inventory_reservations where booking_line_id = $1 and asset_id = $2`, [line1, unitA])).rows[0]
assert(holdA.released_at !== null, 'Unit A reservation hold was released by trigger upon physical return')
assert(holdA.released_reason.includes('physically returned'), `Unit A carry release reason: ${holdA.released_reason}`)

// Assert Unit B hold remains ACTIVE
const holdB = (await sql(`select released_at from inventory_reservations where booking_line_id = $1 and asset_id = $2`, [line1, unitB])).rows[0]
assert(holdB.released_at === null, 'Unit B reservation hold remains ACTIVE on Booking 1')

// Recompute status for Unit A
await sql(`select recompute_unit_status($1)`, [unitA])
const statusAAfterReturn = (await sql(`select status from product_units where id = $1`, [unitA])).rows[0].status
assert(statusAAfterReturn !== 'On Rent', `Unit A is no longer On Rent (status is ${statusAAfterReturn})`)

console.log('\n--- 3. Overlapping Booking: Attempt to reserve unreturned Unit B (Must fail 23P01) ---')
const b2Start = '2026-11-02T04:00:00Z'
const b2End = '2026-11-04T04:00:00Z'

const bRes2 = await sql(`insert into bookings
  (client_uuid, booking_no, client_id, branch_id, pickup_at, return_at, delivery_type, stage, created_by, updated_by)
  values (gen_random_uuid(), '9002', $1, $2, $3, $4, 'Client Pickup', 'Quote', $5, $5) returning id`,
  [client, branch, b2Start, b2End, ownerId])
const booking2 = bRes2.rows[0].id

const lRes2 = await sql(`insert into booking_lines
  (client_uuid, booking_id, product_id, line_type, qty, description, rate, days, created_by)
  values (gen_random_uuid(), $1, $2, 'Equipment', 1, '1x Sony FX6', 0, 2, $3) returning id`,
  [booking2, productId, ownerId])
const line2 = lRes2.rows[0].id

let gistError = null
try {
  await sql(`insert into inventory_reservations
    (client_uuid, booking_id, booking_line_id, asset_id, period, created_by)
    values (gen_random_uuid(), $1, $2, $3, tstzrange($4::timestamptz, $5::timestamptz, '[)'), $6)`,
    [booking2, line2, unitB, b2Start, b2End, ownerId])
} catch (err) {
  gistError = err
}
assert(gistError !== null, 'Attempting to reserve unreturned Unit B was rejected')
assert(gistError?.code === '23P01', `Rejection was GiST double-booking exclusion constraint 23P01 (${gistError?.message})`)

console.log('\n--- 4. Overlapping Booking: Reserve returned usable Unit A (Must succeed) ---')
let reserveAError = null
let resARow = null
try {
  const r = await sql(`insert into inventory_reservations
    (client_uuid, booking_id, booking_line_id, asset_id, period, created_by)
    values (gen_random_uuid(), $1, $2, $3, tstzrange($4::timestamptz, $5::timestamptz, '[)'), $6) returning id`,
    [booking2, line2, unitA, b2Start, b2End, ownerId])
  resARow = r.rows[0]
} catch (err) {
  reserveAError = err
}
assert(reserveAError === null, `Returned usable Unit A reserved without error: ${reserveAError?.message}`)
assert(resARow?.id !== undefined, 'Returned Unit A successfully minted new overlapping reservation hold')

// Clean up reservation for Unit A from Booking 2 before testing task gates
await sql(`delete from inventory_reservations where id = $1`, [resARow.id])

console.log('\n--- 5. Pending Cleaning Queue does NOT block reservation ---')
const cqeRes = await sql(`insert into cleaning_queue_entries
  (client_uuid, booking_id, unit_id, requires_clean, requires_reset, state, created_by)
  values (gen_random_uuid(), $1, $2, true, true, 'Waiting', $3) returning id`,
  [booking1, unitA, ownerId])
const cqeId = cqeRes.rows[0].id

// Recompute status
await sql(`select recompute_unit_status($1)`, [unitA])
const statusACleaning = (await sql(`select status from product_units where id = $1`, [unitA])).rows[0].status
assert(statusACleaning === 'Cleaning', 'Unit A is in Cleaning queue status')

// Attempt reservation while in cleaning
let cleanReserveError = null
try {
  await sql(`insert into inventory_reservations
    (client_uuid, booking_id, booking_line_id, asset_id, period, created_by)
    values (gen_random_uuid(), $1, $2, $3, tstzrange($4::timestamptz, $5::timestamptz, '[)'), $6)`,
    [booking2, line2, unitA, b2Start, b2End, ownerId])
} catch (err) {
  cleanReserveError = err
}
assert(cleanReserveError === null, 'Pending cleaning does NOT block reserving usable Unit A (Ruling 2026-10-24)')

// Remove booking 2 hold for next checks
await sql(`delete from inventory_reservations where booking_id = $1`, [booking2])

console.log('\n--- 6. QC Defect DOES block reservation ---')
await sql(`update cleaning_queue_entries
  set qc_fail_reason = 'Optical alignment out of tolerance', problem_state = 'Needs Repair'
  where id = $1`, [cqeId])

let qcError = null
try {
  await sql(`insert into inventory_reservations
    (client_uuid, booking_id, booking_line_id, asset_id, period, created_by)
    values (gen_random_uuid(), $1, $2, $3, tstzrange($4::timestamptz, $5::timestamptz, '[)'), $6)`,
    [booking2, line2, unitA, b2Start, b2End, ownerId])
} catch (err) {
  qcError = err
}
assert(qcError !== null, 'QC defect blocks reservation')
assert(qcError?.message.includes('GATE:unit.reserve.qc_defect'), `Threw expected QC defect gate: ${qcError?.message}`)

console.log('\n--- 7. Damage Finding blocks reservation until cleared ---')
// Clear QC failure on queue entry first
await sql(`update cleaning_queue_entries
  set qc_fail_reason = null, problem_state = 'No Problems', reset_completed_at = now()
  where id = $1`, [cqeId])

// Add damage finding from Cleaning inspection
const dfRes = await sql(`insert into damage_findings
  (client_uuid, source, cleaning_queue_entry_id, unit_id, damage_type, description, severity, created_by)
  values (gen_random_uuid(), 'Cleaning', $1, $2, 'Damaged', 'Cracked LCD hinge', 'High', $3) returning id`,
  [cqeId, unitA, ownerId])
const findingId = dfRes.rows[0].id

let dfError = null
try {
  await sql(`insert into inventory_reservations
    (client_uuid, booking_id, booking_line_id, asset_id, period, created_by)
    values (gen_random_uuid(), $1, $2, $3, tstzrange($4::timestamptz, $5::timestamptz, '[)'), $6)`,
    [booking2, line2, unitA, b2Start, b2End, ownerId])
} catch (err) {
  dfError = err
}
assert(dfError !== null, 'Active damage finding blocks reservation')
assert(dfError?.message.includes('GATE:unit.reserve.damage_finding'), `Threw expected damage finding gate: ${dfError?.message}`)

console.log('\n--- 8. Authoritative Repair / Voiding clears defect hold ---')
// Void the finding
await sql(`update damage_findings set voided_at = now() where id = $1`, [findingId])

let clearReserveError = null
let clearHoldId = null
try {
  const r = await sql(`insert into inventory_reservations
    (client_uuid, booking_id, booking_line_id, asset_id, period, created_by)
    values (gen_random_uuid(), $1, $2, $3, tstzrange($4::timestamptz, $5::timestamptz, '[)'), $6) returning id`,
    [booking2, line2, unitA, b2Start, b2End, ownerId])
  clearHoldId = r.rows[0].id
} catch (err) {
  clearReserveError = err
}
assert(clearReserveError === null, 'After authoritative clearance, Unit A can be reserved')
assert(clearHoldId !== null, 'Reservation succeeded after clearance')

// Clean up
await sql(`delete from inventory_reservations where id = $1`, [clearHoldId])

console.log('\n--- 9. Atomic Transaction Rollback preserves reservation hold ---')
// Reset Unit A returned_at to null to test rollback
await sql(`update booking_line_units set returned_at = null, unit_state = 'Picked Up' where id = $1`, [bluA])
await sql(`update inventory_reservations set released_at = null, released_reason = null where booking_line_id = $1 and asset_id = $2`, [line1, unitA])

// Begin subtransaction that fails
try {
  await sql('BEGIN')
  await sql(`update booking_line_units set returned_at = now() where id = $1`, [bluA])
  // Force an error to trigger rollback
  await sql(`select * from nonexistent_table_forcing_rollback`)
  await sql('COMMIT')
} catch (err) {
  await sql('ROLLBACK')
}

const holdAfterRollback = (await sql(`select released_at from inventory_reservations where booking_line_id = $1 and asset_id = $2`, [line1, unitA])).rows[0]
assert(holdAfterRollback.released_at === null, 'Failed transaction rollback leaves reservation hold active')

console.log('\n--- 10. Role-gated write check on booking_line_units ---')
// Set role authenticated as Driver (read-only for booking_line_units)
await sql(`set role authenticated`)
await asUser(driverId)

const driverRes = await sql(`update booking_line_units set returned_at = now() where id = $1`, [bluA])
assert(driverRes.affectedRows === 0, 'Driver role cannot update booking_line_units (0 rows updated due to RLS)')

// Reset session to table owner
await sql(`reset role`)
await asUser(ownerId)

const checkBlu = (await sql(`select returned_at from booking_line_units where id = $1`, [bluA])).rows[0]
assert(checkBlu.returned_at === null, 'Driver update was filtered out by RLS and did not modify returned_at')

console.log(`\n========================================`)
console.log(`All ${assertionsPassed} partial return acceptance assertions PASSED (0 failures)!`)
console.log(`========================================`)
await db.close()
