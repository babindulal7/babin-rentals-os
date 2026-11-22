#!/usr/bin/env node
/**
 * scripts/test-external-holds-concurrency.mjs
 *
 * T9-02 / 0261: the cross-connection race test that PGlite cannot run.
 *
 * PGlite is a single connection, so it cannot show two transactions racing for
 * the same unit. This harness starts a throwaway PostgreSQL cluster from the
 * locally installed binaries, on a free loopback port with its own data
 * directory. It applies the same prelude and migrations as the PGlite gate, then
 * runs the races on separate connections.
 *
 * Safety: it connects only to the cluster it starts (127.0.0.1, trust auth, a
 * random port). It never reads or writes any other server. It stops the cluster
 * and deletes its data directory on exit.
 *
 *   node scripts/test-external-holds-concurrency.mjs
 *   PG_BIN="C:\Program Files\PostgreSQL\17\bin" node scripts/test-external-holds-concurrency.mjs
 *
 * Scenarios run at READ COMMITTED (the Supabase default). "In flight" means the
 * first statement has run inside an open transaction and has not committed.
 *   C1  Booqable hold in flight; the OS claim on the same serial waits, then is refused.
 *   C2  OS claim in flight; the Booqable hold on the same serial waits, then is refused.
 *   C3  OS claim in flight, then rolled back; the hold waits, then proceeds.
 *   C4  Booqable hold in flight, then rolled back; the claim waits, then proceeds.
 *   C5  Two Booqable lines on one serial; the second waits on the exclusion constraint, then fails.
 *   C6  Two-unit quantity product: one hold in flight, two claims wait; exactly two fit.
 *   C7  Two-unit quantity product: one claim in flight, two holds wait; exactly two fit.
 *   C8  Disjoint windows on one serial; the hold waits for the lock, then succeeds.
 *   C0  Control: with the inventory guard trigger disabled, the C1 race double-books.
 *       A passing control shows the harness would catch a missing gate.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')
const PRELUDE = join(ROOT, 'supabase', 'pglite-prelude.sql')
const IS_WINDOWS = process.platform === 'win32'
const DATABASE = 'holds_concurrency'
const STATEMENT_TIMEOUT_MS = 30000
const LOCK_WAIT_TIMEOUT_MS = 10000
const OWNER = '00000000-0000-0000-0000-000000000991'
const COORDINATOR = '00000000-0000-0000-0000-000000000993'
const GUARD_INVENTORY = 'trg_t9_external_holds_guard_inventory'
const GUARD_SOURCE = 'trg_t9_external_holds_guard_source'
const NORMALIZE = 'trg_t9_external_holds_normalize'

const HOLD_SQL = `
  insert into external_holds (client_uuid, source, external_order_id, external_line_id, external_order_number,
                              product_id, asset_id, qty, source_period, last_seen_at)
  values ($1, 'booqable', $2, $3, $4, $5::uuid, $6::uuid, $7::int,
          tstzrange($8::timestamptz, $9::timestamptz, '[)'), now())`

const CLAIM_SQL = `
  insert into inventory_reservations (client_uuid, booking_id, booking_line_id, asset_id, product_id, qty,
                                      period, created_by, hold_state)
  values ($1, $2, $3, $4::uuid, $5::uuid, $6::int, tstzrange($7::timestamptz, $8::timestamptz, '[)'), $9, 'confirmed')`

const results = []
const record = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const exe = (name) => (IS_WINDOWS ? `${name}.exe` : name)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const win = (from, to) => ({ start: `${from}T06:00:00Z`, end: `${to}T06:00:00Z` })

function findPgBin() {
  if (process.env.PG_BIN) return process.env.PG_BIN
  const roots = IS_WINDOWS ? ['C:\\Program Files\\PostgreSQL'] : ['/usr/lib/postgresql']
  for (const root of roots) {
    if (!existsSync(root)) continue
    const versions = readdirSync(root).filter((v) => /^\d+$/.test(v)).sort((a, b) => Number(b) - Number(a))
    for (const version of versions) {
      const bin = join(root, version, 'bin')
      if (existsSync(join(bin, exe('initdb')))) return bin
    }
  }
  return null
}

function runTool(bin, name, args) {
  const result = spawnSync(join(bin, exe(name)), args, { encoding: 'utf8', timeout: 120000, windowsHide: true })
  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim().split('\n').slice(-8).join('\n')
    throw new Error(`${name} exited ${result.status}\n${output}`)
  }
  return result.stdout ?? ''
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

async function startCluster(bin) {
  const base = mkdtempSync(join(tmpdir(), 'holds-pg-'))
  if (/\s/.test(base)) throw new Error(`temporary directory contains a space: ${base}`)
  const dataDir = join(base, 'data')
  const logFile = join(base, 'server.log')
  const port = await freePort()
  runTool(bin, 'initdb', ['-D', dataDir, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--no-locale'])
  // The server inherits pg_ctl's handles. Piping them keeps the call open until the server stops,
  // so the start call takes no pipes and reads the log only if it fails.
  const start = spawnSync(
    join(bin, exe('pg_ctl')),
    ['-D', dataDir, '-l', logFile, '-w', '-t', '60', '-o', `-p ${port} -h 127.0.0.1 -k ${base}`, 'start'],
    { stdio: 'ignore', windowsHide: true, timeout: 120000 },
  )
  if (start.status !== 0) {
    const tail = existsSync(logFile) ? readFileSync(logFile, 'utf8').trim().split('\n').slice(-8).join('\n') : '(no server log)'
    throw new Error(`pg_ctl start exited ${start.status}\n${tail}`)
  }
  return { bin, base, dataDir, port }
}

function stopCluster(cluster) {
  runTool(cluster.bin, 'pg_ctl', ['-D', cluster.dataDir, '-m', 'immediate', '-w', 'stop'])
}

async function connect(cluster, database) {
  const client = new pg.Client({
    host: '127.0.0.1',
    port: cluster.port,
    user: 'postgres',
    database,
    statement_timeout: STATEMENT_TIMEOUT_MS,
  })
  await client.connect()
  return client
}

async function loadSchema(cluster, track) {
  const admin = await track(connect(cluster, 'postgres'))
  await admin.query(`create database ${DATABASE}`)
  const db = await track(connect(cluster, DATABASE))
  await db.query(readFileSync(PRELUDE, 'utf8'))
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    try {
      await db.query(readFileSync(join(MIGRATIONS, file), 'utf8'))
    } catch (error) {
      throw new Error(`migration ${file} failed: ${error.message.split('\n')[0]}`)
    }
  }
  const version = (await db.query('select version() as v')).rows[0].v.split(',')[0]
  return { db, applied: files.length, version }
}

async function seed(db) {
  const branchId = (await db.query('select id from branches order by created_at limit 1')).rows[0].id
  for (const [role, id] of [['Owner', OWNER], ['Coordinator', COORDINATOR]]) {
    await db.query(
      `insert into users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
       values ($1, gen_random_uuid(), $2, $3, $4, '+977-9800000000', $5, $6, true, $1)
       on conflict (id) do update set primary_role = excluded.primary_role`,
      [id, `EMP-CONC-${role.toUpperCase()}`, `${role.toLowerCase()}.conc@example.test`, `Concurrency ${role}`, role, branchId],
    )
  }
  let warehouseId = (await db.query('select id from warehouses order by created_at limit 1')).rows[0]?.id
  if (!warehouseId) {
    warehouseId = (await db.query(
      `insert into warehouses (client_uuid, branch_id, name, code, is_active, created_by)
       values (gen_random_uuid(), $1, 'Concurrency Warehouse', 'WH-CONC', true, $2) returning id`,
      [branchId, OWNER],
    )).rows[0].id
  }
  const clientId = (await db.query(
    `insert into clients (client_uuid, client_code, name, phone, email, created_by)
     values (gen_random_uuid(), 'C-9902', 'Concurrency Test Client', '+9779811000000', 'concurrency.client@example.test', $1)
     returning id`,
    [OWNER],
  )).rows[0].id
  const categoryId = (await db.query('select id from inventory_categories order by name limit 1')).rows[0].id
  const nextCode = async () => (await db.query("select next_document_number('equipment') as code")).rows[0].code
  const productInsert = `insert into products (client_uuid, asset_code, name, brand, category_id, tracking_mode,
                                               total_quantity, allow_overbooking, created_by)
                         values (gen_random_uuid(), $1, $2, 'Concurrency', $3, $4, $5, false, $6) returning id`
  const serial = (await db.query(productInsert, [await nextCode(), 'Concurrency Camera', categoryId, 'Serialised', 6, OWNER])).rows[0].id
  const quantity = (await db.query(productInsert, [await nextCode(), 'Concurrency Tripod Pair', categoryId, 'Quantity', 2, OWNER])).rows[0].id
  const units = []
  for (let i = 1; i <= 6; i += 1) {
    units.push((await db.query(
      `insert into product_units (client_uuid, product_id, serial_no, asset_tag, branch_id, warehouse_id, status, condition, created_by)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, 'In Stock', 'Good', $6) returning id`,
      [serial, `CONC-SN-00${i}`, `BAR-CONC-00${i}`, branchId, warehouseId, OWNER],
    )).rows[0].id)
  }
  return { branchId, clientId, serial, quantity, units }
}

async function makeBooking(db, ctx, productId, qty) {
  const bookingNo = (await db.query("select next_document_number('booking') as no")).rows[0].no
  const bookingId = (await db.query(
    `insert into bookings (client_uuid, booking_no, client_id, branch_id, stage, pickup_at, return_at, delivery_type, created_by, updated_by)
     values (gen_random_uuid(), $1, $2, $3, 'Booked', '2028-01-01T06:00:00Z', '2028-01-03T06:00:00Z', 'Client Pickup', $4, $4)
     returning id`,
    [bookingNo, ctx.clientId, ctx.branchId, OWNER],
  )).rows[0].id
  const lineId = (await db.query(
    `insert into booking_lines (client_uuid, booking_id, product_id, line_type, qty, description, rate, days, created_by)
     values (gen_random_uuid(), $1, $2, 'Equipment', $3, 'Concurrency line', 0, 2, $4) returning id`,
    [bookingId, productId, qty, OWNER],
  )).rows[0].id
  return { bookingId, lineId }
}

const holdArgs = ({ tag, productId, assetId = null, start, end, qty = 1 }) =>
  [randomUUID(), `ORD-${tag}`, `LINE-${tag}`, `BQ-${tag}`, productId, assetId, qty, start, end]

const claimArgs = ({ booking, productId = null, assetId = null, start, end, qty = 1 }) =>
  [randomUUID(), booking.bookingId, booking.lineId, assetId, productId, qty, start, end, COORDINATOR]

async function countFor(db, { assetId = null, productId = null, start, end }) {
  const key = assetId ? 'asset_id' : 'product_id'
  const value = assetId ?? productId
  const holds = (await db.query(
    `select count(*)::int as n from external_holds
      where status = 'active' and ${key} = $1::uuid and period && tstzrange($2::timestamptz, $3::timestamptz, '[)')`,
    [value, start, end],
  )).rows[0].n
  const claims = (await db.query(
    `select count(*)::int as n from inventory_reservations
      where released_at is null and hold_state in ('confirmed', 'active_hold')
        and ${key} = $1::uuid and period && tstzrange($2::timestamptz, $3::timestamptz, '[)')`,
    [value, start, end],
  )).rows[0].n
  return { holds, claims }
}

const pidOf = async (client) => (await client.query('select pg_backend_pid() as pid')).rows[0].pid

async function waitingOnLock(monitor, pid) {
  const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS
  while (Date.now() < deadline) {
    const { rows } = await monitor.query('select wait_event_type from pg_stat_activity where pid = $1', [pid])
    if (rows[0]?.wait_event_type === 'Lock') return true
    await sleep(25)
  }
  return false
}

const attempt = (client, text, params) =>
  client.query(text, params).then(
    () => ({ ok: true }),
    (error) => ({ ok: false, code: error.code, message: error.message.split('\n')[0] }),
  )

// Read the pid before the pending statement is sent: a connection with a statement in flight
// queues every later query behind it, so the pid must come first.
async function startBlocked(monitor, client, text, params) {
  const pid = await pidOf(client)
  const pending = attempt(client, text, params)
  const waited = await waitingOnLock(monitor, pid)
  return { pending, waited }
}

const refused = (outcome, fragment) => !outcome.ok && outcome.message.includes(fragment)

async function c1BooqableFirstSerial(ctx, s) {
  const w = win('2028-05-01', '2028-05-03')
  const booking = await makeBooking(s.db, ctx, ctx.serial, 1)
  await s.a.query('begin')
  await s.a.query(HOLD_SQL, holdArgs({ tag: 'c1', productId: ctx.serial, assetId: ctx.units[0], ...w }))
  const { pending, waited } = await startBlocked(s.monitor, s.b, CLAIM_SQL, claimArgs({ booking, assetId: ctx.units[0], ...w }))
  await s.a.query('commit')
  const outcome = await pending
  const counts = await countFor(s.db, { assetId: ctx.units[0], ...w })
  return {
    ok: waited && refused(outcome, 'GATE:booqable_serial_held') && counts.holds === 1 && counts.claims === 0,
    detail: `waited=${waited}, claim=${outcome.ok ? 'committed' : outcome.message}, holds=${counts.holds}, claims=${counts.claims}`,
  }
}

async function c2OsClaimFirstSerial(ctx, s) {
  const w = win('2028-06-01', '2028-06-03')
  const booking = await makeBooking(s.db, ctx, ctx.serial, 1)
  await s.a.query('begin')
  await s.a.query(CLAIM_SQL, claimArgs({ booking, assetId: ctx.units[1], ...w }))
  const { pending, waited } = await startBlocked(s.monitor, s.b, HOLD_SQL, holdArgs({ tag: 'c2', productId: ctx.serial, assetId: ctx.units[1], ...w }))
  await s.a.query('commit')
  const outcome = await pending
  const counts = await countFor(s.db, { assetId: ctx.units[1], ...w })
  return {
    ok: waited && refused(outcome, 'GATE:booqable_serial_held') && counts.holds === 0 && counts.claims === 1,
    detail: `waited=${waited}, hold=${outcome.ok ? 'committed' : outcome.message}, holds=${counts.holds}, claims=${counts.claims}`,
  }
}

async function c3ClaimRolledBack(ctx, s) {
  const w = win('2028-07-01', '2028-07-03')
  const booking = await makeBooking(s.db, ctx, ctx.serial, 1)
  await s.a.query('begin')
  await s.a.query(CLAIM_SQL, claimArgs({ booking, assetId: ctx.units[2], ...w }))
  const { pending, waited } = await startBlocked(s.monitor, s.b, HOLD_SQL, holdArgs({ tag: 'c3', productId: ctx.serial, assetId: ctx.units[2], ...w }))
  await s.a.query('rollback')
  const outcome = await pending
  const counts = await countFor(s.db, { assetId: ctx.units[2], ...w })
  return {
    ok: waited && outcome.ok && counts.holds === 1 && counts.claims === 0,
    detail: `waited=${waited}, hold=${outcome.ok ? 'committed' : outcome.message}, holds=${counts.holds}, claims=${counts.claims}`,
  }
}

async function c4HoldRolledBack(ctx, s) {
  const w = win('2028-08-01', '2028-08-03')
  const booking = await makeBooking(s.db, ctx, ctx.serial, 1)
  await s.a.query('begin')
  await s.a.query(HOLD_SQL, holdArgs({ tag: 'c4', productId: ctx.serial, assetId: ctx.units[3], ...w }))
  const { pending, waited } = await startBlocked(s.monitor, s.b, CLAIM_SQL, claimArgs({ booking, assetId: ctx.units[3], ...w }))
  await s.a.query('rollback')
  const outcome = await pending
  const counts = await countFor(s.db, { assetId: ctx.units[3], ...w })
  return {
    ok: waited && outcome.ok && counts.holds === 0 && counts.claims === 1,
    detail: `waited=${waited}, claim=${outcome.ok ? 'committed' : outcome.message}, holds=${counts.holds}, claims=${counts.claims}`,
  }
}

async function c5TwoHoldsOneSerial(ctx, s) {
  const w = win('2028-09-01', '2028-09-03')
  await s.a.query('begin')
  await s.a.query(HOLD_SQL, holdArgs({ tag: 'c5a', productId: ctx.serial, assetId: ctx.units[4], ...w }))
  const { pending, waited } = await startBlocked(s.monitor, s.b, HOLD_SQL, holdArgs({ tag: 'c5b', productId: ctx.serial, assetId: ctx.units[4], ...w }))
  await s.a.query('commit')
  const outcome = await pending
  const counts = await countFor(s.db, { assetId: ctx.units[4], ...w })
  return {
    ok: waited && !outcome.ok && outcome.code === '23P01' && counts.holds === 1 && counts.claims === 0,
    detail: `waited=${waited}, second=${outcome.ok ? 'committed' : `${outcome.code} ${outcome.message}`}, holds=${counts.holds}`,
  }
}

async function raceTwoOnQuantity(ctx, s, { first, second, window }) {
  await s.a.query('begin')
  await first(s.a)
  const b = await startBlocked(s.monitor, s.b, second.text, second.args('b'))
  const c = await startBlocked(s.monitor, s.c, second.text, second.args('c'))
  const waited = b.waited && c.waited
  await s.a.query('commit')
  const [outcomeB, outcomeC] = await Promise.all([b.pending, c.pending])
  const outcomes = [outcomeB, outcomeC]
  const okCount = outcomes.filter((o) => o.ok).length
  const refusedCount = outcomes.filter((o) => refused(o, 'GATE:booqable_capacity_held')).length
  const counts = await countFor(s.db, { productId: ctx.quantity, ...window })
  return {
    ok: waited && okCount === 1 && refusedCount === 1 && counts.holds + counts.claims === 2,
    detail: `waited=${waited}, outcomes=[${outcomes.map((o) => (o.ok ? 'committed' : `${o.code} ${o.message.slice(0, 90)}`)).join(' | ')}], holds=${counts.holds}, claims=${counts.claims}`,
  }
}

async function c6HoldThenTwoClaims(ctx, s) {
  const window = win('2028-11-01', '2028-11-03')
  const bookingB = await makeBooking(s.db, ctx, ctx.quantity, 1)
  const bookingC = await makeBooking(s.db, ctx, ctx.quantity, 1)
  return raceTwoOnQuantity(ctx, s, {
    window,
    first: (client) => client.query(HOLD_SQL, holdArgs({ tag: 'c6', productId: ctx.quantity, ...window })),
    second: {
      text: CLAIM_SQL,
      args: (who) => claimArgs({ booking: who === 'b' ? bookingB : bookingC, productId: ctx.quantity, ...window }),
    },
  })
}

async function c7ClaimThenTwoHolds(ctx, s) {
  const window = win('2028-12-01', '2028-12-03')
  const booking = await makeBooking(s.db, ctx, ctx.quantity, 1)
  return raceTwoOnQuantity(ctx, s, {
    window,
    first: (client) => client.query(CLAIM_SQL, claimArgs({ booking, productId: ctx.quantity, ...window })),
    second: {
      text: HOLD_SQL,
      args: (who) => holdArgs({ tag: `c7${who}`, productId: ctx.quantity, ...window }),
    },
  })
}

async function c8DisjointWindows(ctx, s) {
  const wa = win('2028-10-01', '2028-10-03')
  const wb = win('2028-10-05', '2028-10-07')
  const booking = await makeBooking(s.db, ctx, ctx.serial, 1)
  await s.a.query('begin')
  await s.a.query(CLAIM_SQL, claimArgs({ booking, assetId: ctx.units[5], ...wa }))
  const { pending, waited } = await startBlocked(s.monitor, s.b, HOLD_SQL, holdArgs({ tag: 'c8', productId: ctx.serial, assetId: ctx.units[5], ...wb }))
  await s.a.query('commit')
  const outcome = await pending
  const claimsA = await countFor(s.db, { assetId: ctx.units[5], ...wa })
  const holdsB = await countFor(s.db, { assetId: ctx.units[5], ...wb })
  return {
    ok: waited && outcome.ok && claimsA.claims === 1 && holdsB.holds === 1,
    detail: `waited=${waited}, hold=${outcome.ok ? 'committed' : outcome.message}, claim A=${claimsA.claims}, hold B=${holdsB.holds}`,
  }
}

async function c0ControlWithoutGuard(ctx, s) {
  const w = win('2029-01-01', '2029-01-03')
  const booking = await makeBooking(s.db, ctx, ctx.serial, 1)
  await s.db.query(`alter table inventory_reservations disable trigger ${GUARD_INVENTORY}`)
  try {
    // Sequential on purpose: the hold commits first. A concurrent variant would block on the product
    // lock, which the BEFORE trigger still takes, and wait for a commit that the harness only issues later.
    await s.a.query(HOLD_SQL, holdArgs({ tag: 'c0', productId: ctx.serial, assetId: ctx.units[0], ...w }))
    const outcome = await attempt(s.b, CLAIM_SQL, claimArgs({ booking, assetId: ctx.units[0], ...w }))
    const counts = await countFor(s.db, { assetId: ctx.units[0], ...w })
    return {
      ok: outcome.ok && counts.holds === 1 && counts.claims === 1,
      detail: `claim=${outcome.ok ? 'committed' : outcome.message}, holds=${counts.holds}, claims=${counts.claims}`,
    }
  } finally {
    await s.db.query(`alter table inventory_reservations enable trigger ${GUARD_INVENTORY}`)
  }
}

const SCENARIOS = [
  ['C1 Booqable hold in flight; OS claim on the same serial waits, then is refused', c1BooqableFirstSerial],
  ['C2 OS claim in flight; Booqable hold on the same serial waits, then is refused', c2OsClaimFirstSerial],
  ['C3 OS claim rolled back; the Booqable hold waits, then proceeds', c3ClaimRolledBack],
  ['C4 Booqable hold rolled back; the OS claim waits, then proceeds', c4HoldRolledBack],
  ['C5 Two Booqable lines on one serial: the second waits on the exclusion constraint, then fails', c5TwoHoldsOneSerial],
  ['C6 Two-unit quantity: a hold in flight and two claims waiting; exactly two fit', c6HoldThenTwoClaims],
  ['C7 Two-unit quantity: a claim in flight and two holds waiting; exactly two fit', c7ClaimThenTwoHolds],
  ['C8 Disjoint windows on one serial: the hold waits for the lock, then succeeds', c8DisjointWindows],
]

async function resetSessions(s) {
  for (const client of [s.a, s.b, s.c]) {
    await client.query('rollback').catch(() => {})
  }
}

async function runMain() {
  const bin = findPgBin()
  if (!bin) {
    console.error('PostgreSQL binaries not found. Set PG_BIN to the folder that holds initdb, pg_ctl and psql.')
    return 2
  }
  const clients = []
  const track = async (promise) => {
    const client = await promise
    clients.push(client)
    return client
  }
  let cluster = null
  try {
    cluster = await startCluster(bin)
    const { db, applied, version } = await loadSchema(cluster, track)
    console.log(`--- T9-02 external holds: real PostgreSQL race test (${version}, ${applied} migrations) ---`)
    const ctx = await seed(db)
    const triggers = (await db.query(
      'select count(*)::int as n from pg_trigger where tgname = any($1::text[]) and not tgisinternal',
      [[GUARD_INVENTORY, GUARD_SOURCE, NORMALIZE]],
    )).rows[0].n
    record('the three gate triggers exist in the migrated database', triggers === 3, `${triggers}/3`)

    const s = {
      db,
      a: await track(connect(cluster, DATABASE)),
      b: await track(connect(cluster, DATABASE)),
      c: await track(connect(cluster, DATABASE)),
      monitor: await track(connect(cluster, DATABASE)),
    }
    for (const [name, scenario] of SCENARIOS) {
      try {
        const { ok, detail } = await scenario(ctx, s)
        record(name, ok, detail)
      } catch (error) {
        record(name, false, `threw: ${error.message.split('\n')[0]}`)
      }
      await resetSessions(s)
    }
    try {
      const { ok, detail } = await c0ControlWithoutGuard(ctx, s)
      record('C0 control: with the inventory guard disabled, the C1 race double-books', ok, detail)
    } catch (error) {
      record('C0 control: with the inventory guard disabled, the C1 race double-books', false, `threw: ${error.message.split('\n')[0]}`)
    }
  } finally {
    await Promise.allSettled(clients.map((client) => client.end()))
    if (cluster) {
      try {
        stopCluster(cluster)
      } catch (error) {
        console.error(`stop failed: ${error.message.split('\n')[0]}`)
      }
      rmSync(cluster.base, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    }
  }
  const failed = results.filter((r) => !r.ok).length
  console.log(`\nResults: ${results.length - failed} passed, ${failed} failed`)
  return failed === 0 ? 0 : 1
}

process.exitCode = await runMain().catch((error) => {
  console.error(`harness error: ${error.message}`)
  return 1
})
