// scripts/rehearse-batch-0-anon-rpcs.mjs — Batch 0 rehearsal and privilege verification
//
// Demonstrates offline in PGlite:
//   1. Pre-0163 baseline: builds migrations up to 0162; confirms all 6 RPCs are executable by anon.
//   2. Applies 0163_close_six_anon_business_rpcs.sql.
//   3. Post-0163 verification: confirms anon EXECUTE is revoked, authenticated EXECUTE is preserved.
//   4. Negative behavioral execution: confirms anon invocation fails with 'permission denied'.
//   5. Rollback drill: applies emergency rollback grants, asserts clean restoration, and re-applies 0163.
//
// Zero network or production access; safe for local and CI execution under Law N-5.

import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TARGET_FUNCTIONS = [
  'adjust_stock',
  'portal_claim_by_verified_email',
  'read_quote_editor',
  'set_staff_active',
  'set_staff_role',
  'update_rental_quote',
]

console.log('BATCH 0 (0163) REHEARSAL & PRIVILEGE LOCKDOWN HARNESS')
console.log('========================================================================')

const db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })
await db.exec(readFileSync(join(ROOT, 'supabase/pglite-prelude.sql'), 'utf8'))

const allMigrations = readdirSync(join(ROOT, 'supabase/migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort()

// 1. Build up to 0162
const pre0163Files = allMigrations.filter((f) => {
  const prefix = parseInt(f.slice(0, 4), 10)
  return !isNaN(prefix) && prefix < 163
})

console.log(`Phase 1: Building pre-0163 baseline (${pre0163Files.length} migrations)...`)
for (const f of pre0163Files) {
  await db.exec(readFileSync(join(ROOT, 'supabase/migrations', f), 'utf8'))
}

// Replicate live production environment (where these 6 functions currently have anon EXECUTE)
await db.exec(`
  grant execute on function public.adjust_stock(uuid, integer, text, uuid, uuid) to anon;
  grant execute on function public.portal_claim_by_verified_email() to anon;
  grant execute on function public.read_quote_editor(text) to anon;
  grant execute on function public.set_staff_active(uuid, boolean) to anon;
  grant execute on function public.set_staff_role(uuid, public.system_role) to anon;
  grant execute on function public.update_rental_quote(uuid, text, uuid, jsonb) to anon;
`)

const checkPrivileges = async () => {
  const rows = await db.query(`
    select p.proname,
           p.oid::regprocedure::text as signature,
           has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_execute
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (${TARGET_FUNCTIONS.map((f) => `'${f}'`).join(', ')})
     order by p.proname
  `)
  return rows.rows
}

let before = await checkPrivileges()
console.log('\nBaseline privilege check (pre-0163):')
let baselineExposed = 0
for (const row of before) {
  console.log(`  - ${row.proname}: anon=${row.anon_execute}, authenticated=${row.auth_execute}`)
  if (row.anon_execute) baselineExposed++
}

if (baselineExposed !== TARGET_FUNCTIONS.length) {
  console.error(`WARNING: expected ${TARGET_FUNCTIONS.length} exposed functions, found ${baselineExposed}`)
}

// 2. Apply 0163
console.log('\nPhase 2: Applying 0163_close_six_anon_business_rpcs.sql...')
const migration0163 = readFileSync(join(ROOT, 'supabase/migrations/0163_close_six_anon_business_rpcs.sql'), 'utf8')
await db.exec(migration0163)
console.log('  Applied successfully.')

// 3. Post-0163 verification
console.log('\nPhase 3: Post-0163 privilege check:')
let after = await checkPrivileges()
let anyAnon = false
let missingAuth = false

for (const row of after) {
  console.log(`  - ${row.proname}: anon=${row.anon_execute}, authenticated=${row.auth_execute}`)
  if (row.anon_execute) anyAnon = true
  if (!row.auth_execute) missingAuth = true
}

if (anyAnon) {
  console.error('FAIL: One or more business functions still executable by anon!')
  process.exit(1)
}
if (missingAuth) {
  console.error('FAIL: One or more business functions missing authenticated EXECUTE!')
  process.exit(1)
}
console.log('  PASS: All 6 functions revoked from anon; authenticated EXECUTE preserved.')

// 4. Behavioral execution check
console.log('\nPhase 4: Behavioral invocation under role anon:')
const calls = [
  { name: 'adjust_stock', sql: "select adjust_stock(gen_random_uuid(), 1, 'probe', gen_random_uuid(), gen_random_uuid())" },
  { name: 'portal_claim_by_verified_email', sql: 'select portal_claim_by_verified_email()' },
  { name: 'read_quote_editor', sql: "select read_quote_editor('Q-0001')" },
  { name: 'set_staff_active', sql: 'select set_staff_active(gen_random_uuid(), true)' },
  { name: 'set_staff_role', sql: "select set_staff_role(gen_random_uuid(), 'Admin'::system_role)" },
  { name: 'update_rental_quote', sql: "select update_rental_quote(gen_random_uuid(), 'probe', gen_random_uuid(), '{}'::jsonb)" },
]

for (const c of calls) {
  try {
    await db.exec('begin')
    await db.exec('set local role anon')
    await db.query(c.sql)
    await db.exec('reset role')
    await db.exec('rollback')
    console.error(`  FAIL: ${c.name} unexpectedly succeeded as anon!`)
    process.exit(1)
  } catch (err) {
    try { await db.exec('rollback') } catch {}
    const msg = String(err.message).split('\n')[0]
    if (msg.includes('permission denied for function')) {
      console.log(`  PASS: ${c.name} properly rejected (${msg})`)
    } else {
      console.error(`  UNEXPECTED ERROR on ${c.name}: ${msg}`)
      process.exit(1)
    }
  }
}

// 5. Emergency Rollback Simulation
console.log('\nPhase 5: Emergency rollback & re-apply verification...')
const rollbackSql = `
begin;
grant execute on function public.adjust_stock(uuid, integer, text, uuid, uuid) to anon;
grant execute on function public.portal_claim_by_verified_email() to anon;
grant execute on function public.read_quote_editor(text) to anon;
grant execute on function public.set_staff_active(uuid, boolean) to anon;
grant execute on function public.set_staff_role(uuid, public.system_role) to anon;
grant execute on function public.update_rental_quote(uuid, text, uuid, jsonb) to anon;
commit;
`
await db.exec(rollbackSql)
const rollbackState = await checkPrivileges()
const rollbackExposed = rollbackState.filter((r) => r.anon_execute).length
if (rollbackExposed === TARGET_FUNCTIONS.length) {
  console.log('  PASS: Emergency rollback script restored pre-0163 grant state cleanly.')
} else {
  console.error(`FAIL: Rollback restored only ${rollbackExposed}/${TARGET_FUNCTIONS.length} grants.`)
  process.exit(1)
}

// Re-apply 0163 after rollback
await db.exec(migration0163)
const reapplyState = await checkPrivileges()
const reapplyExposed = reapplyState.filter((r) => r.anon_execute).length
if (reapplyExposed === 0) {
  console.log('  PASS: Re-application of 0163 after rollback closed all 6 RPCs cleanly.')
} else {
  console.error(`FAIL: Re-application failed with ${reapplyExposed} remaining exposed.`)
  process.exit(1)
}

await db.close()
console.log('\n========================================================================')
console.log('BATCH 0 REHEARSAL COMPLETE: PASS (All checks verified offline in PGlite)')
