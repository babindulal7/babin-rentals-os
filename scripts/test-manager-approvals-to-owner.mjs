#!/usr/bin/env node
// R-22.8 (22 Nov 2026) · Manager-level approvals go to the Owner while the Settings choice is on (0264).
// Proves on a database built from scratch in local PGlite: with the default (on), a Manager cannot
// approve damage or late-fee waivers, and the Owner can; with the setting off, the existing rules apply;
// with no setting row, the default (on) applies. Synthetic identifiers only.
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const MIG = join(HERE, '..', 'supabase', 'migrations')
const db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })
await db.exec(readFileSync(join(HERE, '..', 'supabase', 'pglite-prelude.sql'), 'utf8'))
for (const f of readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(join(MIG, f), 'utf8'))
}

let failed = 0
const check = (ok, msg) => { console.log(`${ok ? '[ok] ' : '[FAIL]'} ${msg}`); if (!ok) failed++ }
const uuid = () => crypto.randomUUID()

const branch = (await db.query('select id from branches order by created_at limit 1')).rows[0].id
const users = { Owner: uuid(), Manager: uuid() }
for (const [role, id] of Object.entries(users)) {
  await db.query(
    `insert into users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
     values ($1, gen_random_uuid(), $2, $3, $4, '+977-9800000002', $5, $6, true, $1)`,
    [id, `EMP-MA-${role}`, `${role.toLowerCase()}-ma@babinrentals.test`, `MA ${role}`, role, branch],
  )
}
const as = (role) => db.exec(`reset role; select set_config('app.current_user_id', '${users[role]}', false); set role authenticated;`)
const resetRole = () => db.exec('reset role; select set_config(\'app.current_user_id\', \'\', false);')

const damage = async (charge) => (await db.query('select auth_can_approve_damage($1::numeric) as ok', [charge])).rows[0].ok
const lateFee = async () => (await db.query('select auth_can_approve_late_fee_waiver() as ok')).rows[0].ok

// 1. Default: the seeded setting is on.
await as('Manager')
check((await damage(100)) === false, 'default on: Manager cannot approve damage below Rs 25,000')
check((await damage(30000)) === false, 'default on: Manager cannot approve damage at or above Rs 25,000')
check((await lateFee()) === false, 'default on: Manager cannot approve a late-fee waiver')
await as('Owner')
check((await damage(100)) === true, 'default on: Owner approves damage below Rs 25,000')
check((await damage(30000)) === true, 'default on: Owner approves damage at or above Rs 25,000')
check((await lateFee()) === true, 'default on: Owner approves a late-fee waiver')
await resetRole()

// 2. Setting off: the existing rules apply again.
await db.query(`update settings set value = 'false'::jsonb where key = 'managerApprovalsToOwner' and scope = 'org' and location_id is null`)
await as('Manager')
check((await damage(100)) === true, 'setting off: Manager approves damage below Rs 25,000 (0057 rule)')
check((await damage(30000)) === false, 'setting off: Manager still cannot approve damage at or above Rs 25,000')
check((await lateFee()) === true, 'setting off: Manager approves a late-fee waiver (0058 rule)')
await as('Owner')
check((await damage(30000)) === true, 'setting off: Owner still approves damage at or above Rs 25,000')
check((await lateFee()) === true, 'setting off: Owner still approves a late-fee waiver')
await resetRole()

// 3. The setting row cannot be deleted (Law 3, nothing is deleted), so a missing row never happens.
//    The refusal is checked and rolled back, so the table is left as it was.
await db.exec('begin')
let deleteRefused = false
try {
  await db.query(`delete from settings where key = 'managerApprovalsToOwner' and scope = 'org' and location_id is null`)
} catch (error) {
  deleteRefused = /Law 3/.test(error.message)
}
await db.exec('rollback')
check(deleteRefused, 'the managerApprovalsToOwner row cannot be deleted (Law 3)')

console.log(failed === 0 ? '\nmanager approvals to owner: all checks passed' : `\nmanager approvals to owner: ${failed} check(s) failed`)
process.exit(failed === 0 ? 0 : 1)
