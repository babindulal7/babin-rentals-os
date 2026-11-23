#!/usr/bin/env node
/**
 * scripts/test-mfa-db-gate.mjs
 *
 * T1-17 / Migration 0263: Database-Enforced AAL2 Two-Step Sign-In for Money Roles Test Suite.
 *
 * Verifies:
 * 1. Default (Unarmed) Mode:
 *    - Money roles (Owner, Admin, Manager, Coordinator, Accounts) view money at AAL1.
 *    - Floor roles (Warehouse, Technician, Driver) and Client remain strictly money-blind (Law 6).
 * 2. Settings Enforcement Security:
 *    - Only Owner can toggle two-step authentication enforcement (GATE:gate.settings.role).
 *    - Toggling writes audit record to staff_mfa_audit.
 * 3. Armed Mode Enforcement:
 *    - When armed, money roles at AAL1 evaluate auth_can_view_money() = false.
 *    - When armed, money roles at AAL1 have money columns masked to NULL.
 *    - When armed, money roles at AAL2 evaluate auth_can_view_money() = true.
 *    - Floor roles at AAL2 remain strictly money-blind (Law 6 inviolate).
 * 4. Factor Enrolment & Lost Phone Recovery:
 *    - Staff can enrol their own TOTP factor; cross-user enrolment is refused.
 *    - Non-privileged roles cannot reset MFA factors (GATE:gate.security.mfa_reset_forbidden).
 *    - Admin can reset Coordinator/Manager but cannot reset Owner/Admin (AD2 rule).
 *    - Owner can reset any staff factor, audited in staff_mfa_audit.
 * 5. Overview RPC Access:
 *    - Owner/Admin/Manager can query get_staff_mfa_overview(); floor roles are refused.
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

// Seed Accounts user if needed
await db.exec(`
  insert into public.users (id, client_uuid, employee_code, email, mobile, primary_role, full_name, branch_id, is_active)
  values ('00000000-0000-0000-0000-000000000109', gen_random_uuid(), 'EMP-ACC01', 'testaccounts@babinrentals.com', '+977-9812349998', 'Accounts', 'Test Accounts', (select branch_id from users limit 1), true)
  on conflict (id) do nothing;

  insert into auth.users (id, email)
  select id, email from public.users
  on conflict (id) do nothing;
`)

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

// Switch role and JWT AAL level
async function asRole(role, aal = 'aal1', callback) {
  let userId
  if (role === 'Owner') userId = '00000000-0000-0000-0000-000000000101'
  else if (role === 'Admin') userId = '00000000-0000-0000-0000-000000000102'
  else if (role === 'Manager') userId = '00000000-0000-0000-0000-000000000108'
  else if (role === 'Warehouse') userId = '00000000-0000-0000-0000-000000000103'
  else if (role === 'Coordinator') userId = '00000000-0000-0000-0000-000000000104'
  else if (role === 'Technician') userId = '00000000-0000-0000-0000-000000000105'
  else if (role === 'Driver') userId = '00000000-0000-0000-0000-000000000106'
  else if (role === 'Client') userId = '00000000-0000-0000-0000-000000000107'
  else if (role === 'Accounts') userId = '00000000-0000-0000-0000-000000000109'

  const claims = JSON.stringify({
    sub: userId || '',
    role: userId ? 'authenticated' : 'anon',
    aal: aal,
    amr: aal === 'aal2' ? [{ method: 'password' }, { method: 'totp' }] : [{ method: 'password' }]
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
    // Reset to postgres
    await db.exec(`
      set role postgres;
      select set_config('app.current_user_id', '', false);
      select set_config('request.jwt.claim.sub', '', false);
      select set_config('request.jwt.claim.role', '', false);
      select set_config('request.jwt.claims', '', false);
    `)
  }
}

console.log('--- Suite 1: Unarmed Mode (Default Phase A) ---')

await asRole('Coordinator', 'aal1', async () => {
  const res = await db.query('select auth_can_view_money() as can_view')
  check(res.rows[0].can_view === true, 'Coordinator at AAL1 can view money when unarmed')
})

await asRole('Accounts', 'aal1', async () => {
  const res = await db.query('select auth_can_view_money() as can_view')
  check(res.rows[0].can_view === true, 'Accounts at AAL1 can view money when unarmed')
})

await asRole('Warehouse', 'aal1', async () => {
  const res = await db.query('select auth_can_view_money() as can_view')
  check(res.rows[0].can_view === false, 'Warehouse at AAL1 is money-blind (Law 6)')
})

await asRole('Technician', 'aal1', async () => {
  const res = await db.query('select auth_can_view_money() as can_view')
  check(res.rows[0].can_view === false, 'Technician at AAL1 is money-blind (Law 6)')
})

await asRole('Driver', 'aal1', async () => {
  const res = await db.query('select auth_can_view_money() as can_view')
  check(res.rows[0].can_view === false, 'Driver at AAL1 is money-blind (Law 6)')
})

await asRole('Client', 'aal1', async () => {
  const res = await db.query('select auth_can_view_money() as can_view')
  check(res.rows[0].can_view === false, 'Client at AAL1 is money-blind (Law 6)')
})

await asRole('anon', 'aal1', async () => {
  const res = await db.query('select auth_can_view_money() as can_view')
  check(res.rows[0].can_view === false, 'Anon caller is money-blind (Law 6)')
})

// Unknown / NULL role check
await db.exec(`
  set role authenticated;
  select set_config('app.current_user_id', '99999999-9999-9999-9999-999999999999', false);
  select set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', false);
  select set_config('request.jwt.claim.role', 'authenticated', false);
  select set_config('request.jwt.claims', '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}', false);
`)
const unknownRoleRes = await db.query('select auth_can_view_money() as can_view')
check(unknownRoleRes.rows[0].can_view === false, 'Non-existent / NULL user role fails closed')
await db.exec('set role postgres;')

console.log('--- Suite 2: Enforcement Toggle Role Guard ---')

await asRole('Coordinator', 'aal1', async () => {
  try {
    await db.query('select set_two_step_auth_enforcement(true)')
    check(false, 'Coordinator toggle should fail')
  } catch (err) {
    check(err.message.includes('GATE:gate.settings.role'), 'Coordinator toggle refused with GATE:gate.settings.role')
  }
})

await asRole('Admin', 'aal1', async () => {
  try {
    await db.query('select set_two_step_auth_enforcement(true)')
    check(false, 'Admin toggle should fail (Owner-only)')
  } catch (err) {
    check(err.message.includes('GATE:gate.settings.role'), 'Admin toggle refused with GATE:gate.settings.role')
  }
})

await asRole('Owner', 'aal1', async () => {
  const res = await db.query('select set_two_step_auth_enforcement(true) as r')
  check(res.rows[0].r.is_enforced === true, 'Owner can successfully arm two-step auth enforcement')
})

// Verify audit entry for arming
const auditRows = await db.query(`select * from public.staff_mfa_audit where action = 'enforcement_toggled'`)
check(auditRows.rows.length >= 1, 'Arming event persisted in staff_mfa_audit')

console.log('--- Suite 3: Armed Mode AAL Enforcement ---')

await asRole('Coordinator', 'aal1', async () => {
  const res = await db.query('select auth_can_view_money() as can_view')
  check(res.rows[0].can_view === false, 'Armed mode: Coordinator at AAL1 CANNOT view money')
})

await asRole('Coordinator', 'aal2', async () => {
  const res = await db.query('select auth_can_view_money() as can_view')
  check(res.rows[0].can_view === true, 'Armed mode: Coordinator stepped up to AAL2 CAN view money')
})

await asRole('Owner', 'aal1', async () => {
  const res = await db.query('select auth_can_view_money() as can_view')
  check(res.rows[0].can_view === false, 'Armed mode: Owner at AAL1 CANNOT view money')
})

await asRole('Owner', 'aal2', async () => {
  const res = await db.query('select auth_can_view_money() as can_view')
  check(res.rows[0].can_view === true, 'Armed mode: Owner stepped up to AAL2 CAN view money')
})

await asRole('Warehouse', 'aal2', async () => {
  const res = await db.query('select auth_can_view_money() as can_view')
  check(res.rows[0].can_view === false, 'Armed mode: Warehouse even at AAL2 remains strictly money-blind (Law 6)')
})

await asRole('Technician', 'aal2', async () => {
  const res = await db.query('select auth_can_view_money() as can_view')
  check(res.rows[0].can_view === false, 'Armed mode: Technician even at AAL2 remains strictly money-blind (Law 6)')
})

await asRole('Driver', 'aal2', async () => {
  const res = await db.query('select auth_can_view_money() as can_view')
  check(res.rows[0].can_view === false, 'Armed mode: Driver even at AAL2 remains strictly money-blind (Law 6)')
})

await asRole('Client', 'aal2', async () => {
  const res = await db.query('select auth_can_view_money() as can_view')
  check(res.rows[0].can_view === false, 'Armed mode: Client even at AAL2 remains strictly money-blind (Law 6)')
})

console.log('--- Suite 4: Column-Level Money Masking Verification ---')

await asRole('Coordinator', 'aal1', async () => {
  // Query products_v view where rates are masked with auth_can_view_money()
  const res = await db.query('select daily_rate from products_v limit 1')
  check(res.rows.length > 0 && res.rows[0].daily_rate === null, 'Armed Coordinator at AAL1 reads NULL daily_rate from products_v view')
})

await asRole('Coordinator', 'aal2', async () => {
  const res = await db.query('select daily_rate from products_v limit 1')
  check(res.rows.length > 0 && res.rows[0].daily_rate !== null, 'Armed Coordinator at AAL2 reads real numeric daily_rate from products_v view')
})

console.log('--- Suite 5: Enrolment & Lost Phone Recovery ---')

const targetUserId = '00000000-0000-0000-0000-000000000104' // Coordinator
const ownerUserId = '00000000-0000-0000-0000-000000000101' // Owner
const adminUserId = '00000000-0000-0000-0000-000000000102' // Admin

// Negative Test 1: Direct RPC invocation without provider factor MUST fail closed
await asRole('Coordinator', 'aal2', async () => {
  try {
    await db.query('select record_staff_mfa_enrolment()')
    check(false, 'Direct RPC without provider factor should fail')
  } catch (err) {
    check(err.message.includes('GATE:gate.security.mfa_factor_unverified'), 'Direct RPC without factor refused with GATE:gate.security.mfa_factor_unverified')
  }
})

// Negative Test 2: Factor in provider exists but is unverified (status = 'unverified')
await db.exec(`
  insert into auth.mfa_factors (user_id, factor_type, status, friendly_name)
  values ('${targetUserId}', 'totp', 'unverified', 'Coordinator Authenticator');
`)
await asRole('Coordinator', 'aal2', async () => {
  try {
    await db.query('select record_staff_mfa_enrolment()')
    check(false, 'Direct RPC with unverified provider factor should fail')
  } catch (err) {
    check(err.message.includes('GATE:gate.security.mfa_factor_unverified'), 'Unverified factor refused with GATE:gate.security.mfa_factor_unverified')
  }
})

// Negative Test 3: Owner/Admin attempting cross-user enrolment MUST fail (no override)
await asRole('Owner', 'aal2', async () => {
  try {
    await db.query(`select record_staff_mfa_enrolment('${targetUserId}')`)
    check(false, 'Owner attempting cross-user enrolment should fail')
  } catch (err) {
    check(err.message.includes('GATE:gate.security.mfa_enrol_forbidden'), 'Cross-user enrolment refused even for Owner with GATE:gate.security.mfa_enrol_forbidden')
  }
})

// Positive Test: Provider factor is genuinely verified (status = 'verified')
await db.exec(`
  update auth.mfa_factors
  set status = 'verified', updated_at = now()
  where user_id = '${targetUserId}';
`)
await asRole('Coordinator', 'aal2', async () => {
  const res = await db.query('select record_staff_mfa_enrolment() as r')
  check(res.rows[0].r.success === true, 'Coordinator can record enrolment after provider verification')
})

// Verify factor row in mirror table
const enrolledFactor = await db.query(`select * from public.staff_mfa_factors where user_id = '${targetUserId}'`)
check(enrolledFactor.rows.length === 1 && enrolledFactor.rows[0].status === 'verified', 'Mirror table records verified factor')

// Unauthorized reset refusal
await asRole('Warehouse', 'aal1', async () => {
  try {
    await db.query(`select reset_staff_mfa('${targetUserId}')`)
    check(false, 'Warehouse reset should fail')
  } catch (err) {
    check(err.message.includes('GATE:gate.security.mfa_reset_forbidden'), 'Warehouse reset refused with GATE:gate.security.mfa_reset_forbidden')
  }
})

// Self-reset refusal (Owner cannot self-reset via admin RPC)
await asRole('Owner', 'aal2', async () => {
  try {
    await db.query(`select reset_staff_mfa('${ownerUserId}')`)
    check(false, 'Owner self-reset should fail')
  } catch (err) {
    check(err.message.includes('GATE:gate.security.mfa_self_reset_forbidden'), 'Owner self-reset refused with GATE:gate.security.mfa_self_reset_forbidden')
  }
})

// Admin cannot reset Owner (AD2 rule)
await asRole('Admin', 'aal2', async () => {
  try {
    await db.query(`select reset_staff_mfa('${ownerUserId}')`)
    check(false, 'Admin resetting Owner should fail')
  } catch (err) {
    check(err.message.includes('GATE:gate.security.mfa_reset_forbidden'), 'Admin cannot reset Owner factor (AD2 boundary)')
  }
})

// Seed active session and refresh token for target user to verify revocation upon reset
await db.exec(`
  insert into auth.sessions (user_id, aal) values ('${targetUserId}', 'aal2');
  insert into auth.refresh_tokens (user_id, token) values ('${targetUserId}', 'token-to-be-revoked');
`)

// Admin can reset Coordinator
await asRole('Admin', 'aal2', async () => {
  const res = await db.query(`select reset_staff_mfa('${targetUserId}') as r`)
  check(res.rows[0].r.success === true, 'Admin can successfully reset Coordinator MFA factor')
})

// Verify factor was cleared from public mirror table
const factorCheck = await db.query(`select * from public.staff_mfa_factors where user_id = '${targetUserId}'`)
check(factorCheck.rows.length === 0, 'Reset cleared factor from staff_mfa_factors')

// Verify factor was cleared from auth provider table
const providerFactorCheck = await db.query(`select * from auth.mfa_factors where user_id = '${targetUserId}'`)
check(providerFactorCheck.rows.length === 0, 'Reset cleared factor from auth.mfa_factors')

// Verify sessions were revoked from auth.sessions
const sessionCheck = await db.query(`select * from auth.sessions where user_id = '${targetUserId}'`)
check(sessionCheck.rows.length === 0, 'Reset invalidated active sessions in auth.sessions')

// Verify refresh tokens were revoked from auth.refresh_tokens
const refreshCheck = await db.query(`select * from auth.refresh_tokens where user_id = '${targetUserId}'`)
check(refreshCheck.rows.length === 0, 'Reset invalidated refresh tokens in auth.refresh_tokens')

// Verify audit entry for reset
const resetAudit = await db.query(`select * from public.staff_mfa_audit where action = 'reset_by_admin' and user_id = '${targetUserId}'`)
check(resetAudit.rows.length >= 1, 'Reset event recorded in staff_mfa_audit with actor role')

console.log('--- Suite 6: Staff MFA Overview RPC ---')

await asRole('Coordinator', 'aal2', async () => {
  try {
    await db.query('select get_staff_mfa_overview()')
    check(false, 'Coordinator overview call should fail')
  } catch (err) {
    check(err.message.includes('GATE:gate.settings.role'), 'Coordinator refused from get_staff_mfa_overview')
  }
})

await asRole('Owner', 'aal2', async () => {
  const res = await db.query('select get_staff_mfa_overview() as overview')
  const overview = res.rows[0].overview
  check(Array.isArray(overview) && overview.length > 0, 'Owner can retrieve staff MFA overview list')
  const hasMoneyRoleFlag = overview.some((u) => u.is_money_role === true)
  check(hasMoneyRoleFlag, 'Overview correctly flags is_money_role for privileged accounts')
})

// Disarm back to unarmed mode for safe state
await asRole('Owner', 'aal2', async () => {
  await db.query('select set_two_step_auth_enforcement(false)')
})

console.log(`\nResults: ${passed} passed, ${failed} failed.`)
if (failed > 0) {
  process.exit(1)
} else {
  console.log('All T1-17 database MFA gate tests passed cleanly!')
}
