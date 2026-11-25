#!/usr/bin/env node
/**
 * Issue #440 cancellation authorization regression on disposable PGlite, never hosted Supabase.
 * Checks real SECURITY DEFINER RPC execution under authenticated test identities.
 * Hosted JWT/PostgREST verification is STILL REQUIRED before production.
 */
import assert from 'node:assert/strict'
import { makePickupFixture, pickup } from './fixtures/cancellation-pickup-fixture.mjs'
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
  // Validate the exact real-race fixture and business errors in a single
  // disposable connection first. This is serial ordering, NOT race proof.
  for (const kind of ['movement','handover line']) {
    for (const cancelFirst of [true,false]) {
      await check('Physical pickup fixture '+kind+' / '+(cancelFirst?'cancel first':'pickup first'), async () => {
        const fixture=await makePickupFixture({q,ownerId:owner,warehouseId:ids.WarehouseB,branchId:branchB,clientId:clientB})
        const read=async()=>({
          ...(await stageSnapshot(fixture.id)),
          movements:(await q('select * from public.session_line_movements where session_id=$1 order by id',[fixture.sessionId])).rows,
          handover:(await q('select * from public.handover_lines where booking_line_id=$1 order by id',[fixture.lineId])).rows,
        })
        const before=await read()
        const write=()=>pickup(db,fixture,kind,ids.WarehouseB)
        if(cancelFirst){
          await asActor(owner,async()=>assert.equal((await call(fixture.id,'json')).rows[0].result.success,true))
          const winner=await read()
          assert.equal(winner.booking.cancelled_by,owner)
          assert.ok(winner.reservations.length>0)
          assert.ok(winner.reservations.every(row=>row.released_at!==null))
          await asActor(ids.WarehouseB,()=>assert.rejects(write(),e=>e.code==='P0001'&&/no longer ready for pickup/.test(e.message)))
          assert.deepEqual(await read(),winner)
        }else{
          await asActor(ids.WarehouseB,write)
          const winner=await read()
          assert.equal(winner.booking.stage,'Packed')
          assert.equal(kind==='movement'?winner.movements.length:winner.handover.length,1)
          assert.deepEqual(winner.reservations,before.reservations)
          await asActor(owner,()=>assert.rejects(call(fixture.id,'json'),e=>e.code==='P0001'&&/pickup has already occurred/.test(e.message)))
          assert.deepEqual(await read(),winner)
        }
      })
    }
  }
  // Test the distinct session-completion writer used by floorVerb.ts.
  // No movement is recorded before this probe: it isolates the final
  // session write, rather than relying on the already-tested movement guard.
  const sessionFixture = () => makePickupFixture({q,ownerId:owner,warehouseId:ids.WarehouseB,branchId:branchB,clientId:clientB})
  const seal = fixture => q("update public.operation_sessions set state='Completed',completed_at=clock_timestamp(),completed_by=$1 where id=$2 returning id,state",[ids.WarehouseB,fixture.sessionId])
  let completionControl = false
  await check('uncancelled Handover session completion positive control',async()=>{
    const fixture=await sessionFixture()
    await asActor(ids.WarehouseB,async()=>{
      const receipt=await seal(fixture)
      assert.equal(receipt.rows.length,1,'Floor writer must actually update one row')
      assert.equal(receipt.rows[0].state,'Completed')
    })
    const row=await one('select state,completed_at from public.operation_sessions where id=$1',[fixture.sessionId])
    assert.equal(row.state,'Completed')
    assert.ok(row.completed_at)
    const before=await stageSnapshot(fixture.id)
    await asActor(owner,()=>assert.rejects(call(fixture.id,'json'),e=>e.code==='P0001'&&/pickup has already occurred/.test(e.message)))
    assert.deepEqual(await stageSnapshot(fixture.id),before)
    completionControl=true
  })
  await check('cancelled Handover session completion refused without mutation',async()=>{
    assert.ok(completionControl,'Positive control must pass before interpreting the cancellation probe')
    const fixture=await sessionFixture()
    await asActor(owner,async()=>assert.equal((await call(fixture.id,'json')).rows[0].result.success,true))
    const before=await stageSnapshot(fixture.id)
    let refused=false
    await asActor(ids.WarehouseB,async()=>{
      try {
        const receipt=await seal(fixture)
        refused=receipt.rows.length===0
      } catch(error) {
        assert.ok(['P0001','42501'].includes(error.code),'Unexpected database error: '+error.code)
        refused=true
      }
    })
    assert.deepEqual(await stageSnapshot(fixture.id),before,'Cancelled session completion must not persist a custody receipt')
    assert.ok(refused,'Cancelled session completion unexpectedly succeeded')
  })
  // Direct serial-unit writer used by floorVerb.ts: isolate this from movement
  // and handover-line writes so those existing guards cannot hide a gap.
  const serialFixture=()=>makePickupFixture({q,ownerId:owner,warehouseId:ids.WarehouseB,branchId:branchB,clientId:clientB,serialised:true})
  const pickUnit=fixture=>q("update public.booking_line_units set unit_state='Picked Up',handover_session_id=$1 where id=$2 returning id,unit_state",[fixture.sessionId,fixture.unitId])
  const serialSnapshot=async fixture=>({
    ...(await stageSnapshot(fixture.id)),
    units:(await q('select * from public.booking_line_units where booking_line_id=$1 order by id',[fixture.lineId])).rows,
    assets:(await q('select * from public.product_units where id=$1',[fixture.assetId])).rows,
    movements:(await q('select * from public.session_line_movements where booking_line_id=$1 order by id',[fixture.lineId])).rows,
  })
  let serialControl=false
  await check('uncancelled serial unit pickup positive control',async()=>{
    const fixture=await serialFixture()
    const before=await serialSnapshot(fixture)
    assert.equal(before.units[0]?.unit_state,'Ready')
    assert.ok(before.reservations.some(row=>row.released_at===null&&row.asset_id===fixture.assetId),'Serial fixture must own the matching physical hold')
    await asActor(ids.WarehouseB,async()=>{
      const receipt=await pickUnit(fixture)
      assert.equal(receipt.rows.length,1)
      assert.equal(receipt.rows[0].unit_state,'Picked Up')
    })
    const winner=await serialSnapshot(fixture)
    assert.equal(winner.units[0].unit_state,'Picked Up')
    assert.equal(winner.booking.stage,'Packed')
    assert.deepEqual(winner.reservations,before.reservations)
    await asActor(owner,()=>assert.rejects(call(fixture.id,'json'),e=>e.code==='P0001'&&/units already picked up|pickup has already occurred/.test(e.message)))
    assert.deepEqual(await serialSnapshot(fixture),winner)
    serialControl=true
  })
  await check('cancelled serial unit pickup refused without custody mutation',async()=>{
    assert.ok(serialControl,'Positive control must pass before interpreting the cancellation probe')
    const fixture=await serialFixture()
    await asActor(owner,async()=>assert.equal((await call(fixture.id,'json')).rows[0].result.success,true))
    const before=await serialSnapshot(fixture)
    assert.ok(before.reservations.length>0)
    assert.ok(before.reservations.every(row=>row.released_at!==null))
    let refused=false
    await asActor(ids.WarehouseB,async()=>{
      try{
        const receipt=await pickUnit(fixture)
        refused=receipt.rows.length===0
      }catch(error){
        assert.ok(['P0001','42501'].includes(error.code),'Unexpected database error: '+error.code)
        refused=true
      }
    })
    assert.deepEqual(await serialSnapshot(fixture),before,'Cancelled rental cannot acquire serial custody or mutate a released hold')
    assert.ok(refused,'Cancelled serial unit pickup unexpectedly succeeded')
  })
  console.log(`Cancellation boundary: ${passed} PASS, ${failures.length} FAIL (disposable PGlite)`)
  assert.equal(failures.length, 0, failures.join('; '))
} finally {
  await db.close()
}
