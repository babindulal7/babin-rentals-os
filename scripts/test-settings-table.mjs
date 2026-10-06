#!/usr/bin/env node
// Booqable adoption spec G1 / RULING 2026-10-07 R-07-03. Proves (in PGlite) that the settings
// table stores one value shared by every device, keeps history, allows a location override only
// for operationalDayStart, refuses delete, and is Owner-write / money-gated-read.
// NOTE: RLS proven here is not proven for Supabase (see check-pglite.mjs header).
// EXCLUDE_MIGRATION=0158 applies everything except that file (proves the test fails without it).
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const MIG = join(HERE, '..', 'supabase', 'migrations')
const skip = process.env.EXCLUDE_MIGRATION
const db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })
await db.exec(readFileSync(join(HERE, '..', 'supabase', 'pglite-prelude.sql'), 'utf8'))
for (const f of readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort()) {
  if (skip && skip.split(',').some((x) => f.startsWith(x))) continue
  await db.exec(readFileSync(join(MIG, f), 'utf8'))
}

let failed = 0
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) failed++ }
const fails = async (sql, params = []) => { try { await db.query(sql, params); return false } catch { return true } }

const roleUser = async (role) => (await db.query(`select id from users where primary_role = $1 limit 1`, [role])).rows[0]?.id
const owner = await roleUser('Owner')
const warehouse = await roleUser('Warehouse')
const branch = (await db.query(`select id from branches order by created_at limit 1`)).rows[0].id

// As Owner (superuser session; the policies are exercised below under `authenticated`).
await db.query(`insert into settings (key, value, updated_by) values ('operationalDayStart', '"06:00"', $1)`, [owner])
await db.query(`update settings set value = '"05:00"' where key = 'operationalDayStart' and scope = 'org'`)
const hist = (await db.query(`select old_value, new_value, changed_by from settings_history where key = 'operationalDayStart' order by changed_at, id`)).rows
check(hist.length === 2, 'insert and change each leave one history row')
check(JSON.stringify(hist[1]?.old_value) === '"06:00"' && JSON.stringify(hist[1]?.new_value) === '"05:00"', 'the change row keeps old and new value')

await db.query(`update settings set value = '"05:00"' where key = 'operationalDayStart'`)
check((await db.query(`select count(*)::int n from settings_history where key='operationalDayStart'`)).rows[0].n === 2, 'a no-op write adds no history')

check(await fails(`insert into settings (key, value, scope, location_id) values ('vatRatePercent','13','location',$1)`, [branch]), 'only operationalDayStart may be overridden per location (R-07-03)')
check(await fails(`insert into settings (key, value, scope, location_id) values ('operationalDayStart','"07:00"','org',$1)`, [branch]), 'an org row cannot name a location')
check(await fails(`insert into settings (key, value, scope) values ('operationalDayStart','"07:00"','location')`), 'a location row must name a location')
check(!(await fails(`insert into settings (key, value, scope, location_id) values ('operationalDayStart','"07:00"','location',$1)`, [branch])), 'operationalDayStart may carry a location override')
check(await fails(`insert into settings (key, value) values ('operationalDayStart','"08:00"')`), 'one org value per key (unique)')
check(await fails(`delete from settings where key = 'operationalDayStart'`), 'a setting cannot be deleted (Law 3)')
check(await fails(`update settings_history set new_value = '"x"'`) && await fails(`delete from settings_history`), 'history is append-only')

// RLS, as the API role.
await db.query(`insert into settings (key, value) values ('vatRatePercent', '13')`)
async function asRole(userId, fn) {
  await db.query(`set role authenticated`)
  await db.query(`select set_config('app.current_user_id', $1, false)`, [userId])
  try { return await fn() } finally { await db.query(`reset role`); await db.query(`select set_config('app.current_user_id', '', false)`) }
}
if (warehouse) {
  const seen = await asRole(warehouse, async () => (await db.query(`select key from settings`)).rows.map((r) => r.key))
  check(seen.includes('operationalDayStart'), 'Warehouse can read a non-money setting')
  check(!seen.includes('vatRatePercent'), 'Warehouse cannot read a money-gated setting (Law 6)')
  check(await asRole(warehouse, () => fails(`update settings set value = '"09:00"' where key = 'operationalDayStart' and scope = 'org'`)) ||
    (await db.query(`select value from settings where key='operationalDayStart' and scope='org'`)).rows[0].value === '05:00',
    'Warehouse write is refused by RLS (value unchanged)')
}
if (owner) {
  await asRole(owner, async () => { await db.query(`update settings set value = '"06:30"' where key = 'operationalDayStart' and scope = 'org'`) })
  check((await db.query(`select value from settings where key='operationalDayStart' and scope='org'`)).rows[0].value === '06:30', 'Owner can write')
  const h = await asRole(owner, async () => (await db.query(`select count(*)::int n from settings_history`)).rows[0].n)
  check(h >= 3, 'Owner can read history')
}

console.log(failed ? `\n❌ ${failed} settings invariant(s) FAILED` : '\n🎉 SETTINGS TABLE INVARIANTS VERIFIED')
process.exit(failed ? 1 : 0)
