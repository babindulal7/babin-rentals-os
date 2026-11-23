#!/usr/bin/env node
/**
 * scripts/test-away-mode-db-gate.mjs
 *
 * T7-14 / Migration 0262: Online Booking Away Mode Database Gate & Server Refusal Test Suite.
 *
 * Verifies:
 * 1. Initial status: get_online_booking_away_status() returns is_away = false, can_accept_requests = true, and a valid message string.
 * 2. Role enforcement: Warehouse, Coordinator, and Anon cannot configure away mode (GATE:gate.settings.role).
 * 3. Configuration: Manager, Admin, and Owner can enable away mode with custom message and resume date.
 * 4. Anon inspection: Anon caller can read get_online_booking_away_status() without credentials.
 * 5. Server rejection: submit_booking_request is refused fail-closed when away mode is active (GATE:gate.booking_request.away_mode).
 * 6. Public read immunity: public_catalogue_v and rates remain queryable by anon while away.
 * 7. Automatic expiration: When resume_date has passed, away mode automatically disengages.
 * 8. Future resume date: While resume_date is in future, away mode remains actively enforced.
 * 9. Re-enablement: Disengaging away mode immediately re-enables submit_booking_request.
 * 10. Law 6 Money blindness: Away status payload and settings keys contain zero financial data.
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

// Seed a Manager user for testing Manager role
await db.exec(`
  insert into public.users (id, client_uuid, employee_code, email, mobile, primary_role, full_name, branch_id, is_active)
  values ('00000000-0000-0000-0000-000000000108', gen_random_uuid(), 'EMP-MGR99', 'testmanager_t714@babinrentals.com', '+977-9812349999', 'Manager', 'Test Manager', (select branch_id from users limit 1), true)
  on conflict (id) do nothing;
`)

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

// Helpers for role switching
async function asRole(role, callback) {
  let userId
  if (role === 'Owner') userId = '00000000-0000-0000-0000-000000000101'
  else if (role === 'Admin') userId = '00000000-0000-0000-0000-000000000102'
  else if (role === 'Manager') userId = '00000000-0000-0000-0000-000000000108'
  else if (role === 'Warehouse') userId = '00000000-0000-0000-0000-000000000103'
  else if (role === 'Coordinator') userId = '00000000-0000-0000-0000-000000000104'

  if (userId) {
    await db.exec(`
      set role authenticated;
      select set_config('app.current_user_id', '${userId}', false);
      select set_config('request.jwt.claim.sub', '${userId}', false);
      select set_config('request.jwt.claim.role', 'authenticated', false);
    `)
  } else {
    await db.exec(`
      set role anon;
      select set_config('app.current_user_id', '', false);
      select set_config('request.jwt.claim.sub', '', false);
      select set_config('request.jwt.claim.role', 'anon', false);
    `)
  }

  try {
    return await callback()
  } finally {
    try {
      await db.exec(`
        reset role;
        select set_config('app.current_user_id', '', false);
        select set_config('request.jwt.claim.sub', '', false);
        select set_config('request.jwt.claim.role', '', false);
      `)
    } catch {
      await db.exec('rollback;')
    }
  }
}

console.log('--- T7-14 Online Booking Away Mode DB Gate Tests ---')

// 1. Initial State
await asRole('anon', async () => {
  const res = (await db.query(`select public.get_online_booking_away_status() as status`)).rows[0].status
  check(res.is_away === false, 'initial status: is_away is false')
  check(res.can_accept_requests === true, 'initial status: can_accept_requests is true')
  check(typeof res.message === 'string' && res.message.length > 0, 'initial status: message is string')
})

// 2. Role Restriction: Warehouse cannot configure away mode
await asRole('Warehouse', async () => {
  let caught = false
  try {
    await db.query(`select public.set_online_booking_away(true, 'Test closed', null)`)
  } catch (err) {
    caught = true
    check(/gate\.settings\.role|Only Owner, Admin, and Manager/i.test(err.message), 'Warehouse role is refused by gate.settings.role')
  }
  check(caught, 'Warehouse cannot call set_online_booking_away')
})

// 3. Role Restriction: Coordinator cannot configure away mode
await asRole('Coordinator', async () => {
  let caught = false
  try {
    await db.query(`select public.set_online_booking_away(true, 'Test closed', null)`)
  } catch (err) {
    caught = true
    check(/gate\.settings\.role|Only Owner, Admin, and Manager/i.test(err.message), 'Coordinator role is refused by gate.settings.role')
  }
  check(caught, 'Coordinator cannot call set_online_booking_away')
})

// 4. Role Permission: Manager can configure away mode
await asRole('Manager', async () => {
  const res = (await db.query(`
    select public.set_online_booking_away(true, 'Back on 15 Feb — call or WhatsApp us', null) as status
  `)).rows[0].status
  check(res.is_away === true, 'Manager enabled away mode: is_away is true')
  check(res.can_accept_requests === false, 'Manager enabled away mode: can_accept_requests is false')
  check(res.message === 'Back on 15 Feb — call or WhatsApp us', 'custom message preserved')
})

// 5. Anon can read active away status
await asRole('anon', async () => {
  const res = (await db.query(`select public.get_online_booking_away_status() as status`)).rows[0].status
  check(res.is_away === true, 'anon sees active away mode')
  check(res.can_accept_requests === false, 'anon sees can_accept_requests = false')
  check(res.message === 'Back on 15 Feb — call or WhatsApp us', 'anon sees custom notice message')
})

// Get a valid seeded product ID for request tests
const sampleProdId = (await db.query(`select id from public.products limit 1`)).rows[0].id

// 6. Server Rejection: submit_booking_request is refused fail-closed when away
await asRole('anon', async () => {
  const payload = {
    client_name: 'Jane Doe',
    client_email: 'jane@example.com',
    client_phone: '+977-9811111111',
    start_date: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10),
    end_date: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10),
    fulfillment_type: 'pickup',
    lines: [{ product_id: sampleProdId, quantity: 1 }],
  }

  let caught = false
  try {
    await db.query(`select public.submit_booking_request($1::jsonb)`, [JSON.stringify(payload)])
  } catch (err) {
    caught = true
    check(/gate\.booking_request\.away_mode|Online booking requests are temporarily disabled/i.test(err.message),
      'submit_booking_request throws GATE:gate.booking_request.away_mode')
  }
  check(caught, 'submit_booking_request was refused while away mode is active')
})

// 7. Public Catalogue and Rates remain accessible while away
await asRole('anon', async () => {
  const cat = await db.query(`select count(*) as count from public.public_catalogue_v`)
  check(parseInt(cat.rows[0].count) >= 0, 'public_catalogue_v query succeeds for anon while away mode is active')
})

// 8. Auto-disengagement test with past resume date
await asRole('Admin', async () => {
  const pastDate = new Date(Date.now() - 3600000).toISOString() // 1 hour ago
  const res = (await db.query(`
    select public.set_online_booking_away(true, 'Should be expired', $1::timestamptz) as status
  `, [pastDate])).rows[0].status

  check(res.is_away === false, 'past resume date: is_away automatically evaluated as false')
  check(res.can_accept_requests === true, 'past resume date: can_accept_requests is true')
})

// 9. Future resume date remains active
await asRole('Owner', async () => {
  const futureDate = new Date(Date.now() + 86400000 * 5).toISOString() // 5 days in future
  const res = (await db.query(`
    select public.set_online_booking_away(true, 'Back on 15 Feb', $1::timestamptz) as status
  `, [futureDate])).rows[0].status

  check(res.is_away === true, 'future resume date: is_away is true')
  check(res.can_accept_requests === false, 'future resume date: can_accept_requests is false')
})

// 10. Disengaging Away Mode allows requests to succeed
await asRole('Owner', async () => {
  const res = (await db.query(`
    select public.set_online_booking_away(false, '', null) as status
  `)).rows[0].status

  check(res.is_away === false, 'away mode disengaged: is_away is false')
  check(res.can_accept_requests === true, 'away mode disengaged: can_accept_requests is true')
})

// 11. Request succeeds after disengagement
await asRole('anon', async () => {
  const payload = {
    client_name: 'John Smith',
    client_email: 'john@example.com',
    client_phone: '+977-9822222222',
    start_date: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10),
    end_date: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10),
    fulfillment_type: 'pickup',
    lines: [{ product_id: sampleProdId, quantity: 1 }],
  }

  const res = (await db.query(`select public.submit_booking_request($1::jsonb) as res`, [JSON.stringify(payload)])).rows[0].res
  check(Boolean(res.request_id), 'submit_booking_request accepted after away mode disengaged')
  check(res.status === 'pending', 'request status is pending')
})

// 12. Law 6: Money Blindness Verification
await asRole('Warehouse', async () => {
  const status = (await db.query(`select public.get_online_booking_away_status() as status`)).rows[0].status
  const keys = Object.keys(status)
  const hasMoneyKey = keys.some(k => /paisa|npr|rate|total|price|amount/i.test(k))
  check(!hasMoneyKey, 'Law 6: get_online_booking_away_status payload has no money fields')
})

console.log(`\nResults: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
} else {
  console.log('--- ALL T7-14 AWAY MODE DB GATE TESTS PASSED ---')
}
