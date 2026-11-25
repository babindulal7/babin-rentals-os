// #440: real two-connection PostgreSQL stage/cancellation serialization.
// Called only by the existing guarded disposable Linux runner. No hosted DB.
// Stage-only and quantity pickup fixtures; no claim of complete UI or serialised custody coverage.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import pg from 'pg'

export async function verifyCancellationRace({ connectionString, observer, ownerId, warehouseId, branchId, clientId }) {
  const url = new URL(connectionString)
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted' ||
      process.env.RUNNER_OS !== 'Linux' || process.env.DOCKER_HOST || process.env.DOCKER_CONTEXT ||
      url.protocol !== 'postgresql:' || !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      url.port !== '54322' || url.pathname !== '/postgres' || url.search || url.hash) {
    throw new Error('Cancellation race requires the isolated CI database')
  }
  const q = (sql, args = []) => observer.query(sql, args)
  const first = new pg.Client({ connectionString })
  const second = new pg.Client({ connectionString })
  let pending
  const begin = async (conn, id) => {
    await conn.query('begin isolation level read committed')
    await conn.query("set local lock_timeout='10s'; set local statement_timeout='15s'")
    await conn.query("select set_config('app.current_user_id',$1,true),set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claims',$2,true)", [id, JSON.stringify({sub:id,role:'authenticated',aal:'aal1'})])
    await conn.query('set local role authenticated')
    const { rows } = await conn.query('select public.auth_user_id() as id')
    assert.equal(rows[0]?.id, id)
  }
  const cancel = (conn, id) => conn.query('select public.cancel_booking($1::jsonb) as receipt', [JSON.stringify({booking_id:id,reason:'Disposable concurrency regression'})])
  const advance = (conn, id) => conn.query(
    "insert into public.booking_stage_transitions (client_uuid,booking_id,branch_id,from_stage,to_stage,actor_id,actor_role,occurred_at,reason) values ($1,$2,$3,'Packed','On Rent',$4,'Warehouse',now(),'Disposable concurrency control')",
    [randomUUID(), id, branchId, warehouseId])
  const makeBooking = async () => {
    const id = randomUUID()
    await q("insert into public.bookings (id,client_uuid,booking_no,client_id,branch_id,pickup_at,return_at,delivery_type,stage,created_by,updated_by) values ($1,$2,public.next_document_number('booking'),$3,$4,'2099-12-20T04:00:00Z','2099-12-26T04:00:00Z','Client Pickup','Packed',$5,$5)", [id,randomUUID(),clientId,branchId,ownerId])
    return id
  }
  // Real quantity reservation and outbound evidence, not just stage snapshots.
  const makePickupFixture = async () => {
    const id = randomUUID(), productId = randomUUID(), lineId = randomUUID()
    const packingId = randomUUID(), sessionId = randomUUID()
    await q('begin')
    try {
      await q("select set_config('app.current_user_id',$1,true),set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claims',$2,true)", [ownerId,JSON.stringify({sub:ownerId,role:'authenticated',aal:'aal1'})])
      const actor = (await q('select public.auth_user_id() as id, public.auth_can_view_money() as money')).rows[0]
      assert.equal(actor?.id,ownerId)
      assert.equal(actor.money,true)
      const category = (await q('select id from public.inventory_categories order by name limit 1')).rows[0]?.id
      assert.ok(category)
      await q("insert into public.products (id,client_uuid,asset_code,name,category_id,brand,tracking_mode,total_quantity,daily_rate,created_by) values ($1,$2,public.next_document_number('equipment'),'Disposable Pickup Race Cable',$3,'Disposable','Quantity',20,250,$4)",[productId,randomUUID(),category,ownerId])
      await q("insert into public.bookings (id,client_uuid,booking_no,client_id,branch_id,pickup_at,return_at,delivery_type,stage,created_by,updated_by) values ($1,$2,public.next_document_number('booking'),$3,$4,'2099-12-20T04:00:00Z','2099-12-26T04:00:00Z','Client Pickup','Quote',$5,$5)",[id,randomUUID(),clientId,branchId,ownerId])
      await q("insert into public.booking_lines (id,client_uuid,booking_id,line_type,product_id,description,qty,days,rate,created_by) values ($1,$2,$3,'Equipment',$4,'Disposable Pickup Race Cable',2,6,250,$5)",[lineId,randomUUID(),id,productId,ownerId])
      for (const [from,to] of [['Quote','Booked'],['Booked','Packed']]) {
        if (to === 'Packed') {
          await q("insert into public.operation_sessions (id,client_uuid,booking_id,operation,state,warehouse_staff_id,created_by) values ($1,$2,$3,'Packing','In Progress',$4,$4)",[packingId,randomUUID(),id,ownerId])
          await q("insert into public.packing_lines (client_uuid,session_id,booking_line_id,state,qty_required,qty_packed_entered,created_by) values ($1,$2,$3,'Packed',2,2,$4)",[randomUUID(),packingId,lineId,ownerId])
        }
        await q("insert into public.booking_stage_transitions (client_uuid,booking_id,branch_id,from_stage,to_stage,actor_id,actor_role,occurred_at) values ($1,$2,$3,$4,$5,$6,'Owner',now())",[randomUUID(),id,branchId,from,to,ownerId])
      }
      await q("update public.operation_sessions set state='Completed',completed_at=clock_timestamp(),completed_by=$1 where id=$2",[ownerId,packingId])
      await q("insert into public.operation_sessions (id,client_uuid,booking_id,operation,state,delivery_method,warehouse_staff_id,created_by,government_id_verified,booking_authorization_verified) values ($1,$2,$3,'Handover','In Progress','Client Pickup',$4,$5,true,true)",[sessionId,randomUUID(),id,warehouseId,ownerId])
      const active = (await q('select count(*)::int as n from public.inventory_reservations where booking_id=$1 and released_at is null',[id])).rows[0]?.n
      assert.ok(active>0,'Physical fixture must own active inventory holds')
      await q('commit')
      return {id,lineId,sessionId}
    } catch (error) {
      await q('rollback')
      throw error
    }
  }
  const pickup = (conn, fixture, kind) => kind === 'movement'
    ? conn.query("insert into public.session_line_movements (client_uuid,session_id,booking_line_id,qty,resulting_item_state,moved_at,created_by) values ($1,$2,$3,1,'Picked Up',now(),$4)",[randomUUID(),fixture.sessionId,fixture.lineId,warehouseId])
    : conn.query("insert into public.handover_lines (client_uuid,booking_line_id,state,qty_required,first_session_id,completed_session_id,picked_up_at,created_by) values ($1,$2,'Picked Up',2,$3,$3,now(),$4)",[randomUUID(),fixture.lineId,fixture.sessionId,warehouseId])
  const snapshot = async id => ({
    booking: (await q('select stage,cancelled_at,cancelled_by from public.bookings where id=$1',[id])).rows[0],
    transitions: (await q('select from_stage,to_stage from public.booking_stage_transitions where booking_id=$1 order by id',[id])).rows,
    audit: (await q('select id from public.audit_events where record_id=$1 order by id',[id])).rows,
    reservations: (await q('select * from public.inventory_reservations where booking_id=$1 order by id',[id])).rows,
  })
  const waitForLock = async (blocked, blocker) => {
    for (let i=0;i<60;i++) {
      const {rows} = await q('select $2::int = any(pg_blocking_pids($1::int)) as waiting', [blocked.processID,blocker.processID])
      if (rows[0]?.waiting) return
      await sleep(50)
    }
    throw new Error('Expected concurrent booking lock was not observed')
  }
  // Attach rejection handler immediately; a query can fail before the observer
  // sees the lock. A timeout/deadlock is never accepted as a business refusal.
  const capture = promise => promise.then(result => ({result}), error => ({error}))
  try {
    await first.connect()
    await second.connect()
    for (const cancellationFirst of [true,false]) {
      const id = await makeBooking()
      const baseline = await snapshot(id)
      await begin(first,cancellationFirst ? ownerId : warehouseId)
      await begin(second,cancellationFirst ? warehouseId : ownerId)
      if (cancellationFirst) {
        const receipt = await cancel(first,id)
        assert.equal(receipt.rows[0]?.receipt?.success,true)
        pending = capture(advance(second,id))
      } else {
        await advance(first,id)
        pending = capture(cancel(second,id))
      }
      await waitForLock(second,first)
      await first.query('commit')
      const winner = await snapshot(id)
      const outcome = await pending
      pending = undefined
      assert.ok(outcome.error,'The losing operation must reject')
      assert.equal(outcome.error.code,'P0001','Expected business gate, not a lock timeout')
      assert.match(outcome.error.message,cancellationFirst ? /gate\.booking\.cancelled/ : /cannot be cancelled/)
      await second.query('rollback')
      assert.deepEqual(await snapshot(id),winner,'Losing transaction left persisted side effects')
      if (cancellationFirst) {
        assert.equal(winner.booking.stage,'Packed')
        assert.equal(winner.booking.cancelled_by,ownerId)
        assert.deepEqual(winner.transitions,baseline.transitions)
      } else {
        assert.equal(winner.booking.stage,'On Rent')
        assert.equal(winner.booking.cancelled_at,null)
        assert.equal(winner.transitions.length,baseline.transitions.length+1)
      }
      console.log('PASS real PostgreSQL lock and losing transaction rollback: '+(cancellationFirst?'cancel first':'stage first'))
    }
    for (const kind of ['movement','handover line']) {
      for (const cancellationFirst of [true,false]) {
        const fixture = await makePickupFixture()
        const read = async () => ({
          ...(await snapshot(fixture.id)),
          sessions: (await q('select * from public.operation_sessions where booking_id=$1 order by id',[fixture.id])).rows,
          movements: (await q('select * from public.session_line_movements where session_id=$1 order by id',[fixture.sessionId])).rows,
          handover: (await q('select * from public.handover_lines where booking_line_id=$1 order by id',[fixture.lineId])).rows,
          relatedAudit: (await q('select id from public.audit_events where record_id=any($1::uuid[]) order by id',[[fixture.lineId,fixture.sessionId]])).rows,
        })
        const before = await read()
        await begin(first,cancellationFirst ? ownerId : warehouseId)
        await begin(second,cancellationFirst ? warehouseId : ownerId)
        if (cancellationFirst) {
          const receipt = await cancel(first,fixture.id)
          assert.equal(receipt.rows[0]?.receipt?.success,true)
          pending = capture(pickup(second,fixture,kind))
        } else {
          await pickup(first,fixture,kind)
          pending = capture(cancel(second,fixture.id))
        }
        await waitForLock(second,first)
        await first.query('commit')
        const winner = await read()
        const outcome = await pending
        pending = undefined
        assert.ok(outcome.error,'Losing physical operation must reject')
        assert.equal(outcome.error.code,'P0001')
        assert.match(outcome.error.message,cancellationFirst ? /no longer ready for pickup/ : /pickup has already occurred/)
        await second.query('rollback')
        assert.deepEqual(await read(),winner,'Losing physical operation persisted changes')
        assert.equal(winner.booking.stage,'Packed','Partial pickup must not advance stage')
        if (cancellationFirst) {
          assert.equal(winner.booking.cancelled_by,ownerId)
          assert.deepEqual(winner.movements,before.movements)
          assert.deepEqual(winner.handover,before.handover)
          assert.ok(winner.reservations.every(r=>r.released_at!==null),'Cancellation releases active holds')
        } else {
          assert.equal(winner.booking.cancelled_at,null)
          assert.deepEqual(winner.reservations,before.reservations,'Partial pickup must retain holds')
          assert.equal(kind==='movement' ? winner.movements.length : winner.handover.length,1)
        }
        console.log('PASS real pickup race: '+kind+' / '+(cancellationFirst?'cancel first':'pickup first'))
      }
    }
  } finally {
    // Unblock the second session on any failed assertion before awaiting it.
    await first.query('rollback').catch(()=>{})
    if (pending) await pending
    await second.query('rollback').catch(()=>{})
    await Promise.allSettled([first.end(),second.end()])
  }
}
