#!/usr/bin/env node
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

console.log('====================================================================')
console.log('SYSTEM DESIGN CONSISTENCY & INTEGRITY AUDIT SUITE (PGlite)')
console.log('====================================================================')

const HERE = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS = join(HERE, '..', 'supabase', 'migrations')
const PRELUDE_PATH = join(HERE, '..', 'supabase', 'pglite-prelude.sql')

const db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })

// 1. Run prelude
await db.exec(readFileSync(PRELUDE_PATH, 'utf8'))

// 2. Apply all migrations in order
const files = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()
for (const file of files) {
  const sql = readFileSync(join(MIGRATIONS, file), 'utf8')
  try {
    await db.exec(sql)
  } catch (err) {
    console.error(`Migration ${file} failed:`, err.message)
    process.exit(1)
  }
}
console.log(`✓ Applied all ${files.length} migrations in PGlite.`)

let passed = 0
let failed = 0
function assertCheck(cond, name, detail = '') {
  if (cond) {
    console.log(`[PASS] ${name}`)
    passed++
  } else {
    console.error(`[FAIL] ${name} ${detail}`)
    failed++
  }
}

// Setup base test fixtures
const branchId = (await db.query(`select id from branches order by created_at limit 1;`)).rows[0].id
const clients = (await db.query(`select id from clients order by created_at limit 2;`)).rows
const clientA = clients[0].id
const clientB = clients[1].id

// Roles / Users setup
const ownerId = '10000000-0000-0000-0000-000000000001'
const coordinatorId = '10000000-0000-0000-0000-000000000002'
const warehouseId = '10000000-0000-0000-0000-000000000003'
const technicianId = '10000000-0000-0000-0000-000000000004'
const driverId = '10000000-0000-0000-0000-000000000005'
const clientUserId = '10000000-0000-0000-0000-000000000006'

await db.query(`
  insert into users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
  values
    ($1, gen_random_uuid(), 'EMP-O1', 'owner1@test.com', 'Test Owner', '+977-9800000001', 'Owner', $7, true, $1),
    ($2, gen_random_uuid(), 'EMP-C1', 'coord1@test.com', 'Test Coord', '+977-9800000002', 'Coordinator', $7, true, $1),
    ($3, gen_random_uuid(), 'EMP-W1', 'wh1@test.com', 'Test WH', '+977-9800000003', 'Warehouse', $7, true, $1),
    ($4, gen_random_uuid(), 'EMP-T1', 'tech1@test.com', 'Test Tech', '+977-9800000004', 'Technician', $7, true, $1),
    ($5, gen_random_uuid(), 'EMP-D1', 'driver1@test.com', 'Test Driver', '+977-9800000005', 'Driver', $7, true, $1),
    ($6, gen_random_uuid(), 'EMP-CL1', 'clientuser@test.com', 'Test ClientUser', '+977-9800000006', 'Client', $7, true, $1)
  on conflict (id) do nothing;
`, [ownerId, coordinatorId, warehouseId, technicianId, driverId, clientUserId, branchId])

// Get 1 serialised product with at least 2 units
const serialProd = (await db.query(`
  select p.id, count(pu.id)::int as unit_count
    from products p
    join product_units pu on pu.product_id = p.id
   where p.tracking_mode = 'Serialised'
   group by p.id
  having count(pu.id) >= 2
   limit 1;
`)).rows[0]

const serialUnits = (await db.query(`
  select id from product_units where product_id = $1 order by id limit 2;
`, [serialProd.id])).rows.map(r => r.id)

// Create a dedicated quantity-tracked product with total_quantity = 5
const catId = (await db.query(`select id from inventory_categories limit 1;`)).rows[0].id
const qtyProdId = '20000000-0000-0000-0000-000000000001'
await db.query(`
  insert into products (id, client_uuid, asset_code, name, category_id, brand, tracking_mode, total_quantity, is_active, created_by)
  values ($1, gen_random_uuid(), 'EQ990001', 'Audit Qty Cable', $2, 'TestBrand', 'Quantity', 5, true, $3)
  on conflict (id) do nothing;
`, [qtyProdId, catId, ownerId])

const asUser = async (userId) => {
  await db.exec(`select set_config('app.current_user_id', '${userId}', false);`)
}
await asUser(ownerId)

let bookingSeq = 985000
async function createTestBooking(opts) {
  await asUser(ownerId)
  const no = String(++bookingSeq)
  const pickup = opts.pickup ?? '2027-05-01 06:00:00+05:45'
  const ret = opts.return ?? '2027-05-05 06:00:00+05:45'
  const client = opts.clientId ?? clientA
  const projType = opts.projectType ?? 'Commercial / Advertisement'

  const bRes = await db.query(`
    insert into bookings (client_uuid, booking_no, client_id, branch_id, pickup_at, return_at, stage, delivery_type, project_type, created_by, updated_by)
    values (gen_random_uuid(), $1, $2, $3, $4, $5, 'Quote', 'Client Pickup', $6, $7, $7)
    returning id, booking_no;
  `, [no, client, branchId, pickup, ret, projType, opts.actorId ?? ownerId])
  const bId = bRes.rows[0].id

  // Add line
  const lRes = await db.query(`
    insert into booking_lines (client_uuid, booking_id, line_type, product_id, description, qty, days, rate, created_by)
    values (gen_random_uuid(), $1, 'Equipment', $2, 'Test Line', $3, 1, 500, $4)
    returning id;
  `, [bId, opts.productId ?? serialProd.id, opts.qty ?? 1, opts.actorId ?? ownerId])
  const lId = lRes.rows[0].id

  if (opts.unitId) {
    await db.query(`
      insert into booking_line_units (client_uuid, booking_line_id, asset_id, qty, created_by)
      values (gen_random_uuid(), $1, $2, 1, $3);
    `, [lId, opts.unitId, opts.actorId ?? ownerId])
  }

  return { bookingId: bId, lineId: lId, bookingNo: no }
}

async function confirmViaTransition(bId, actor = ownerId, role = 'Owner') {
  await db.exec(`reset role; select set_config('app.current_user_id', '${actor}', false); set role authenticated;`)
  try {
    await db.query(`
      insert into booking_stage_transitions (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role)
      values (gen_random_uuid(), $1, $2, 'Quote', 'Booked', $3, $4);
    `, [bId, branchId, actor, role])
    await db.exec(`reset role; select set_config('app.current_user_id', '${ownerId}', false);`)
    return { ok: true }
  } catch (err) {
    await db.exec(`reset role; select set_config('app.current_user_id', '${ownerId}', false);`)
    return { ok: false, error: err.message }
  }
}

async function confirmViaAtomicRpc(bId, actor = ownerId) {
  await db.exec(`reset role; select set_config('app.current_user_id', '${actor}', false); set role authenticated;`)
  try {
    const res = await db.query(`
      select confirm_booking_atomic($1, $2, gen_random_uuid(), now(), 'Atomic confirm') as res;
    `, [bId, actor])
    await db.exec(`reset role; select set_config('app.current_user_id', '${ownerId}', false);`)
    return { ok: true, data: res.rows[0].res }
  } catch (err) {
    await db.exec(`reset role; select set_config('app.current_user_id', '${ownerId}', false);`)
    return { ok: false, error: err.message }
  }
}

console.log('\n--- PRIORITY 0: BOOKING, HOLD & AVAILABILITY CONSISTENCY ---')

// ---------------------------------------------------------------------------
// Case 0.1: Booking A (Draft 5 days) vs Booking B (Confirmed 1 day inside A's interval)
// ---------------------------------------------------------------------------
console.log('\nProbe 0.1: Overlapping Draft vs Confirmed Interval')
// Booking A: 5 days on unit 0
const bA = await createTestBooking({
  pickup: '2027-05-01 06:00:00+05:45',
  return: '2027-05-06 06:00:00+05:45',
  unitId: serialUnits[0]
})
// Booking B: 1 day within A (2027-05-02 to 2027-05-03) on same unit 0
const bB = await createTestBooking({
  pickup: '2027-05-02 06:00:00+05:45',
  return: '2027-05-03 06:00:00+05:45',
  unitId: serialUnits[0]
})

// Booking B confirms first
const bBConfirm = await confirmViaTransition(bB.bookingId)
assertCheck(bBConfirm.ok, 'Booking B confirms successfully within A interval')

// Check stages
const stageA1 = (await db.query(`select stage from bookings where id = $1`, [bA.bookingId])).rows[0].stage
const stageB1 = (await db.query(`select stage from bookings where id = $1`, [bB.bookingId])).rows[0].stage
assertCheck(stageA1 === 'Quote', 'Booking A remains Quote while B is confirmed')
assertCheck(stageB1 === 'Booked', 'Booking B moved to Booked')

// Booking A now attempts confirmation -> must fail whole without partial holds
const bAConfirm = await confirmViaTransition(bA.bookingId)
assertCheck(!bAConfirm.ok && bAConfirm.error.includes('inventory_reservations_no_double_booking'),
  'Booking A confirmation refused by exclusion constraint', bAConfirm.error)

const stageA2 = (await db.query(`select stage from bookings where id = $1`, [bA.bookingId])).rows[0].stage
assertCheck(stageA2 === 'Quote', 'Booking A is still Quote after failed confirmation')

const aHolds = (await db.query(`select count(*)::int as cnt from inventory_reservations where booking_id = $1`, [bA.bookingId])).rows[0].cnt
assertCheck(aHolds === 0, 'No partial reservations recorded for refused Booking A')

// ---------------------------------------------------------------------------
// Case 0.2: Two Simultaneous / Competing Confirmations of the Last Unit
// ---------------------------------------------------------------------------
console.log('\nProbe 0.2: Contending Confirmations for the Last Unit')
const bC1 = await createTestBooking({
  pickup: '2027-05-10 06:00:00+05:45',
  return: '2027-05-12 06:00:00+05:45',
  unitId: serialUnits[0]
})
const bC2 = await createTestBooking({
  pickup: '2027-05-10 06:00:00+05:45',
  return: '2027-05-12 06:00:00+05:45',
  unitId: serialUnits[0]
})

const conf1 = await confirmViaTransition(bC1.bookingId)
const conf2 = await confirmViaTransition(bC2.bookingId)

assertCheck(conf1.ok !== conf2.ok && (conf1.ok || conf2.ok),
  'Exactly one confirmation succeeds and one fails for contending unit')

const liveHoldsC = (await db.query(`
  select count(*)::int as cnt from inventory_reservations
   where asset_id = $1 and released_at is null
     and period && tstzrange('2027-05-10 06:00:00+05:45', '2027-05-12 06:00:00+05:45')
`, [serialUnits[0]])).rows[0].cnt
assertCheck(liveHoldsC === 1, 'Exactly 1 live reservation row exists for the contended period')

// ---------------------------------------------------------------------------
// Case 0.3: Temporary Active Holds vs Expired Holds
// ---------------------------------------------------------------------------
console.log('\nProbe 0.3: Temporary Holds (Active blocks, Expired reclaimable)')
const bHold1 = await createTestBooking({
  pickup: '2027-06-01 06:00:00+05:45',
  return: '2027-06-04 06:00:00+05:45',
  unitId: serialUnits[0]
})

// Create active hold on unit 0 for 240 minutes
const holdRes = await db.query(`
  select create_or_extend_hold(
    $1, $2, $3, null, 1, null, 240, gen_random_uuid(), $4
  ) as res;
`, [bHold1.bookingId, bHold1.lineId, serialUnits[0], ownerId])
const holdId = holdRes.rows[0].res.reservation_id
assertCheck(holdRes.rows[0].res.success === true, 'Temporary hold created successfully')

// Competing booking tries to confirm during active hold
const bCompeting = await createTestBooking({
  pickup: '2027-06-02 06:00:00+05:45',
  return: '2027-06-03 06:00:00+05:45',
  unitId: serialUnits[0]
})
const compConf = await confirmViaTransition(bCompeting.bookingId)
assertCheck(!compConf.ok && compConf.error.includes('inventory_reservations_no_double_booking'),
  'Active hold successfully blocks competing booking confirmation')

// Now simulate hold expiry: manually set expires_at in the past
await db.query(`
  update inventory_reservations set expires_at = now() - interval '1 hour' where id = $1;
`, [holdId])

// Path A: Competing booking attempts confirmation via confirm_booking_atomic
// confirm_booking_atomic Step 5 explicitly reclaims expired holds!
const compAtomicConf = await confirmViaAtomicRpc(bCompeting.bookingId)
if (!compAtomicConf.ok) console.log('DEBUG Probe 0.3 compAtomicConf error:', compAtomicConf.error)
assertCheck(compAtomicConf.ok, 'confirm_booking_atomic reclaims expired hold and successfully confirms competing booking', compAtomicConf.error)

const holdStateAfter = (await db.query(`select hold_state, released_at from inventory_reservations where id = $1`, [holdId])).rows[0]
assertCheck(holdStateAfter?.hold_state === 'expired_hold' && holdStateAfter?.released_at !== null,
  'Expired hold was reclaimed and marked expired_hold with released_at timestamp')

// ---------------------------------------------------------------------------
// Case 0.4: Booking Confirming With Its Own Prior Active Hold
// ---------------------------------------------------------------------------
console.log('\nProbe 0.4: Booking Confirming Its Own Prior Active Hold')
const bOwnHold = await createTestBooking({
  pickup: '2027-06-10 06:00:00+05:45',
  return: '2027-06-15 06:00:00+05:45',
  unitId: serialUnits[0]
})
const ownHoldRes = await db.query(`
  select create_or_extend_hold(
    $1, $2, $3, null, 1, null, 240, gen_random_uuid(), $4
  ) as res;
`, [bOwnHold.bookingId, bOwnHold.lineId, serialUnits[0], ownerId])
const ownHoldId = ownHoldRes.rows[0].res.reservation_id

// Confirm via confirm_booking_atomic: Step 6 converts active_hold -> confirmed
const ownConf = await confirmViaAtomicRpc(bOwnHold.bookingId)
if (!ownConf.ok) console.log('DEBUG Probe 0.4 ownConf error:', ownConf.error)
assertCheck(ownConf.ok, 'confirm_booking_atomic converts own active hold to confirmed seamlessly', ownConf.error)

const ownHoldFinal = (await db.query(`select hold_state, expires_at from inventory_reservations where id = $1`, [ownHoldId])).rows[0]
assertCheck(ownHoldFinal.hold_state === 'confirmed' && ownHoldFinal.expires_at === null,
  'Own hold transitioned from active_hold to confirmed without duplication or self-collision')

// ---------------------------------------------------------------------------
// Case 0.5: Capacity & Peak Concurrent Quantity
// ---------------------------------------------------------------------------
console.log('\nProbe 0.5: Quantity Inventory Capacity & Peak Occupancy')
// Dedicated Quantity Product has capacity 5.
// Booking Q1: 2027-07-01 to 2027-07-04, qty 3
const bQ1 = await createTestBooking({
  pickup: '2027-07-01 06:00:00+05:45',
  return: '2027-07-04 06:00:00+05:45',
  productId: qtyProdId,
  qty: 3
})
await confirmViaTransition(bQ1.bookingId)

// Booking Q2: non-overlapping: 2027-07-05 to 2027-07-08, qty 4
const bQ2 = await createTestBooking({
  pickup: '2027-07-05 06:00:00+05:45',
  return: '2027-07-08 06:00:00+05:45',
  productId: qtyProdId,
  qty: 4
})
const confQ2 = await confirmViaTransition(bQ2.bookingId)
assertCheck(confQ2.ok, 'Non-overlapping quantity booking accepted even though sum(3+4=7) > capacity(5)')

// Booking Q3: overlapping with Q1: 2027-07-02 to 2027-07-03, qty 3
// Peak would be 3 (from Q1) + 3 (from Q3) = 6 > 5. Must fail.
const bQ3 = await createTestBooking({
  pickup: '2027-07-02 06:00:00+05:45',
  return: '2027-07-03 06:00:00+05:45',
  productId: qtyProdId,
  qty: 3
})
const confQ3 = await confirmViaTransition(bQ3.bookingId)
assertCheck(!confQ3.ok && confQ3.error.includes('stock on hand is 5'),
  'Overlapping quantity booking exceeding peak capacity refused', confQ3.error)

// ---------------------------------------------------------------------------
// Case 0.6: Asia/Kathmandu 06:00 Half-Open [start, end) Boundaries
// ---------------------------------------------------------------------------
console.log('\nProbe 0.6: Asia/Kathmandu 06:00 Half-Open [start, end) Windows')
// Booking K1 ends at 06:00:00+05:45 on 2027-08-05
const bK1 = await createTestBooking({
  pickup: '2027-08-01 06:00:00+05:45',
  return: '2027-08-05 06:00:00+05:45',
  unitId: serialUnits[1]
})
await confirmViaTransition(bK1.bookingId)

// Booking K2 starts at EXACT SAME instant: 2027-08-05 06:00:00+05:45
const bK2 = await createTestBooking({
  pickup: '2027-08-05 06:00:00+05:45',
  return: '2027-08-10 06:00:00+05:45',
  unitId: serialUnits[1]
})
const confK2 = await confirmViaTransition(bK2.bookingId)
assertCheck(confK2.ok, 'Back-to-back bookings at exactly 06:00 NPT do not collide ([) bounds)')

// ---------------------------------------------------------------------------
// Case 0.7: Refused Reschedule Leaves Dates & Reservations Unchanged
// ---------------------------------------------------------------------------
console.log('\nProbe 0.7: Reschedule Conflict & Rollback')
// bK1 is 2027-08-01 to 2027-08-05 on unit 1
// bK2 is 2027-08-05 to 2027-08-10 on unit 1
// Try to extend bK1 return_at to 2027-08-07 (overlaps bK2)
let updateFailed = false
try {
  await db.query(`
    update bookings set return_at = '2027-08-07 06:00:00+05:45' where id = $1;
  `, [bK1.bookingId])
} catch (err) {
  updateFailed = true
}
assertCheck(updateFailed, 'Reschedule overlapping another booking is refused by trigger')

const bK1Current = (await db.query(`select return_at from bookings where id = $1`, [bK1.bookingId])).rows[0]
const bK1PeriodRow = (await db.query(`select period::text from inventory_reservations where booking_id = $1 and released_at is null`, [bK1.bookingId])).rows[0]
console.log('DEBUG Probe 0.7 bK1PeriodRow:', bK1PeriodRow)
const bK1Period = bK1PeriodRow?.period ?? ''

assertCheck(new Date(bK1Current.return_at).toISOString() === new Date('2027-08-05 06:00:00+05:45').toISOString(),
  'Original booking return_at is preserved after refused reschedule')
assertCheck(bK1Period !== '',
  'Original reservation period exists after refused reschedule')

// ---------------------------------------------------------------------------
// Case 0.8: Database RLS & Authorization as Single Authority
// ---------------------------------------------------------------------------
console.log('\nProbe 0.8: Database Authorization & RLS Role Checks')
const testAuthBooking = async (actor, roleClaim, pickup = '2027-09-01 06:00:00+05:45', ret = '2027-09-02 06:00:00+05:45') => {
  const bTest = await createTestBooking({
    pickup,
    return: ret,
    unitId: serialUnits[0]
  })
  const res = await confirmViaTransition(bTest.bookingId, actor, roleClaim)
  await asUser(ownerId) // restore
  return res
}

const coordRes = await testAuthBooking(coordinatorId, 'Coordinator', '2027-09-01 06:00:00+05:45', '2027-09-02 06:00:00+05:45')
assertCheck(coordRes.ok, 'Coordinator role authorized to confirm booking', coordRes.error)

const whRes = await testAuthBooking(warehouseId, 'Warehouse', '2027-09-03 06:00:00+05:45', '2027-09-04 06:00:00+05:45')
assertCheck(whRes.ok, 'Warehouse role authorized to confirm booking', whRes.error)

// Driver attempting to confirm (unauthorized in booking_stage_transitions_insert policy)
const driverRes = await testAuthBooking(driverId, 'Driver', '2027-09-05 06:00:00+05:45', '2027-09-06 06:00:00+05:45')
assertCheck(!driverRes.ok, 'Driver role rejected from confirming booking by RLS')

// Client attempting to confirm (unauthorized in booking_stage_transitions_insert policy)
const clientAuthRes = await testAuthBooking(clientUserId, 'Client', '2027-09-07 06:00:00+05:45', '2027-09-08 06:00:00+05:45')
assertCheck(!clientAuthRes.ok, 'Client role rejected from confirming booking by RLS')

// Spoofing: Driver passes actor_role = 'Owner' in transition insert
const spoofRes = await testAuthBooking(driverId, 'Owner', '2027-09-09 06:00:00+05:45', '2027-09-10 06:00:00+05:45')
assertCheck(!spoofRes.ok, 'Client-supplied actor_role = "Owner" cannot bypass DB authorization for Driver')

// Technician role checked in confirm_booking_atomic (explicit 42501 gate)
const techBooking = await createTestBooking({
  pickup: '2027-09-11 06:00:00+05:45',
  return: '2027-09-12 06:00:00+05:45',
  unitId: serialUnits[0]
})
const techAtomicRes = await confirmViaAtomicRpc(techBooking.bookingId, technicianId)
assertCheck(!techAtomicRes.ok && techAtomicRes.error.includes('Permission denied: role Technician cannot confirm bookings'),
  'Technician role rejected from confirming by confirm_booking_atomic gate (42501)')

console.log('\n--- PRIORITY 1: PAYMENTS & DOCUMENT INTEGRITY ---')

// ---------------------------------------------------------------------------
// Case 1.1: Duplicate Record-Payment Request Idempotency (Law 8)
// ---------------------------------------------------------------------------
console.log('\nProbe 1.1: Payment Idempotency & Unique Client UUID')
const payBooking = await createTestBooking({
  pickup: '2027-10-01 06:00:00+05:45',
  return: '2027-10-03 06:00:00+05:45',
  unitId: serialUnits[0]
})
await confirmViaTransition(payBooking.bookingId)

// Create invoice for 1000 rupees
const invPRes = await db.query(`
  insert into invoices (
    client_uuid, invoice_no, issue_date, due_date, booking_id, client_id, branch_id, status,
    subtotal, discount_amount, taxable_amount, vat_amount, total_amount,
    paid_amount, outstanding_amount, created_by
  ) values (
    gen_random_uuid(), 'INV-AUDIT-P1', CURRENT_DATE, CURRENT_DATE + 7, $1, $2, $3, 'Sent',
    1000, 0, 1000, 130, 1130, 0, 1130, $4
  ) returning id;
`, [payBooking.bookingId, clientA, branchId, ownerId])
const payInvId = invPRes.rows[0].id

const sharedClientUuid = '30000000-0000-0000-0000-000000000001'
// First insert
await db.query(`
  insert into payments (
    client_uuid, payment_no, booking_id, invoice_id, client_id, branch_id,
    amount, payment_type, payment_date, received_by
  ) values ($1, 'PAY-AUDIT-P1', $2, $3, $4, $5, 500, 'Advance Payment', now(), $6);
`, [sharedClientUuid, payBooking.bookingId, payInvId, clientA, branchId, ownerId])

// Second insert with SAME client_uuid
let duplicateFailed = false
try {
  await db.query(`
    insert into payments (
      client_uuid, payment_no, booking_id, invoice_id, client_id, branch_id,
      amount, payment_type, payment_date, received_by
    ) values ($1, 'PAY-AUDIT-P2', $2, $3, $4, $5, 500, 'Advance Payment', now(), $6);
  `, [sharedClientUuid, payBooking.bookingId, payInvId, clientA, branchId, ownerId])
} catch (err) {
  duplicateFailed = true
}
assertCheck(duplicateFailed, 'Duplicate payment submission with same client_uuid rejected by constraint')

const payRows = (await db.query(`select count(*)::int as cnt from payments where client_uuid = $1`, [sharedClientUuid])).rows[0].cnt
assertCheck(payRows === 1, 'Exactly one payment row persisted')

const invAfterP1 = (await db.query(`select paid_amount, outstanding_amount from invoices where id = $1`, [payInvId])).rows[0]
assertCheck(Number(invAfterP1.paid_amount) === 500 && Number(invAfterP1.outstanding_amount) === 630,
  'Invoice totals reflect single payment (paid: 500, outstanding: 630)')

// ---------------------------------------------------------------------------
// Case 1.2: Overpayment Rejection via Ceiling Trigger
// ---------------------------------------------------------------------------
console.log('\nProbe 1.2: Payment Ceiling Rejection')
let overpayFailed = false
try {
  // Outstanding is 630; attempt to pay 630.02
  await db.query(`
    insert into payments (
      client_uuid, payment_no, booking_id, invoice_id, client_id, branch_id,
      amount, payment_type, payment_date, received_by
    ) values (gen_random_uuid(), 'PAY-AUDIT-OVER', $1, $2, $3, $4, 630.02, 'Advance Payment', now(), $5);
  `, [payBooking.bookingId, payInvId, clientA, branchId, ownerId])
} catch (err) {
  overpayFailed = true
  assertCheck(err.message.includes('gate.payment.over_invoice'), 'Overpayment rejected by gate.payment.over_invoice', err.message)
}
assertCheck(overpayFailed, 'Payment exceeding invoice outstanding amount rejected')

// ---------------------------------------------------------------------------
// Case 1.3: Cross-Client & Cross-Booking Settlement Rejection
// ---------------------------------------------------------------------------
console.log('\nProbe 1.3: Cross-Client / Cross-Booking Settlement Rejection')
let crossClientFailed = false
try {
  await db.query(`
    insert into payments (
      client_uuid, payment_no, booking_id, invoice_id, client_id, branch_id,
      amount, payment_type, payment_date, received_by
    ) values (gen_random_uuid(), 'PAY-AUDIT-CROSS1', $1, $2, $3, $4, 100, 'Advance Payment', now(), $5);
  `, [payBooking.bookingId, payInvId, clientB, branchId, ownerId])
} catch (err) {
  crossClientFailed = true
  assertCheck(err.message.includes('gate.payment.client_mismatch'), 'Cross-client payment rejected', err.message)
}
assertCheck(crossClientFailed, 'Payment with mismatched client_id rejected')

// ---------------------------------------------------------------------------
// Case 1.4: Payment Immutability & Reversal Flow (Law 4)
// ---------------------------------------------------------------------------
console.log('\nProbe 1.4: Payment Immutability & Reversal Flow')
const pRow = (await db.query(`select id, amount from payments where client_uuid = $1`, [sharedClientUuid])).rows[0]

let updatePayFailed = false
try {
  await db.query(`update payments set amount = 600 where id = $1`, [pRow.id])
} catch (err) {
  updatePayFailed = true
}
assertCheck(updatePayFailed, 'Direct UPDATE on payments table rejected by immutability trigger')

let deletePayFailed = false
try {
  await db.query(`delete from payments where id = $1`, [pRow.id])
} catch (err) {
  deletePayFailed = true
}
assertCheck(deletePayFailed, 'Direct DELETE on payments table rejected by immutability trigger')

// Authorized reversal via payment_reversals table
await db.query(`
  insert into payment_reversals (
    client_uuid, reversal_no, original_payment_id, amount, reason, reversed_by, approved_by
  ) values (
    gen_random_uuid(), 'REV-AUDIT-001', $1, $2, 'Customer refund and payment entry correction', $3, $3
  );
`, [pRow.id, pRow.amount, ownerId])

const invAfterRev = (await db.query(`select paid_amount, outstanding_amount from invoices where id = $1`, [payInvId])).rows[0]
assertCheck(Number(invAfterRev.paid_amount) === 0 && Number(invAfterRev.outstanding_amount) === 1130,
  'Invoice recalculated after authorized reversal (paid: 0, outstanding: 1130)')

console.log('\n====================================================================')
console.log(`TOTAL AUDIT CHECKS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`)
console.log('====================================================================\n')

process.exit(failed > 0 ? 1 : 0)
