#!/usr/bin/env node
// Online request totals are in paisa (0265). A product rate of Rs 700 per day for three days
// is 210,000 paisa, with 13% VAT of 27,300 and a 50% advance of 118,650. Runs on a database built
// from scratch in local PGlite. Synthetic identifiers only.
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
const product = uuid()
await db.query(
  `insert into products (id, client_uuid, asset_code, name, category_id, brand, status, show_online, daily_rate)
   values ($1, gen_random_uuid(), 'EQ000201', 'PF paisa cable 10m', $2, 'PF', 'Active', true, 700)`,
  [product, category],
)

const result = (await db.query('select submit_booking_request($1::jsonb) as r', [JSON.stringify({
  client_name: 'Synthetic Test Client',
  client_email: 'synthetic-paisa@babinrentals.test',
  client_phone: '+977-9800000098',
  start_date: '2026-12-01',
  end_date: '2026-12-03',
  fulfillment_type: 'pickup',
  lines: [{ product_id: product, quantity: 1 }],
})])).rows[0].r

check(Number(result.total_paisa) === 210000, `total is 210,000 paisa for Rs 700 x 3 days (got ${result.total_paisa})`)
check(Number(result.vat_paisa) === 27300, `VAT is 27,300 paisa at 13% (got ${result.vat_paisa})`)
check(Number(result.advance_due_paisa) === 118650, `advance is 118,650 paisa at 50% (got ${result.advance_due_paisa})`)

const line = (await db.query('select daily_rate_paisa, line_total_paisa from booking_request_lines where request_id = $1', [result.request_id])).rows[0]
check(Number(line.daily_rate_paisa) === 70000, `line daily rate is 70,000 paisa (got ${line.daily_rate_paisa})`)
check(Number(line.line_total_paisa) === 210000, `line total is 210,000 paisa (got ${line.line_total_paisa})`)

console.log(failed === 0 ? '\nsubmit request paisa: all checks passed' : `\nsubmit request paisa: ${failed} check(s) failed`)
process.exit(failed === 0 ? 0 : 1)
