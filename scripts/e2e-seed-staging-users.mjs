#!/usr/bin/env node
/**
 * scripts/e2e-seed-staging-users.mjs
 *
 * Creates or refreshes three dedicated E2E test accounts on the STAGING
 * Supabase project only:
 *   e2e-owner@babinrentals.test    (Owner)
 *   e2e-manager@babinrentals.test  (Manager)
 *   e2e-staff@babinrentals.test    (Warehouse, floor operations granted)
 *
 * Passwords are generated here, never committed. They are written to
 * .env.staging.local (gitignored) as E2E_* variables.
 *
 * Does NOT touch the shared staging seats (a0000000-...) or any other row.
 *
 * Usage (from the repo root, with .env.staging.local present):
 *   node scripts/e2e-seed-staging-users.mjs
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import pg from 'pg'

const ENV_FILE = resolve('.env.staging.local')
const STAGING_REF = 'klhmsrunqrdxjudyhnkm'
const PRODUCTION_REF = 'sxguwvgoserhdolewibb'

if (!existsSync(ENV_FILE)) {
  console.error('[FATAL] .env.staging.local not found in the repo root.')
  process.exit(1)
}

// Parse the env file into a map; values are never printed.
const envLines = readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)
const env = {}
for (const line of envLines) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}

const dbUrl = env.BABIN_STAGING_DB_URL
if (!dbUrl) {
  console.error('[FATAL] BABIN_STAGING_DB_URL missing from .env.staging.local.')
  process.exit(1)
}
// Safety guard: the connection string must name the staging project and never production.
if (!dbUrl.includes(STAGING_REF) || dbUrl.includes(PRODUCTION_REF)) {
  console.error('[FATAL] Refusing to run: connection string is not the staging project.')
  process.exit(1)
}

const SEATS = [
  {
    key: 'OWNER', id: 'e2e00000-0000-4000-8000-000000000001', email: 'e2e-owner@babinrentals.test',
    name: 'E2E Owner', role: 'Owner', code: 'EMP-E2E-001', mobile: '+9779811000001', grants: true,
  },
  {
    key: 'MANAGER', id: 'e2e00000-0000-4000-8000-000000000002', email: 'e2e-manager@babinrentals.test',
    name: 'E2E Manager', role: 'Manager', code: 'EMP-E2E-002', mobile: '+9779811000002', grants: false,
  },
  {
    key: 'STAFF', id: 'e2e00000-0000-4000-8000-000000000003', email: 'e2e-staff@babinrentals.test',
    name: 'E2E Staff', role: 'Warehouse', code: 'EMP-E2E-003', mobile: '+9779811000003', grants: true,
  },
]

// Fresh random passwords every run; 24 chars of base64url plus a fixed suffix to meet typical complexity rules.
const passwords = Object.fromEntries(SEATS.map((s) => [s.key, randomBytes(18).toString('base64url') + 'Aa1!']))

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
})

try {
  await client.connect()
  await client.query('begin')

  const br = await client.query('select id from branches order by created_at limit 1')
  if (br.rowCount === 0) throw new Error('No branch row on staging; seed the staging branch first.')
  const branchId = br.rows[0].id

  for (const s of SEATS) {
    await client.query(
      `insert into auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data,
         raw_user_meta_data, aud, role, is_sso_user, created_at, updated_at)
       values ($1, '00000000-0000-0000-0000-000000000000'::uuid, $2, extensions.crypt($3, extensions.gen_salt('bf')), now(),
         '{"provider":"email","providers":["email"]}'::jsonb,
         jsonb_build_object('full_name', $4::text, 'role', $5::text), 'authenticated', 'authenticated', false, now(), now())
       on conflict (id) do update set
         instance_id = excluded.instance_id,
         email = excluded.email,
         encrypted_password = excluded.encrypted_password,
         email_confirmed_at = coalesce(auth.users.email_confirmed_at, now()),
         updated_at = now()`,
      [s.id, s.email, passwords[s.key], s.name, s.role],
    )

    // GoTrue fails with a 500 on NULL token columns; existing staging rows use ''.
    await client.query(
      `update auth.users set
         confirmation_token = coalesce(confirmation_token, ''),
         recovery_token = coalesce(recovery_token, ''),
         email_change = coalesce(email_change, ''),
         email_change_token_new = coalesce(email_change_token_new, '')
       where id = $1`,
      [s.id],
    )

    await client.query('delete from auth.identities where user_id = $1', [s.id])
    await client.query(
      `insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
       values (gen_random_uuid(), $1::uuid, jsonb_build_object('sub', $1::text, 'email', $2::text), 'email', $1::text, now(), now(), now())`,
      [s.id, s.email],
    )

    await client.query(
      `insert into public.users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active)
       values ($1, gen_random_uuid(), $2, $3, $4, $5, $6::system_role, $7, true)
       on conflict (id) do update set
         primary_role = excluded.primary_role,
         branch_id = excluded.branch_id,
         email = excluded.email,
         full_name = excluded.full_name,
         is_active = true`,
      [s.id, s.code, s.email, s.name, s.mobile, s.role, branchId],
    )

    if (s.grants) {
      for (const op of ['pack', 'handover', 'return', 'reset']) {
        await client.query(
          `insert into operations_grants (client_uuid, user_id, branch_id, operation, granted_by, granted_at)
           select gen_random_uuid(), $1, $2, $3, $1, now()
           where not exists (
             select 1 from operations_grants
             where user_id = $1 and branch_id = $2 and operation = $3 and revoked_at is null)`,
          [s.id, branchId, op],
        )
      }
    }
  }

  await client.query('commit')
  console.log('[OK] Seeded 3 E2E users on staging project', STAGING_REF)
} catch (err) {
  await client.query('rollback').catch(() => {})
  console.error('[FAIL] Seed rolled back:', err.message)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}

if (process.exitCode) process.exit(process.exitCode)

// Write E2E_* variables into the gitignored env file, replacing any old E2E_ lines.
const kept = envLines.filter((l) => !/^\s*E2E_(OWNER|MANAGER|STAFF)_(EMAIL|PASSWORD)\s*=/.test(l))
while (kept.length && kept[kept.length - 1].trim() === '') kept.pop()
kept.push('')
kept.push('# E2E test accounts (generated by scripts/e2e-seed-staging-users.mjs). Staging only.')
for (const s of SEATS) {
  kept.push(`E2E_${s.key}_EMAIL=${s.email}`)
  kept.push(`E2E_${s.key}_PASSWORD=${passwords[s.key]}`)
}
writeFileSync(ENV_FILE, kept.join('\n') + '\n', 'utf8')
console.log('[OK] Wrote E2E_* variables to .env.staging.local (gitignored). Passwords not printed.')
