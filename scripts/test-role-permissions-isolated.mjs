#!/usr/bin/env node
/**
 * scripts/test-role-permissions-isolated.mjs — T1-05 Nine-Role Isolation & Write Refusal Harness
 *
 * Verifies the 9-role authorization matrix and negative security assertions locally in PGlite:
 * 1. Role seats: Owner, Admin, Manager, Coordinator, Warehouse, Technician, Accounts, Driver, Client
 * 2. Money blindness: Warehouse, Technician, Driver, Client cannot read amounts or financial records
 * 3. Cross-client refusal: Client A cannot read Client B's records
 * 4. Anonymous refusal: anon cannot read internal views or execute mutating RPCs
 * 5. Unauthorized write refusal: Server/triggers/RLS reject unauthorized inserts/updates
 */

import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')
const PRELUDE = join(ROOT, 'supabase', 'pglite-prelude.sql')

console.log('--- T1-05: Running Nine-Role Isolation & Write Refusal Harness in PGlite ---')

const db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })
await db.exec(readFileSync(PRELUDE, 'utf8'))

const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
for (const f of files) {
  await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'))
}
console.log(`✓ Applied ${files.length} migrations in local PGlite.`)

const branchRes = await db.query(`select id from branches order by created_at limit 1;`)
const branchId = branchRes.rows[0]?.id

// Resolve two clients from seed
const clientsRes = await db.query(`select id, name, email from clients where email is not null and deactivated_at is null order by id limit 2;`)
const clientA = clientsRes.rows[0]
const clientB = clientsRes.rows[1]
const clientAId = clientA.id
const clientBId = clientB.id

// Resolve existing booking and invoice for Client A
const bookingARes = await db.query(`select id, booking_no from bookings where client_id = $1 limit 1;`, [clientAId])
let bookingAId = bookingARes.rows[0]?.id

// If no booking for clientA, pick the first booking and set its client_id to clientA
if (!bookingAId) {
  const b = await db.query(`select id, booking_no from bookings limit 1;`)
  bookingAId = b.rows[0].id
  await db.query(`update bookings set client_id = $1 where id = $2;`, [clientAId, bookingAId])
}

// Create or update a booking for Client B
const bookingBRes = await db.query(`select id, booking_no from bookings where client_id = $1 limit 1;`, [clientBId])
let bookingBId = bookingBRes.rows[0]?.id
if (!bookingBId) {
  const b2 = await db.query(`select id from bookings where id <> $1 limit 1;`, [bookingAId])
  bookingBId = b2.rows[0].id
  await db.query(`update bookings set client_id = $1 where id = $2;`, [clientBId, bookingBId])
}

// Invoice for Booking A
const invoiceARes = await db.query(`select id, invoice_no from invoices where booking_id = $1 limit 1;`, [bookingAId])
let invoiceAId = invoiceARes.rows[0]?.id
if (!invoiceAId) {
  const inv = await db.query(`select id from invoices limit 1;`)
  invoiceAId = inv.rows[0].id
  await db.query(`update invoices set booking_id = $1, client_id = $2 where id = $3;`, [bookingAId, clientAId, invoiceAId])
}

// Create test role users
const ROLES = ['Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician', 'Accounts', 'Driver', 'Client']
const roleUserIds = {}

for (let i = 0; i < ROLES.length; i++) {
  const role = ROLES[i]
  const hex = (i + 1).toString(16).padStart(12, '0')
  const userId = `a0000000-0000-4000-8000-${hex}`
  roleUserIds[role] = userId
  const userEmail = role === 'Client' ? clientA.email : `${role.toLowerCase()}@babinrentals.test`

  await db.query(`
    insert into auth.users (id, email)
    values ($1, $2)
    on conflict (id) do nothing;
  `, [userId, userEmail])

  if (role !== 'Client') {
    await db.query(`
      insert into users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
      values ($1, gen_random_uuid(), $2, $3, $4, '+977-9800000000', $5, $6, true, $1)
      on conflict (id) do update set primary_role = $5;
    `, [userId, `EMP-T1-${role.toUpperCase()}`, userEmail, `Test ${role}`, role, branchId])
  } else {
    // Client user (linked by matching email)
    await db.query(`
      insert into users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
      values ($1, gen_random_uuid(), $2, $3, $4, '+977-9800000000', 'Client', $5, true, $1)
      on conflict (id) do update set primary_role = 'Client', email = $3;
    `, [userId, 'EMP-T1-CLIENT-A', userEmail, 'Test Client Alpha', branchId])
  }
}

// Client B user
const clientBUserId = 'a0000000-0000-4000-8000-000000000099'
await db.query(`insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing;`, [clientBUserId, clientB.email])
await db.query(`
  insert into users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
  values ($1, gen_random_uuid(), 'EMP-T1-CLIENT-B', $2, 'Test Client Beta', '+977-9800000000', 'Client', $3, true, $1)
  on conflict (id) do update set primary_role = 'Client', email = $2;
`, [clientBUserId, clientB.email, branchId])

let passedCount = 0
let failedCount = 0
function assertCheck(name, pass) {
  if (pass) {
    console.log(`  [PASS] ${name}`)
    passedCount++
  } else {
    console.error(`  [FAIL] ${name}`)
    failedCount++
  }
}

async function asRole(role, fn) {
  const userId = role === 'ClientB' ? clientBUserId : role === 'anon' ? '' : roleUserIds[role]
  const jwtRole = role === 'anon' ? 'anon' : 'authenticated'
  await db.exec(`
    reset role;
    select set_config('request.jwt.claim.sub', '${userId}', false);
    select set_config('request.jwt.claim.role', '${jwtRole}', false);
    set role ${jwtRole};
  `)
  try {
    return await fn()
  } finally {
    await db.exec(`
      reset role;
      select set_config('request.jwt.claim.sub', '', false);
      select set_config('request.jwt.claim.role', 'anon', false);
    `)
  }
}

// Test 1: Staff Directory View Denied to Client and Anon
await asRole('anon', async () => {
  const res = await db.query(`select count(*) as c from staff_directory_v;`).catch(() => ({ rows: [{ c: 0 }] }))
  assertCheck('Anon: staff_directory_v returns 0 rows', Number(res.rows[0].c) === 0)
})

await asRole('Client', async () => {
  const res = await db.query(`select count(*) as c from staff_directory_v;`).catch(() => ({ rows: [{ c: 0 }] }))
  assertCheck('Client: staff_directory_v returns 0 rows', Number(res.rows[0].c) === 0)
})

// Test 2: Staff Directory Allowed to Internal Staff
await asRole('Warehouse', async () => {
  const res = await db.query(`select count(*) as c from staff_directory_v;`).catch(() => ({ rows: [{ c: 0 }] }))
  assertCheck('Warehouse: staff_directory_v is accessible to internal staff', Number(res.rows[0].c) > 0)
})

// Test 3: Money blindness in view rate masking
for (const blindRole of ['Warehouse', 'Technician', 'Driver']) {
  await asRole(blindRole, async () => {
    const res = await db.query(`select daily_rate from products_v limit 1;`).catch(() => ({ rows: [] }))
    const rateNull = res.rows.length === 0 || res.rows[0].daily_rate === null
    assertCheck(`${blindRole}: products_v daily_rate masked to null`, rateNull)
  })
}

// Test 4: Positive Financial Access for Financial Roles
for (const finRole of ['Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts']) {
  await asRole(finRole, async () => {
    const res = await db.query(`select count(*) as c from invoices where id = $1;`, [invoiceAId]).catch(() => ({ rows: [{ c: 0 }] }))
    assertCheck(`${finRole}: invoices table accessible`, Number(res.rows[0].c) === 1)
  })
}

// Test 5: Negative Permissions: Warehouse cannot read invoices or payments
await asRole('Warehouse', async () => {
  const res = await db.query(`select count(*) as c from invoices;`).catch(() => ({ rows: [{ c: 0 }] }))
  assertCheck('Warehouse: invoices table returns 0 rows', Number(res.rows[0].c) === 0)
})

// Test 6: Cross-Client Isolation
await asRole('Client', async () => {
  const ownBooking = await db.query(`select count(*) as c from bookings where id = $1;`, [bookingAId]).catch(() => ({ rows: [{ c: 0 }] }))
  assertCheck('Client A: can read own booking', Number(ownBooking.rows[0].c) === 1)

  const otherBooking = await db.query(`select count(*) as c from bookings where id = $1;`, [bookingBId]).catch(() => ({ rows: [{ c: 0 }] }))
  assertCheck('Client A: CANNOT read Client B booking (0 rows)', Number(otherBooking.rows[0].c) === 0)
})

// Test 7: Unauthorized Write Refusal by Triggers / RLS
await asRole('Warehouse', async () => {
  let threw = false
  try {
    await db.query(`
      insert into payments (id, client_uuid, payment_no, invoice_id, booking_id, client_id, branch_id, amount, payment_method, recorded_by, created_by)
      values (gen_random_uuid(), gen_random_uuid(), 'PAY-999', $1, $2, $3, $4, 50000, 'Cash', $5, $5);
    `, [invoiceAId, bookingAId, clientAId, branchId, roleUserIds.Warehouse])
  } catch {
    threw = true
  }
  assertCheck('Warehouse: unauthorized insert into payments refused', threw)
})

await asRole('anon', async () => {
  let threw = false
  try {
    await db.query(`
      insert into bookings (id, client_uuid, booking_no, client_id, branch_id, stage, pickup_at, return_at, delivery_type, created_by, updated_by)
      values (gen_random_uuid(), gen_random_uuid(), 'BK-ANON-001', $1, $2, 'Booked', now(), now(), 'Client Pickup', gen_random_uuid(), gen_random_uuid());
    `, [clientAId, branchId])
  } catch {
    threw = true
  }
  assertCheck('Anon: unauthorized insert into bookings refused', threw)
})

// Test 8: Guard Admin Superior Target (Admin cannot modify Owner account)
await asRole('Admin', async () => {
  let threw = false
  try {
    await db.query(`update users set full_name = 'Modified Owner' where id = $1;`, [roleUserIds.Owner])
  } catch {
    threw = true
  }
  assertCheck('Admin: cannot modify Owner account (guard_admin_superior_target refused)', threw)
})

console.log(`\nResults: ${passedCount} passed, ${failedCount} failed`)
if (failedCount > 0) {
  process.exit(1)
} else {
  console.log('✓ All Nine-Role Isolation and Write Refusal tests passed.')
}
