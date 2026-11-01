#!/usr/bin/env node
/**
 * SEC-HOLD regression: isolated PGlite. Does NOT prove hosted JWT/PostgREST.
 * Runs the complete migration chain before probing actor and branch guards.
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'

const db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })
await db.exec(readFileSync('supabase/pglite-prelude.sql', 'utf8'))
await db.exec('alter table storage.buckets add column public boolean default true')
for (const file of readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync('supabase/migrations/' + file, 'utf8'))
}

const users = (await db.query('select id, primary_role from users')).rows
const owner = users.find(u => u.primary_role === 'Owner')?.id
const staff = users.find(u => u.primary_role === 'Warehouse')?.id
const booking = (await db.query('select id, branch_id from bookings limit 1')).rows[0]
assert.ok(owner && staff && booking?.id, 'seed contains Owner, Warehouse and a booking')

const uuid = async () => (await db.query('select gen_random_uuid() id')).rows[0].id
const otherBranch = await uuid()
await db.query(
  `insert into branches(id,client_uuid,branch_code,name,address,phone,created_by)
   values($1,gen_random_uuid(),'BR-SEC-HOLD','Security Test Other Branch','Test address','9800009999',$2)`,
  [otherBranch, owner],
)
await db.query("update users set primary_role = 'Coordinator', branch_id = $1 where id = $2", [otherBranch, staff])

async function asActor(id) {
  await db.exec("reset role; select set_config('app.current_user_id','',false),set_config('request.jwt.claim.sub','',false)")
  await db.query("select set_config('app.current_user_id',$1,false),set_config('request.jwt.claim.sub',$1,false)", [id])
  await db.exec('set role authenticated')
}
async function refused(label, sql, args, expected) {
  await assert.rejects(db.query(sql, args), e => expected.test(String(e?.message)), label)
  console.log('PASS ' + label)
}

await asActor(staff)
await refused(
  'Coordinator cannot forge confirm actor',
  'select confirm_booking_atomic($1::uuid,$2::uuid,$3::uuid)',
  [booking.id, owner, await uuid()],
  /confirmation actor must match/i,
)
await refused(
  'Coordinator cannot confirm booking in another branch',
  'select confirm_booking_atomic($1::uuid,$2::uuid,$3::uuid)',
  [booking.id, staff, await uuid()],
  /booking belongs to another branch/i,
)
await refused(
  'Coordinator cannot forge hold creator',
  'select create_or_extend_hold($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::int,$6::tstzrange,$7::int,$8::uuid,$9::uuid)',
  [booking.id, await uuid(), null, await uuid(), 1, null, 30, owner, await uuid()],
  /hold actor must match/i,
)
await refused(
  'Coordinator cannot forge hold releaser',
  'select release_hold($1::uuid,$2::text,$3::uuid)',
  [await uuid(), 'Security regression', owner],
  /hold release actor must match/i,
)

// Positive path: a valid same-branch Coordinator can hold an actual booking
// equipment line and then release the active Quote hold. Negative-only tests
// would miss an accidentally over-restrictive SECURITY DEFINER repair.
await db.exec("reset role; select set_config('app.current_user_id','',false),set_config('request.jwt.claim.sub','',false)")
const client = (await db.query('select id from clients order by id limit 1')).rows[0]
const product = (await db.query(
  'select p.id from products p where exists (select 1 from product_units u where u.product_id = p.id) order by p.id limit 1',
)).rows[0]
assert.ok(client?.id && product?.id, 'seed contains a Client and product with stock units')
const quote = (await db.query(
  `insert into bookings (client_uuid,booking_no,client_id,branch_id,pickup_at,return_at,stage,delivery_type,created_by,updated_by)
   values(gen_random_uuid(),'9900551',$1,$2,'2120-01-01 06:00:00+00','2120-01-03 06:00:00+00','Quote','Client Pickup',$3,$3)
   returning id`,
  [client.id, otherBranch, owner],
)).rows[0]
const line = (await db.query(
  `insert into booking_lines (client_uuid,booking_id,line_type,product_id,description,qty,days,rate,created_by)
   values(gen_random_uuid(),$1,'Equipment',$2,'SEC-HOLD valid stock test',1,2,0,$3)
   returning id`,
  [quote.id, product.id, owner],
)).rows[0]
await asActor(staff)
const held = (await db.query(
  `select create_or_extend_hold($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::int,$6::tstzrange,$7::int,$8::uuid,$9::uuid) as data`,
  [quote.id, line.id, null, product.id, 1, null, 30, await uuid(), staff],
)).rows[0].data
assert.equal(held.success, true, 'same-branch Coordinator can create hold')
assert.equal(held.hold_state, 'active_hold')
console.log('PASS same-branch Coordinator can create a valid hold')
const released = (await db.query(
  'select release_hold($1::uuid,$2::text,$3::uuid) as data',
  [held.reservation_id, 'Valid staff release', staff],
)).rows[0].data
assert.equal(released.success, true, 'same-branch Coordinator may release Quote hold')
const noRepeat = (await db.query(
  'select release_hold($1::uuid,$2::text,$3::uuid) as data',
  [held.reservation_id, 'Duplicate release', staff],
)).rows[0].data
assert.equal(noRepeat.success, false, 'second release cannot delete or re-release a hold')
console.log('PASS active Quote hold release succeeds once and double-release is refused')

await db.exec("reset role; select set_config('app.current_user_id','',false),set_config('request.jwt.claim.sub','',false)")
await db.query('update users set branch_id=$1 where id=$2', [booking.branch_id, staff])
await asActor(staff)
await refused(
  'Coordinator cannot place a hold on another branch booking',
  `select create_or_extend_hold($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::int,$6::tstzrange,$7::int,$8::uuid,$9::uuid)`,
  [quote.id, line.id, null, product.id, 1, null, 30, await uuid(), staff],
  /booking belongs to another branch/i,
)

await db.exec("reset role; select set_config('app.current_user_id','',false),set_config('request.jwt.claim.sub','',false)")
const state = (await db.query('select stage from bookings where id = $1', [booking.id])).rows[0]?.stage
assert.ok(state, 'negative authorization tests left booking present')
console.log('SEC-HOLD actor and branch guards passed (PGlite only; hosted acceptance pending)')
