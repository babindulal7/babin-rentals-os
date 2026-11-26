// Real PostgreSQL race probe; restricted to the explicitly created local cluster.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import pg from 'pg'
import { makePickupFixture } from './fixtures/cancellation-pickup-fixture.mjs'

if (process.env.BABIN_PICKUP_RACE_LOCAL !== '1' || process.env.DOCKER_HOST || process.env.DOCKER_CONTEXT) {
  throw new Error('This probe requires explicit isolated local PostgreSQL opt-in.')
}
const config = { host: '127.0.0.1', port: 55487, database: 'babin_pickup_race', user: 'postgres' }
const observer = new pg.Client(config), first = new pg.Client(config), second = new pg.Client(config)
let pending
try {
  await observer.connect()
  const identity = (await observer.query("select current_database() as db, current_user as actor, current_setting('data_directory') as dir")).rows[0]
  assert.equal(identity.db, config.database)
  assert.equal(identity.actor, config.user)
  assert.equal(resolve(identity.dir).toLowerCase(), resolve(process.env.TEMP, 'babin-pickup-pg17-55487').toLowerCase())
  const ownerId = '00000000-0000-0000-0000-000000000101'
  const warehouseId = '00000000-0000-0000-0000-000000000103'
  const branchId = '00000000-0000-0000-0000-000000000001'
  const clientId = (await observer.query('select id from clients order by id limit 1')).rows[0]?.id
  assert.ok(clientId)
  const q = (sql, args = []) => observer.query(sql, args)
  const fixture = await makePickupFixture({ q, ownerId, warehouseId, branchId, clientId })
  await Promise.all([first.connect(), second.connect()])
  const begin = async conn => {
    await conn.query('begin isolation level read committed')
    await conn.query("set local lock_timeout='10s'; set local statement_timeout='15s'")
    await conn.query("select set_config('app.current_user_id',$1,true),set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claims',$2,true)", [warehouseId, JSON.stringify({ sub: warehouseId, role: 'authenticated', aal: 'aal1' })])
    await conn.query('set local role authenticated')
  }
  const insert = (conn, qty, target = fixture) => conn.query("insert into session_line_movements(client_uuid,session_id,booking_line_id,qty,resulting_item_state,moved_at,created_by) values($1,$2,$3,$4,'Picked Up',now(),$5) returning id", [randomUUID(), target.sessionId, target.lineId, qty, warehouseId])
  await begin(first)
  await begin(second)
  await insert(first, 2)
  pending = insert(second, 1).then(result => ({ result }), error => ({ error }))
  let blocked = false
  for (let i = 0; i < 100; i++) {
    const result = await observer.query('select $2::int = any(pg_blocking_pids($1::int)) as blocked', [second.processID, first.processID])
    if (result.rows[0]?.blocked) { blocked = true; break }
    await sleep(50)
  }
  assert.ok(blocked, 'Expected the second writer to block on the first transaction')
  await first.query('commit')
  const outcome = await pending
  pending = undefined
  assert.equal(outcome.error?.code, 'P0001', 'Over-pickup must be refused, not timed out')
  assert.match(outcome.error.message, /pickup quantity exceeds/i)
  await second.query('rollback')
  const state = (await observer.query('select picked_qty, state from handover_pickup_totals join handover_lines using (booking_line_id) where booking_line_id=$1', [fixture.lineId])).rows[0]
  assert.equal(Number(state.picked_qty), 2)
  assert.equal(state.state, 'Picked Up')
  console.log('PASS PostgreSQL 17: blocked concurrent over-pickup rejected; committed quantity and line preserved')

  const corrected = await makePickupFixture({ q, ownerId, warehouseId, branchId, clientId })
  const original = (await insert(observer, 2, corrected)).rows[0].id
  await begin(first)
  await begin(second)
  await first.query("insert into session_line_movements(client_uuid,session_id,booking_line_id,qty,resulting_item_state,reverses_movement_id,moved_at,created_by) values($1,$2,$3,1,'Picked Up',$4,now(),$5)", [randomUUID(), corrected.sessionId, corrected.lineId, original, warehouseId])
  pending = insert(second, 1, corrected).then(result => ({ result }), error => ({ error }))
  blocked = false
  for (let i = 0; i < 100; i++) {
    const result = await observer.query('select $2::int = any(pg_blocking_pids($1::int)) as blocked', [second.processID, first.processID])
    if (result.rows[0]?.blocked) { blocked = true; break }
    await sleep(50)
  }
  assert.ok(blocked, 'Expected pickup to wait for the correction transaction')
  await first.query('commit')
  const replacement = await pending
  pending = undefined
  assert.ifError(replacement.error)
  await second.query('commit')
  const afterCorrection = (await observer.query('select picked_qty, state from handover_pickup_totals join handover_lines using (booking_line_id) where booking_line_id=$1', [corrected.lineId])).rows[0]
  assert.equal(Number(afterCorrection.picked_qty), 2)
  assert.equal(afterCorrection.state, 'Picked Up')
  console.log('PASS PostgreSQL 17: pickup waits for correction and records the released quantity')

  const missingRace = await makePickupFixture({ q, ownerId, warehouseId, branchId, clientId })
  await insert(observer, 1, missingRace)
  await begin(first)
  await begin(second)
  await insert(first, 1, missingRace)
  pending = second.query("update handover_lines set state='Missing', missing_reason='Concurrent missing report' where booking_line_id=$1", [missingRace.lineId])
    .then(result => ({ result }), error => ({ error }))
  blocked = false
  for (let i = 0; i < 100; i++) {
    const result = await observer.query('select $2::int = any(pg_blocking_pids($1::int)) as blocked', [second.processID, first.processID])
    if (result.rows[0]?.blocked) { blocked = true; break }
    await sleep(50)
  }
  assert.ok(blocked, 'Expected the Missing update to wait for the final pickup')
  await first.query('commit')
  const staleMissing = await pending
  pending = undefined
  assert.equal(staleMissing.error?.code, 'P0001', 'A stale Missing update must be refused by the business gate')
  assert.match(staleMissing.error.message, /fully picked up line cannot be recorded as missing/i)
  await second.query('rollback')
  const afterMissingRace = (await observer.query('select picked_qty, state from handover_pickup_totals join handover_lines using (booking_line_id) where booking_line_id=$1', [missingRace.lineId])).rows[0]
  assert.equal(Number(afterMissingRace.picked_qty), 2)
  assert.equal(afterMissingRace.state, 'Picked Up')
  console.log('PASS PostgreSQL 17: stale Missing update rejected after final pickup')

  const serial = await makePickupFixture({ q, ownerId, warehouseId, branchId, clientId, serialised: true })
  const serialMove = (await q("insert into session_line_movements(client_uuid,session_id,booking_line_id,unit_id,qty,resulting_item_state,moved_at,created_by) values($1,$2,$3,$4,1,'Picked Up',now(),$5) returning id", [randomUUID(),serial.sessionId,serial.lineId,serial.assetId,warehouseId])).rows[0].id
  let serialState = (await q('select unit_state, handover_session_id from booking_line_units where id=$1', [serial.unitId])).rows[0]
  assert.equal(serialState.unit_state, 'Picked Up')
  assert.equal(serialState.handover_session_id, serial.sessionId)
  await q("insert into session_line_movements(client_uuid,session_id,booking_line_id,qty,resulting_item_state,reverses_movement_id,moved_at,created_by) values($1,$2,$3,1,'Picked Up',$4,now(),$5)", [randomUUID(),serial.sessionId,serial.lineId,serialMove,warehouseId])
  serialState = (await q('select unit_state, handover_session_id from booking_line_units where id=$1', [serial.unitId])).rows[0]
  assert.equal(serialState.unit_state, 'Ready')
  assert.equal(serialState.handover_session_id, null)
  console.log('PASS PostgreSQL 17: serial pickup and correction atomically update the assigned unit')
} finally {
  await first.query('rollback').catch(() => {})
  if (pending) await pending
  await second.query('rollback').catch(() => {})
  await Promise.allSettled([first.end(), second.end(), observer.end()])
}
