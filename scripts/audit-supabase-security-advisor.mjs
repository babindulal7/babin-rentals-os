/**
 * scripts/audit-supabase-security-advisor.mjs
 *
 * Automated inspector for T-SB-01: Supabase Security Acceptance Audit.
 * Rebuilds schema from scratch in PGlite and inspects:
 *  1. staff_directory_v definition, grants, reloptions, and multi-role data disclosure.
 *  2. Security definer functions: permissions for anon vs authenticated, search_path pinning.
 *  3. Security definer views: reloptions, permissions, and row predicates.
 *  4. Storage policies on storage.objects.
 */

import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const MIG = join(ROOT, 'supabase', 'migrations')

const db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })

console.log('Loading prelude and migrations into PGlite...')
await db.exec(readFileSync(join(ROOT, 'supabase', 'pglite-prelude.sql'), 'utf8'))
try {
  await db.exec('alter table storage.buckets add column if not exists public boolean default true')
} catch {}

const files = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort()
for (const file of files) {
  try {
    await db.exec(readFileSync(join(MIG, file), 'utf8'))
  } catch (err) {
    console.error(`Failed migration ${file}:`, err.message)
    process.exit(1)
  }
}
console.log(`Applied ${files.length} migrations.`)

const report = {
  timestamp: new Date().toISOString(),
  head: '0a2970e1',
  migrations_count: files.length,
  staff_directory_v: {},
  security_definer_functions: [],
  security_definer_views: [],
  storage_policies: [],
  role_disclosure_checks: {},
}

// 1. Inspect staff_directory_v
const viewMeta = (await db.query(`
  SELECT c.relname, c.reloptions,
         has_table_privilege('anon', c.oid, 'SELECT') AS anon_can_select,
         has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_can_select
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'staff_directory_v';
`)).rows[0]

const viewDef = (await db.query(`
  SELECT pg_get_viewdef('public.staff_directory_v'::regclass, true) as def;
`)).rows[0]?.def

report.staff_directory_v = {
  meta: viewMeta,
  definition: viewDef,
}

// 2. Inventory SECURITY DEFINER functions in public schema
const secDefFuncs = (await db.query(`
  SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args,
         p.prosecdef AS security_definer,
         has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
         proconfig
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef
  ORDER BY p.proname;
`)).rows

report.security_definer_functions = secDefFuncs.map(f => ({
  name: f.proname,
  args: f.args,
  anon_execute: f.anon_execute,
  authenticated_execute: f.authenticated_execute,
  has_search_path: Array.isArray(f.proconfig) && f.proconfig.some(c => c.startsWith('search_path=')),
  config: f.proconfig,
}))

// 3. Inventory Views in public schema
const publicViews = (await db.query(`
  SELECT c.relname, c.reloptions,
         has_table_privilege('anon', c.oid, 'SELECT') AS anon_can_select,
         has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_can_select
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'v'
  ORDER BY c.relname;
`)).rows

report.public_views = publicViews.map(v => ({
  name: v.relname,
  reloptions: v.reloptions,
  anon_can_select: v.anon_can_select,
  authenticated_can_select: v.authenticated_can_select,
}))

// 4. Inventory Storage Policies
const storagePolicies = (await db.query(`
  SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
  FROM pg_policies
  WHERE schemaname = 'storage'
  ORDER BY tablename, policyname;
`)).rows

report.storage_policies = storagePolicies

// 5. Behavioral testing of staff_directory_v across roles
// Find seeded staff and create synthetic identities if needed
await db.exec('reset role;')
const defaultBranch = (await db.query(`SELECT id FROM public.branches LIMIT 1`)).rows[0]?.id
const allUsers = (await db.query(`SELECT id, full_name, email, primary_role FROM public.users ORDER BY id`)).rows

async function asRole(role, userId) {
  await db.exec("reset role; select set_config('app.current_user_id','',false),set_config('request.jwt.claim.sub','',false)")
  if (role === 'anon') {
    await db.exec('set role anon')
    return
  }
  await db.query("select set_config('app.current_user_id',$1,false),set_config('request.jwt.claim.sub',$1,false)", [userId])
  await db.exec('set role authenticated')
}

// 5a. Check anon
await asRole('anon')
let anonError = null
let anonRows = []
try {
  anonRows = (await db.query('SELECT * FROM public.staff_directory_v')).rows
} catch (e) {
  anonError = e.message
}
report.role_disclosure_checks['anon'] = {
  allowed: anonError === null,
  error: anonError,
  row_count: anonRows.length,
}

// 5b. Reset to superuser to check or insert synthetic identities
await db.exec('reset role;')

const testRoles = [
  'Client',
  'Warehouse',
  'Technician',
  'Driver',
  'Coordinator',
  'Accounts',
  'Manager',
  'Admin',
  'Owner'
]

for (const role of testRoles) {
  await db.exec('reset role;')
  let user = allUsers.find(u => u.primary_role === role)
  if (!user) {
    const newId = crypto.randomUUID()
    const empCode = `EMP${Math.floor(1000 + Math.random() * 9000)}`
    const mobile = `+977-98${Math.floor(10000000 + Math.random() * 90000000)}`
    await db.query(`
      INSERT INTO public.users (id, client_uuid, full_name, email, employee_code, mobile, branch_id, primary_role, is_active)
      VALUES ($1, gen_random_uuid(), $2, $3, $4, $5, $6, $7, true)
    `, [newId, `Synthetic ${role}`, `${role.toLowerCase()}@test.local`, empCode, mobile, defaultBranch, role])
    user = { id: newId, primary_role: role }
  }

  await asRole('authenticated', user.id)
  let result = null
  let queryError = null
  try {
    const res = await db.query('SELECT * FROM public.staff_directory_v')
    result = res.rows
  } catch (e) {
    queryError = e.message
  }

  if (queryError) {
    report.role_disclosure_checks[role] = { error: queryError, row_count: 0 }
  } else {
    const exposedEmails = result.filter(r => r.email !== null)
    const exposedMobiles = result.filter(r => r.mobile !== null)
    const exposedPins = result.filter(r => r.has_pin === true || r.pin_set_at !== null)
    const exposedAuths = result.filter(r => r.has_auth_account === true || r.last_sign_in_at !== null)

    report.role_disclosure_checks[role] = {
      row_count: result.length,
      sample_visible_names: result.slice(0, 3).map(r => r.full_name),
      exposed_email_count: exposedEmails.length,
      exposed_mobile_count: exposedMobiles.length,
      exposed_pin_metadata_count: exposedPins.length,
      exposed_auth_metadata_count: exposedAuths.length,
      unmasked: exposedEmails.length > 0,
    }
  }
}

await db.exec('reset role;')
await db.close()

writeFileSync(join(ROOT, 'docs', 'verification', 'audit_supabase_security_raw.json'), JSON.stringify(report, null, 2))
console.log('Security audit completed. Raw data written to docs/verification/audit_supabase_security_raw.json')
