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

await db.exec("reset role; select set_config('app.current_user_id','',false),set_config('request.jwt.claim.sub','',false)")
const state = (await db.query('select stage from bookings where id = $1', [booking.id])).rows[0]?.stage
assert.ok(state, 'negative authorization tests left booking present')
console.log('SEC-HOLD actor and branch guards passed (PGlite only; hosted acceptance pending)')
