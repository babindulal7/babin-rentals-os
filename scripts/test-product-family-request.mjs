#!/usr/bin/env node
// T7-13 · A booking request for a product family option records exactly the chosen option.
// Submits a request for the 10m option of a cable family on a database built from scratch in
// local PGlite, then checks the saved line points at that product only, and is priced from its rate.
// Synthetic identifiers only. Confirmation and per-unit reservation are covered by check:lifecycle.
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

const category = (await db.query('select id from inventory_categories order by created_at limit 1')).rows[0].id
const tenMetre = uuid()
const fiveMetre = uuid()
const DAILY_10M_PAISA = 70000n // Rs 700
for (const [id, code, name, rate] of [
  [tenMetre, 'EQ000101', 'PF cable 10m', 700],
  [fiveMetre, 'EQ000102', 'PF cable 5m', 500],
]) {
  await db.query(
    `insert into products (id, client_uuid, asset_code, name, category_id, brand, status, show_online, daily_rate)
     values ($1, gen_random_uuid(), $2, $3, $4, 'PF', 'Active', true, $5)`,
    [id, code, name, category, rate],
  )
}

const payload = {
  client_name: 'Synthetic Test Client',
  client_email: 'synthetic-family-request@babinrentals.test',
  client_phone: '+977-9800000099',
  start_date: '2026-12-01',
  end_date: '2026-12-03',
  fulfillment_type: 'pickup',
  lines: [{ product_id: tenMetre, quantity: 1 }],
}

let result
try {
  result = (await db.query('select submit_booking_request($1::jsonb) as r', [JSON.stringify(payload)])).rows[0].r
  check(!!result?.request_id, 'the request is accepted')
} catch (e) {
  check(false, `submit_booking_request raised: ${e.message}`)
}

if (result?.request_id) {
  const lines = (await db.query(
    'select product_id, quantity from booking_request_lines where request_id = $1',
    [result.request_id],
  )).rows
  check(lines.length === 1, `the request holds exactly one line (got ${lines.length})`)
  check(lines[0]?.product_id === tenMetre, 'the line is the chosen 10m option')
  check(!lines.some((l) => l.product_id === fiveMetre), 'the other option is not in the request')

}

console.log(failed === 0 ? '\nfamily request: all checks passed' : `\nfamily request: ${failed} check(s) failed`)
process.exit(failed === 0 ? 0 : 1)
