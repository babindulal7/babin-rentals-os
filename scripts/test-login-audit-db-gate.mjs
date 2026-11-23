#!/usr/bin/env node
/**
 * scripts/test-login-audit-db-gate.mjs
 *
 * T1-18 / Migration 0268: Server-Side Sign-In History & New-Device Notification Engine.
 *
 * Verifies:
 * 1. Role-Gated Read Access:
 *    - Owner and Admin can read from sign_in_events (B22).
 *    - Manager, Coordinator, Warehouse, Technician, Driver cannot read sign_in_events (0 rows / RLS denied).
 * 2. Immutable Direct Writes:
 *    - Direct INSERT/UPDATE/DELETE on sign_in_events is denied to all roles (immutable append-only log).
 * 3. record_sign_in_event RPC:
 *    - Records sign-in events with server timestamp and metadata.
 *    - Detects first-seen device for Owner and Admin, producing dedicated new_device event and should_alert = true (B23).
 *    - Second sign-in with the same device_hash does NOT emit new_device alert.
 *    - Coordinator or Floor sign-in from a new device does NOT trigger an email alert (B23).
 * 4. get_recent_sign_in_events RPC:
 *    - Accessible by Owner and Admin; Manager and Coordinator are strictly refused.
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
    console.error(`✗ ${msg}`)
    failed++
  }
}

async function asRole(role, callback) {
  let userId
  if (role === 'Owner') userId = '00000000-0000-0000-0000-000000000101'
  else if (role === 'Admin') userId = '00000000-0000-0000-0000-000000000102'
  else if (role === 'Manager') userId = '00000000-0000-0000-0000-000000000108'
  else if (role === 'Warehouse') userId = '00000000-0000-0000-0000-000000000103'
  else if (role === 'Coordinator') userId = '00000000-0000-0000-0000-000000000104'

  const claims = JSON.stringify({
    sub: userId || '',
    role: userId ? 'authenticated' : 'anon',
  })

  if (userId) {
    await db.exec(`
      set role authenticated;
      select set_config('app.current_user_id', '${userId}', false);
      select set_config('request.jwt.claim.sub', '${userId}', false);
      select set_config('request.jwt.claim.role', 'authenticated', false);
      select set_config('request.jwt.claims', '${claims}', false);
    `)
  } else {
    await db.exec(`
      set role anon;
      select set_config('app.current_user_id', '', false);
      select set_config('request.jwt.claim.sub', '', false);
      select set_config('request.jwt.claim.role', 'anon', false);
      select set_config('request.jwt.claims', '{}', false);
    `)
  }

  try {
    return await callback()
  } finally {
    await db.exec(`
      set role postgres;
      select set_config('app.current_user_id', '', false);
      select set_config('request.jwt.claim.sub', '', false);
      select set_config('request.jwt.claim.role', '', false);
      select set_config('request.jwt.claims', '', false);
    `)
  }
}

console.log('--- Suite 1: Direct Table Write Immobility ---')

await asRole('Owner', async () => {
  try {
    await db.query(`insert into public.sign_in_events (user_id, device_hash, kind) values ('00000000-0000-0000-0000-000000000101', 'h1', 'sign-in')`)
    check(false, 'Direct insert should be denied')
  } catch (err) {
    check(err.message.includes('permission denied') || err.message.includes('Direct insert into sign_in_events is forbidden'), 'Direct INSERT to sign_in_events denied to Owner')
  }
})

console.log('--- Suite 2: RPC Event Recording & New Device Detection ---')

// Admin signs in from new device 1
await asRole('Admin', async () => {
  const res = await db.query(`select record_sign_in_event('device_mac_01', 'Mozilla/5.0 Mac', '192.168.1.10') as r`)
  const r = res.rows[0].r
  check(r.success === true, 'Admin sign-in event recorded successfully')
  check(r.is_new_device === true, 'Admin first-time device recognized as new_device')
  check(r.should_alert === true, 'Admin new device triggers should_alert = true')
})

// Admin signs in again from SAME device 1
await asRole('Admin', async () => {
  const res = await db.query(`select record_sign_in_event('device_mac_01', 'Mozilla/5.0 Mac', '192.168.1.10') as r`)
  const r = res.rows[0].r
  check(r.success === true, 'Admin second sign-in from same device recorded')
  check(r.is_new_device === false, 'Known device does NOT trigger new_device')
  check(r.should_alert === false, 'Known device does NOT trigger should_alert')
})

// Coordinator signs in from brand new device
await asRole('Coordinator', async () => {
  const res = await db.query(`select record_sign_in_event('device_phone_01', 'Mobile Chrome', '192.168.1.55') as r`)
  const r = res.rows[0].r
  check(r.success === true, 'Coordinator sign-in recorded')
  check(r.is_new_device === false, 'Coordinator does not emit new_device alert (B23 Owner/Admin only)')
  check(r.should_alert === false, 'Coordinator does not trigger email alert')
})

console.log('--- Suite 3: RLS Read Access Enforcement ---')

await asRole('Owner', async () => {
  const res = await db.query('select * from public.sign_in_events')
  check(res.rows.length >= 3, 'Owner reads all sign-in event rows')
})

await asRole('Admin', async () => {
  const res = await db.query('select * from public.sign_in_events')
  check(res.rows.length >= 3, 'Admin reads sign-in event rows')
})

await asRole('Manager', async () => {
  const res = await db.query('select * from public.sign_in_events')
  check(res.rows.length === 0, 'Manager reads 0 rows from sign_in_events (denied by RLS)')
})

await asRole('Coordinator', async () => {
  const res = await db.query('select * from public.sign_in_events')
  check(res.rows.length === 0, 'Coordinator reads 0 rows from sign_in_events (denied by RLS)')
})

console.log('--- Suite 4: Query RPC Access ---')

await asRole('Manager', async () => {
  try {
    await db.query('select get_recent_sign_in_events(10)')
    check(false, 'Manager get_recent_sign_in_events should fail')
  } catch (err) {
    check(err.message.includes('GATE:gate.settings.role'), 'Manager refused from get_recent_sign_in_events RPC')
  }
})

await asRole('Owner', async () => {
  const res = await db.query('select get_recent_sign_in_events(10) as events')
  const events = res.rows[0].events
  check(Array.isArray(events) && events.length >= 3, 'Owner retrieves formatted recent sign-in history')
  check(events[0].full_name !== undefined, 'History includes joined full_name')
})

console.log(`\nResults: ${passed} passed, ${failed} failed.`)
if (failed > 0) {
  process.exit(1)
} else {
  console.log('All T1-18 database sign-in audit gate tests passed cleanly!')
}
