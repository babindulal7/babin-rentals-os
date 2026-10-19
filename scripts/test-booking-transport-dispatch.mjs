#!/usr/bin/env node
// Verification test for migration 0166: mutate_booking_transport RPC & delivery_transport_v
import { createTestDatabase } from './lib/pglite-test-utils.mjs'

const db = await createTestDatabase()

let failed = 0
const check = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`)
  if (!ok) failed++
}

const fails = async (fn, frag) => {
  try {
    await fn()
  } catch (e) {
    return frag ? e.message.includes(frag) : true
  }
  return false
}

const branchId = (await db.query(`select id from branches order by created_at limit 1`)).rows[0].id
const clientId = (await db.query(`select id from clients order by created_at limit 1`)).rows[0].id

const ids = {
  Owner: '00000000-0000-0000-0000-000000000501',
  Admin: '00000000-0000-0000-0000-000000000502',
  Coordinator: '00000000-0000-0000-0000-000000000503',
  Driver: '00000000-0000-0000-0000-000000000504',
}

for (const [role, id] of Object.entries(ids)) {
  await db.query(
    `insert into users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
     values ($1, gen_random_uuid(), $2, $3, $4, '+977-9800000000', $5, $6, true, $1)
     on conflict (id) do update set primary_role = $5, is_active = true, branch_id = $6`,
    [id, `EMP-T-${role}`, `${role.toLowerCase()}-t@babinrentals.com`, `Test ${role}`, role, branchId],
  )
}

const asUser = (role) =>
  db.exec(
    `reset role;
     select set_config('request.jwt.claim.sub', '${ids[role]}', false),
            set_config('request.jwt.claim.role', 'authenticated', false),
            set_config('app.current_user_id', '${ids[role]}', false);
     set role authenticated;`,
  )

const asAdmin = () => db.exec('reset role;')

// Create a booking with Babin Delivery
const bookingId = (
  await db.query(
    `insert into bookings (client_uuid, booking_no, client_id, branch_id, pickup_at, return_at, stage, delivery_type, pickup_location, created_by, updated_by)
     values (gen_random_uuid(), '990001', $1, $2, now(), now() + interval '2 days', 'Booked', 'Babin Delivery', 'Kathmandu Ward 3', $3, $3)
     returning id`,
    [clientId, branchId, ids.Owner],
  )
).rows[0].id

// Create transport plan
const transportId = (
  await db.query(
    `insert into booking_transport (client_uuid, booking_id, vehicle, number_plate, delivery_status, delivery_revision, created_by)
     values (gen_random_uuid(), $1, 'Delivery Van', 'BA 2 CHA 1234', 'Scheduled', 1, $2)
     returning id`,
    [bookingId, ids.Owner],
  )
).rows[0].id

// 1. Role check: Coordinator cannot mutate transport
await asUser('Coordinator')
check(
  await fails(
    () =>
      db.query(`select public.mutate_booking_transport($1, 1, gen_random_uuid(), 'assign', $2)`, [
        transportId,
        ids.Driver,
      ]),
    'Only authorized transport administrators may change dispatches.',
  ),
  'Coordinator cannot mutate transport (Owner/Admin only)',
)

// 2. Owner assigns driver
await asUser('Owner')
const assignKey = '00000000-0000-0000-0000-000000000511'
const assignRes = (
  await db.query(`select public.mutate_booking_transport($1, 1, $2, 'assign', $3) as res`, [
    transportId,
    assignKey,
    ids.Driver,
  ])
).rows[0].res

check(assignRes.revision === 2, 'Assigning driver increments revision to 2')

await asAdmin()
const tripAfterAssign = (await db.query(`select * from booking_transport where id = $1`, [transportId])).rows[0]
check(tripAfterAssign.delivery_status === 'Ready', 'Assigning driver transitions status to Ready')
check(tripAfterAssign.driver_id === ids.Driver, 'Driver ID is persisted on transport row')

// 3. Idempotency: replaying with same key returns identical receipt
await asUser('Owner')
const replayRes = (
  await db.query(`select public.mutate_booking_transport($1, 1, $2, 'assign', $3) as res`, [
    transportId,
    assignKey,
    ids.Driver,
  ])
).rows[0].res
check(replayRes.revision === 2, 'Idempotent replay returns cached receipt response')

// 4. Stale revision rejection
check(
  await fails(
    () =>
      db.query(`select public.mutate_booking_transport($1, 1, gen_random_uuid(), 'dispatch')`, [
        transportId,
      ]),
    'Dispatch changed. Refresh before saving.',
  ),
  'Stale revision is rejected with optimistic lock error',
)

// 5. Stage gate: dispatch requires booking stage 'On Rent'
check(
  await fails(
    () =>
      db.query(`select public.mutate_booking_transport($1, 2, gen_random_uuid(), 'dispatch')`, [
        transportId,
      ]),
    'Complete the handover gates and assign a driver before dispatch.',
  ),
  'Dispatch is blocked until booking reaches On Rent',
)

// Transition booking to On Rent
await asAdmin()
await db.query(`update bookings set stage = 'On Rent' where id = $1`, [bookingId])

// 6. Dispatch trip
await asUser('Owner')
const dispatchKey = '00000000-0000-0000-0000-000000000512'
const dispatchRes = (
  await db.query(`select public.mutate_booking_transport($1, 2, $2, 'dispatch') as res`, [
    transportId,
    dispatchKey,
  ])
).rows[0].res

check(dispatchRes.revision === 3, 'Dispatching trip increments revision to 3')

await asAdmin()
const tripAfterDispatch = (await db.query(`select * from booking_transport where id = $1`, [transportId])).rows[0]
check(tripAfterDispatch.delivery_status === 'In Transit', 'Status transitions to In Transit')
check(tripAfterDispatch.dispatched_at !== null, 'Dispatched timestamp is stamped')

// 7. Deliver trip requires receiver name >= 2 chars
await asUser('Owner')
check(
  await fails(
    () =>
      db.query(`select public.mutate_booking_transport($1, 3, gen_random_uuid(), 'deliver', null, 'A')`, [
        transportId,
      ]),
    'An in-transit trip and receiver name are required.',
  ),
  'Deliver requires receiver name of at least 2 characters',
)

// 8. Deliver trip
const deliverKey = '00000000-0000-0000-0000-000000000513'
const deliverRes = (
  await db.query(
    `select public.mutate_booking_transport($1, 3, $2, 'deliver', null, 'Babin Shrestha', 'Delivered intact') as res`,
    [transportId, deliverKey],
  )
).rows[0].res

check(deliverRes.revision === 4, 'Delivering trip increments revision to 4')

await asAdmin()
const tripAfterDeliver = (await db.query(`select * from booking_transport where id = $1`, [transportId])).rows[0]
check(tripAfterDeliver.delivery_status === 'Delivered', 'Status transitions to Delivered')
check(tripAfterDeliver.delivered_at !== null, 'Delivered timestamp is stamped')
check(tripAfterDeliver.recipient_name === 'Babin Shrestha', 'Recipient name is recorded')
check(tripAfterDeliver.delivery_note === 'Delivered intact', 'Delivery note is recorded')

// 9. Audit log verification
const auditCount = (
  await db.query(
    `select count(*)::int as n from audit_events where table_name = 'booking_transport' and record_id = $1`,
    [transportId],
  )
).rows[0].n
check(auditCount >= 3, `Database audited all ${auditCount} transport transitions in audit_events`)

// 10. View test: Driver can read assigned transport row in delivery_transport_v
await asUser('Driver')
const driverViewRows = (await db.query(`select * from delivery_transport_v where id = $1`, [transportId])).rows
check(driverViewRows.length === 1, 'Assigned driver can read their transport row via delivery_transport_v')
check(driverViewRows[0].delivery_status === 'Delivered', 'Driver reads correct delivery status from view')

if (failed > 0) {
  console.error(`\n❌ ${failed} check(s) failed.`)
  process.exit(1)
} else {
  console.log('\n🎉 BOOKING TRANSPORT DISPATCH LIFECYCLE VERIFIED')
  process.exit(0)
}
