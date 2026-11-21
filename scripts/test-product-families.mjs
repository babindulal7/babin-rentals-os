#!/usr/bin/env node
// T7-13 · Product families (migrations 0261, 0262). Proves on a database built from scratch
// in local PGlite: Owner can group, grouping is idempotent on client_uuid, Warehouse is
// refused, a product cannot sit in two families, a family needs two options, and anonymous
// visitors see only publicly sold options. Synthetic identifiers only.
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
const users = { Owner: uuid(), Warehouse: uuid() }
for (const [role, id] of Object.entries(users)) {
  await db.query(
    `insert into users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
     values ($1, gen_random_uuid(), $2, $3, $4, '+977-9800000001', $5, $6, true, $1)`,
    [id, `EMP-PF-${role}`, `${role.toLowerCase()}-pf@babinrentals.test`, `PF ${role}`, role, branch],
  )
}
const as = (role) => db.exec(`reset role; select set_config('app.current_user_id', '${users[role]}', false); set role authenticated;`)
const resetRole = () => db.exec(`reset role; select set_config('app.current_user_id', '', false);`)

// Four synthetic products: three publicly sold, one not online.
const products = [uuid(), uuid(), uuid(), uuid()]
const names = ['PF lens EF', 'PF lens PL', 'PF cable 5m', 'PF cable 10m']
const category = (await db.query('select id from inventory_categories order by created_at limit 1')).rows[0].id
for (const [i, id] of products.entries()) {
  await db.query(
    `insert into products (id, client_uuid, asset_code, name, category_id, brand, status, show_online, daily_rate)
     values ($1, gen_random_uuid(), $2, $3, $4, 'PF', 'Active', $5, 100)`,
    [id, `EQ00000${i + 1}`, names[i], category, i < 3],
  )
}

const members = (ids) => JSON.stringify(ids.map((id, i) => ({
  product_id: id, option_label: `Option ${i + 1}`, sort_order: i, client_uuid: uuid(),
})))

const clientUuid = uuid()
await as('Owner')
let familyId
try {
  familyId = (await db.query('select group_products_into_family($1, $2, $3::jsonb) as id', [clientUuid, 'PF lens family', members(products.slice(0, 2))])).rows[0].id
  check(!!familyId, 'Owner can group two active products into a family')
} catch (e) { check(false, `Owner grouping raised: ${e.message}`) }

try {
  const again = (await db.query('select group_products_into_family($1, $2, $3::jsonb) as id', [clientUuid, 'PF lens family', members(products.slice(0, 2))])).rows[0].id
  check(again === familyId, 'same client_uuid returns the same family (idempotent)')
} catch (e) { check(false, `idempotent retry raised: ${e.message}`) }
await resetRole()

const count = (await db.query('select count(*)::int as n from product_family_members where family_id = $1', [familyId])).rows[0].n
check(count === 2, `family holds exactly two members (got ${count})`)

await as('Warehouse')
try {
  await db.query('select group_products_into_family($1, $2, $3::jsonb)', [uuid(), 'Warehouse try', members(products.slice(2, 4))])
  check(false, 'Warehouse grouping must be refused')
} catch (e) {
  check(/permission denied/i.test(e.message), 'Warehouse grouping is refused')
}

await as('Owner')
try {
  await db.query('select group_products_into_family($1, $2, $3::jsonb)', [uuid(), 'Second family', members([products[0], products[2]])])
  check(false, 'a product already in a family must not join a second family')
} catch (e) {
  check(true, 'a product already in a family is refused')
}
try {
  await db.query('select group_products_into_family($1, $2, $3::jsonb)', [uuid(), 'One option', members([products[3]])])
  check(false, 'a family with one option must be refused')
} catch (e) {
  check(/at least two options/.test(e.message), 'a family with one option is refused')
}

// Second family: one publicly sold option and one that is not online.
await db.query('select group_products_into_family($1, $2, $3::jsonb)', [uuid(), 'Cables', members([products[2], products[3]])])
await resetRole()

// Anonymous visitors read only publicly sold options.
await db.exec('reset role; set role anon')
const anonRows = (await db.query('select product_id, option_label from public_product_family_options_v')).rows
await resetRole()
check(anonRows.length === 3, `anon sees exactly the three publicly sold options (got ${anonRows.length})`)
check(!anonRows.some((r) => r.product_id === products[3]), 'a product that is not online never appears to anon')

console.log(failed === 0 ? '\nproduct families: all checks passed' : `\nproduct families: ${failed} check(s) failed`)
process.exit(failed === 0 ? 0 : 1)
