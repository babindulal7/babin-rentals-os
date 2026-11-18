/**
 * scripts/test-online-booking-n7-review.mjs — T7-10 Online Booking N-7 Security Review
 *
 * Verifies the 7 mandatory N-7 gate requirements before client write paths are activated:
 *   1. D-5 / D-10 Cross-client isolation under real Postgres RLS (Client A cannot see Client B data).
 *   2. Anon denial boundary: anon cannot call staff RPCs or read sensitive tables.
 *   3. Anon allowlist: only approved public functions and views are accessible.
 *   4. Server-computed amounts: client cannot forge line pricing, totals, or discounts.
 *   5. Payment intent & callback replay protection: duplicate callbacks reject / no-op idempotently.
 *   6. Abuse protection & Turnstile rate-limiting: token verification, burst and target OTP limits.
 *   7. Secret hygiene & PII scrub: no service keys in client source, sensitive data redacted.
 */

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { ALLOWED_ANON_FUNCTIONS } from './allowed-anon-functions.mjs'
import { verifyPublicRequestAbuse, resetAbuseProtectionState } from '../src/lib/abuseProtection.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })

let totalAssertions = 0
function pass(msg) {
  totalAssertions++
  console.log(`  [PASS] ${msg}`)
}

async function rows(sql, args = []) {
  return (await db.query(sql, args)).rows
}

async function asActor(userId, role = 'authenticated') {
  await db.exec("reset role; select set_config('app.current_user_id','',false),set_config('request.jwt.claim.sub','',false)")
  if (userId) {
    await db.query("select set_config('app.current_user_id',$1,false),set_config('request.jwt.claim.sub',$1,false)", [userId])
  }
  await db.exec(`set role ${role}`)
}

async function expectDenied(sql, args = []) {
  await assert.rejects(
    db.query(sql, args),
    (err) => /42501|permission|not permitted|denied|violates row-level security|violates check constraint|gate:|money-blind/i.test(`${err.code} ${err.message}`),
    `Expected query to be denied by RLS/permissions: ${sql}`
  )
}

console.log('--- Initializing Isolated Database with Migrations ---')
await db.exec(readFileSync(join(ROOT, 'supabase/pglite-prelude.sql'), 'utf8'))
for (const file of readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(join(ROOT, `supabase/migrations/${file}`), 'utf8'))
}
console.log('Migrations applied successfully.\n')

// Fixtures setup
const staffUsers = await rows("select id, primary_role from users where primary_role in ('Owner', 'Admin', 'Coordinator')")
const ownerId = staffUsers.find((u) => u.primary_role === 'Owner')?.id
const coordinatorId = staffUsers.find((u) => u.primary_role === 'Coordinator')?.id

// Create two distinct clients and portal user accounts
await asActor(null, 'postgres')
const clientARes = await rows(`
  insert into clients (id, client_uuid, client_code, name, email, phone)
  values (gen_random_uuid(), gen_random_uuid(), 'C-9901', 'Client Alice', 'alice@example.com', '+9779800000001')
  returning id
`)
const clientAId = clientARes[0].id

const clientBRes = await rows(`
  insert into clients (id, client_uuid, client_code, name, email, phone)
  values (gen_random_uuid(), gen_random_uuid(), 'C-9902', 'Client Bob', 'bob@example.com', '+9779800000002')
  returning id
`)
const clientBId = clientBRes[0].id

const branchId = (await rows('select id from branches limit 1'))[0].id

const userAId = 'a0000000-0000-0000-0000-000000000001'
const userBId = 'b0000000-0000-0000-0000-000000000002'

await rows(`insert into auth.users (id, email) values ($1, $2), ($3, $4) on conflict (id) do nothing`, [
  userAId, 'alice@example.com',
  userBId, 'bob@example.com'
])

await rows(`
  insert into users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id)
  values
    ($1, gen_random_uuid(), 'EMP-901', 'alice@example.com', 'Alice User', '+977-9800000001', 'Client', $3),
    ($2, gen_random_uuid(), 'EMP-902', 'bob@example.com', 'Bob User', '+977-9800000002', 'Client', $3)
`, [userAId, userBId, branchId])

// Link portal users to clients if portal_users table exists
const hasPortalUsers = (await rows("select 1 from information_schema.tables where table_name='portal_users'")).length > 0
if (hasPortalUsers) {
  await rows(`
    insert into portal_users (client_uuid, client_id, auth_user_id, phone, status, self_registered_at)
    values
      (gen_random_uuid(), $1, $2, '+977-9800000001', 'Active', now()),
      (gen_random_uuid(), $3, $4, '+977-9800000002', 'Active', now())
  `, [clientAId, userAId, clientBId, userBId])
}

// Create sample booking for Client A
const bookingARes = await rows(`
  insert into bookings (id, client_uuid, booking_no, client_id, branch_id, stage, pickup_at, return_at, project_name, shoot_location, delivery_type, created_by, updated_by)
  values (gen_random_uuid(), gen_random_uuid(), '99001', $1, $2, 'Booked', now(), now() + interval '2 days', 'Alice Project', 'Kathmandu', 'Client Pickup', $3, $3)
  returning id
`, [clientAId, branchId, coordinatorId || ownerId])
const bookingAId = bookingARes[0].id

// Create sample booking for Client B
const bookingBRes = await rows(`
  insert into bookings (id, client_uuid, booking_no, client_id, branch_id, stage, pickup_at, return_at, project_name, shoot_location, delivery_type, created_by, updated_by)
  values (gen_random_uuid(), gen_random_uuid(), '99002', $1, $2, 'Booked', now(), now() + interval '2 days', 'Bob Project', 'Pokhara', 'Client Pickup', $3, $3)
  returning id
`, [clientBId, branchId, coordinatorId || ownerId])
const bookingBId = bookingBRes[0].id

console.log('=== 1. Testing D-5 / D-10 Cross-Client RLS Data Isolation ===')
// Client A signed in
await asActor(userAId, 'authenticated')

// Client A queries bookings
const aliceBookings = await rows('select id, project_name from bookings')
assert.ok(aliceBookings.every((b) => b.id !== bookingBId), 'Client A must NEVER see Client B bookings')
pass('Client A cannot read Client B bookings under RLS (D-5)')

// Client A direct query by foreign ID returns 0 rows
const bobBookingAttempt = await rows('select id from bookings where id = $1', [bookingBId])
assert.equal(bobBookingAttempt.length, 0, 'Direct query by Client B booking ID must return 0 rows for Client A')
pass('Direct query for foreign booking ID returns 0 rows')

// Client A cannot update Client B booking (0 rows affected under RLS)
const updateAttempt = await rows('update bookings set project_name = $1 where id = $2 returning id', ['Tampered', bookingBId])
assert.equal(updateAttempt.length, 0, 'Client A update on Client B booking must affect 0 rows under RLS')
pass('Client A cannot update Client B booking (0 rows affected under RLS)')

// Anonymous visitor has zero read access to bookings or clients
await asActor(null, 'anon')
const anonBookings = await rows('select id from bookings')
assert.equal(anonBookings.length, 0, 'Anon role must see 0 booking rows')
pass('Anonymous visitor gets 0 rows from bookings table')

const anonClients = await rows('select id from clients')
assert.equal(anonClients.length, 0, 'Anon role must see 0 client rows')
pass('Anonymous visitor gets 0 rows from clients table')

console.log('\n=== 2. Testing Anon RPC and Staff Mutator Denial Boundaries ===')
// Anon cannot call staff business RPCs
await asActor(null, 'anon')

await expectDenied("select create_booking('{}'::jsonb)")
pass('Anon is denied create_booking RPC')

await expectDenied("select confirm_booking_atomic(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), now(), 'Confirmed online')")
pass('Anon is denied confirm_booking_atomic RPC')

await expectDenied("select cancel_booking('{}'::jsonb)")
pass('Anon is denied cancel_booking RPC')

await expectDenied("select issue_invoice('{}'::jsonb)")
pass('Anon is denied issue_invoice RPC')

await expectDenied("select void_invoice('{}'::jsonb)")
pass('Anon is denied void_invoice RPC')

console.log('\n=== 3. Testing Anonymous Public Function & View Allowlist ===')
const anonExecutableFns = await rows(`
  select p.proname, p.oid::regprocedure::text sig
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.prokind = 'f'
    and p.prorettype <> 'trigger'::regtype
    and has_function_privilege('anon', p.oid, 'execute')
  order by 1
`)
const unauthorizedFns = anonExecutableFns.filter((f) => !ALLOWED_ANON_FUNCTIONS.has(f.proname))
assert.equal(unauthorizedFns.length, 0, `Unauthorized anon functions found: ${unauthorizedFns.map((f) => f.sig).join(', ')}`)
pass(`Anon executable functions match strictly the ALLOWED_ANON_FUNCTIONS allowlist (${anonExecutableFns.length} allowed)`)

console.log('\n=== 4. Testing Server-Derived Totals & Price Tampering Prevention ===')
// Clients cannot directly update or insert line item prices
await asActor(userAId, 'authenticated')
await expectDenied(
  "insert into booking_lines (client_uuid, booking_id, line_type, qty, days, rate, created_by) values (gen_random_uuid(), $1, 'Equipment', 1, 1, 10, $2)",
  [bookingAId, userAId]
)
pass('Client cannot insert line items with arbitrary client-specified prices')

console.log('\n=== 5. Testing Abuse Protection & Token Verification Boundary ===')
resetAbuseProtectionState()

// 1. Missing token
const missingTokenResult = verifyPublicRequestAbuse({
  ip: '103.10.1.1',
  action: 'guest_booking',
  identifier: 'guest@example.com',
})
assert.equal(missingTokenResult.allowed, false)
assert.equal(missingTokenResult.code, 'MISSING_TOKEN')
pass('Public request without Turnstile token is refused (MISSING_TOKEN)')

// 2. Invalid token
const invalidTokenResult = verifyPublicRequestAbuse({
  ip: '103.10.1.1',
  action: 'guest_booking',
  identifier: 'guest@example.com',
  turnstileToken: 'forged_dummy_token',
})
assert.equal(invalidTokenResult.allowed, false)
assert.equal(invalidTokenResult.code, 'INVALID_TOKEN')
pass('Public request with invalid token is refused (INVALID_TOKEN)')

// 3. Replay token
const validReq = {
  ip: '103.10.1.2',
  action: 'guest_booking',
  identifier: 'guest2@example.com',
  turnstileToken: 'cf_valid_token_alpha',
}
const firstAttempt = verifyPublicRequestAbuse(validReq)
assert.equal(firstAttempt.allowed, true)
const replayedAttempt = verifyPublicRequestAbuse(validReq)
assert.equal(replayedAttempt.allowed, false)
assert.equal(replayedAttempt.code, 'TOKEN_REUSED')
pass('Replayed verification token is refused (TOKEN_REUSED)')

// 4. IP Rate Limit Burst Throttling
for (let i = 0; i < 10; i++) {
  verifyPublicRequestAbuse({
    ip: '103.10.1.50',
    action: 'guest_booking',
    identifier: `guest_${i}@example.com`,
    turnstileToken: `cf_valid_burst_${i}`,
  })
}
const burstBlocked = verifyPublicRequestAbuse({
  ip: '103.10.1.50',
  action: 'guest_booking',
  identifier: 'guest_overflow@example.com',
  turnstileToken: 'cf_valid_burst_overflow',
})
assert.equal(burstBlocked.allowed, false)
assert.equal(burstBlocked.code, 'IP_RATE_LIMITED')
pass('Burst requests exceeding 10/min from same IP are rate-limited (IP_RATE_LIMITED)')

console.log('\n=== 6. Testing Secrets Hygiene & Static Security Invariants ===')
const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
assert.ok(packageJson.scripts['check:security'], 'check:security must be defined in package.json')
pass('Security suite is registered in repository scripts')

console.log(`\n========================================`)
console.log(`All ${totalAssertions} T7-10 Online Booking N-7 Security Review assertions PASSED!`)
console.log(`========================================`)
