#!/usr/bin/env node
/**
 * Issue #440 cancellation authorization regression on disposable PGlite, never hosted Supabase.
 * Checks real SECURITY DEFINER RPC execution under authenticated test identities.
 * Hosted JWT/PostgREST verification is STILL REQUIRED before production.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })
const q = (sql, args = []) => db.query(sql, args)
const one = async (sql, args = []) => (await q(sql, args)).rows[0]
let passed = 0
const failures = []
const check = async (name, action) => {
  try {
    await action()
    console.log(`PASS ${name}`)
    passed++
  } catch (error) {
    failures.push(name)
    console.error(`FAIL ${name}: ${error.message}`)
  }
}
const denied = async (sql, args = []) => {
  await assert.rejects(q(sql, args), error => error.code === '42501', 'expected permission denial (42501)')
}
try {
  await db.exec(readFileSync(join(root, 'supabase/pglite-prelude.sql'), 'utf8'))
  for (const file of readdirSync(join(root, 'supabase/migrations')).filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(root, 'supabase/migrations', file), 'utf8'))
  }

  // Explicit opt-in for isolated repair proof; default still tests real migrations.
  if (process.argv.includes('--candidate')) {
    console.log('TEST-ONLY candidate SQL: not part of deployable migrations')
    await db.exec(readFileSync(join(root, 'scripts/fixtures/cancellation-branch-boundary-candidate.sql'), 'utf8'))
  }

  const owner = (await one("select id from public.users where primary_role = 'Owner' order by created_at limit 1"))?.id
  assert.ok(owner, 'seed must contain an Owner')
  const branchA = (await one('select id from public.branches order by created_at limit 1'))?.id
  assert.ok(branchA, 'seed must contain a branch')
  const branchB = (await one(
    `insert into public.branches(client_uuid,branch_code,name,address,phone,created_by)
     values(gen_random_uuid(),'BR-CANCEL-TEST','Cancellation security branch','Local fixture','9800000009',$1) returning id`,
    [owner],
  )).id

  const ids = {}
  const actors = [
    ['CoordinatorA', 'Coordinator', branchA],
    ['AdminA', 'Admin', branchA],
    ['WarehouseB', 'Warehouse', branchB],
    ['DriverA', 'Driver', branchA],
    ['Client', 'Client', branchA],
  ]
  for (const [name, role, site] of actors) {
    const id = (await one(
      `insert into public.users(id,client_uuid,employee_code,email,full_name,mobile,primary_role,branch_id,is_active,created_by)
       values(gen_random_uuid(),gen_random_uuid(),$1,$2,$3,'9800000099',$4,$5,true,$6) returning id`,
      [`CAN-${name}`, `cancel-${name.toLowerCase()}@isolated.test`, `Cancel ${name}`, role, site, owner],
    )).id
    ids[name] = id
  }

  const client = async name => {
    const code = (await one("select next_document_number('client') as code")).code
    return (await one(
      `insert into public.clients(client_uuid,client_code,name,phone,created_by)
       values(gen_random_uuid(),$1,$2,$3,$4) returning id`, [code, name, name.endsWith(' A') ? '+9779700000440' : '+9779700000441', owner],
    )).id
  }
  const clientA = await client('Cancellation Security A')
  const clientB = await client('Cancellation Security B')
  const booking = async (clientId, site, stage = 'Booked') => {
    const number = (await one("select next_document_number('booking') as no")).no
    return (await one(
      `insert into public.bookings(client_uuid,booking_no,client_id,branch_id,pickup_at,return_at,delivery_type,stage,created_by,updated_by)
       values(gen_random_uuid(),$1,$2,$3,'2099-12-20T04:00:00Z','2099-12-26T04:00:00Z',
              'Babin Delivery',$5,$4,$4) returning id`,
      [number, clientId, site, owner, stage],
    )).id
  }
  const asActor = async (id, action) => {
    await db.exec('reset role')
    await q(
      "select set_config('app.current_user_id',$1,false), set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.role','authenticated',false)",
      [id],
    )
    await db.exec('set role authenticated')
    try {
      return await action()
    } finally {
      try {
        await db.exec("reset role; select set_config('app.current_user_id','',false),set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','',false)")
      } catch {
        await db.exec('rollback')
        await db.exec("reset role; select set_config('app.current_user_id','',false),set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','',false)")
      }
    }
  }

  const reason = 'Synthetic cancellation security test'
  const call = (id, overload, actor = owner) => overload === 'json'
    ? q('select public.cancel_booking($1::jsonb) as result', [JSON.stringify({ booking_id: id, reason, actor_id: actor })])
    : q('select public.cancel_booking($1::uuid,$2::text,$3::uuid) as result', [id, reason, actor])
  const snapshot = async id => ({
    booking: await one('select cancelled_at, cancelled_by, stage from public.bookings where id = $1', [id]),
    audit: await one("select count(*)::int as n from public.audit_events where record_id = $1", [id]),
    reservations: (await q('select * from public.inventory_reservations where booking_id = $1 order by id', [id])).rows,
  })
  for (const overload of ['json', 'legacy']) {
    await check(`own-branch Coordinator succeeds and actor is session-derived (${overload})`, async () => {
      const id = await booking(clientA, branchA)
      await asActor(ids.CoordinatorA, async () => {
        assert.equal((await one('select auth_user_role() as role')).role, 'Coordinator')
        assert.equal((await one('select auth_user_branch_id() as site')).site, branchA)
        assert.equal((await call(id, overload)).rows[0].result.success, true)
      })
      const after = await snapshot(id)
      assert.ok(after.booking.cancelled_at)
      assert.equal(after.booking.cancelled_by, ids.CoordinatorA)
    })
    await check(`cross-branch Coordinator denied without side effects (${overload})`, async () => {
      const id = await booking(clientB, branchB)
      const before = await snapshot(id)
      let rejection
      await asActor(ids.CoordinatorA, async () => {
        assert.equal((await one('select auth_user_branch_id() as site')).site, branchA)
        try {
          await call(id, overload)
        } catch (error) {
          rejection = error
        }
      })
      const after = await snapshot(id)
      assert.deepEqual(after, before, 'Cross-branch cancellation must not change booking, audit or reservations')
      assert.equal(rejection?.code, '42501', 'Cross-branch cancellation must explicitly deny access')
    })
    await check(`Coordinator cannot distinguish foreign from nonexistent booking (${overload})`, async () => {
      const id = await booking(clientB, branchB)
      const before = await snapshot(id)
      const errors = []
      await asActor(ids.CoordinatorA, async () => {
        for (const target of [id, crypto.randomUUID()]) {
          try {
            await call(target, overload)
          } catch (error) {
            errors.push({ code: error.code, message: error.message })
          }
        }
      })
      assert.deepEqual(await snapshot(id), before, 'Foreign booking must remain unchanged')
      assert.equal(errors.length, 2, 'Both targets must be refused')
      assert.equal(errors[0].code, '42501')
      assert.deepEqual(errors[0], errors[1], 'Foreign and missing target must produce the same denial')
    })
    await check(`repeat cancellation cannot change the original audit or booking (${overload})`, async () => {
      const id = await booking(clientA, branchA)
      await asActor(ids.CoordinatorA, async () => {
        assert.equal((await call(id, overload)).rows[0].result.success, true)
      })
      const before = await snapshot(id)
      await asActor(ids.CoordinatorA, async () => assert.rejects(call(id, overload)))
      assert.deepEqual(await snapshot(id), before)
    })
    await check(`foreign Packed booking remains inaccessible (${overload})`, async () => {
      const id = await booking(clientB, branchB, 'Packed')
      const before = await snapshot(id)
      await asActor(ids.CoordinatorA, async () => denied(
        overload === 'json' ? 'select public.cancel_booking($1::jsonb)' : 'select public.cancel_booking($1::uuid,$2::text,$3::uuid)',
        overload === 'json' ? [JSON.stringify({booking_id:id,reason})] : [id,reason,owner]
      ))
      assert.deepEqual(await snapshot(id), before)
    })
    await check(`own-branch Packed booking denied to Coordinator (${overload})`, async () => {
      const id = await booking(clientA, branchA, 'Packed')
      const before = await snapshot(id)
      await asActor(ids.CoordinatorA, async () => assert.rejects(call(id, overload), error => error.code === '42501'))
      assert.deepEqual(await snapshot(id), before)
    })
    await check(`Admin can cancel across branches (${overload})`, async () => {
      const id = await booking(clientB, branchB)
      await asActor(ids.AdminA, async () => assert.equal((await call(id, overload)).rows[0].result.success, true))
      assert.equal((await snapshot(id)).booking.cancelled_by, ids.AdminA)
    })
    await check(`Owner can cancel across branches (${overload})`, async () => {
      const id = await booking(clientB, branchB)
      await asActor(owner, async () => assert.equal((await call(id, overload)).rows[0].result.success, true))
      assert.equal((await snapshot(id)).booking.cancelled_by, owner)
    })
    for (const role of ['WarehouseB','DriverA','Client']) {
      await check(`${role} denied without mutation (${overload})`, async () => {
        const id = await booking(clientA, role === 'WarehouseB' ? branchB : branchA)
        const before = await snapshot(id)
        await asActor(ids[role], async () => assert.rejects(call(id, overload), error => error.code === '42501'))
        assert.deepEqual(await snapshot(id), before)
      })
    }
  }
  // Serial ordering is a necessary precondition for race safety; this is NOT a
  // two-connection concurrency test. Use the same authenticated floor writer
  // and matching positive controls to isolate cancellation as the difference.
  const stageTransition = (id, from, to) => q(
    `insert into public.booking_stage_transitions
       (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at, reason)
     values (gen_random_uuid(), $1, $2, $3, $4, $5, 'Warehouse', now(), $6)`,
    [id, branchB, from, to, ids.WarehouseB, 'Synthetic stage boundary control'],
  )
  const stageSnapshot = async id => ({
    ...(await snapshot(id)),
    transitions: (await q('select * from public.booking_stage_transitions where booking_id=$1 order by id', [id])).rows,
    sessions: (await q('select * from public.operation_sessions where booking_id=$1 order by id', [id])).rows,
  })
  for (const [from, to] of [['Booked', 'Packed'], ['Packed', 'On Rent']]) {
    await check(`uncancelled ${from} → ${to} positive control`, async () => {
      const id = await booking(clientB, branchB, from)
      await asActor(ids.WarehouseB, () => stageTransition(id, from, to))
      assert.equal((await snapshot(id)).booking.stage, to)
    })
    await check(`cancelled ${from} → ${to} refused with no side effects`, async () => {
      const id = await booking(clientB, branchB, from)
      await asActor(owner, async () => assert.equal((await call(id, 'json')).rows[0].result.success, true))
      const before = await stageSnapshot(id)
      assert.ok(before.booking.cancelled_at)
      let refusal
      await asActor(ids.WarehouseB, async () => {
        try { await stageTransition(id, from, to) } catch (error) { refusal = error }
      })
      assert.deepEqual(await stageSnapshot(id), before, 'Cancellation must be terminal for stage, audit, sessions and reservations')
      assert.ok(refusal, 'Cancelled booking transition must be refused')
    })
  }
  console.log(`Cancellation boundary: ${passed} PASS, ${failures.length} FAIL (disposable PGlite)`)
  assert.equal(failures.length, 0, failures.join('; '))
} finally {
  await db.close()
}
