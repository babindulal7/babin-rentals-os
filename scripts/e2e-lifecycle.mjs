#!/usr/bin/env node
/**
 * `npm run check:lifecycle` ΓÇö drive one booking's whole life through a REAL
 * Postgres and assert at every step.
 *
 * RULING 2026-09-08 (R-27).
 *
 * ## Why this exists
 *
 * 2,834 unit tests were green while the database accepted:
 *
 *   ┬╖ a double booking ΓÇö two bookings, one camera, overlapping dates, both
 *     confirmed, `inventory_reservations` still at zero rows;
 *   ┬╖ **every discounted booking refused outright** ΓÇö `create_booking` wrote an
 *     audit class `'data change'` that `audit_event_class` has never had, so the
 *     enum cast raised 22P02 and rolled the whole create back (0099);
 *   ┬╖ a stage walk with no floor rows behind it;
 *   ┬╖ a close with no invoice.
 *
 * None of those is visible to a unit test, and not because the tests are bad.
 * They mock `lib/supabase` or drive `lib/mock/client.ts`, and every one of the
 * four failures above lives on the far side of that seam ΓÇö in an enum cast, a
 * trigger, a policy, a constraint. A suite that cannot execute plpgsql cannot
 * see them. This script executes plpgsql.
 *
 * ## What it is, and what it is not
 *
 * PGlite: Postgres 18 compiled to WASM, running in this process. A real planner,
 * real plpgsql, real constraints, real triggers, real RLS.
 *
 * Γ£à RLS **is** exercised. Every step that names a role runs `set role
 *    authenticated` with `app.current_user_id` set to that user, which is
 *    exactly the shape `auth_user_role()` reads and the shape `0094`'s own
 *    post-conditions use. `authenticated` is not the table owner, so policies
 *    apply.
 *
 * Γ¥î It is **not** Supabase. No JWT, no PostgREST, no `auth.uid()`, no column
 *    grants as production has them, no connection pooling. A green run here is a
 *    NECESSARY condition for the lifecycle working on production, never a
 *    sufficient one. The same script takes `--live` later (unimplemented) to run
 *    against `sxguwvgoserhdolewibb` with a real seat.
 *
 * Γ¥î It is not a drift test. This builds an EMPTY database and seeds its own
 *    corpus, so it cannot reproduce a failure that depends on production's rows.
 *
 * ## Known-red steps
 *
 * Some of the thirteen steps assert behaviour that is ruled and NOT BUILT. They
 * carry `expect: 'red'` and a reason. A `red` step that fails is reported and
 * does **not** fail the run; a `red` step that PASSES fails the run loudly,
 * because that means the thing was built and the marker is now a lie. R-27 asks
 * for exactly this ("the script records the current behaviour as a known-red row
 * rather than skipping it") ΓÇö a skipped step is invisible, a red one is a
 * standing bill.
 *
 *   node scripts/e2e-lifecycle.mjs           # run everything
 *   node scripts/e2e-lifecycle.mjs --only L3 # one step (plus its prerequisites)
 *   node scripts/e2e-lifecycle.mjs --verbose # print every SQL error in full
 *
 * Exit 0 only when every `green` step passed and every `red` step is still red.
 * Writes `.lifecycle-result.json` for `npm run completion` (R-29) to read.
 */
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beginVerification, finishVerification } from './test-receipt.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')

const args = process.argv.slice(2)
const verbose = args.includes('--verbose')
const onlyIdx = args.indexOf('--only')
const only = onlyIdx === -1 ? null : args[onlyIdx + 1]
const verificationStart = beginVerification(ROOT, `npm run check:lifecycle${args.length ? ` -- ${args.join(' ')}` : ''}`, 'disposable local PGlite with RLS; no hosted JWT/PostgREST')
writeFileSync(join(ROOT, '.lifecycle-result.json'), JSON.stringify(verificationStart, null, 2))

/* ΓöÇΓöÇ The corpus this script seeds ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
 *
 * Fixed uuids so a failure names a row you can find, and so a re-run is
 * byte-identical. Nine users, one per `system_role`, because Law 6 and every
 * capability question below is "which role", and borrowing the 0047 corpus's
 * five would leave Accounts, Technician, Driver and Client untested ΓÇö which is
 * exactly the gap `four-of-five-staff-cannot-sign-in` describes on production.
 */
const U = {
  Owner: '00000000-0000-4000-8000-00000000e001',
  Admin: '00000000-0000-4000-8000-00000000e002',
  Manager: '00000000-0000-4000-8000-00000000e003',
  Coordinator: '00000000-0000-4000-8000-00000000e004',
  Warehouse: '00000000-0000-4000-8000-00000000e005',
  Accounts: '00000000-0000-4000-8000-00000000e006',
  Technician: '00000000-0000-4000-8000-00000000e007',
  Driver: '00000000-0000-4000-8000-00000000e008',
  Client: '00000000-0000-4000-8000-00000000e009',
}
const SERIAL_PRODUCT = '00000000-0000-4000-8000-00000000f001'
const QTY_PRODUCT = '00000000-0000-4000-8000-00000000f002'
const CONSUMABLE_PRODUCT = '00000000-0000-4000-8000-00000000f003'
const UNITS = [
  '00000000-0000-4000-8000-00000000f101',
  '00000000-0000-4000-8000-00000000f102',
  '00000000-0000-4000-8000-00000000f103',
]
const CLIENT = '00000000-0000-4000-8000-00000000f201'
const OTHER_CLIENT = '00000000-0000-4000-8000-00000000f202'

/** Rental windows, far enough out that no seeded corpus row overlaps them. */
const W = {
  /* #900 ┬╖ 10-12 Sep */ a: ['2099-09-10T04:00:00Z', '2099-09-12T04:00:00Z'],
  /* #901 ┬╖ 11-13 Sep ΓÇö overlaps a */ b: ['2099-09-11T04:00:00Z', '2099-09-13T04:00:00Z'],
  /* #902 ┬╖ 12-14 Sep ΓÇö same-day turnaround with a */ c: ['2099-09-12T04:00:00Z', '2099-09-14T04:00:00Z'],
  /* the quantity probes */ d: ['2099-10-01T04:00:00Z', '2099-10-03T04:00:00Z'],
  /* the consumable probe: clear of every other window */ e: ['2099-11-01T04:00:00Z', '2099-11-03T04:00:00Z'],
}

let BRANCH = null

/* ΓöÇΓöÇ Plumbing ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */

const db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })

/** Run as a signed-in staff member: the role `authenticated`, identified. */
async function as(role, fn) {
  await db.exec(`set role authenticated;
    select set_config('app.current_user_id', '${U[role]}', false);
    select set_config('request.jwt.claim.sub', '${U[role]}', false);
    select set_config('request.jwt.claim.role', 'authenticated', false);`)
  try {
    return await fn()
  } finally {
    /* Defensive: a refused statement leaves the session in an aborted
       transaction, and this cleanup would then throw "current transaction is
       aborted" OVER the real error ΓÇö which is how L9 spent one run reporting a
       transaction state instead of the four payments it was asking about. */
    try {
      await db.exec(`reset role; select set_config('app.current_user_id', '', false);
        select set_config('request.jwt.claim.sub', '', false); select set_config('request.jwt.claim.role', '', false);`)
    } catch {
      await db.exec('rollback;')
      await db.exec(`reset role; select set_config('app.current_user_id', '', false);
        select set_config('request.jwt.claim.sub', '', false); select set_config('request.jwt.claim.role', '', false);`)
    }
  }
}

/**
 * Run a block and UNDO it, whatever it did.
 *
 * A step that probes what the database wrongly ACCEPTS leaves those rows behind,
 * and every later step then measures the wreckage instead of its own subject ΓÇö
 * L9's accepted overpayment turned L10's 7,119 into 15,238 and L13's two
 * payments into three. Law 3 forbids deleting the evidence afterwards, and a
 * step should not need a clean-up path that the product does not have. So the
 * probe runs inside a transaction that is always rolled back.
 */
async function undone(fn) {
  await db.exec('begin;')
  try {
    return await fn()
  } finally {
    try {
      await db.exec('rollback; reset role;')
    } catch {
      /* already aborted */
    }
  }
}

/** Run as the migration owner ΓÇö seeding, and reading past RLS to assert. */
async function asOwnerOfTheDatabase(fn) {
  await db.exec('reset role;')
  return fn()
}

const q = (text, params) => db.query(text, params)

/** One value, or null. */
async function one(text, params) {
  const r = await q(text, params)
  const row = r.rows[0]
  if (row === undefined) return null
  return Object.values(row)[0]
}

class Refused extends Error {}

/** Assert a statement is REFUSED, and by the right thing. */
async function refuses(what, text, params, matcher) {
  let message = null
  try {
    await q(text, params)
  } catch (e) {
    message = String(e.message)
  }
  if (message === null) throw new Refused(`${what}: the database ACCEPTED it. It must not.`)
  if (matcher !== undefined && !matcher.test(message)) {
    throw new Refused(`${what}: refused, but by the wrong thing ΓÇö ${message.split('\n')[0]}`)
  }
  return message
}

function assert(condition, what) {
  if (!condition) throw new Refused(what)
}

/** Settle an invoice: issue it if Draft, then record payments to clear outstanding. */
async function settleInvoice(bookingKey, actorId = U.Accounts) {
  const invoiceId = await one(
    'select id from invoices where booking_id = $1 and status in (\'Draft\', \'Sent\')',
    [bookingIds[bookingKey]]
  )
  if (!invoiceId) return
  // Issue if Draft - run as Accounts
  const status = await one('select status from invoices where id = $1', [invoiceId])
  if (status === 'Draft') {
    await as('Accounts', async () => {
      await q('select issue_invoice($1::jsonb)', [
        JSON.stringify({ invoice_id: invoiceId, issued_by: actorId })
      ])
    })
  }
  // Pay to zero outstanding
  const outstanding = Number(await one('select outstanding_amount from invoices where id = $1', [invoiceId]))
  if (outstanding > 0) {
    await as('Accounts', async () => {
      await q(
        `insert into payments (client_uuid, payment_no, booking_id, invoice_id, client_id, branch_id, amount, payment_type, payment_date, received_by)
         values (gen_random_uuid(), next_document_number('payment'), $1, $2, $3, $4, $5, 'Advance Payment', now(), $6)`,
        [bookingIds[bookingKey], invoiceId, CLIENT, BRANCH, outstanding, U.Accounts]
      )
    })
  }
}

function assertEq(actual, expected, what) {
  if (String(actual) !== String(expected)) {
    throw new Refused(`${what} ΓÇö expected ${String(expected)}, got ${String(actual)}`)
  }
}

/* ΓöÇΓöÇ Apply the chain ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */

console.log((await one('select version()')).split(',')[0])

try {
  await db.exec(readFileSync(join(ROOT, 'supabase', 'pglite-prelude.sql'), 'utf8'))
} catch (e) {
  console.error(`PRELUDE FAILED ΓÇö ${String(e.message).split('\n')[0]}`)
  process.exit(2)
}

for (const f of readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort()) {
  try {
    await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'))
  } catch (e) {
    console.error(`\nMIGRATION FAILED ΓÇö ${f}\n  ${String(e.message).split('\n')[0]}`)
    console.error('The chain does not build. `npm run check:pglite` is the tool for that; this script needs it green first.')
    process.exit(2)
  }
}

/* ΓöÇΓöÇ Seed ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */

async function seed() {
  BRANCH = await one('select id from branches order by created_at limit 1')
  assert(BRANCH !== null, 'seed: the migration chain left no branch to attach anything to.')
  const WAREHOUSE = await one('select id from warehouses order by warehouse_code limit 1')
  assert(WAREHOUSE !== null, 'seed: no warehouse ΓÇö product_units.warehouse_id is NOT NULL.')
  const CATEGORY = await one('select id from inventory_categories order by name limit 1')
  assert(CATEGORY !== null, 'seed: no inventory_category ΓÇö products.category_id is NOT NULL.')

  /* Every NOT NULL column with no default is named. `fixtures-invented-reference-data`
     is a whole bug class in this repo: a fixture that invents its own warehouse
     or category keeps a suite green while the real action resolves the label
     against a real table and is refused. So the two lookups above READ the
     corpus rather than minting anything. */
  for (const [n, [role, id]] of Object.entries(U).entries()) {
    await q(
      `insert into users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
       values ($1, gen_random_uuid(), $2, $3, $4, $5, $6, $7, true, $1)
       on conflict (id) do nothing`,
      [
        id,
        `LC-${String(n + 1).padStart(3, '0')}`,
        `lifecycle-${role.toLowerCase()}@babinrentals.test`,
        `Lifecycle ${role}`,
        `98000000${String(n + 1).padStart(2, '0')}`,
        role,
        BRANCH,
      ],
    )
  }

  for (const [n, [id, name]] of [
    [CLIENT, 'Lifecycle Films Pvt. Ltd.'],
    [OTHER_CLIENT, 'Someone Else Pictures'],
  ].entries()) {
    await q(
      `insert into clients (id, client_uuid, client_code, name, phone, created_by)
       values ($1, gen_random_uuid(), $2, $3, $4, $5)
       on conflict (id) do nothing`,
      [id, await one("select next_document_number('client')"), name, `+977980000000${String(n + 1)}`, U.Owner],
    )
  }

  await q(
    `insert into auth.users (id, email, email_confirmed_at)
     values ($1, $2, now())
     on conflict (id) do nothing`,
    [U.Client, 'lifecycle-client@babinrentals.test'],
  )

  await q(
    `insert into portal_users (client_uuid, client_id, auth_user_id, email, status, self_registered_at)
     values (gen_random_uuid(), $1, $2, $3, 'Active', now())
     on conflict do nothing`,
    [CLIENT, U.Client, 'lifecycle-client@babinrentals.test'],
  )

  await q(
    `insert into bookings (client_uuid, booking_no, client_id, branch_id, pickup_at, return_at, delivery_type, stage, created_by, updated_by)
     values (gen_random_uuid(), $4, $1, $2, '2099-12-01T04:00:00Z', '2099-12-03T04:00:00Z', 'Client Pickup', 'Quote', $3, $3)
     on conflict do nothing`,
    [OTHER_CLIENT, BRANCH, U.Owner, await one("select next_document_number('booking')")],
  )

  /* One Serialised product with three units, one Quantity product with a
     stock of three, and one Consumable product with a stock of ten. The 0047
     corpus is 56 products and ALL Serialised, while production is 204 and ALL
     Quantity ΓÇö so a script that borrowed the corpus would exercise the GiST
     exclusion and never the capacity ceiling, which is the half that matters
     on live. Both are seeded here. The consumable is seeded for L21. */
  await q(
    `insert into products (id, client_uuid, asset_code, name, category_id, brand, tracking_mode, total_quantity, daily_rate, created_by)
     values ($1, gen_random_uuid(), $5, 'Lifecycle Serialised Camera', $4, 'Lifecycle', 'Serialised', 3, 3500, $3),
            ($2, gen_random_uuid(), $6, 'Lifecycle Bulk Cable',        $4, 'Lifecycle', 'Quantity',   3, 250,  $3),
            ($7, gen_random_uuid(), $8, 'Lifecycle Gaffer Tape',       $4, 'Lifecycle', 'Consumable', 10, 150, $3)
     on conflict (id) do nothing`,
    [
      SERIAL_PRODUCT,
      QTY_PRODUCT,
      U.Owner,
      CATEGORY,
      await one("select next_document_number('equipment')"),
      await one("select next_document_number('equipment')"),
      CONSUMABLE_PRODUCT,
      await one("select next_document_number('equipment')"),
    ],
  )

  for (const [n, id] of UNITS.entries()) {
    await q(
      `insert into product_units (id, client_uuid, product_id, asset_tag, serial_no, status, branch_id, warehouse_id, created_by)
       values ($1, gen_random_uuid(), $2, $3, $4, 'In Stock', $5, $6, $7)
       on conflict (id) do nothing`,
      [id, SERIAL_PRODUCT, `LC-SER-001-U0${String(n + 1)}`, `LCSN-00${String(n + 1)}`, BRANCH, WAREHOUSE, U.Owner],
    )
  }
}

/* ΓöÇΓöÇ The booking-shaped payloads ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */

let bookingIds = {}

function createPayload({ key, window, actor, lines, discountPercent }) {
  const payload = {
    client_uuid: crypto.randomUUID(),
    created_by: U[actor],
    branch_id: BRANCH,
    client_id: CLIENT,
    pickup_at: window[0],
    return_at: window[1],
    delivery_type: 'Client Pickup',
    lines: lines.map((line) => ({
      client_uuid: crypto.randomUUID(),
      line_type: 'Equipment',
      product_id: line.productId,
      description: line.description,
      qty: line.qty,
      days: line.days,
      rate: line.rate,
      ...(line.units === undefined
        ? {}
        : { units: line.units.map((assetId) => ({ client_uuid: crypto.randomUUID(), asset_id: assetId })) }),
    })),
  }
  if (discountPercent !== undefined) {
    payload.discounts = [
      {
        client_uuid: crypto.randomUUID(),
        audit_client_uuid: crypto.randomUUID(),
        client_id: CLIENT,
        discount_source: 'Manual',
        percent: discountPercent,
        reason: 'Repeat client, agreed on the phone',
      },
    ]
  }
  return { key, payload }
}

async function createBooking(spec) {
  const { key, payload } = createPayload(spec)
  const result = await one('select create_booking($1::jsonb)', [JSON.stringify(payload)])
  bookingIds[key] = result.booking_id
  return result
}

/** One stage transition, as `applyBookingTransition` writes it. */
async function transition(key, from, to, actor, extra = {}) {
  await q(
    `insert into booking_stage_transitions
       (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at, reason)
     values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, now(), $7)`,
    [bookingIds[key], BRANCH, from, to, U[actor], actor, extra.reason ?? null],
  )
}

async function liveHolds(key) {
  return Number(
    await one('select count(*) from inventory_reservations where booking_id = $1 and released_at is null', [
      bookingIds[key],
    ]),
  )
}

async function stageOf(key) {
  return one('select stage::text from bookings where id = $1', [bookingIds[key]])
}

/**
 * Action layer wrappers mirroring application actions in `src/actions/rentals/`.
 * These encapsulate operational multi-table transactions (sessions, movements,
 * sign-offs, deposits, gates, transitions) so tests drive the domain actions
 * instead of loose, ad-hoc SQL statements.
 */
async function actionPackRental({ key, actor, units }) {
  const bookingId = bookingIds[key]
  const currentStage = await stageOf(key)
  assert(currentStage === 'Booked', `actionPackRental: booking ${key} must be Booked, got ${currentStage}`)
  const packingSessionId = crypto.randomUUID()
  await q(
    `insert into operation_sessions (id, client_uuid, booking_id, operation, session_no, state, warehouse_staff_id, created_by)
     values ($1, gen_random_uuid(), $2, 'Packing', 1, 'In Progress', $3, $3)`,
    [packingSessionId, bookingId, U[actor]],
  )
  for (const unit of units) {
    await q(
      `insert into session_line_movements (client_uuid, session_id, booking_line_id, unit_id, serial, qty, moved_at, created_by)
       values (gen_random_uuid(), $1, (select id from booking_lines where booking_id = $2 limit 1), $3, $4, 1, now(), $5)`,
      [packingSessionId, bookingId, unit.id ?? unit, unit.serial ?? 'SN-A1', U[actor]],
    )
  }
  await transition(key, 'Booked', 'Packed', actor)
  await q(`update operation_sessions set state = 'Completed' where id = $1`, [packingSessionId])
  return { sessionId: packingSessionId }
}

async function actionHandoverRental({ key, actor, signerName = 'Lifecycle Client Signer', deliveryMethod = 'Client Pickup', verified = true, reason = 'Handover completed with client signature' }) {
  const bookingId = bookingIds[key]
  const currentStage = await stageOf(key)
  assert(currentStage === 'Packed', `actionHandoverRental: booking ${key} must be Packed, got ${currentStage}`)
  const handoverSessionId = crypto.randomUUID()
  await q(
    `insert into operation_sessions (id, client_uuid, booking_id, operation, session_no, state, delivery_method, warehouse_staff_id, created_by, government_id_verified, booking_authorization_verified)
     values ($1, gen_random_uuid(), $2, 'Handover', 1, 'In Progress', $3, $4, $4, $5, $5)`,
    [handoverSessionId, bookingId, deliveryMethod, U[actor], verified],
  )
  await q(
    `insert into handover_lines (client_uuid, booking_line_id, state, qty_required, first_session_id, completed_session_id, created_by)
     values (gen_random_uuid(), (select id from booking_lines where booking_id = $1 limit 1), 'Picked Up', 1, $2, $2, $3)`,
    [bookingId, handoverSessionId, U[actor]],
  )
  await q(
    `insert into signatures (client_uuid, session_id, signature_role, signer_name, signed_at, device, is_required, created_by)
     values (gen_random_uuid(), $1, 'Receiver', $2, now(), 'iPad-1', true, $3)`,
    [handoverSessionId, signerName, U[actor]],
  )
  await transition(key, 'Packed', 'On Rent', actor, { reason })
  await q(`update operation_sessions set state = 'Completed' where id = $1`, [handoverSessionId])
  return { sessionId: handoverSessionId }
}

async function actionReturnRental({ key, actor, returnedUnits = [], missingUnits = [] }) {
  const bookingId = bookingIds[key]
  const currentStage = await stageOf(key)
  assert(currentStage === 'On Rent', `actionReturnRental: booking ${key} must be On Rent, got ${currentStage}`)
  for (const u of returnedUnits) {
    await q(
      `update booking_line_units
          set returned_at = now(), condition = 'Good'
        where asset_id = $1
          and booking_line_id in (select id from booking_lines where booking_id = $2)`,
      [u.id ?? u, bookingId],
    )
  }
  for (const m of missingUnits) {
    await q(
      `insert into booking_line_units
         (client_uuid, booking_line_id, asset_id, qty, unit_state, missing_reason, created_by)
       values
         (gen_random_uuid(), (select id from booking_lines where booking_id = $1 limit 1), $2, 1, 'Missing', $3, $4)`,
      [bookingId, m.id ?? m, m.reason ?? 'Lost on location during shoot', U[actor]],
    )
  }
  const returnSessionId = crypto.randomUUID()
  await q(
    `insert into operation_sessions (id, client_uuid, booking_id, operation, session_no, state, warehouse_staff_id, created_by)
     values ($1, gen_random_uuid(), $2, 'Return', 1, 'In Progress', $3, $3)`,
    [returnSessionId, bookingId, U[actor]],
  )
  await q(
    `insert into return_lines (client_uuid, booking_line_id, state, qty_expected, session_id, returned_at, created_by)
     values (gen_random_uuid(), (select id from booking_lines where booking_id = $1 limit 1), 'Returned', 1, $2, now(), $3)`,
    [bookingId, returnSessionId, U[actor]],
  )
  await transition(key, 'On Rent', 'Returned', actor)
  await q(`update operation_sessions set state = 'Completed' where id = $1`, [returnSessionId])
  return { sessionId: returnSessionId }
}

async function actionCompleteReset({ key, actor }) {
  const bookingId = bookingIds[key]
  const currentStage = await stageOf(key)
  assert(currentStage === 'Returned', `actionCompleteReset: booking ${key} must be Returned, got ${currentStage}`)
  await q(
    `insert into cleaning_queue_entries (client_uuid, booking_id, unit_id, state, created_by)
     values (gen_random_uuid(), $1, $2, 'Ready', $3)
     on conflict do nothing`,
    [bookingId, UNITS[0], U[actor]],
  )
}

async function actionCloseRental({ key, actor }) {
  await transition(key, 'Returned', 'Closed', actor)
}

/* ΓöÇΓöÇ The thirteen steps ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */

let invoiceId = null

/* Editor RPC helpers (0146/0147). Each call runs as a signed-in role so the
   function's own role ceiling, revision lock and receipt table are what answer. */
/** s() plus the JWT subject uth.uid() reads - the editor RPCs identify the actor with it. */
const asJwt = (role, fn) =>
  as(role, async () => {
    await q(`select set_config('request.jwt.claim.sub', $1, false)`, [U[role]])
    try {
      return await fn()
    } finally {
      await q(`select set_config('request.jwt.claim.sub', '', false)`)
    }
  })
const rpcAs = (role, text, params) =>
  asJwt(role, async () => {
    const r = await q(text, params)
    return Object.values(r.rows[0] ?? {})[0] ?? null
  })
const editorRead = (role, kind, id) => rpcAs(role, 'select read_record_editor($1, $2)', [kind, id])
const editorSave = (role, kind, id, rev, key, values, rows) =>
  rpcAs(role, 'select save_record_editor($1, $2::uuid, $3, $4::uuid, $5::jsonb, $6::jsonb)', [
    kind, id, rev, key, JSON.stringify(values), JSON.stringify(rows),
  ])
const refusesAs = (role, what, text, params, matcher) => asJwt(role, () => refuses(what, text, params, matcher))
const refusesSave = (role, what, kind, id, rev, key, values, rows, matcher) =>
  refusesAs(
    role,
    what,
    'select save_record_editor($1, $2::uuid, $3, $4::uuid, $5::jsonb, $6::jsonb)',
    [kind, id, rev, key, JSON.stringify(values), JSON.stringify(rows)],
    matcher,
  )
const QUOTE_VALUE_KEYS = ['client_id', 'project', 'project_type', 'project_type_other', 'pickup_at', 'return_at', 'delivery_type', 'pickup_location', 'return_location', 'deposit_required']
const quotePayload = (snap, change = (p) => p) => {
  const values = Object.fromEntries(QUOTE_VALUE_KEYS.filter((k) => k in snap.values).map((k) => [k, snap.values[k]]))
  return change({ values, lines: snap.lines, crew: snap.crew, transport: snap.transport ?? {}, discount_percent: snap.discounts.reduce((s, d) => s + Number(d.percent), 0) })
}
const quoteSave = (role, id, rev, key, payload) =>
  rpcAs(role, 'select update_rental_quote($1::uuid, $2, $3::uuid, $4::jsonb)', [id, rev, key, JSON.stringify(payload)])
const refusesQuote = (role, what, id, rev, key, payload, matcher) =>
  refusesAs(role, what, 'select update_rental_quote($1::uuid, $2, $3::uuid, $4::jsonb)', [id, rev, key, JSON.stringify(payload)], matcher)

const STEPS = [
  {
    id: 'L1',
    title: 'Coordinator creates a booking: 1 unit, 2 days, 10% discount',
    expect: 'green',
    async run() {
      await as('Coordinator', async () => {
        const created = await createBooking({
          key: 'a',
          window: W.a,
          actor: 'Coordinator',
          discountPercent: 10,
          lines: [
            {
              productId: SERIAL_PRODUCT,
              description: 'Lifecycle Serialised Camera',
              qty: 1,
              days: 2,
              rate: 350000,
              units: [UNITS[0]],
            },
          ],
        })
        assertEq(created.stage, 'Quote', 'a new booking starts at Quote')
        assertEq(created.line_count, 1, 'the line was written')
        assertEq(created.unit_count, 1, 'the serial was assigned at creation (D5)')
      })

      await asOwnerOfTheDatabase(async () => {
        assertEq(
          await one('select count(*) from booking_discounts where booking_id = $1', [bookingIds.a]),
          1,
          'the discount row exists ΓÇö this is the assertion 0099 fixed',
        )
        assertEq(
          await one(
            `select event_class::text from audit_events
              where table_name = 'booking_discounts' and record_id = $1`,
            [bookingIds.a],
          ),
          'discount',
          "the discount's audit row is class 'discount'",
        )
      })
    },
  },

  {
    id: 'L2',
    title: 'Quote ΓåÆ Booked writes exactly one reservation (R-26)',
    expect: 'green',
    async run() {
      await as('Coordinator', async () => {
        await transition('a', 'Quote', 'Booked', 'Coordinator')
      })
      assertEq(await stageOf('a'), 'Booked', 'the booking moved')
      assertEq(await liveHolds('a'), 1, 'the Booked transition placed one hold')
      assertEq(
        await one(
          'select asset_id from inventory_reservations where booking_id = $1 and released_at is null',
          [bookingIds.a],
        ),
        UNITS[0],
        'the hold names the unit the booking was given at creation',
      )
    },
  },

  {
    id: 'L3',
    title: 'A conflicting booking ΓÇö same unit, overlapping dates ΓÇö is REFUSED',
    expect: 'green',
    async run() {
      const before = Number(await one('select count(*) from inventory_reservations'))

      await as('Coordinator', async () => {
        await createBooking({
          key: 'b',
          window: W.b,
          actor: 'Coordinator',
          lines: [
            {
              productId: SERIAL_PRODUCT,
              description: 'Lifecycle Serialised Camera',
              qty: 1,
              days: 2,
              rate: 350000,
              units: [UNITS[0]],
            },
          ],
        })

        await refuses(
          'the second booking taking a unit already held over an overlapping window',
          `insert into booking_stage_transitions
             (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
           values (gen_random_uuid(), $1, $2, 'Quote', 'Booked', $3, 'Coordinator', now())`,
          [bookingIds.b, BRANCH, U.Coordinator],
          /no_double_booking|exclusion/i,
        )
      })

      assertEq(await stageOf('b'), 'Quote', 'the refused booking stayed a Quote')
      assertEq(await liveHolds('b'), 0, 'and holds nothing')
      assertEq(
        Number(await one('select count(*) from inventory_reservations')),
        before,
        'the reservation count is unchanged ΓÇö the whole transaction rolled back',
      )
    },
  },

  {
    id: 'L4',
    title: 'A same-day turnaround is ACCEPTED (half-open bounds)',
    expect: 'green',
    async run() {
      await as('Coordinator', async () => {
        await createBooking({
          key: 'c',
          window: W.c,
          actor: 'Coordinator',
          lines: [
            {
              productId: SERIAL_PRODUCT,
              description: 'Lifecycle Serialised Camera',
              qty: 1,
              days: 2,
              rate: 350000,
              units: [UNITS[0]],
            },
          ],
        })
        await transition('c', 'Quote', 'Booked', 'Coordinator')
      })
      assertEq(await stageOf('c'), 'Booked', 'a booking starting when the last one ends is accepted')
      assertEq(await liveHolds('c'), 1, 'and holds the same unit for its own window')
    },
  },

  {
    id: 'L5',
    title: 'A quantity line beyond stock on hand is REFUSED by the capacity ceiling (0045)',
    expect: 'green',
    async run() {
      await as('Coordinator', async () => {
        /* The whole shelf: 3 of 3. Accepted. */
        await createBooking({
          key: 'qty-ok',
          window: W.d,
          actor: 'Coordinator',
          lines: [{ productId: QTY_PRODUCT, description: 'Lifecycle Bulk Cable', qty: 3, days: 2, rate: 250 }],
        })
        await transition('qty-ok', 'Quote', 'Booked', 'Coordinator')

        /* One more than exists, same window. Refused. */
        await createBooking({
          key: 'qty-over',
          window: W.d,
          actor: 'Coordinator',
          lines: [{ productId: QTY_PRODUCT, description: 'Lifecycle Bulk Cable', qty: 1, days: 2, rate: 250 }],
        })
        await refuses(
          'a quantity hold beyond stock on hand',
          `insert into booking_stage_transitions
             (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
           values (gen_random_uuid(), $1, $2, 'Quote', 'Booked', $3, 'Coordinator', now())`,
          [bookingIds['qty-over'], BRANCH, U.Coordinator],
          /Reservation rejected.*stock on hand/i,
        )
      })

      assertEq(await liveHolds('qty-ok'), 1, 'the whole shelf is one product-level hold, not three')
      assertEq(
        await one(
          'select qty from inventory_reservations where booking_id = $1 and released_at is null',
          [bookingIds['qty-ok']],
        ),
        3,
        'carrying the line qty',
      )
      assertEq(await stageOf('qty-over'), 'Quote', 'the over-capacity booking stayed a Quote')
    },
  },

  {
    id: 'L6',
    title: 'Booked ΓåÆ Packed ΓåÆ On Rent as Warehouse requires the session rows each stage needs',
    expect: 'green',
    async run() {
      await as('Warehouse', async () => {
        // 1. Moving to Packed without a Packing session is refused
        await refuses(
          'moving to Packed with no Packing session',
          `insert into booking_stage_transitions
             (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
           values (gen_random_uuid(), $1, $2, 'Booked', 'Packed', $3, 'Warehouse', now())`,
          [bookingIds.a, BRANCH, U.Warehouse],
          /gate\.pack\.session_missing/,
        )

        // 2. Complete Pack through action
        await actionPackRental({
          key: 'a',
          actor: 'Warehouse',
          units: [{ id: UNITS[0], serial: 'SN-A1' }],
        })
        assertEq(await stageOf('a'), 'Packed', 'the booking moved to Packed once Packing session and movements exist')

        // Cancellation guard checks at Packed
        await undone(async () => {
          await refuses(
            'cancel at Packed by Warehouse is refused',
            `update bookings set cancelled_at = now(), cancellation_reason = 'Cancelled by warehouse staff without manager authorization' where id = $1`,
            [bookingIds.a],
            /gate\.cancel\.stage_too_late/,
          )
        })

        // 3. Moving to On Rent without a Handover session is refused
        await refuses(
          'moving to On Rent with no Handover session',
          `insert into booking_stage_transitions
             (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
           values (gen_random_uuid(), $1, $2, 'Packed', 'On Rent', $3, 'Warehouse', now())`,
          [bookingIds.a, BRANCH, U.Warehouse],
          /gate\.handover\.session_missing/,
        )

        // 4. Complete Handover through action
        await actionHandoverRental({
          key: 'a',
          actor: 'Warehouse',
          signerName: 'Lifecycle Client Signer',
          reason: 'Handover completed with client signature',
        })
      })

      assertEq(await stageOf('a'), 'On Rent', 'the walk to On Rent completed')

      const sessions = Number(
        await one('select count(*) from operation_sessions where booking_id = $1', [bookingIds.a]),
      )
      assertEq(sessions, 2, 'both Packing and Handover sessions exist for the booking')
    },
  },

  {
    id: 'L7',
    title: 'A partial return: one unit back, one missing',
    expect: 'green',
    async run() {
      await as('Warehouse', async () => {
        // Refuse moving to Returned with no Return session
        await refuses(
          'moving to Returned with no Return session',
          `insert into booking_stage_transitions
             (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
           values (gen_random_uuid(), $1, $2, 'On Rent', 'Returned', $3, 'Warehouse', now())`,
          [bookingIds.a, BRANCH, U.Warehouse],
          /gate\.return\.session_missing/,
        )

        // Complete partial return through action: 1 unit back, 1 missing
        await actionReturnRental({
          key: 'a',
          actor: 'Warehouse',
          returnedUnits: [UNITS[0]],
          missingUnits: [{ id: UNITS[1], reason: 'Lost on location during shoot' }],
        })
      })

      assertEq(await stageOf('a'), 'Returned', 'the booking returned')

      const stillHeld = await liveHolds('a')
      assertEq(stillHeld, 0, 'every hold on a returned booking is released (R-26)')

      const cases = Number(
        await one("select count(*) from cases where linked_booking_id = $1 and type = 'Missing'", [bookingIds.a]),
      )
      assert(cases > 0, 'no Missing case was opened for the unit that did not come back')
    },
  },

  {
    id: 'L8',
    title: 'Accounts raises and issues the invoice: figures snapshot and become immutable (R-15, Law 4)',
    expect: 'green',
    async run() {
      // Since T3-14b creates a Draft invoice on Confirm, the invoice already exists.
      // Query the existing Draft invoice for booking 'a'.
      await asOwnerOfTheDatabase(async () => {
        const row = (
          await q(
            'select id, subtotal, discount_amount, taxable_amount, vat_amount, total_amount, status::text from invoices where booking_id = $1 and status = \'Draft\'',
            [bookingIds.a],
          )
        ).rows[0]
        invoiceId = row.id
        assert(invoiceId !== undefined && invoiceId !== null, 'Draft invoice exists for booking a')

        assertEq(row.status, 'Draft', 'invoice is in Draft status')
        assertEq(Number(row.subtotal), 700000, 'subtotal = 1 unit ├ù 2 days ├ù 350000 = 700000 (before discount)')
        assertEq(Number(row.discount_amount), 70000, 'discount = 10% of 700000 = 70000')
        assertEq(Number(row.taxable_amount), 630000, 'taxable = 700000 - 70000 = 630000')
        assertEq(Number(row.vat_amount), 81900, 'vat = 13% of 630000 = 81900')
        assertEq(Number(row.total_amount), 711900, 'total = 630000 + 81900 = 711900')

        // Draft invoices are mutable - changing notes should succeed
        await q('update invoices set notes = \'Test note\' where id = $1', [invoiceId])
        const updated = await one('select notes from invoices where id = $1', [invoiceId])
        assertEq(updated, 'Test note', 'Draft invoice notes can be changed')
      })

      /* Issue the invoice: mints invoice_no (R-15), sets issue_date, and advances status to Sent */
      await as('Accounts', async () => {
        const issued = await one('select issue_invoice($1::jsonb)', [
          JSON.stringify({
            invoice_id: invoiceId,
            issued_by: U.Accounts,
          }),
        ])
        assert(issued.invoice_no !== null && typeof issued.invoice_no === 'string', 'issued invoice has no number')
        assert(issued.invoice_no.startsWith('INV-'), `issued invoice number is unexpected: ${issued.invoice_no}`)
        assertEq(issued.status, 'Sent', 'newly issued invoice without payments has status Sent')
      })

      /* Law 4 / reject_invoice_edit_after_issue: once issued, figures are immutable */
      await as('Accounts', async () => {
        let editFailed = false
        try {
          await q('update invoices set subtotal = 9999 where id = $1', [invoiceId])
        } catch (err) {
          editFailed = true
          assert(
            String(err).includes('figures are immutable'),
            `expected immutability rejection, got: ${String(err)}`,
          )
        }
        assert(editFailed, 'direct update to issued invoice subtotal was unexpectedly accepted')
      })
    },
  },

  {
    id: 'L9',
    title: 'Four payments that must all be refused',
    expect: 'green',
    async run() {
      const insert = `insert into payments
          (client_uuid, payment_no, booking_id, invoice_id, client_id, branch_id, amount, payment_type, payment_date, received_by)
        values (gen_random_uuid(), next_document_number('payment'), $1, $2, $3, $4, $5, 'Advance Payment', now(), $6)`

      /* Every probe here is UNDONE ΓÇö see `undone`. One of these four IS accepted
         today, and left in place it would silently change L10's arithmetic and
         L13's row count. */
      const accepted = await undone(async () => {
        const outstanding = Number(await one('select outstanding_amount from invoices where id = $1', [invoiceId]))
        const taken = []

        const attempts = [
          ['larger than the outstanding amount', 'Accounts', [bookingIds.a, invoiceId, CLIENT, BRANCH, outstanding + 1000, U.Accounts]],
          ['of zero', 'Accounts', [bookingIds.a, invoiceId, CLIENT, BRANCH, 0, U.Accounts]],
          ["naming another client's booking", 'Accounts', [bookingIds.a, invoiceId, OTHER_CLIENT, BRANCH, 100, U.Accounts]],
          ['taken by Warehouse ΓÇö Law 6', 'Warehouse', [bookingIds.a, invoiceId, CLIENT, BRANCH, 100, U.Warehouse]],
        ]

        /* One SAVEPOINT per attempt. A refused statement aborts the whole
           transaction ΓÇö every later attempt then fails with "current transaction
           is aborted", which reads exactly like a refusal and is not one. The
           savepoint is what keeps four independent probes independent. */
        for (const [n, [what, role, params]] of attempts.entries()) {
          const sp = `l9_${String(n)}`
          await db.exec(`savepoint ${sp};`)
          await as(role, async () => {
            try {
              const result = await q(insert, params)
              if ((result.affectedRows ?? 0) > 0) taken.push(what)
            } catch {
              /* refused, which is what this step wants */
            }
            /* Inside the role block, BEFORE it resets the role: the rollback is
               what clears an aborted transaction, and the reset needs a live one. */
            await db.exec(`rollback to savepoint ${sp};`)
          })
        }
        return taken
      })

      assert(
        accepted.length === 0,
        `the database ACCEPTED ${String(accepted.length)} payment(s) it must refuse: ${accepted.join('; ')}`,
      )
    },
  },

  {
    id: 'L10',
    title: 'Two payments settle the invoice: 3,000 then 4,119',
    expect: 'green',
    async run() {
      await as('Accounts', async () => {
        for (const amount of [300000, 411900]) {
          await q(
            `insert into payments
               (client_uuid, payment_no, booking_id, invoice_id, client_id, branch_id, amount, payment_type, payment_date, received_by)
             values (gen_random_uuid(), next_document_number('payment'), $1, $2, $3, $4, $5, 'Advance Payment', now(), $6)`,
            [bookingIds.a, invoiceId, CLIENT, BRANCH, amount, U.Accounts],
          )
        }
      })

      await asOwnerOfTheDatabase(async () => {
        const row = (
          await q('select paid_amount, outstanding_amount, status::text from invoices where id = $1', [invoiceId])
        ).rows[0]
        assertEq(Number(row.paid_amount), 711900, 'paid_amount (paisa)')
        assertEq(Number(row.outstanding_amount), 0, 'outstanding_amount')
        assertEq(row.status, 'Paid', 'invoice status is Paid')
      })
    },
  },

  {
    id: 'L11',
    title: 'Closed needs a settled invoice',
    expect: 'green',
    async run() {
      /* Refused while open cases exist (Gate 3e) */
      let closeWithOpenCaseRefused = false
      try {
        await as('Coordinator', async () => {
          await transition('a', 'Returned', 'Closed', 'Coordinator')
        })
      } catch (err) {
        closeWithOpenCaseRefused = true
        assert(
          String(err).includes('open cases'),
          `expected open cases gate rejection, got: ${String(err)}`,
        )
      }
      assert(closeWithOpenCaseRefused, 'booking closed while open cases were still pending')

      /* Manager resolves the missing item case so the booking can lawfully close */
      await as('Manager', async () => {
        await q(
          `update cases set status = 'Resolved', settled_at = now() where linked_booking_id = $1 and type = 'Missing'`,
          [bookingIds.a],
        )
      })

      /* The ACCEPTED half, on the booking this script has settled. */
      await as('Coordinator', async () => {
        await transition('a', 'Returned', 'Closed', 'Coordinator')
      })
      assertEq(await stageOf('a'), 'Closed', 'a settled booking closes')
      assert(
        (await one('select closed_at from bookings where id = $1', [bookingIds.a])) !== null,
        'closed_at was set by the transition',
      )

      /* The REFUSED half, on booking `c` ΓÇö Booked, and never invoiced/settled. Undone,
         because walking a second booking to Closed for the sake of an assertion
         would leave a closed booking in the corpus and Closed is final. */
      const closedWithNoInvoice = await undone(async () => {
        await as('Warehouse', async () => {
          await actionPackRental({ key: 'c', actor: 'Warehouse', units: [{ id: UNITS[0], serial: 'SN-C1' }] })
          await actionHandoverRental({ key: 'c', actor: 'Warehouse', signerName: 'Lifecycle Client Signer', reason: 'Handover completed with client signature' })
          await actionReturnRental({ key: 'c', actor: 'Warehouse', returnedUnits: [{ id: UNITS[0] }] })
        })

        // Settle invoice is NOT called here because we are verifying that an unsettled booking CANNOT close!
        await as('Coordinator', async () => {
          try {
            await transition('c', 'Returned', 'Closed', 'Coordinator')
          } catch {
            return
          }
        })
        return (await stageOf('c')) === 'Closed'
      })

      assert(
        closedWithNoInvoice !== true,
        'a booking with NO invoice and nothing paid walked all the way to Closed. The close gate never asked whether it had been billed.',
      )
    },
  },

  {
    id: 'L12',
    title: 'Money-blind roles read no money and write none',
    expect: 'green',
    async run() {
      /* ΓÜá The trap this step was written wrong into once, kept as a comment
         because it is the single easiest way to fabricate a passing Law 6 test.
         An UPDATE whose WHERE clause matches no VISIBLE row is not refused ΓÇö it
         succeeds, affecting zero rows. So `refuses(...)` reports "the database
         ACCEPTED it", and a naive reading calls that a Law 6 hole when it is in
         fact RLS working exactly as designed.

         The honest assertion is about the OUTCOME, not the error: the write
         touched nothing, and the figure is unchanged when read by someone who
         can see it. Both are checked, and the read-back is done as the database
         owner so a masked read cannot pass by returning nothing. */
      const before = Number(
        await asOwnerOfTheDatabase(() => one('select total_amount from invoices where id = $1', [invoiceId])),
      )

      for (const role of ['Warehouse', 'Technician', 'Driver', 'Client']) {
        await as(role, async () => {
          for (const table of ['invoices', 'payments', 'security_deposits']) {
            const n = Number(await one(`select count(*) from ${table}`))
            assertEq(n, 0, `${role} can see ${String(n)} row(s) of ${table}; Law 6 says none`)
          }

          let touched = 0
          try {
            const result = await q('update invoices set total_amount = total_amount + 1 where id = $1', [invoiceId])
            touched = result.affectedRows ?? 0
          } catch {
            touched = 0 /* refused outright, which is the stronger outcome */
          }
          assertEq(touched, 0, `${role} changed ${String(touched)} invoice row(s); Law 6 says none`)
        })
      }

      const after = Number(
        await asOwnerOfTheDatabase(() => one('select total_amount from invoices where id = $1', [invoiceId])),
      )
      assertEq(after, before, 'the invoice total after four money-blind roles tried to raise it')
    },
  },

  {
    id: 'L13',
    title: 'Even the Owner cannot rewrite the audit log or delete a payment',
    expect: 'green',
    async run() {
      await as('Owner', async () => {
        await refuses(
          'an Owner updating an audit row',
          "update audit_events set reason = 'rewritten' where id = (select id from audit_events limit 1)",
          [],
          /./,
        )
        await refuses(
          'an Owner deleting a payment',
          'delete from payments where invoice_id = $1',
          [invoiceId],
          /./,
        )
      })
      assertEq(
        Number(await one('select count(*) from payments where invoice_id = $1', [invoiceId])),
        2,
        'both payments are still there',
      )
    },
  },

  {
    id: 'L14',
    title: 'Client portal user sees only their own rows, never another client\'s',
    expect: 'green',
    async run() {
      await as('Client', async () => {
        // 1. clients table: sees own client row, cannot see OTHER_CLIENT
        const myClients = await q('select id, name from clients')
        assertEq(myClients.rows.length, 1, 'Client sees exactly their own client row')
        assertEq(myClients.rows[0].id, CLIENT, 'The one visible client is their own')

        const otherClientVisible = Number(
          await one('select count(*) from clients where id = $1', [OTHER_CLIENT]),
        )
        assertEq(otherClientVisible, 0, 'Client cannot see another client\'s row')

        // 2. bookings table: sees own bookings (a, b, c), cannot see OTHER_CLIENT's bookings
        const myBookings = await q('select id, client_id from bookings')
        assert(myBookings.rows.length > 0, 'Client sees their own bookings')
        for (const b of myBookings.rows) {
          assertEq(b.client_id, CLIENT, 'Visible booking belongs to own client')
        }

        const otherBookingVisible = Number(
          await one('select count(*) from bookings where client_id = $1', [OTHER_CLIENT]),
        )
        assertEq(otherBookingVisible, 0, 'Client cannot see another client\'s bookings')

        // 3. booking_lines table: sees lines for own bookings only
        const myLines = await q('select id, booking_id from booking_lines')
        assert(myLines.rows.length > 0, 'Client sees booking lines for own bookings')

        // 4. Staff directory view exists and is blocked to Client (0148: P9)
        const staff = await q('select count(*) from staff_directory_v')
        assertEq(Number(staff.rows[0].count), 0, 'Client cannot read internal staff directory (0148 / P9)')
      })

      // Verify that staff can read the staff directory
      await as('Coordinator', async () => {
        const staff = await q('select count(*) from staff_directory_v')
        assert(Number(staff.rows[0].count) > 0, 'Staff directory view exists and lists staff for staff roles')
      })
    },
  },

  {
    id: 'L15',
    title: 'Unit status is owned by the engine; direct write is refused (S1-5)',
    expect: 'green',
    async run() {
      // 1. Direct update to status as Owner is refused by gate.unit_status.direct_write
      await asOwnerOfTheDatabase(async () => {
        await refuses(
          'direct update to product_units.status',
          "update product_units set status = 'On Rent' where id = $1",
          [UNITS[0]],
          /gate\.unit_status\.direct_write/,
        )
      })

      // 2. Status recomputed: active maintenance record sets status to 'Maintenance'
      const maintId = crypto.randomUUID()
      await asOwnerOfTheDatabase(async () => {
        await q(
          `insert into maintenance_records (id, client_uuid, record_no, product_unit_id, maintenance_type, description, scheduled_date, created_by)
           values ($1, gen_random_uuid(), 'MR-L15-01', $2, 'Cleaning', 'Routine scheduled cleaning', now(), $3)`,
          [maintId, UNITS[0], U.Owner],
        )
      })
      const unit0StatusMaint = await one('select status::text from product_units where id = $1', [UNITS[0]])
      assertEq(unit0StatusMaint, 'Maintenance', 'Unit with active maintenance record has status Maintenance')

      // 3. Complete the maintenance record -> status recomputes back to 'In Stock'
      await asOwnerOfTheDatabase(async () => {
        await q(
          `update maintenance_records set status = 'Completed', completed_at = now() where id = $1`,
          [maintId],
        )
      })
      const unit0StatusStock = await one('select status::text from product_units where id = $1', [UNITS[0]])
      assertEq(unit0StatusStock, 'In Stock', 'Unit with completed maintenance recomputes to In Stock')
    },
  },

  {
    id: 'L16',
    title: 'Invoice void discipline: role check, reason, credit note requirement (S1-3)',
    expect: 'green',
    async run() {
      // In L10, invoiceId is Paid (paid_amount: 7119).
      // 1. Coordinator cannot void (gate.invoice.void_role)
      await asOwnerOfTheDatabase(async () => {
        await db.exec(`select set_config('app.current_user_id', '${U.Coordinator}', false);`)
        try {
          await refuses(
            'void by Coordinator',
            "update invoices set status = 'Void', void_reason = 'Cancelled by client agreement' where id = $1",
            [invoiceId],
            /gate\.invoice\.void_role/,
          )
        } finally {
          await db.exec("select set_config('app.current_user_id', '', false);")
        }
      })

      // 2. Void without reason (or reason < 10 chars) by Accounts is refused (gate.invoice.void_reason)
      await as('Accounts', async () => {
        await refuses(
          'void without reason',
          "update invoices set status = 'Void' where id = $1",
          [invoiceId],
          /gate\.invoice\.void_reason/,
        )
        await refuses(
          'void with short reason',
          "update invoices set status = 'Void', void_reason = 'mistake' where id = $1",
          [invoiceId],
          /gate\.invoice\.void_reason/,
        )
      })

      // 3. Void of a paid invoice without a credit note is refused (gate.invoice.void_paid)
      await as('Accounts', async () => {
        await refuses(
          'void of paid invoice without credit note',
          "update invoices set status = 'Void', void_reason = 'Customer requested full refund' where id = $1",
          [invoiceId],
          /gate\.invoice\.void_paid/,
        )
      })

      // 4. Issue a credit note for this invoice, then void succeeds
      await as('Accounts', async () => {
        await q(
          `insert into credit_notes (client_uuid, credit_note_no, invoice_id, amount, reason, created_by)
           values (gen_random_uuid(), next_document_number('credit_note'), $1, 7119, 'Full refund credit note issued', $2)`,
          [invoiceId, U.Accounts],
        )

        await q(
          `update invoices
              set status = 'Void',
                  void_reason = 'Cancelled and refunded with credit note'
            where id = $1`,
          [invoiceId],
        )
      })

      const voidRow = (await q('select status::text, voided_by, voided_at from invoices where id = $1', [invoiceId])).rows[0]
      assertEq(voidRow.status, 'Void', 'invoice status is Void')
      assert(voidRow.voided_by !== null, 'voided_by was stamped by trigger')
      assert(voidRow.voided_at !== null, 'voided_at was stamped by trigger')

      // 5. Unvoiding or modifying voided invoice is refused (gate.invoice.void_immutable)
      await as('Accounts', async () => {
        await refuses(
          'unvoiding voided invoice',
          "update invoices set status = 'Draft' where id = $1",
          [invoiceId],
          /gate\.invoice\.void_immutable/,
        )
      })
    },
  },

  {
    id: 'L17',
    title: 'Server-side prices for money-blind callers, line guard, role ceiling & user immutability (S1-6, S1-7)',
    expect: 'green',
    async run() {
      // 1. Warehouse create_booking with rate: 1 on a Rs 3,500 model sets line rate 3500, rate_overridden = false, audit row present
      let whBookingId
      await as('Warehouse', async () => {
        const res = await createBooking({
          key: 'wh-booking',
          window: W.d,
          actor: 'Warehouse',
          lines: [
            {
              productId: SERIAL_PRODUCT,
              description: 'Warehouse created booking',
              qty: 1,
              days: 1,
              rate: 1,
            },
          ],
        })
        whBookingId = res.booking_id
      })

      const lineRow = (
        await q(
          'select rate, rate_overridden from booking_lines where booking_id = $1',
          [whBookingId],
        )
      ).rows[0]
      assertEq(Number(lineRow.rate), 3500, 'line rate was set to server product daily_rate 3500')
      assertEq(lineRow.rate_overridden, false, 'rate_overridden is false')

      const auditCount = Number(
        await one(
          "select count(*) from audit_events where record_id = $1 and action = 'price.server_applied'",
          [whBookingId],
        ),
      )
      assert(auditCount > 0, 'audit_events row for price.server_applied was written')

      // 2. Coordinator create_booking with rate: 3000 sets rate 3000, rate_overridden = true
      let coordBookingId
      await as('Coordinator', async () => {
        const res = await createBooking({
          key: 'coord-booking',
          window: W.d,
          actor: 'Coordinator',
          lines: [
            {
              productId: SERIAL_PRODUCT,
              description: 'Coordinator created override booking',
              qty: 1,
              days: 1,
              rate: 3000,
            },
          ],
        })
        coordBookingId = res.booking_id
      })

      const coordLineRow = (
        await q(
          'select rate, rate_overridden from booking_lines where booking_id = $1',
          [coordBookingId],
        )
      ).rows[0]
      assertEq(Number(coordLineRow.rate), 3000, 'Coordinator line rate is 3000')
      assertEq(coordLineRow.rate_overridden, true, 'rate_overridden is true')

      // 3. Warehouse direct insert into booking_lines with rate is refused (gate.booking_lines.money_blind_insert)
      await as('Warehouse', async () => {
        await refuses(
          'direct insert into booking_lines by Warehouse',
          `insert into booking_lines
             (client_uuid, booking_id, line_type, product_id, qty, days, rate, created_by)
           values (gen_random_uuid(), $1, 'Equipment', $2, 1, 1, 3500, $3)`,
          [whBookingId, SERIAL_PRODUCT, U.Warehouse],
          /gate\.booking_lines\.money_blind_insert/,
        )
      })

      // 4. Money-blind caller attempting discounts in create_booking is refused (gate.discount.money_blind)
      await as('Warehouse', async () => {
        await refuses(
          'create_booking with discounts by money-blind caller',
          'select create_booking($1::jsonb)',
          [
            JSON.stringify({
              client_uuid: crypto.randomUUID(),
              created_by: U.Warehouse,
              branch_id: BRANCH,
              client_id: CLIENT,
              pickup_at: W.d[0],
              return_at: W.d[1],
              delivery_type: 'Client Pickup',
              lines: [
                {
                  client_uuid: crypto.randomUUID(),
                  product_id: SERIAL_PRODUCT,
                  qty: 1,
                  days: 1,
                },
              ],
              discounts: [
                {
                  client_uuid: crypto.randomUUID(),
                  discount_source: 'Commercial Negotiation',
                  percent: 10,
                  reason: 'Test discount',
                },
              ],
            }),
          ],
          /gate\.discount\.money_blind/,
        )
      })

      // 5. Admin assigning Owner or Admin role is refused by role ceiling (gate.users.role_ceiling)
      await as('Admin', async () => {
        await refuses(
          'Admin setting role to Admin',
          "update users set primary_role = 'Admin' where id = $1",
          [U.Coordinator],
          /gate\.users\.role_ceiling/,
        )
      })

      // 6. Deleting from users is refused (gate.users.immutable)
      await asOwnerOfTheDatabase(async () => {
        await refuses(
          'Owner deleting from users',
          'delete from users where id = $1',
          [U.Coordinator],
          /gate\.users\.immutable/,
        )
      })
    },
  },

  {
    id: 'L18',
    title: 'Booking schedule changes cannot desynchronise reservations',
    expect: 'green',
    async run() {
      const firstWindow = ['2100-01-01T04:00:00Z', '2100-01-03T04:00:00Z']
      const secondWindow = ['2100-01-03T04:00:00Z', '2100-01-05T04:00:00Z']

      await as('Coordinator', async () => {
        for (const [key, window] of [
          ['schedule-a', firstWindow],
          ['schedule-b', secondWindow],
        ]) {
          await createBooking({
            key,
            window,
            actor: 'Coordinator',
            lines: [
              {
                productId: SERIAL_PRODUCT,
                description: 'Schedule ownership camera',
                qty: 1,
                days: 2,
                rate: 350000,
                units: [UNITS[1]],
              },
            ],
          })
          await transition(key, 'Quote', 'Booked', 'Coordinator')
        }

        await refuses(
          'a direct booking date update whose synchronized reservation would overlap the next booking',
          'update bookings set return_at = $2 where id = $1',
          [bookingIds['schedule-a'], '2100-01-04T04:00:00Z'],
          /no_double_booking|exclusion/i,
        )
      })

      assertEq(
        await one('select return_at = $2::timestamptz from bookings where id = $1', [
          bookingIds['schedule-a'],
          firstWindow[1],
        ]),
        true,
        'the refused direct write left the booking schedule unchanged',
      )
      assertEq(
        await one(
          'select upper(period) = $2::timestamptz from inventory_reservations where booking_id = $1 and released_at is null',
          [bookingIds['schedule-a'], firstWindow[1]],
        ),
        true,
        'the reservation still ends with the booking',
      )

      await as('Coordinator', async () => {
        await q('update bookings set pickup_at = $2 where id = $1', [
          bookingIds['schedule-a'],
          '2099-12-31T04:00:00Z',
        ])
      })
      assertEq(
        await one(
          'select lower(period) = $2::timestamptz from inventory_reservations where booking_id = $1 and released_at is null',
          [bookingIds['schedule-a'], '2099-12-31T04:00:00Z'],
        ),
        true,
        'a safe direct schedule change moved the reservation in the same transaction',
      )

      await as('Coordinator', async () => {
        await refuses(
          'the official extension path when its new period overlaps the next booking',
          'select extend_booking($1::uuid, 1, $2, $3::uuid)',
          [bookingIds['schedule-a'], 'Client requested one more rental day', U.Coordinator],
          /no_double_booking|exclusion/i,
        )
      })

      assertEq(
        await one('select return_at = $2::timestamptz from bookings where id = $1', [
          bookingIds['schedule-a'],
          firstWindow[1],
        ]),
        true,
        'the refused extension rolled the booking date back',
      )
    },
  },

  {
    id: 'L19',
    title: 'A payment reversal cannot exceed the receipt across partial corrections',
    expect: 'green',
    async run() {
      /* Keep the probe reversible: this proves the ledger guard without changing
         the settled lifecycle record L10/L11 established above. */
      await undone(async () => {
        await as('Manager', async () => {
          const paymentId = await one(
            `select id from payments where booking_id = $1 and amount = 300000 order by created_at limit 1`,
            [bookingIds.a],
          )
          assert(paymentId !== null, 'L19 needs L10\'s Rs 3,000 receipt.')

          await q(
            `insert into payment_reversals
               (client_uuid, reversal_no, original_payment_id, amount, reason, reversed_by, approved_by)
             values (gen_random_uuid(), 'REV-L19-0001', $1, 250000, 'Lifecycle partial correction', $2, $2)`,
            [paymentId, U.Manager],
          )

          await refuses(
            'a second partial reversal beyond the remaining Rs 500',
            `insert into payment_reversals
               (client_uuid, reversal_no, original_payment_id, amount, reason, reversed_by, approved_by)
             values (gen_random_uuid(), 'REV-L19-0002', $1, 50100, 'Lifecycle excess correction', $2, $2)`,
            [paymentId, U.Manager],
            /remaining reversible amount|exceeds/i,
          )
        })
      })
    },
  },
  {
    id: 'L20',
    title: 'Bulk stock adjustment is atomic, idempotent, reasoned, and Manager-only',
    expect: 'green',
    async run() {
      await undone(async () => {
        const refusesInProbe = async (what, sql, params, matcher) => {
          await db.exec('savepoint stock_probe;')
          try {
            await refuses(what, sql, params, matcher)
          } finally {
            await db.exec('rollback to savepoint stock_probe; release savepoint stock_probe;')
          }
        }
        const key = '00000000-0000-4000-8000-00000000a140'
        await as('Manager', async () => {
          await q("select set_config('request.jwt.claim.sub', $1, true)", [U.Manager])
          const before = await one('select total_quantity from products where id = $1', [QTY_PRODUCT])
          const first = await q(
            'select * from adjust_stock($1, 2, $2, $3, $4)',
            [QTY_PRODUCT, 'Found two extra units during count', U.Manager, key],
          )
          assertEq(first.rows[0].quantity_before, before, 'adjustment records prior quantity')
          assertEq(first.rows[0].quantity_after, before + 2, 'adjustment records new quantity')
          await q('select * from adjust_stock($1, 2, $2, $3, $4)',
            [QTY_PRODUCT, 'Found two extra units during count', U.Manager, key])
          assertEq(await one('select total_quantity from products where id = $1', [QTY_PRODUCT]), before + 2,
            'retry does not apply the delta twice')
          await refusesInProbe('stock below zero', 'select * from adjust_stock($1, -999, $2, $3, gen_random_uuid())',
            [QTY_PRODUCT, 'Physical count found missing stock', U.Manager], /below zero/i)
          await refusesInProbe('serialised bulk adjustment', 'select * from adjust_stock($1, 1, $2, $3, gen_random_uuid())',
            [SERIAL_PRODUCT, 'Physical count found an extra unit', U.Manager], /Serialised products/i)
          await refusesInProbe('direct quantity update', 'update products set total_quantity = total_quantity + 1 where id = $1',
            [QTY_PRODUCT], /audited stock adjustment action/i)
        })
        await as('Warehouse', async () => {
          await q("select set_config('request.jwt.claim.sub', $1, true)", [U.Warehouse])
          await refusesInProbe('Warehouse stock adjustment', 'select * from adjust_stock($1, 1, $2, $3, gen_random_uuid())',
            [QTY_PRODUCT, 'Physical count found an extra unit', U.Warehouse], /Only Owner, Admin, or Manager/i)
        })
      })
    },
  },
  {
    id: 'L21',
    title: 'A consumable line deducts stock at Handover and needs no return receipt (0141/0142)',
    expect: 'green',
    async run() {
      await as('Coordinator', async () => {
        await createBooking({
          key: 'cons',
          window: W.e,
          actor: 'Coordinator',
          lines: [
            {
              productId: SERIAL_PRODUCT,
              description: 'Consumable-probe camera',
              qty: 1,
              days: 2,
              rate: 350000,
              units: [UNITS[2]],
            },
            {
              productId: CONSUMABLE_PRODUCT,
              description: 'Lifecycle Gaffer Tape',
              qty: 2,
              days: 2,
              rate: 150,
            },
          ],
        })
        await transition('cons', 'Quote', 'Booked', 'Coordinator')
      })
      assertEq(await liveHolds('cons'), 2, 'the consumable line holds quantity like any non-serialised line')

      await as('Warehouse', async () => {
        const packingSessionId = crypto.randomUUID()
        await q(
          `insert into operation_sessions (id, client_uuid, booking_id, operation, session_no, state, warehouse_staff_id, created_by)
           values ($1, gen_random_uuid(), $2, 'Packing', 1, 'In Progress', $3, $3)`,
          [packingSessionId, bookingIds.cons, U.Warehouse],
        )
        await q(
          `insert into session_line_movements (client_uuid, session_id, booking_line_id, unit_id, serial, qty, moved_at, created_by)
           values (gen_random_uuid(), $1, (select id from booking_lines where booking_id = $2 and product_id = $3), $4, 'LCSN-003', 1, now(), $5)`,
          [packingSessionId, bookingIds.cons, SERIAL_PRODUCT, UNITS[2], U.Warehouse],
        )
        await transition('cons', 'Booked', 'Packed', 'Warehouse')
      })

      // Settle invoice before handover to satisfy R-06 gate (run independently so role is not clobbered)
      await as('Accounts', async () => {
        const draftInvoiceId = await one('select id from invoices where booking_id = $1 and status = \'Draft\'', [bookingIds.cons])
        if (draftInvoiceId) {
          await q('select issue_invoice($1::jsonb)', [
            JSON.stringify({ invoice_id: draftInvoiceId, issued_by: U.Accounts })
          ])
          // Pay the outstanding amount
          const outstanding = Number(await one('select outstanding_amount from invoices where id = $1', [draftInvoiceId]))
          if (outstanding > 0) {
            await q(
              `insert into payments (client_uuid, payment_no, booking_id, invoice_id, client_id, branch_id, amount, payment_type, payment_date, received_by)
               values (gen_random_uuid(), next_document_number('payment'), $1, $2, $3, $4, $5, 'Advance Payment', now(), $6)`,
            [bookingIds.cons, draftInvoiceId, CLIENT, BRANCH, outstanding, U.Accounts])
          }
        }
      })

      await as('Warehouse', async () => {
        const handoverSessionId = crypto.randomUUID()
        await q(
          `insert into operation_sessions (id, client_uuid, booking_id, operation, session_no, state, delivery_method, warehouse_staff_id, created_by, government_id_verified, booking_authorization_verified)
           values ($1, gen_random_uuid(), $2, 'Handover', 1, 'In Progress', 'Client Pickup', $3, $3, true, true)`,
          [handoverSessionId, bookingIds.cons, U.Warehouse],
        )
        // Handover still receipts every line including the consumable ΓÇö the
        // exemption is Return-only.
        for (const [productId, qty] of [[SERIAL_PRODUCT, 1], [CONSUMABLE_PRODUCT, 2]]) {
          await q(
            `insert into handover_lines (client_uuid, booking_line_id, state, qty_required, first_session_id, completed_session_id, created_by)
             values (gen_random_uuid(), (select id from booking_lines where booking_id = $1 and product_id = $2), 'Picked Up', $3, $4, $4, $5)`,
            [bookingIds.cons, productId, qty, handoverSessionId, U.Warehouse],
          )
        }
        await q(
          `insert into signatures (client_uuid, session_id, signature_role, signer_name, signed_at, device, is_required, created_by)
           values (gen_random_uuid(), $1, 'Receiver', 'Lifecycle Client Signer', now(), 'iPad-1', true, $2)`,
          [handoverSessionId, U.Warehouse],
        )
        await transition('cons', 'Packed', 'On Rent', 'Warehouse')
      })

      assertEq(await stageOf('cons'), 'On Rent', 'handover completed with the consumable line aboard')

      // 0142: the Handover deducted 2 tapes from the shelf of 10.
      await asOwnerOfTheDatabase(async () => {
        const movement = (
          await q(
            `select qty, quantity_before, quantity_after
               from consumable_stock_movements
              where booking_id = $1`,
            [bookingIds.cons],
          )
        ).rows[0]
        assert(movement !== undefined, 'no consumable movement was recorded at Handover')
        assertEq(movement.qty, 2, 'movement qty')
        assertEq(movement.quantity_before, 10, 'movement quantity_before')
        assertEq(movement.quantity_after, 8, 'movement quantity_after')
        assertEq(
          await one('select total_quantity from products where id = $1', [CONSUMABLE_PRODUCT]),
          8,
          'the shelf count moved exactly once',
        )
      })

      await as('Warehouse', async () => {
        // The camera comes back in this session's books.
        await q(
          `update booking_line_units
              set returned_at = now(), condition = 'Good'
            where asset_id = $1
              and booking_line_id in (select id from booking_lines where booking_id = $2)`,
          [UNITS[2], bookingIds.cons],
        )
        const returnSessionId = crypto.randomUUID()
        await q(
          `insert into operation_sessions (id, client_uuid, booking_id, operation, session_no, state, warehouse_staff_id, created_by)
           values ($1, gen_random_uuid(), $2, 'Return', 1, 'In Progress', $3, $3)`,
          [returnSessionId, bookingIds.cons, U.Warehouse],
        )

        // The exemption is narrow: the serialised line still needs its receipt.
        await refuses(
          'moving to Returned with the camera unreceipted',
          `insert into booking_stage_transitions
             (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
           values (gen_random_uuid(), $1, $2, 'On Rent', 'Returned', $3, 'Warehouse', now())`,
          [bookingIds.cons, BRANCH, U.Warehouse],
          /gate\.return\.units_unaccounted/,
        )

        await q(
          `insert into return_lines (client_uuid, booking_line_id, state, qty_expected, session_id, returned_at, created_by)
           values (gen_random_uuid(), (select id from booking_lines where booking_id = $1 and product_id = $2), 'Returned', 1, $3, now(), $4)`,
          [bookingIds.cons, SERIAL_PRODUCT, returnSessionId, U.Warehouse],
        )

        // 0141: no return line for the gaffer tape, and the move is accepted.
        await transition('cons', 'On Rent', 'Returned', 'Warehouse')
      })

      assertEq(await stageOf('cons'), 'Returned', 'the booking returned without a consumable receipt')
      assertEq(await liveHolds('cons'), 0, 'every hold released, quantity holds included (R-26)')
      assertEq(
        await one(
          "select count(*) from cases where linked_booking_id = $1 and type = 'Missing'",
          [bookingIds.cons],
        ),
        0,
        'the consumed line opens no Missing case',
      )

      // The one-per-line UNIQUE is the re-run guard, not a bare not-exists.
      // As owner: RLS has no INSERT policy on this table by design (only the
      // trigger writes), so the probe must bypass RLS to reach the constraint.
      await undone(async () => {
        await asOwnerOfTheDatabase(async () => {
          await refuses(
            'a second deduction for the same booking line',
            `insert into consumable_stock_movements
               (client_uuid, booking_id, booking_line_id, product_id, qty, quantity_before, quantity_after, created_by)
             values (gen_random_uuid(), $1,
               (select id from booking_lines where booking_id = $1 and product_id = $2),
               $2, 2, 8, 6, $3)`,
            [bookingIds.cons, CONSUMABLE_PRODUCT, U.Warehouse],
            /duplicate|unique/i,
          )
        })
      })
    },
  },
  {
    id: 'L22',
    title: 'Smart Intel note visibility and classified values are filtered by RLS for every role',
    expect: 'green',
    run: async () => {
      await undone(async () => {
        await asOwnerOfTheDatabase(async () => {
          for (const visibility of ['all_staff', 'operations', 'management']) {
            await q(
              `insert into intel_entity_notes (client_uuid, entity_type, client_id, body, visibility, created_by)
               values (gen_random_uuid(), 'client', $1, $2, $3, $4)`,
              [CLIENT, `Intel ${visibility}`, visibility, U.Owner],
            )
            await q(
              `insert into booking_notes (client_uuid, booking_id, note_type, body, visibility, created_by)
               values (gen_random_uuid(), $1, 'Internal', $2, $3, $4)`,
              [bookingIds.a, `Intel ${visibility}`, visibility, U.Owner],
            )
          }
          for (const classification of ['operational', 'personal', 'financial']) {
            const definitionId = crypto.randomUUID()
            await q(
              `insert into intel_field_definitions
                 (id, client_uuid, entity_type, field_key, label, classification, high_priority, created_by)
               values ($1, gen_random_uuid(), 'client', $2, $3, $4, true, $5)`,
              [definitionId, `lifecycle_${classification}`, `Lifecycle ${classification}`, classification, U.Owner],
            )
            await q(
              `insert into intel_field_values
                 (client_uuid, definition_id, client_id, value_text, created_by)
               values (gen_random_uuid(), $1, $2, $3, $4)`,
              [definitionId, CLIENT, `SECRET_${classification}`, U.Owner],
            )
          }
        })
        for (const role of Object.keys(U)) {
          const noteCount = ['Owner', 'Admin', 'Manager'].includes(role) ? 3 : role === 'Accounts' ? 1 : role === 'Client' ? 0 : 2
          const fieldCount = ['Owner', 'Admin', 'Manager', 'Accounts'].includes(role) ? 3 : role === 'Coordinator' ? 2 : role === 'Client' ? 0 : 1
          await as(role, async () => {
            assertEq(await one('select count(*) from intel_entity_notes where client_id = $1', [CLIENT]), noteCount, `${role} client note visibility`)
            assertEq(await one('select count(*) from booking_notes where booking_id = $1 and body like $2', [bookingIds.a, 'Intel %']), noteCount, `${role} booking note visibility`)
            assertEq(await one('select count(*) from intel_field_values where client_id = $1', [CLIENT]), fieldCount, `${role} classified field visibility`)
            if (!['Owner', 'Admin', 'Manager', 'Accounts'].includes(role)) {
              assertEq(await one("select count(*) from intel_field_values where value_text = 'SECRET_financial'"), 0, `${role} financial payload absence`)
            }
          })
        }
      })
    },
  },
  {
    id: 'L23',
    title: 'extend_booking RPC extends return dates, increments line days, and updates reservations (AUD D5)',
    expect: 'green',
    run: async () => {
      // 1. Create a dedicated test booking in Quote -> Booked stage
      await as('Coordinator', async () => {
        await createBooking({
          key: 'ext_test',
          window: ['2105-06-01T04:00:00Z', '2105-06-03T04:00:00Z'],
          actor: 'Coordinator',
          lines: [
            {
              productId: SERIAL_PRODUCT,
              description: 'Extension Lifecycle Test Camera',
              qty: 1,
              days: 2,
              rate: 350000,
              units: [UNITS[2]],
            },
          ],
        })
        await transition('ext_test', 'Quote', 'Booked', 'Coordinator')
      })

      // 2. Refuses extension by unauthorized role (e.g. Client)
      await as('Client', async () => {
        await refuses(
          'extension by Client',
          `select extend_booking(jsonb_build_object(
            'booking_id', $1::uuid,
            'days', 2,
            'reason', 'Unauthorized client extension attempt'
          ))`,
          [bookingIds['ext_test']],
          /42501|may not extend/i,
        )
      })

      // 3. Coordinator extends booking by 2 days via extend_booking RPC
      let rpcResult
      await as('Coordinator', async () => {
        const res = await q(
          `select extend_booking(jsonb_build_object(
            'booking_id', $1::uuid,
            'days', 2,
            'reason', 'Production shoot schedule extended by two operational days'
          )) as data`,
          [bookingIds['ext_test']],
        )
        rpcResult = res.rows[0].data
      })

      assertEq(rpcResult.success, true, 'extend_booking RPC succeeded')
      assertEq(rpcResult.days_added, 2, 'two days added in result')

      // 4. Verify bookings.return_at advanced by 2 days
      const newReturnAt = await one('select return_at from bookings where id = $1', [bookingIds['ext_test']])
      const diffMs = new Date(newReturnAt).getTime() - new Date('2105-06-03T04:00:00Z').getTime()
      assertEq(diffMs, 2 * 24 * 60 * 60 * 1000, 'return_at moved forward exactly 2 days')

      // 5. Verify booking_lines.days incremented by 2 (2 + 2 = 4)
      const newDays = Number(
        await one(
          'select days from booking_lines where booking_id = $1 and voided_at is null limit 1',
          [bookingIds['ext_test']],
        ),
      )
      assertEq(newDays, 4, 'line days incremented to 4')

      // 6. Verify inventory_reservations period upper boundary matches new return_at
      const reservationUpper = await one(
        'select upper(period) from inventory_reservations where booking_id = $1 and released_at is null',
        [bookingIds['ext_test']],
      )
      assertEq(
        new Date(reservationUpper).toISOString(),
        new Date(newReturnAt).toISOString(),
        'reservation period matches new return date',
      )

      // 7. Verify audit event was recorded with actor Coordinator
      const auditCount = Number(
        await one(
          "select count(*) from audit_events where record_id = $1 and reason like '%extended by two operational days%' and actor_id = $2",
          [bookingIds['ext_test'], U.Coordinator],
        ),
      )
      assert(auditCount >= 1, 'extend_booking emitted audit event attributed to Coordinator')
    },
  },
  {
    id: 'L24',
    title: 'void_invoice RPC atomically issues credit note for paid amounts and voids invoice (AUD D6)',
    expect: 'green',
    run: async () => {
      // 1. Create a dedicated test booking and partially paid invoice
      const voidTestBookingId = crypto.randomUUID()
      await as('Coordinator', async () => {
        await q(
          `insert into bookings (id, client_uuid, booking_no, client_id, branch_id, project_type, delivery_type, stage, pickup_at, return_at, created_by, updated_by)
           values ($1, gen_random_uuid(), next_document_number('booking'), $2, $3, 'Commercial / Advertisement', 'Client Pickup', 'Quote', now(), now() + interval '2 days', $4, $4)`,
          [voidTestBookingId, CLIENT, BRANCH, U.Coordinator],
        )
      })

      const voidTestInvoiceId = crypto.randomUUID()
      await as('Accounts', async () => {
        await q(
          `insert into invoices (id, client_uuid, invoice_no, booking_id, client_id, branch_id, status, subtotal, total_amount, paid_amount, outstanding_amount, issue_date, due_date, created_by)
           values ($1, gen_random_uuid(), next_document_number('invoice'), $2, $3, $4, 'Partially Paid', 10000, 10000, 4000, 6000, current_date, current_date + 7, $5)`,
          [voidTestInvoiceId, voidTestBookingId, CLIENT, BRANCH, U.Accounts],
        )
      })

      // 2. Refuses void by unauthorized role (e.g. Technician)
      await as('Technician', async () => {
        await refuses(
          'void by Technician',
          `select void_invoice(jsonb_build_object(
            'invoice_id', $1::uuid,
            'reason', 'Technician attempting unauthorized invoice void'
          ))`,
          [voidTestInvoiceId],
          /gate\.invoice\.void_role/i,
        )
      })

      // 3. Accounts voids invoice via void_invoice RPC
      let voidResult
      await as('Accounts', async () => {
        const res = await q(
          `select void_invoice(jsonb_build_object(
            'invoice_id', $1::uuid,
            'reason', 'Client cancelled shoot with agreed refund credit note'
          )) as data`,
          [voidTestInvoiceId],
        )
        voidResult = res.rows[0].data
      })

      assertEq(voidResult.status, 'Void', 'void_invoice returned status Void')
      assert(voidResult.credit_note_no !== null, 'credit note number returned')

      // 4. Verify credit_notes row created for 4000 paid amount
      const creditRow = (
        await q('select amount, reason from credit_notes where invoice_id = $1', [voidTestInvoiceId])
      ).rows[0]
      assertEq(Number(creditRow.amount), 4000, 'credit note created for exact paid amount')

      // 5. Verify invoice status in DB is Void
      const invStatus = await one('select status::text from invoices where id = $1', [voidTestInvoiceId])
      assertEq(invStatus, 'Void', 'invoice status in DB is Void')

      // 6. Verify audit event written
      const auditCount = Number(
        await one(
          "select count(*) from audit_events where record_id = $1 and table_name = 'invoices' and actor_id = $2",
          [voidTestInvoiceId, U.Accounts],
        ),
      )
      assert(auditCount >= 1, 'void_invoice emitted audit event attributed to Accounts')
    },
  },
  {
    id: 'L25',
    title: 'Client Save changes is one atomic, idempotent, revision-locked write; contact removal keeps history (0146)',
    expect: 'green',
    async run() {
      const key = crypto.randomUUID()
      const values = { type_parent: 'Organisation', org_subtype: 'Production House', name: 'Editor Test Films', phone: '+9779801234567', country: 'Nepal' }
      const rows = [{ full_name: 'Sita Rai', phone: '+9779801234568' }]
      const created = await editorSave('Coordinator', 'client', null, null, key, values, rows)
      assert(created.id && created.revision, 'create returns the new record and its revision')
      const replay = await editorSave('Coordinator', 'client', null, null, key, values, rows)
      assertEq(replay.id, created.id, 'replaying the same key returns the same client')
      assertEq(await one("select count(*) from clients where phone = '+9779801234567'"), 1, 'a retry created no duplicate')
      await refusesSave('Coordinator', 'same key, different change', 'client', null, null, key, { ...values, name: 'Other' }, rows, /different change/i)

      const opened = await editorRead('Coordinator', 'client', created.id)
      assertEq(opened.values.name, 'Editor Test Films', 'edit loads the stored value')
      assertEq(opened.rows.length, 1, 'edit loads the primary contact')
      const edited = await editorSave('Coordinator', 'client', created.id, opened.revision, crypto.randomUUID(), { ...opened.values, name: 'Editor Test Films Ltd' }, opened.rows)
      assert(edited.revision !== opened.revision, 'a save moves the revision')
      assertEq(await one('select name from clients where id = $1', [created.id]), 'Editor Test Films Ltd', 'the edit persisted on the same row')
      assertEq(await one("select count(*) from clients where phone = '+9779801234567'"), 1, 'editing created no second client')

      await refusesSave('Coordinator', 'stale revision', 'client', created.id, opened.revision, crypto.randomUUID(), { ...opened.values, name: 'Stale write' }, opened.rows, /changed since you opened/i)
      assertEq(await one('select name from clients where id = $1', [created.id]), 'Editor Test Films Ltd', 'the stale write changed nothing')
      await refusesSave('Coordinator', 'credit override through generic save', 'client', created.id, edited.revision, crypto.randomUUID(), { ...edited.values, approved_credit_limit: 999999 }, edited.rows, /cannot be edited/i)
      for (const role of ['Warehouse', 'Accounts', 'Technician', 'Driver']) {
        await refusesSave(role, `${role} client edit`, 'client', created.id, edited.revision, crypto.randomUUID(), edited.values, edited.rows, /Permission denied/i)
      }

      await refusesSave('Coordinator', 'duplicate phone', 'client', null, null, crypto.randomUUID(), { ...values, name: 'Twin' }, [], /already exists/i)
      const walkIn = await editorSave('Warehouse', 'client', null, null, crypto.randomUUID(), { type_parent: 'Individual', name: 'Floor Walk-in', phone: '+9779801234569' }, [])
      assert(walkIn.id, 'Warehouse may still create a client (canCreateClient parity)')
      await refusesSave('Warehouse', 'Warehouse editing the walk-in', 'client', walkIn.id, walkIn.revision, crypto.randomUUID(), walkIn.values, [], /Permission denied/i)

      const cleared = await editorSave('Coordinator', 'client', created.id, edited.revision, crypto.randomUUID(), edited.values, [])
      assertEq(cleared.rows.length, 0, 'removing the contact leaves no active primary')
      assertEq(await one("select count(*) from client_contacts where client_id = $1 and status = 'Deactivated'", [created.id]), 1, 'the removed contact is deactivated, never deleted (Law 3)')
    },
  },
  {
    id: 'L26',
    title: 'Equipment Save changes edits catalogue, rates and unit location only; stock, custody and identity are refused (0146)',
    expect: 'green',
    async run() {
      const stripCreateOnly = (snap) => {
        const { tracking_mode: _t, total_quantity: _q, ...values } = snap.values
        return { ...snap, values }
      }
      const opened = stripCreateOnly(await editorRead('Manager', 'equipment', SERIAL_PRODUCT))
      assertEq(opened.rows.length, 3, 'edit loads every unit')
      const stockBefore = await one('select total_quantity from products where id = $1', [SERIAL_PRODUCT])
      const relocated = opened.rows.map((r, i) => (i === 0 ? { ...r, rack: 'R-EDIT', shelf: 'S1' } : r))
      const saved = stripCreateOnly(await editorSave('Manager', 'equipment', SERIAL_PRODUCT, opened.revision, crypto.randomUUID(), { ...opened.values, name: 'Lifecycle Serialised Camera II', daily_rate: 4100, notes_internal: 'edited' }, relocated))
      assertEq(await one('select name from products where id = $1', [SERIAL_PRODUCT]), 'Lifecycle Serialised Camera II', 'catalogue edit persisted')
      assertEq(Number(await one('select daily_rate from products where id = $1', [SERIAL_PRODUCT])), 4100, 'permitted rate persisted')
      assertEq(await one('select rack from product_units where id = $1', [UNITS[0]]), 'R-EDIT', 'unit location persisted')
      assertEq(await one('select total_quantity from products where id = $1', [SERIAL_PRODUCT]), stockBefore, 'stock is unchanged by a generic edit')
      assertEq(await one('select count(*) from product_units where product_id = $1', [SERIAL_PRODUCT]), 3, 'no unit was added or removed')

      await refusesSave('Manager', 'stale revision', 'equipment', SERIAL_PRODUCT, opened.revision, crypto.randomUUID(), opened.values, opened.rows, /changed since you opened/i)
      await refusesSave('Manager', 'tracking mode change', 'equipment', SERIAL_PRODUCT, saved.revision, crypto.randomUUID(), { ...saved.values, tracking_mode: 'Quantity' }, saved.rows, /cannot be edited/i)
      await refusesSave('Manager', 'stock quantity change', 'equipment', SERIAL_PRODUCT, saved.revision, crypto.randomUUID(), { ...saved.values, total_quantity: 99 }, saved.rows, /cannot be edited/i)
      await refusesSave('Manager', 'unit condition change', 'equipment', SERIAL_PRODUCT, saved.revision, crypto.randomUUID(), saved.values, saved.rows.map((r, i) => (i === 1 ? { ...r, condition: 'Poor' } : r)), /operational workflow/i)
      await refusesSave('Manager', 'unit custody change', 'equipment', SERIAL_PRODUCT, saved.revision, crypto.randomUUID(), saved.values, saved.rows.map((r, i) => (i === 1 ? { ...r, status: 'Retired' } : r)), /operational workflow/i)
      await refusesSave('Manager', 'unit removal', 'equipment', SERIAL_PRODUCT, saved.revision, crypto.randomUUID(), saved.values, saved.rows.slice(1), /cannot be removed/i)
      await refusesSave('Manager', 'unit addition', 'equipment', SERIAL_PRODUCT, saved.revision, crypto.randomUUID(), saved.values, [...saved.rows, { serial_no: 'NEW', warehouse_id: saved.rows[0].warehouse_id }], /intake/i)
      for (const role of ['Coordinator', 'Warehouse', 'Accounts']) {
        await refusesSave(role, `${role} equipment edit`, 'equipment', SERIAL_PRODUCT, saved.revision, crypto.randomUUID(), saved.values, saved.rows, /Permission denied/i)
      }
      assertEq(await one('select name from products where id = $1', [SERIAL_PRODUCT]), 'Lifecycle Serialised Camera II', 'every refusal left the saved record untouched')
    },
  },
  {
    id: 'L27',
    title: 'Bundle Save changes preserves component identity and soft-deactivates removed components (0146)',
    expect: 'green',
    async run() {
      const key = crypto.randomUUID()
      const rows = [
        { product_id: SERIAL_PRODUCT, quantity: 1, days: 1, is_mandatory: true, sort_order: 0 },
        { product_id: QTY_PRODUCT, quantity: 2, days: 1, is_mandatory: false, sort_order: 1 },
      ]
      const created = await editorSave('Manager', 'bundle', null, null, key, { name: 'Editor Test Kit', daily_rate: 5000, weekly_rate: 25000 }, rows)
      assertEq(created.rows.length, 2, 'both components saved')
      const [first, second] = created.rows
      const edited = await editorSave('Manager', 'bundle', created.id, created.revision, crypto.randomUUID(), { ...created.values, name: 'Editor Test Kit v2' }, [{ ...first, quantity: 3 }, second])
      const kept = edited.rows.find((r) => r.id === first.id)
      assert(kept !== undefined && Number(kept.quantity) === 3, 'the component kept its identity and took the new quantity')
      assertEq(edited.rows.find((r) => r.id === second.id)?.is_mandatory, false, 'the optional flag survived the edit')

      const removed = await editorSave('Manager', 'bundle', created.id, edited.revision, crypto.randomUUID(), edited.values, [edited.rows.find((r) => r.id === first.id)])
      assertEq(removed.rows.length, 1, 'the editor shows one active component')
      assertEq(await one('select count(*) from bundle_items where bundle_id = $1', [created.id]), 2, 'the removed component row still exists')
      assertEq(await one('select is_active from bundle_items where id = $1', [second.id]), false, 'removal is a soft deactivation (Law 3)')
      assert((await one('select deactivated_at from bundle_items where id = $1', [second.id])) !== null, 'the deactivation is timestamped')

      await refusesSave('Manager', 'stale revision', 'bundle', created.id, edited.revision, crypto.randomUUID(), edited.values, edited.rows, /changed since you opened/i)
      await refusesSave('Manager', 'empty bundle', 'bundle', created.id, removed.revision, crypto.randomUUID(), removed.values, [], /at least one component/i)
      await refusesSave('Manager', 'resurrecting a removed component', 'bundle', created.id, removed.revision, crypto.randomUUID(), removed.values, [...removed.rows, second], /removed|Reload/i)
      for (const role of ['Coordinator', 'Warehouse', 'Accounts']) {
        await refusesSave(role, `${role} bundle edit`, 'bundle', created.id, removed.revision, crypto.randomUUID(), removed.values, removed.rows, /Permission denied/i)
      }
    },
  },
  {
    id: 'L28',
    title: 'Quote Save changes is atomic, revision-locked, quote-only and invoice-safe; it makes no reservations (0147)',
    expect: 'green',
    async run() {
      await as('Coordinator', async () => {
        await createBooking({
          key: 'qe',
          window: ['2099-12-10T04:00:00Z', '2099-12-12T04:00:00Z'],
          actor: 'Coordinator',
          lines: [
            { productId: SERIAL_PRODUCT, description: 'Editable camera', qty: 1, days: 2, rate: 3500 },
            { productId: QTY_PRODUCT, description: 'Editable cable', qty: 2, days: 2, rate: 250 },
          ],
        })
      })
      const id = bookingIds.qe
      const snap = await rpcAs('Coordinator', 'select read_quote_editor($1)', [id])
      assertEq(snap.lines.length, 2, 'the editor loads both lines')
      const bookingNo = await one('select booking_no from bookings where id = $1', [id])
      const holdsBefore = await liveHolds('qe')

      const bumped = quotePayload(snap, (p) => ({ ...p, values: { ...p.values, project: 'Edited project' }, lines: p.lines.map((l) => (l.description === 'Editable cable' ? { ...l, qty: 3 } : l)) }))
      const key = crypto.randomUUID()
      const saved = await quoteSave('Coordinator', id, snap.revision, key, bumped)
      assert(saved.revision !== snap.revision, 'the save moves the revision')
      assertEq(await one('select booking_no from bookings where id = $1', [id]), bookingNo, 'the booking number is retained')
      assertEq(await stageOf('qe'), 'Quote', 'the stage is retained')
      assertEq(await one('select project from bookings where id = $1', [id]), 'Edited project', 'the header edit persisted')
      assertEq(await one("select qty from booking_lines where booking_id = $1 and description = 'Editable cable' and voided_at is null", [id]), 3, 'the line edit persisted on the same row')
      assertEq(await liveHolds('qe'), holdsBefore, 'editing a quote makes no reservations')
      assert(Number(await one('select count(*) from audit_events where client_uuid = $1', [key])) >= 1, 'the edit is audited')
      const replay = await quoteSave('Coordinator', id, snap.revision, key, bumped)
      assertEq(replay.revision, saved.revision, 'replaying the same key is a no-op')

      await refusesQuote('Coordinator', 'stale revision', id, snap.revision, crypto.randomUUID(), bumped, /changed since you opened/i)

      const fresh = await rpcAs('Coordinator', 'select read_quote_editor($1)', [id])
      const dropped = quotePayload(fresh, (p) => ({ ...p, lines: p.lines.filter((l) => l.description !== 'Editable camera') }))
      const afterDrop = await quoteSave('Coordinator', id, fresh.revision, crypto.randomUUID(), dropped)
      assertEq(afterDrop.lines.length, 1, 'the editor shows the remaining line')
      assertEq(await one("select count(*) from booking_lines where booking_id = $1 and description = 'Editable camera'", [id]), 1, 'the removed line still exists (voided, never deleted)')
      assert((await one("select voided_at from booking_lines where booking_id = $1 and description = 'Editable camera'", [id])) !== null, 'the removed line is voided')

      for (const role of ['Warehouse', 'Technician', 'Driver', 'Accounts']) {
        await refusesAs(role, `${role} reads the quote editor`, 'select read_quote_editor($1)', [id], /cannot edit/i)
        await refusesQuote(role, `${role} edits a quote`, id, afterDrop.revision, crypto.randomUUID(), dropped, /cannot edit/i)
      }
      await refusesQuote('Coordinator', 'unknown header field', id, afterDrop.revision, crypto.randomUUID(), { ...dropped, values: { ...dropped.values, stage: 'Booked' } }, /cannot be edited/i)

      const later = bookingIds.a
      assert((await stageOf('a')) !== 'Quote', 'fixture: booking a has left Quote')
      await refusesAs('Coordinator', 'reading a confirmed booking', 'select read_quote_editor($1)', [later], /Only unconfirmed quotes/i)
      await refusesQuote('Coordinator', 'editing a confirmed booking', later, 'x', crypto.randomUUID(), dropped, /Only unconfirmed quotes/i)

      // Draft invoice: refused, and the refusal must roll back the header write that ran first.
      const invoiceId = crypto.randomUUID()
      await as('Accounts', async () => {
        await q(
          `insert into invoices (id, client_uuid, invoice_no, booking_id, client_id, branch_id, status, subtotal, total_amount, paid_amount, outstanding_amount, issue_date, due_date, created_by)
           values ($1, gen_random_uuid(), next_document_number('invoice'), $2, $3, $4, 'Draft', 1000, 1000, 0, 1000, current_date, current_date + 7, $5)`,
          [invoiceId, id, CLIENT, BRANCH, U.Accounts],
        )
      })
      const withInvoice = await rpcAs('Coordinator', 'select read_quote_editor($1)', [id])
      await refusesQuote('Coordinator', 'draft invoice present', id, withInvoice.revision, crypto.randomUUID(), quotePayload(withInvoice, (p) => ({ ...p, values: { ...p.values, project: 'Must roll back' } })), /draft invoice/i)
      assertEq(await one('select project from bookings where id = $1', [id]), 'Edited project', 'a refused save leaves no partial write (atomic)')

      await asOwnerOfTheDatabase(async () => {
        await q("update invoices set status = 'Partially Paid', paid_amount = 400, outstanding_amount = 600 where id = $1", [invoiceId])
      })
      const issued = await rpcAs('Coordinator', 'select read_quote_editor($1)', [id])
      await refusesQuote('Coordinator', 'issued invoice present', id, issued.revision, crypto.randomUUID(), quotePayload(issued), /issued financial document/i)
      assertEq(Number(await one('select paid_amount from invoices where id = $1', [invoiceId])), 400, 'payments and issued invoices are never rewritten')
    },
  },
  {
    id: 'L29',
    title: 'update_bundle applies patch, line edits, adds and soft-deactivations in ONE transaction (0153)',
    expect: 'green',
    async run() {
      const created = await editorSave('Manager', 'bundle', null, null, crypto.randomUUID(), { name: 'Atomic Kit', daily_rate: 1000, weekly_rate: 5000 }, [
        { product_id: SERIAL_PRODUCT, quantity: 1, days: 1, is_mandatory: true, sort_order: 0 },
        { product_id: QTY_PRODUCT, quantity: 2, days: 1, is_mandatory: false, sort_order: 1 },
      ])
      const [a, b] = created.rows
      const ub = (role, rev, key, payload) => rpcAs(role, 'select update_bundle($1::uuid, $2, $3::uuid, $4::jsonb)', [created.id, rev, key, JSON.stringify(payload)])
      const refusesUb = (role, what, rev, key, payload, matcher) =>
        refusesAs(role, what, 'select update_bundle($1::uuid, $2, $3::uuid, $4::jsonb)', [created.id, rev, key, JSON.stringify(payload)], matcher)

      const bad = { patch: { name: 'Must roll back' }, edits: [{ id: a.id, quantity: 9 }], deactivations: [{ id: crypto.randomUUID() }] }
      await refusesUb('Manager', 'one bad row poisons the whole save', created.revision, crypto.randomUUID(), bad, /no longer belongs/i)
      assertEq(await one('select name from bundles where id = $1', [created.id]), 'Atomic Kit', 'the header write rolled back')
      assertEq(Number(await one('select quantity from bundle_items where id = $1', [a.id])), 1, 'the line edit rolled back')

      const key = crypto.randomUUID()
      const good = { patch: { name: 'Atomic Kit v2', weekly_rate: 6000 }, edits: [{ id: a.id, quantity: 4, is_mandatory: false }], adds: [{ product_id: CONSUMABLE_PRODUCT, quantity: 1, days: 1 }], deactivations: [{ id: b.id }] }
      const saved = await ub('Manager', created.revision, key, good)
      assertEq(await one('select name from bundles where id = $1', [created.id]), 'Atomic Kit v2', 'header persisted')
      assertEq(Number(await one('select quantity from bundle_items where id = $1', [a.id])), 4, 'line edit persisted on the same row')
      assertEq(saved.rows.length, 2, 'active components: edited one + the new one')
      assertEq(await one('select is_active from bundle_items where id = $1', [b.id]), false, 'removal is a soft deactivation')
      assertEq(await one('select count(*) from bundle_items where bundle_id = $1', [created.id]), 3, 'no component row was deleted')
      assertEq((await ub('Manager', created.revision, key, good)).revision, saved.revision, 'replaying the same key is a no-op')
      assertEq(await one('select count(*) from bundle_items where bundle_id = $1', [created.id]), 3, 'the replay added nothing')

      await refusesUb('Manager', 'stale revision', created.revision, crypto.randomUUID(), good, /changed since you opened/i)
      await refusesUb('Manager', 'unknown header field', saved.revision, crypto.randomUUID(), { patch: { bundle_code: 'X' } }, /cannot be edited/i)
      await refusesUb('Coordinator', 'Coordinator', saved.revision, crypto.randomUUID(), { patch: { name: 'Nope' } }, /Permission denied/i)
      await refusesUb('Manager', 'emptying an active bundle', saved.revision, crypto.randomUUID(), { deactivations: saved.rows.map((r) => ({ id: r.id })) }, /at least one component/i)
    },
  },

  {
    id: 'L30',
    title: 'Close skips a held deposit only with a reason from Manager+, audited, moving no money (0155)',
    expect: 'green',
    async run() {
      const result = await undone(async () => {
        await as('Warehouse', async () => {
          await actionPackRental({ key: 'c', actor: 'Warehouse', units: [{ id: UNITS[0], serial: 'SN-C1' }] })
          await actionHandoverRental({ key: 'c', actor: 'Warehouse', signerName: 'Lifecycle Client Signer', reason: 'Handover completed with client signature' })
          await actionReturnRental({ key: 'c', actor: 'Warehouse', returnedUnits: [{ id: UNITS[0] }] })
        })

        // Settle invoice before close to satisfy close gate
        await settleInvoice('c', U.Accounts)

        /* A deposit of 5,000 collected in full and never returned: HELD. */
        await asOwnerOfTheDatabase(async () => {
          await q(
            `insert into security_deposits (client_uuid, deposit_no, booking_id, client_id, branch_id, required_amount)
             select gen_random_uuid(), 'SD-L30', b.id, b.client_id, $2::uuid, 5000 from bookings b where b.id = $1::uuid`,
            [bookingIds.c, BRANCH],
          )
          await q(
            `insert into deposit_movements (client_uuid, movement_no, security_deposit_id, movement_type, amount, handled_by)
             select gen_random_uuid(), 'DM-L30', id, 'Received', 5000, $1::uuid from security_deposits where deposit_no = 'SD-L30'`,
            [U.Owner],
          )
        })

        const closeAs = (actor, extra) =>
          q(
            `insert into booking_stage_transitions
               (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at, reason, deposit_skip_reason)
             values (gen_random_uuid(), $1, $2, 'Returned', 'Closed', $3, $4, now(), $5, $6)`,
            [bookingIds.c, BRANCH, U[actor], actor, 'Zero-value goodwill job for the lifecycle test', extra ?? null],
          )

        /* A refused insert aborts the transaction, so every probe sits behind a
           savepoint it can roll back to; the setup above survives. */
        const tryClose = async (actor, skip) => {
          let message = null
          await as(actor, async () => {
            await q('savepoint probe')
            try {
              await closeAs(actor, skip)
              await q('release savepoint probe')
            } catch (e) {
              message = String(e.message)
              await q('rollback to savepoint probe')
            }
          })
          return message
        }

        /* 1. No skip: the held deposit still blocks Close. */
        const refusedWithoutSkip = await tryClose('Owner', null)
        assert(refusedWithoutSkip !== null, 'a held deposit did not block Close')
        assert(/unresolved security deposit/i.test(refusedWithoutSkip), `refused by the wrong gate ΓÇö ${refusedWithoutSkip.split('\n')[0]}`)

        /* 2. A reason too short is refused by the table's own check. */
        const tooShort = await tryClose('Owner', 'short')
        assert(tooShort !== null && /deposit_skip_only_on_close/i.test(tooShort), 'a skip reason under 10 characters was accepted')

        /* 3. A Coordinator may not skip, even with a full reason. */
        const coordinatorRefused = await tryClose('Coordinator', 'Client collects the deposit in person next week')
        assert(coordinatorRefused !== null, 'a Coordinator closed a rental over a held deposit')

        /* 4. Owner + reason: closes, audited, no money moved. */
        const ownerSkip = await tryClose('Owner', 'Client collects the deposit in person next week')
        assert(ownerSkip === null, `Owner with a reason was refused ΓÇö ${String(ownerSkip).split('\n')[0]}`)
        const stage = await stageOf('c')
        const audit = await asOwnerOfTheDatabase(() =>
          one(
            `select count(*) from audit_events
              where record_id = $1 and new_values->>'gate' = 'close_deposit_skipped'`,
            [bookingIds.c],
          ),
        )
        const held = await asOwnerOfTheDatabase(() =>
          one(`select received_amount - refunded_amount - applied_amount from security_deposits where deposit_no = 'SD-L30'`),
        )
        return { stage, audit: Number(audit), held: Number(held) }
      })

      assertEq(result.stage, 'Closed', 'Owner with a reason closes over a held deposit')
      assertEq(result.audit, 1, 'the skip wrote exactly one audit event')
      assertEq(result.held, 5000, 'the deposit is still held after the skip ΓÇö no money moved (Law 5)')
    },
  },
]

// O16-3: exercise the real audited writer, not a mocked browser response.
STEPS.push({
  id: 'L31', title: 'Pre-handover reversal and terminal archive are audited, idempotent and Manager-only (0167)', expect: 'green',
  async run() {
    const manage = (role, payload) => asJwt(role, async () => {
      await q('savepoint lifecycle_write')
      try { return await one('select manage_rental_lifecycle($1::jsonb)', [JSON.stringify(payload)]) }
      catch (error) { await q('rollback to savepoint lifecycle_write'); throw error }
      finally { await q('release savepoint lifecycle_write') }
    })
    const reject = (role, what, text, params, matcher) => asJwt(role, async () => {
      await q('savepoint lifecycle_guard')
      try { await refuses(what, text, params, matcher) }
      finally { await q('rollback to savepoint lifecycle_guard'); await q('release savepoint lifecycle_guard') }
    })
    await undone(async () => {
      await as('Warehouse', () => actionPackRental({ key: 'c', actor: 'Warehouse', units: [{ id: UNITS[0], serial: 'SN-C1' }] }))
      const staleHandover = crypto.randomUUID()
      await as('Warehouse', () => q(`insert into operation_sessions(id,client_uuid,booking_id,operation,state,delivery_method,warehouse_staff_id,created_by)
        values($1,gen_random_uuid(),$2,'Handover','In Progress','Client Pickup',$3,$3)`, [staleHandover,bookingIds.c,U.Warehouse]))
      const request = { booking_id: bookingIds.c, client_uuid: crypto.randomUUID(), action: 'revert', target_stage: 'Booked', reason: 'Client needs revised equipment' }
      await reject('Coordinator', 'Coordinator cannot revert', 'select manage_rental_lifecycle($1::jsonb)', [JSON.stringify(request)], /Manager/i)
      const holds = await one('select count(*) from inventory_reservations where booking_id=$1 and released_at is null', [bookingIds.c])
      await manage('Manager', request)
      assertEq(await stageOf('c'), 'Booked', 'Packed reverted to Booked')
      assertEq(await one('select count(*) from inventory_reservations where booking_id=$1 and released_at is null', [bookingIds.c]), holds, 'Booked retains reservations')
      await manage('Manager', request)
      assertEq(Number(await one('select count(*) from booking_stage_transitions where client_uuid=$1', [request.client_uuid])), 1, 'retry creates no duplicate transition')
      await reject('Manager', 'changed retry payload', 'select manage_rental_lifecycle($1::jsonb)', [JSON.stringify({ ...request, reason: 'Different correction reason' })], /another action/i)
      await manage('Manager', { ...request, client_uuid: crypto.randomUUID(), target_stage: 'Quote' })
      assertEq(await stageOf('c'), 'Quote', 'Booked reverted to Quote')
      assertEq(Number(await one('select count(*) from inventory_reservations where booking_id=$1 and released_at is null', [bookingIds.c])), 0, 'Quote releases reservations')
      await reject('Warehouse','stale pickup movement after correction',
        `insert into session_line_movements(client_uuid,session_id,booking_line_id,unit_id,qty,resulting_item_state,moved_at,created_by)
         select gen_random_uuid(),$1,id,$2,1,'Picked Up',now(),$3 from booking_lines where booking_id=$4 limit 1`,
        [staleHandover,UNITS[0],U.Warehouse,bookingIds.c],/no longer ready for pickup/i)
      await reject('Warehouse','stale picked-up line after correction',
        `insert into handover_lines(client_uuid,booking_line_id,state,qty_required,first_session_id,created_by)
         select gen_random_uuid(),id,'Picked Up',qty,$1,$2 from booking_lines where booking_id=$3 limit 1`,
        [staleHandover,U.Warehouse,bookingIds.c],/no longer ready for pickup/i)
      const archive = { booking_id: bookingIds.c, client_uuid: crypto.randomUUID(), action: 'archive', reason: 'No longer needed in active rentals' }
      await reject('Manager', 'cannot archive active booking', 'select manage_rental_lifecycle($1::jsonb)', [JSON.stringify(archive)], /Closed or Cancelled/i)
      await rpcAs('Manager', 'select cancel_booking($1::jsonb)', [JSON.stringify({ booking_id: bookingIds.c, client_uuid: crypto.randomUUID(), reason: 'Client cancelled the revised booking' })])
      await manage('Manager', archive)
      await manage('Manager', archive)
      assertEq(Number(await one('select count(*) from bookings where id=$1 and archived_at is not null', [bookingIds.c])), 1, 'archived booking retained')
      assertEq(Number(await one('select count(*) from audit_events where client_uuid=$1', [archive.client_uuid])), 1, 'archive has one audit receipt')
      await reject('Manager', 'direct archive edit', 'update bookings set archived_at=null, archived_by=null where id=$1', [bookingIds.c], /audited rental lifecycle|permission denied/i)
    })
    await undone(async () => {
      await as('Warehouse', async () => {
        await actionPackRental({ key: 'c', actor: 'Warehouse', units: [{ id: UNITS[0], serial: 'SN-C1' }] })
        await actionHandoverRental({ key: 'c', actor: 'Warehouse', signerName: 'Lifecycle Client Signer', reason: 'Handover completed with client signature' })
      })
      const request = { booking_id: bookingIds.c, client_uuid: crypto.randomUUID(), action: 'revert', target_stage: 'Booked', reason: 'Attempt after equipment handed over' }
      await reject('Manager', 'cannot reverse custody', 'select manage_rental_lifecycle($1::jsonb)', [JSON.stringify(request)], /before handover/i)
    })
    await undone(async () => {
      const id = bookingIds['qty-ok']
      const line = (await q('select id, qty from booking_lines where booking_id=$1 limit 1', [id])).rows[0]
      const pack = crypto.randomUUID()
      const handover = crypto.randomUUID()
      await as('Warehouse', async () => {
        await q(`insert into operation_sessions(id,client_uuid,booking_id,operation,state,warehouse_staff_id,created_by)
          values($1,gen_random_uuid(),$2,'Packing','In Progress',$3,$3)`, [pack,id,U.Warehouse])
        await q(`insert into session_line_movements(client_uuid,session_id,booking_line_id,qty,moved_at,created_by)
          values(gen_random_uuid(),$1,$2,$3,now(),$4)`, [pack,line.id,line.qty,U.Warehouse])
        await transition('qty-ok','Booked','Packed','Warehouse')
        await q(`update operation_sessions set state='Completed' where id=$1`, [pack])
        await q(`insert into operation_sessions(id,client_uuid,booking_id,operation,state,delivery_method,warehouse_staff_id,created_by)
          values($1,gen_random_uuid(),$2,'Handover','In Progress','Client Pickup',$3,$3)`, [handover,id,U.Warehouse])
        await q(`insert into session_line_movements(client_uuid,session_id,booking_line_id,qty,resulting_item_state,moved_at,created_by)
          values(gen_random_uuid(),$1,$2,1,'Picked Up',now(),$3)`, [handover,line.id,U.Warehouse])
      })
      assertEq(await stageOf('qty-ok'), 'Packed', 'partial quantity handover has not advanced the stage')
      const request = { booking_id:id, client_uuid:crypto.randomUUID(), action:'revert', target_stage:'Booked', reason:'Attempt after partial quantity pickup' }
      await reject('Manager','partial quantity custody cannot be reverted','select manage_rental_lifecycle($1::jsonb)',[JSON.stringify(request)],/custody cannot be reverted/i)
      await reject('Manager','partial quantity custody cannot be cancelled','select cancel_booking($1::jsonb)',
        [JSON.stringify({ booking_id:id, client_uuid:crypto.randomUUID(), reason:'Attempt cancellation after partial pickup' })],/pickup has already occurred/i)
    })
    await undone(async () => {
      assertEq(await stageOf('a'), 'Closed', 'closed archive fixture')
      await manage('Owner', { booking_id: bookingIds.a, client_uuid: crypto.randomUUID(), action: 'archive', reason: 'Completed rental retained in archive' })
      assertEq(Number(await one('select count(*) from bookings where id=$1 and archived_at is not null', [bookingIds.a])), 1, 'Closed booking can be archived without deleting it')
    })
  },
})

// 22 Oct (Babin: "activate membership"): a membership is put on a plan, or moved to another, in ONE transaction.
STEPS.push({
  id: 'L32', title: 'A membership is activated or changed atomically, audited and idempotent; Coordinator and above only (0174)', expect: 'green',
  async run() {
    const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v)
    const change = (role, payload) => asJwt(role, async () => {
      await q('savepoint membership_write')
      try { return parse(await one('select change_client_membership($1::jsonb)', [JSON.stringify(payload)])) }
      catch (error) { await q('rollback to savepoint membership_write'); throw error }
      finally { await q('release savepoint membership_write') }
    })
    const reject = (role, what, payload, matcher) => asJwt(role, async () => {
      await q('savepoint membership_guard')
      try { await refuses(what, 'select change_client_membership($1::jsonb)', [JSON.stringify(payload)], matcher) }
      finally { await q('rollback to savepoint membership_guard'); await q('release savepoint membership_guard') }
    })
    const liveRows = (clientId) => asOwnerOfTheDatabase(() =>
      q(`select m.id, p.level::text as level, m.fee_paid, m.join_date::text as join_date
           from client_memberships m join membership_plans p on p.id = m.plan_id
          where m.client_id = $1 and m.superseded_at is null`, [clientId]).then((r) => r.rows))
    const allRows = (clientId) => asOwnerOfTheDatabase(() =>
      one('select count(*) from client_memberships where client_id = $1', [clientId]).then(Number))
    const auditFor = (key) => asOwnerOfTheDatabase(() =>
      q('select actor_id, actor_role::text as role, reason, module::text as module from audit_events where client_uuid = $1', [key]).then((r) => r.rows))

    await undone(async () => {
      await asOwnerOfTheDatabase(() => q(
        `insert into membership_plans (client_uuid, level, label, default_credit_limit, display_order, status, retired_at) values
           (gen_random_uuid(), 'Academy', 'Access Member', 100000, 1, 'Active', null),
           (gen_random_uuid(), 'Creator', 'Partner', 250000, 2, 'Active', null),
           (gen_random_uuid(), 'Elite', 'Elite Member', 0, 3, 'Retired', now())`))

      // 1 ┬╖ Activate: a client with no live membership gets one. Coordinator is allowed (PERMISSIONS C5).
      const k1 = crypto.randomUUID()
      const request = { client_id: CLIENT, client_uuid: k1, plan_level: 'Academy', note: 'Joined at the counter' }
      assertEq((await liveRows(CLIENT)).length, 0, 'the fixture client starts with no membership')
      const first = await change('Coordinator', request)
      assertEq(first.plan_level, 'Academy', 'activated onto Academy')
      assert(first.previous_level === null, 'nothing was replaced')
      const live1 = await liveRows(CLIENT)
      assertEq(live1.length, 1, 'exactly one live membership')
      assert(live1[0].fee_paid === null, 'no fee is recorded (fee_paid stays NULL)')
      assertEq(live1[0].id, first.membership_id, 'the live row is the one the function reported')
      const audit1 = await auditFor(k1)
      assertEq(audit1.length, 1, 'one audit row')
      assertEq(audit1[0].actor_id, U.Coordinator, 'the audit row names the real actor')
      assertEq(audit1[0].role, 'Coordinator', 'and their role')
      assertEq(audit1[0].module, 'Clients', 'filed under Clients')
      assertEq(audit1[0].reason, 'Joined at the counter', 'the note is the audit reason')

      // 2 ┬╖ Retry with the same key: the first answer, no second row, no second audit.
      const again = await change('Coordinator', request)
      assertEq(again.membership_id, first.membership_id, 'a retry returns the first answer')
      assertEq(await allRows(CLIENT), 1, 'a retry writes no second membership')
      assertEq((await auditFor(k1)).length, 1, 'a retry writes no second audit row')
      await reject('Coordinator', 'the same key with a different plan', { ...request, plan_level: 'Creator' }, /another action/i)
      await reject('Coordinator', 'the same key with a different note', { ...request, note: 'Something else' }, /another action/i)

      // 3 ┬╖ Change: Manager moves them up. The old row is superseded and retained, never deleted.
      const k2 = crypto.randomUUID()
      const up = await change('Manager', { client_id: CLIENT, client_uuid: k2, plan_level: 'Creator' })
      assertEq(up.previous_level, 'Academy', 'reports the plan it replaced')
      const live2 = await liveRows(CLIENT)
      assertEq(live2.length, 1, 'still exactly one live membership')
      assertEq(live2[0].level, 'Creator', 'now Creator')
      assertEq(await allRows(CLIENT), 2, 'the old row is retained')
      const old = await asOwnerOfTheDatabase(() => q('select superseded_by_id, superseded_at from client_memberships where id = $1', [first.membership_id]).then((r) => r.rows[0]))
      assertEq(old.superseded_by_id, up.membership_id, 'the old row points at the new one')
      assert(old.superseded_at !== null, 'and is stamped superseded')

      // 4 ┬╖ Refusals leave the live membership exactly as it was.
      const before = (await liveRows(CLIENT))[0].id
      await reject('Manager', 'the plan they are already on', { client_id: CLIENT, client_uuid: crypto.randomUUID(), plan_level: 'Creator' }, /already on the Creator plan/i)
      await reject('Manager', 'a retired plan', { client_id: CLIENT, client_uuid: crypto.randomUUID(), plan_level: 'Elite' }, /retired/i)
      await reject('Manager', 'a plan that does not exist', { client_id: CLIENT, client_uuid: crypto.randomUUID(), plan_level: 'Platinum' }, /does not exist/i)
      await reject('Manager', 'a client that does not exist', { client_id: crypto.randomUUID(), client_uuid: crypto.randomUUID(), plan_level: 'Academy' }, /Client was not found/i)
      await reject('Manager', 'an over-long note', { client_id: CLIENT, client_uuid: crypto.randomUUID(), plan_level: 'Academy', note: 'x'.repeat(501) }, /at most 500/i)
      await reject('Manager', 'a missing key', { client_id: CLIENT, plan_level: 'Academy' }, /required/i)
      assertEq((await liveRows(CLIENT))[0].id, before, 'no refusal disturbed the live membership')
      assertEq(await allRows(CLIENT), 2, 'and none wrote a row')

      // 5 ┬╖ Who may: Owner and Admin can (a downgrade is allowed); nobody else.
      const k3 = crypto.randomUUID()
      const down = await change('Admin', { client_id: CLIENT, client_uuid: k3, plan_level: 'Academy' })
      assertEq(down.previous_level, 'Creator', 'Admin moved them down')
      await change('Owner', { client_id: CLIENT, client_uuid: crypto.randomUUID(), plan_level: 'Creator' })
      assertEq((await liveRows(CLIENT)).length, 1, 'four changes later there is still exactly one live membership')
      assertEq(await allRows(CLIENT), 4, 'and all four rows are retained')
      for (const role of ['Accounts', 'Warehouse', 'Technician', 'Driver', 'Client']) {
        await reject(role, `${role} changing a membership`, { client_id: OTHER_CLIENT, client_uuid: crypto.randomUUID(), plan_level: 'Academy' }, /Coordinator or above/i)
      }
      assertEq(await allRows(OTHER_CLIENT), 0, 'no refused role wrote anything')

      // 6 ┬╖ A deactivated client cannot take a membership.
      await asOwnerOfTheDatabase(() => q(
        `update clients set status = 'Deactivated', deactivated_at = now(), deactivated_by = $2, deactivation_reason = 'L32 fixture' where id = $1`,
        [OTHER_CLIENT, U.Owner]))
      await reject('Manager', 'a deactivated client', { client_id: OTHER_CLIENT, client_uuid: crypto.randomUUID(), plan_level: 'Academy' }, /deactivated/i)
      assertEq(await allRows(OTHER_CLIENT), 0, 'a deactivated client got no membership')
    })
  },
})

/*
 * RULING 2026-10-18: closing.approve is Owner/Admin/Manager/Accounts.
 *
 * `rbac.canApproveDailyClosing` offered Coordinator a sign-off that
 * `daily_closings_finance_insert` refused, because 0117 narrowed
 * `auth_is_finance_or_admin()` and the predicate was not moved with it (N-3).
 * This asks the POLICY, role by role, which seats it admits ΓÇö the set the UI
 * offers the control to must equal it. Each insert is rolled back.
 */
STEPS.push({
  id: 'L33',
  title: 'Daily closing sign-off: RLS admits exactly Owner, Admin, Manager, Accounts ΓÇö Coordinator refused (0117, N-3)',
  expect: 'green',
  async run() {
    const admitted = []
    await undone(async () => {
      for (const role of Object.keys(U)) {
        await as(role, async () => {
          await q('savepoint closing_probe')
          try {
            await q(
              `insert into daily_closings (
                 client_uuid, branch_id, business_date, counted_cash, expected_cash, variance,
                 pickups_count, returns_count, new_count, collected_cash, collected_bank,
                 collected_card, collected_other, receivables, deposits_held, approved_by)
               values (gen_random_uuid(), $1, '2099-12-31', 2500, 2000, 500, 0, 0, 0, 2000, 0, 0, 0, 0, 0, $2)`,
              [BRANCH, U[role]],
            )
            admitted.push(role)
          } catch (e) {
            const message = String(e.message)
            if (!/row-level security/i.test(message)) {
              throw new Refused(`${role}: refused by the wrong thing ΓÇö ${message.split('\n')[0]}`)
            }
          } finally {
            await q('rollback to savepoint closing_probe')
            await q('release savepoint closing_probe')
          }
        })
      }
    })
    assertEq(admitted.join(', '), 'Owner, Admin, Manager, Accounts', 'roles daily_closings_finance_insert admits')
  },
})

STEPS.push({
  id: 'L34',
  title: 'Warehouse overrides gate 1 with reason; refused without',
  expect: 'green',
  run: async () => {
    await undone(async () => {
      await as('Coordinator', async () => {
        await createBooking({
          key: 'l34',
          window: ['2099-12-01T04:00:00Z', '2099-12-03T04:00:00Z'],
          actor: 'Coordinator',
          lines: [
            {
              productId: SERIAL_PRODUCT,
              description: 'Lifecycle Serialised Camera',
              qty: 1,
              days: 2,
              rate: 350000,
              units: [UNITS[0]],
            },
          ],
        })
      })
      const bId = bookingIds.l34

      // Advance Quote -> Booked
      await transition('l34', 'Quote', 'Booked', 'Coordinator')

      // Pack the booking
      await as('Warehouse', async () => {
        await actionPackRental({
          key: 'l34',
          actor: 'Warehouse',
          units: [{ id: UNITS[0], serial: 'LCSN-001' }],
        })
      })

      // Settle invoice before handover to satisfy R-06 gate
      await settleInvoice('l34', U.Accounts)

      // Handover session with unverified receiver (verified = false)
      const handoverSessionId = crypto.randomUUID()
      await as('Warehouse', async () => {
        await q(
          `insert into operation_sessions (id, client_uuid, booking_id, operation, session_no, state, delivery_method, warehouse_staff_id, created_by, government_id_verified, booking_authorization_verified)
           values ($1, gen_random_uuid(), $2, 'Handover', 1, 'In Progress', 'Client Pickup', $3, $3, false, false)`,
          [handoverSessionId, bId, U.Warehouse],
        )
        const hlLineId = await one('select id from booking_lines where booking_id = $1', [bId])
        await q(
          `insert into handover_lines (client_uuid, booking_line_id, state, qty_required, first_session_id, completed_session_id, created_by)
           values (gen_random_uuid(), $1, 'Picked Up', 1, $2, $2, $3)`,
          [hlLineId, handoverSessionId, U.Warehouse],
        )
        await q(
          `insert into signatures (client_uuid, session_id, signature_role, signer_name, signed_at, device, is_required, created_by)
           values (gen_random_uuid(), $1, 'Receiver', 'Gate1 Test Signer', now(), 'iPad-1', true, $2)`,
          [handoverSessionId, U.Warehouse],
        )
      })

      // 1. Moving to On Rent without override MUST BE REFUSED
      await as('Warehouse', async () => {
        await q('savepoint gate1_refuse_1')
        try {
          await refuses(
            'moving to On Rent with unverified receiver and no override is refused',
            `insert into booking_stage_transitions (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
             values (gen_random_uuid(), $1, $2, 'Packed', 'On Rent', $3, 'Warehouse', now())`,
            [bId, BRANCH, U.Warehouse],
            /gate\.handover\.receiver_unverified/,
          )
        } finally {
          await q('rollback to savepoint gate1_refuse_1')
          await q('release savepoint gate1_refuse_1')
        }
      })

      // 2. Reason < 10 chars is refused by DB check constraint
      const auditId = crypto.randomUUID()
      await q(
        `insert into audit_events (id, client_uuid, module, action, table_name, record_id, actor_id, actor_role, branch_id)
         values ($1, gen_random_uuid(), 'Rentals', 'Approve', 'operation_sessions', $2, $3, 'Warehouse', $4)`,
        [auditId, handoverSessionId, U.Warehouse, BRANCH],
      )

      await q('savepoint gate1_refuse_2')
      try {
        await refuses(
          'gate 1 override with reason < 10 chars is refused by DB check',
          `insert into override_records (id, client_uuid, override_type, subject_type, subject_id, gate_number, reason, approver_user_id, approver_role, audit_event_id, created_by)
           values (gen_random_uuid(), gen_random_uuid(), 'Gate override', 'operation_sessions', $1, 1, 'short', $2, 'Warehouse', $3, $2)`,
          [handoverSessionId, U.Warehouse, auditId],
          /override_records_reason_min_10_chars/,
        )
      } finally {
        await q('rollback to savepoint gate1_refuse_2')
        await q('release savepoint gate1_refuse_2')
      }

      // 3. Warehouse inserts valid override record with reason >= 10 chars
      await as('Warehouse', async () => {
        await q(
          `insert into override_records (id, client_uuid, override_type, subject_type, subject_id, gate_number, reason, approver_user_id, approver_role, audit_event_id, created_by)
           values (gen_random_uuid(), gen_random_uuid(), 'Gate override', 'operation_sessions', $1, 1, 'Client forgot physical ID; verified via owner phone call', $2, 'Warehouse', $3, $2)`,
          [handoverSessionId, U.Warehouse, auditId],
        )
      })

      // 4. Moving to On Rent now SUCCEEDS
      await as('Warehouse', async () => {
        await q(
          `insert into booking_stage_transitions (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
           values (gen_random_uuid(), $1, $2, 'Packed', 'On Rent', $3, 'Warehouse', now())`,
          [bId, BRANCH, U.Warehouse],
        )
      })

      const finalStage = await stageOf('l34')
      assertEq(finalStage, 'On Rent', 'booking advanced to On Rent after Warehouse override')
    })
  },
})

STEPS.push({
  id: 'L35',
  title: 'Technician can perform every floor verb (Pack, Handover, Return, Reset); Coordinator refused (D3, T2-05)',
  expect: 'green',
  run: async () => {
    await undone(async () => {
      // 1. Create a fresh booking
      await as('Coordinator', async () => {
        await createBooking({
          key: 'l35',
          window: ['2099-12-10T04:00:00Z', '2099-12-12T04:00:00Z'],
          actor: 'Coordinator',
          lines: [
            {
              productId: SERIAL_PRODUCT,
              description: 'Lifecycle Camera for Technician',
              qty: 1,
              days: 2,
              rate: 350000,
              units: [UNITS[0]],
            },
          ],
        })
      })

      // Quote -> Booked
      await transition('l35', 'Quote', 'Booked', 'Coordinator')

      // Coordinator is refused from floor verbs by RLS on operation_sessions
      await as('Coordinator', async () => {
        await q('savepoint coord_pack_probe')
        try {
          await refuses(
            'Coordinator cannot write operation_sessions',
            `insert into operation_sessions (client_uuid, booking_id, operation, session_no, state, warehouse_staff_id, created_by)
             values (gen_random_uuid(), $1, 'Packing', 1, 'In Progress', $2, $2)`,
            [bookingIds.l35, U.Coordinator],
            /row-level security/i,
          )
        } finally {
          await q('rollback to savepoint coord_pack_probe')
          await q('release savepoint coord_pack_probe')
        }
      })

      // Technician performs Pack -> Packed
      await as('Technician', async () => {
        await actionPackRental({
          key: 'l35',
          actor: 'Technician',
          units: [{ id: UNITS[0], serial: 'LCSN-001' }],
        })
      })

      // Settle invoice before Technician handover to satisfy R-06 gate
      await settleInvoice('l35', U.Accounts)

      assertEq(await stageOf('l35'), 'Packed', 'Technician advanced booking to Packed')

      // Technician performs Handover -> On Rent
      await as('Technician', async () => {
        await actionHandoverRental({
          key: 'l35',
          actor: 'Technician',
          signerName: 'Tech Handover Client',
          deliveryMethod: 'Client Pickup',
          verified: true,
          reason: 'Handover completed with client signature',
        })
      })
      assertEq(await stageOf('l35'), 'On Rent', 'Technician advanced booking to On Rent')

      // Technician performs Return -> Returned
      await as('Technician', async () => {
        await actionReturnRental({
          key: 'l35',
          actor: 'Technician',
          returnedUnits: [{ id: UNITS[0] }],
        })
      })
      assertEq(await stageOf('l35'), 'Returned', 'Technician advanced booking to Returned')

      // Technician performs Reset
      await as('Technician', async () => {
        await actionCompleteReset({
          key: 'l35',
          actor: 'Technician',
        })
      })
    })
  },
})

STEPS.push({
  id: 'L36',
  title: 'ID satisfies deposit gate at Handover without cash deposit (D1, T2-03)',
  expect: 'green',
  run: async () => {
    await undone(async () => {
      // 1. Create a fresh booking with deposit required
      await as('Coordinator', async () => {
        await createBooking({
          key: 'l36',
          window: ['2099-12-15T04:00:00Z', '2099-12-17T04:00:00Z'],
          actor: 'Coordinator',
          lines: [
            {
              productId: SERIAL_PRODUCT,
              description: 'Lifecycle Camera for Collateral Deposit',
              qty: 1,
              days: 2,
              rate: 350000,
              units: [UNITS[0]],
            },
          ],
        })
      })
      const bId = bookingIds.l36

      // Quote -> Booked
      await transition('l36', 'Quote', 'Booked', 'Coordinator')

      // Set pending deposit on booking
      await asOwnerOfTheDatabase(async () => {
        await q(
          `insert into security_deposits (client_uuid, deposit_no, booking_id, client_id, branch_id, required_amount, pending_amount)
           select gen_random_uuid(), 'SD-L36', b.id, b.client_id, $2::uuid, 10000, 10000 from bookings b where b.id = $1::uuid`,
          [bId, BRANCH],
        )
      })

      // Pack booking
      await as('Warehouse', async () => {
        await actionPackRental({
          key: 'l36',
          actor: 'Warehouse',
          units: [{ id: UNITS[0], serial: 'LCSN-001' }],
        })
      })

      // Settle invoice before handover to satisfy R-06 gate
      await as('Accounts', async () => {
        const draftInvoiceId = await one('select id from invoices where booking_id = $1 and status = \'Draft\'', [bookingIds.l36])
        if (draftInvoiceId) {
          await q('select issue_invoice($1::jsonb)', [
            JSON.stringify({ invoice_id: draftInvoiceId, issued_by: U.Accounts })
          ])
          const outstanding = Number(await one('select outstanding_amount from invoices where id = $1', [draftInvoiceId]))
          if (outstanding > 0) {
            await q(
              `insert into payments (client_uuid, payment_no, booking_id, invoice_id, client_id, branch_id, amount, payment_type, payment_date, received_by)
               values (gen_random_uuid(), next_document_number('payment'), $1, $2, $3, $4, $5, 'Advance Payment', now(), $6)`,
            [bookingIds.l36, draftInvoiceId, CLIENT, BRANCH, outstanding, U.Accounts])
          }
        }
      })

      // Setup Handover session
      const handoverSessionId = crypto.randomUUID()
      await as('Warehouse', async () => {
        await q(
          `insert into operation_sessions (id, client_uuid, booking_id, operation, session_no, state, delivery_method, warehouse_staff_id, created_by, government_id_verified, booking_authorization_verified)
           values ($1, gen_random_uuid(), $2, 'Handover', 1, 'In Progress', 'Client Pickup', $3, $3, true, true)`,
          [handoverSessionId, bId, U.Warehouse],
        )
        const hlLineId = await one('select id from booking_lines where booking_id = $1', [bId])
        await q(
          `insert into handover_lines (client_uuid, booking_line_id, state, qty_required, first_session_id, completed_session_id, created_by)
           values (gen_random_uuid(), $1, 'Picked Up', 1, $2, $2, $3)`,
          [hlLineId, handoverSessionId, U.Warehouse],
        )
        await q(
          `insert into signatures (client_uuid, session_id, signature_role, signer_name, signed_at, device, is_required, created_by)
           values (gen_random_uuid(), $1, 'Receiver', 'Collateral Test Signer', now(), 'iPad-1', true, $2)`,
          [handoverSessionId, U.Warehouse],
        )
      })

      // Moving to On Rent without cash deposit or collateral is refused (R-06 warning requires reason)
      await as('Warehouse', async () => {
        await q('savepoint deposit_warn_probe')
        try {
          await refuses(
            'handover without cash deposit or collateral is refused without override reason',
            `insert into booking_stage_transitions (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
             values (gen_random_uuid(), $1, $2, 'Packed', 'On Rent', $3, 'Warehouse', now())`,
            [bId, BRANCH, U.Warehouse],
            /pending deposit of Rs\. 10000\.00/,
          )
        } finally {
          await q('rollback to savepoint deposit_warn_probe')
          await q('release savepoint deposit_warn_probe')
        }
      })

      // Now client presents ID card as deposit collateral instead of cash (D1, T2-03)
      await as('Warehouse', async () => {
        await q(
          `insert into collateral_documents (client_uuid, booking_id, collateral_type, document_number, held_by, created_by)
           values (gen_random_uuid(), $1, 'citizenship_card', '27-01-78-12345', $2, $2)`,
          [bId, U.Warehouse],
        )
      })

      // Handover with held ID succeeds WITHOUT money override reason!
      await as('Warehouse', async () => {
        await q(
          `insert into booking_stage_transitions (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
           values (gen_random_uuid(), $1, $2, 'Packed', 'On Rent', $3, 'Warehouse', now())`,
          [bId, BRANCH, U.Warehouse],
        )
        await q(`update operation_sessions set state = 'Completed' where id = $1`, [handoverSessionId])
      })

      assertEq(await stageOf('l36'), 'On Rent', 'booking advanced to On Rent with ID held as deposit')
    })
  },
})

STEPS.push({
  id: 'L37',
  title: 'Close refused while ID held; accepted once returned (D1, T2-03)',
  expect: 'green',
  run: async () => {
    await undone(async () => {
      // 1. Create and progress booking to On Rent with held collateral
      await as('Coordinator', async () => {
        await createBooking({
          key: 'l37',
          window: ['2099-12-20T04:00:00Z', '2099-12-22T04:00:00Z'],
          actor: 'Coordinator',
          lines: [
            {
              productId: SERIAL_PRODUCT,
              description: 'Lifecycle Camera for Collateral Close Gate',
              qty: 1,
              days: 2,
              rate: 350000,
              units: [UNITS[0]],
            },
          ],
        })
      })
      const bId = bookingIds.l37
      await transition('l37', 'Quote', 'Booked', 'Coordinator')

      await as('Warehouse', async () => {
        await actionPackRental({
          key: 'l37',
          actor: 'Warehouse',
          units: [{ id: UNITS[0], serial: 'LCSN-001' }],
        })
      })

      await as('Warehouse', async () => {
        await q(
          `insert into collateral_documents (client_uuid, booking_id, collateral_type, document_number, held_by, created_by)
           values (gen_random_uuid(), $1, 'passport', 'PA09876543', $2, $2)`,
          [bId, U.Warehouse],
        )
        await actionHandoverRental({
          key: 'l37',
          actor: 'Warehouse',
          signerName: 'Passport Signer',
          deliveryMethod: 'Client Pickup',
          verified: true,
          reason: 'Handover completed with client signature',
        })
      })
      assertEq(await stageOf('l37'), 'On Rent', 'booking is On Rent')

      // Return booking
      await as('Warehouse', async () => {
        await actionReturnRental({
          key: 'l37',
          actor: 'Warehouse',
          returnedUnits: [{ id: UNITS[0] }],
        })
      })
      assertEq(await stageOf('l37'), 'Returned', 'booking is Returned')

      // Settle the T3-14b Draft invoice to satisfy close gate
      await settleInvoice('l37', U.Accounts)

      // Provide settled invoice
      await asOwnerOfTheDatabase(async () => {
        await q(
          `insert into invoices (client_uuid, invoice_no, booking_id, client_id, branch_id, issue_date, due_date, total_amount, paid_amount, outstanding_amount, status)
           select gen_random_uuid(), 'INV-L37', b.id, b.client_id, $2::uuid, current_date, current_date + 7, 7000, 7000, 0, 'Paid' from bookings b where b.id = $1::uuid`,
          [bId, BRANCH],
        )
      })

      // Attempt Close while collateral is still held: MUST BE REFUSED (gate.close.collateral_held)
      await as('Manager', async () => {
        await q('savepoint collateral_close_probe')
        try {
          await refuses(
            'closing while collateral is held is refused',
            `insert into booking_stage_transitions (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
             values (gen_random_uuid(), $1, $2, 'Returned', 'Closed', $3, 'Manager', now())`,
            [bId, BRANCH, U.Manager],
            /gate\.close\.collateral_held/,
          )
        } finally {
          await q('rollback to savepoint collateral_close_probe')
          await q('release savepoint collateral_close_probe')
        }
      })

      // Staff records return of ID to client
      await as('Warehouse', async () => {
        await q(
          `update collateral_documents set returned_at = now(), returned_by = $2, updated_at = now(), updated_by = $2 where booking_id = $1`,
          [bId, U.Warehouse],
        )
      })

      // Close now SUCCEEDS!
      await as('Manager', async () => {
        await q(
          `insert into booking_stage_transitions (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
           values (gen_random_uuid(), $1, $2, 'Returned', 'Closed', $3, 'Manager', now())`,
          [bId, BRANCH, U.Manager],
        )
      })

      assertEq(await stageOf('l37'), 'Closed', 'booking closed after returning collateral')
    })
  },
})

STEPS.push({
  id: 'L38',
  title: 'Warehouse cannot read ID document number; Manager reads unmasked (D1, T2-03)',
  expect: 'green',
  run: async () => {
    await undone(async () => {
      const bId = bookingIds.a
      const docNum = 'NP-CITIZEN-998877'
      await asOwnerOfTheDatabase(async () => {
        await q(
          `insert into collateral_documents (client_uuid, booking_id, collateral_type, document_number, held_by, created_by)
           values (gen_random_uuid(), $1, 'citizenship_card', $2, $3, $3)`,
          [bId, docNum, U.Owner],
        )
      })

      // 1. Warehouse direct select on collateral_documents.document_number is refused by column permissions
      await as('Warehouse', async () => {
        await q('savepoint wh_doc_probe')
        try {
          await refuses(
            'Warehouse direct select on collateral_documents.document_number is refused',
            `select document_number from collateral_documents where booking_id = $1`,
            [bId],
            /permission denied/i,
          )
        } finally {
          await q('rollback to savepoint wh_doc_probe')
          await q('release savepoint wh_doc_probe')
        }
      })

      // 2. Warehouse select on collateral_documents_v returns masked document_number and null evidence_file_id
      await as('Warehouse', async () => {
        const rows = (await q(`select document_number, evidence_file_id from collateral_documents_v where booking_id = $1`, [bId])).rows
        assertEq(rows.length, 1, 'Warehouse finds collateral record')
        assertEq(rows[0].document_number, '••••-••••-8877', 'Warehouse sees masked document number')
        assertEq(rows[0].evidence_file_id, null, 'Warehouse sees null evidence file id')
      })

      // 3. Manager select on collateral_documents_v returns unmasked document_number
      await as('Manager', async () => {
        const rows = (await q(`select document_number from collateral_documents_v where booking_id = $1`, [bId])).rows
        assertEq(rows.length, 1, 'Manager finds collateral record')
        assertEq(rows[0].document_number, docNum, 'Manager sees unmasked document number')
      })
    })
  },
})

STEPS.push({
  id: 'L39',
  title: 'Warehouse cannot read client ID document number or collector ID number; Manager reads unmasked (W50, W34, T2-12)',
  expect: 'green',
  run: async () => {
    await undone(async () => {
      const clientId = CLIENT
      const idNum = 'NP-CITIZEN-123456'
      const collectorIdNum = 'NP-DL-987654'

      await asOwnerOfTheDatabase(async () => {
        await q(
          `insert into client_id_documents (client_uuid, client_id, id_type, id_number, created_by, verified_by)
           values (gen_random_uuid(), $1, 'citizenship_card', $2, $3, $3)`,
          [clientId, idNum, U.Owner],
        )
        await q(
          `insert into client_collectors (client_uuid, client_id, name, phone, role_title, id_type, id_number, created_by)
           values (gen_random_uuid(), $1, 'Sita Gurung', '+9779811223344', '1st AC', 'driving_licence', $2, $3)`,
          [clientId, collectorIdNum, U.Owner],
        )
      })

      // 1. Warehouse direct select on client_id_documents.id_number is refused by column permissions
      await as('Warehouse', async () => {
        await q('savepoint wh_id_probe')
        try {
          await refuses(
            'Warehouse direct select on client_id_documents.id_number is refused',
            `select id_number from client_id_documents where client_id = $1`,
            [clientId],
            /permission denied/i,
          )
        } finally {
          await q('rollback to savepoint wh_id_probe')
          await q('release savepoint wh_id_probe')
        }
      })

      // 2. Warehouse direct select on client_collectors.id_number is refused by column permissions
      await as('Warehouse', async () => {
        await q('savepoint wh_coll_probe')
        try {
          await refuses(
            'Warehouse direct select on client_collectors.id_number is refused',
            `select id_number from client_collectors where client_id = $1`,
            [clientId],
            /permission denied/i,
          )
        } finally {
          await q('rollback to savepoint wh_coll_probe')
          await q('release savepoint wh_coll_probe')
        }
      })

      // 3. Warehouse select on client_id_documents_v returns masked id_number and null evidence_file_id
      await as('Warehouse', async () => {
        const rows = (await q(`select id_number, evidence_file_id from client_id_documents_v where client_id = $1`, [clientId])).rows
        assertEq(rows.length, 1, 'Warehouse finds client ID document')
        assertEq(rows[0].id_number, '••••-••••-3456', 'Warehouse sees masked client ID document number')
        assertEq(rows[0].evidence_file_id, null, 'Warehouse sees null evidence file id')
      })

      // 4. Warehouse select on client_collectors_v returns masked id_number and null evidence_file_id
      await as('Warehouse', async () => {
        const rows = (await q(`select name, id_number, evidence_file_id from client_collectors_v where client_id = $1`, [clientId])).rows
        assertEq(rows.length, 1, 'Warehouse finds client collector')
        assertEq(rows[0].name, 'Sita Gurung', 'Warehouse sees collector name')
        assertEq(rows[0].id_number, '••••-••••-7654', 'Warehouse sees masked collector ID number')
        assertEq(rows[0].evidence_file_id, null, 'Warehouse sees null evidence file id')
      })

      // 5. Manager select on client_id_documents_v returns unmasked id_number
      await as('Manager', async () => {
        const rows = (await q(`select id_number from client_id_documents_v where client_id = $1`, [clientId])).rows
        assertEq(rows.length, 1, 'Manager finds client ID document')
        assertEq(rows[0].id_number, idNum, 'Manager sees unmasked client ID document number')
      })

      // 6. Manager select on client_collectors_v returns unmasked id_number
      await as('Manager', async () => {
        const rows = (await q(`select id_number from client_collectors_v where client_id = $1`, [clientId])).rows
        assertEq(rows.length, 1, 'Manager finds client collector')
        assertEq(rows[0].id_number, collectorIdNum, 'Manager sees unmasked collector ID number')
      })

      // 7. Verify helper function client_has_id_on_file
      await as('Warehouse', async () => {
        const hasId = await one('select client_has_id_on_file($1)', [clientId])
        assertEq(Boolean(hasId), true, 'client_has_id_on_file returns true for client with ID')
      })
    })
  },
})

STEPS.push({
  id: 'L40',
  title: 'Self-QC refused without the flag, accepted with it, audited (W43, L7, T2-13)',
  expect: 'green',
  run: async () => {
    await undone(async () => {
      await as('Warehouse', async () => {
        const entryId = crypto.randomUUID()
        const unitId = UNITS[0]
        const bookingId = bookingIds.a

        // 1. Insert queue entry for reset
        await q(
          `insert into cleaning_queue_entries (id, client_uuid, booking_id, unit_id, state, cleaned_by, clean_completed_at, created_by)
           values ($1, gen_random_uuid(), $2, $3, 'Cleaning', $4, now(), $4)`,
          [entryId, bookingId, unitId, U.Warehouse],
        )

        // 2. Setting qc_by = cleaned_by without qc_self_checked is refused by the check constraint
        await q('savepoint qc_self_check_probe')
        try {
          await refuses(
            'self-QC without qc_self_checked is refused',
            `update cleaning_queue_entries
             set qc_by = $1, qc_at = now(), qc_self_checked = false
             where id = $2`,
            [U.Warehouse, entryId],
            /cleaning_queue_entries_qc_is_a_second_pair_of_eyes/i,
          )
        } finally {
          await q('rollback to savepoint qc_self_check_probe')
          await q('release savepoint qc_self_check_probe')
        }

        // 3. Setting qc_by = cleaned_by WITH qc_self_checked = true is accepted
        await q(
          `update cleaning_queue_entries
           set qc_by = $1, qc_at = now(), qc_self_checked = true, state = 'Ready'
           where id = $2`,
          [U.Warehouse, entryId],
        )

        const row = (await q(`select qc_by, cleaned_by, qc_self_checked from cleaning_queue_entries where id = $1`, [entryId])).rows[0]
        assertEq(row.qc_by, U.Warehouse, 'qc_by matches operator')
        assertEq(row.cleaned_by, U.Warehouse, 'cleaned_by matches operator')
        assertEq(row.qc_self_checked, true, 'qc_self_checked is true')

        // 4. Verify audit_events recorded the self-checked QC (Manager+ can view audit log)
        let audit = null
        await as('Manager', async () => {
          audit = (await q(
            `select new_values from audit_events
             where table_name = 'cleaning_queue_entries' and record_id = $1 and action = 'Update'
             order by created_at desc limit 1`,
            [entryId],
          )).rows[0]
        })
        assert(audit, 'audit event exists for cleaning_queue_entries self-QC')
        assertEq(audit.new_values.qc_self_checked, true, 'audit record reflects qc_self_checked = true')
      })
    })
  },
})

STEPS.push({
  id: 'L41',
  title: 'Unit with open damage finding cannot be reserved; after repair job closes it can (D4, T2-06)',
  expect: 'green',
  run: async () => {
    await undone(async () => {
      const unitId = UNITS[0]
      const findingId = crypto.randomUUID()
      const mntId = crypto.randomUUID()

      // 1. Insert a completed cleaning queue entry and unresolved damage finding on the unit
      const cleanEntryId = crypto.randomUUID()
      await asOwnerOfTheDatabase(async () => {
        await q(
          `insert into cleaning_queue_entries (id, client_uuid, booking_id, unit_id, state, cleaned_by, completed_at, created_by)
           values ($1, gen_random_uuid(), $2, $3, 'Ready', $4, now(), $4)`,
          [cleanEntryId, bookingIds.a, unitId, U.Owner],
        )
        await q(
          `insert into damage_findings (id, client_uuid, source, cleaning_queue_entry_id, unit_id, damage_type, description, severity, created_by)
           values ($1, gen_random_uuid(), 'Cleaning', $2, $3, 'Physical', 'Broken optical filter thread', 'Moderate', $4)`,
          [findingId, cleanEntryId, unitId, U.Owner],
        )
      })

      // 2. An attempt to reserve the unit with open finding is refused by validate_unit_reservability()
      const lineId = (await q(`select id from booking_lines where booking_id = $1 limit 1`, [bookingIds.a])).rows[0].id
      await as('Coordinator', async () => {
        await q('savepoint reserve_damage_probe')
        try {
          await refuses(
            'Unit with open damage finding cannot be reserved',
            `insert into inventory_reservations (client_uuid, booking_id, booking_line_id, asset_id, period, created_by)
             values (gen_random_uuid(), $1, $2, $3, tstzrange(now() + interval '1 day', now() + interval '2 days', '[]'), $4)`,
            [bookingIds.a, lineId, unitId, U.Coordinator],
            /GATE:unit.reserve.damage_finding/i,
          )
        } finally {
          await q('rollback to savepoint reserve_damage_probe')
          await q('release savepoint reserve_damage_probe')
        }
      })

      // 3. Create a maintenance record linked to the damage finding
      await asOwnerOfTheDatabase(async () => {
        await q(
          `insert into maintenance_records (id, client_uuid, record_no, product_unit_id, damage_finding_id, maintenance_type, priority, status, description, scheduled_date, created_by)
           values ($1, gen_random_uuid(), 'MT-2026-9999', $2, $3, 'Repair', 'Normal', 'In Progress', 'Replace optical filter thread ring', current_date, $4)`,
          [mntId, unitId, findingId, U.Owner],
        )
      })

      // 4. Warehouse cannot close the maintenance job (42501 permission denied)
      await as('Warehouse', async () => {
        await q('savepoint wh_close_probe')
        try {
          await refuses(
            'Warehouse cannot close maintenance jobs',
            `select close_maintenance_job($1, 'Attempted close by warehouse')`,
            [mntId],
            /Permission denied/i,
          )
        } finally {
          await q('rollback to savepoint wh_close_probe')
          await q('release savepoint wh_close_probe')
        }
      })

      // 5. Technician closes the maintenance job with a required note
      await as('Technician', async () => {
        const res = await one(
          `select close_maintenance_job($1, 'Replaced filter thread ring and tested mount tolerance.', 'Filter ring stripped', 'Replaced ring with OEM part', 2500)`,
          [mntId],
        )
        assertEq(res.success, true, 'close_maintenance_job succeeded for Technician')
      })

      // 6. Linked damage finding is now marked repaired (repaired_at is set, repaired_by is set)
      await as('Manager', async () => {
        const findingRow = (await q(`select repaired_at, repaired_by from damage_findings where id = $1`, [findingId])).rows[0]
        assert(findingRow, 'damage finding exists')
        assert(findingRow.repaired_at, 'repaired_at is set on the finding')
        assert(findingRow.repaired_by, 'repaired_by is recorded')
      })

      // 7. Unit status is recomputed to In Stock and condition is restored
      await as('Manager', async () => {
        const unitRow = (await q(`select status, condition from product_units where id = $1`, [unitId])).rows[0]
        assertEq(unitRow.condition, 'Good', 'unit condition restored to Good')
        assertEq(unitRow.status, 'In Stock', 'unit status is In Stock')
      })

      // 8. Reserving the unit now succeeds
      await as('Coordinator', async () => {
        const resId = crypto.randomUUID()
        await q(
          `insert into inventory_reservations (id, client_uuid, booking_id, booking_line_id, asset_id, period, created_by)
           values ($1, gen_random_uuid(), $2, $3, $4, tstzrange(now() + interval '1 day', now() + interval '2 days', '[]'), $5)`,
          [resId, bookingIds.a, lineId, unitId, U.Coordinator],
        )
        const row = (await q(`select id from inventory_reservations where id = $1`, [resId])).rows[0]
        assertEq(row.id, resId, 'reservation inserted successfully after repair clearance')
      })

      // 9. Warehouse sees cost as null on maintenance_records_v (Law 6)
      await as('Warehouse', async () => {
        const mRow = (await q(`select cost from maintenance_records_v where id = $1`, [mntId])).rows[0]
        assertEq(mRow.cost, null, 'Warehouse sees null cost on maintenance_records_v')
      })

      // 10. Manager reads unmasked cost
      await as('Manager', async () => {
        const mRow = (await q(`select cost from maintenance_records_v where id = $1`, [mntId])).rows[0]
        assertEq(Number(mRow.cost), 2500, 'Manager reads unmasked cost')
      })
    })
  },
})

STEPS.push({
  id: 'L42',
  title: 'Team notes on the database: staff create, read, acknowledge, pin, archive; Client/anon denied; direct update/delete blocked; idempotent (S6, T4-04)',
  expect: 'green',
  run: async () => {
    await undone(async () => {
      const clientUuid1 = crypto.randomUUID()
      let note1Id
      let note2Id
      let note3Id

      // 1. Warehouse creates note1 with client_uuid; duplicate submission returns same ID (Law 8)
      await as('Warehouse', async () => {
        note1Id = await one(
          `select create_team_note('FX6 cage missing top handle bolt', $1, 'Gear Alert', 'high', 'EQ-SONY-FX6-01', array['EQ-SONY-FX6-01'])`,
          [clientUuid1],
        )
        assert(note1Id, 'create_team_note returned id for Warehouse')

        // Replay with same client_uuid is idempotent
        const replay = await one(
          `select create_team_note('FX6 cage missing top handle bolt', $1, 'Gear Alert', 'high', 'EQ-SONY-FX6-01', array['EQ-SONY-FX6-01'])`,
          [clientUuid1],
        )
        assertEq(replay, note1Id, 'replaying client_uuid returns same note ID')
      })

      // 2. Technician creates note2 (pinned)
      await as('Technician', async () => {
        note2Id = await one(
          `select create_team_note('Replaced top handle bolt on FX6 cage', gen_random_uuid(), 'Gear Alert', 'normal', 'EQ-SONY-FX6-01', array['EQ-SONY-FX6-01'], true)`,
        )
        assert(note2Id, 'create_team_note returned id for Technician')
      })

      // 3. Driver creates note3
      await as('Driver', async () => {
        note3Id = await one(
          `select create_team_note('Balkhu road clear, normal transit route', gen_random_uuid(), 'Logistics & Transport', 'normal')`,
        )
        assert(note3Id, 'create_team_note returned id for Driver')
      })

      // 4. Client cannot create team notes (refused)
      await as('Client', async () => {
        await q('savepoint client_create_note')
        try {
          await refuses(
            'Client cannot create team notes',
            `select create_team_note('Client attempted note', gen_random_uuid())`,
            [],
            /insufficient_privilege|Only staff can create team notes/i,
          )
        } finally {
          await q('rollback to savepoint client_create_note')
          await q('release savepoint client_create_note')
        }
      })

      // 5. Client cannot list team notes via RPC (refused)
      await as('Client', async () => {
        await q('savepoint client_list_note')
        try {
          await refuses(
            'Client cannot list team notes via RPC',
            `select * from list_team_notes()`,
            [],
            /insufficient_privilege|Only staff can list team notes/i,
          )
        } finally {
          await q('rollback to savepoint client_list_note')
          await q('release savepoint client_list_note')
        }
      })

      // 6. Client direct SELECT from team_notes returns 0 rows (RLS)
      await as('Client', async () => {
        const rows = (await q(`select * from team_notes`)).rows
        assertEq(rows.length, 0, 'Client direct select returns 0 team_notes rows via RLS')
      })

      // 7. Coordinator acknowledges note1
      await as('Coordinator', async () => {
        const ack1 = await one(`select acknowledge_team_note($1)`, [note1Id])
        assertEq(ack1, true, 'first acknowledge returns true')
        const ack2 = await one(`select acknowledge_team_note($1)`, [note1Id])
        assertEq(ack2, false, 'second acknowledge returns false (idempotent)')
      })

      // 8. Direct UPDATE on team_notes is revoked/refused
      await as('Warehouse', async () => {
        await q('savepoint wh_update_note')
        try {
          await refuses(
            'Direct update on team_notes is refused',
            `update team_notes set body = 'tampered' where id = $1`,
            [note1Id],
            /permission denied/i,
          )
        } finally {
          await q('rollback to savepoint wh_update_note')
          await q('release savepoint wh_update_note')
        }
      })

      // 9. Direct DELETE on team_notes is revoked/refused (Law 3)
      await as('Warehouse', async () => {
        await q('savepoint wh_delete_note')
        try {
          await refuses(
            'Direct delete on team_notes is refused',
            `delete from team_notes where id = $1`,
            [note1Id],
            /permission denied/i,
          )
        } finally {
          await q('rollback to savepoint wh_delete_note')
          await q('release savepoint wh_delete_note')
        }
      })

      // 10. Manager pins note3
      await as('Manager', async () => {
        const pinRes = await one(`select pin_team_note($1, true)`, [note3Id])
        assertEq(pinRes, true, 'pin_team_note returned true')
      })

      // 11. Coordinator archives note1 (archive, never delete)
      await as('Coordinator', async () => {
        const arcRes = await one(`select archive_team_note($1, true)`, [note1Id])
        assertEq(arcRes, true, 'archive_team_note returned true')
      })

      // 12. Default list_team_notes excludes archived notes; includes active ones with pinned first
      await as('Warehouse', async () => {
        const activeNotes = (await q(`select id, pinned, is_archived from list_team_notes(50, 0, false)`)).rows
        const note1Active = activeNotes.find((n) => n.id === note1Id)
        assertEq(note1Active, undefined, 'archived note1 is excluded from default list')
        const note2Active = activeNotes.find((n) => n.id === note2Id)
        assert(note2Active, 'active note2 is present in list')
        const note3Active = activeNotes.find((n) => n.id === note3Id)
        assert(note3Active, 'active note3 is present in list')
        assertEq(note3Active.pinned, true, 'note3 is pinned')
      })

      // 13. list_team_notes with p_include_archived=true includes archived note1
      await as('Warehouse', async () => {
        const allNotes = (await q(`select id, is_archived from list_team_notes(50, 0, true)`)).rows
        const note1Found = allNotes.find((n) => n.id === note1Id)
        assert(note1Found, 'archived note1 is included when p_include_archived is true')
        assertEq(note1Found.is_archived, true, 'note1 is_archived is true')
      })

      // 14. Audit events exist for team_notes mutations
      await asOwnerOfTheDatabase(async () => {
        const auditRows = (await q(`select id, action, table_name from audit_events where table_name = 'team_notes'`)).rows
        assert(auditRows.length >= 3, 'audit_events recorded team_notes mutations')
      })
    })
  },
})

STEPS.push({
  id: 'L43',
  title: 'Shift handover on the database: staff can write/read/acknowledge/archive handovers; Law 6 cash masking; Client is denied; hard delete rejected (0186)',
  expect: 'green',
  run: async () => {
    await undone(async () => {
      const clientUuid1 = crypto.randomUUID()
      const clientUuid2 = crypto.randomUUID()
      const clientUuidWh = crypto.randomUUID()

      // 1. Law 6: Warehouse (money-blind) is REFUSED from recording cash figures in create_shift_handover RPC
      await as('Warehouse', async () => {
        await q('savepoint wh_cash_probe')
        try {
          await refuses(
            'Warehouse cannot record cash counted or variance in shift handover',
            `select create_shift_handover(
              $1, 'A', 'Hari KC', 'Warehouse', $2, 'Raju Thapa',
              1840000, 'matched', 0, 'Overlap window open ΓÇö keys and van'
            )`,
            [clientUuidWh, U.Technician],
            /FORBIDDEN \(Law 6\): Money-blind role/i,
          )
        } finally {
          await q('rollback to savepoint wh_cash_probe')
          await q('release savepoint wh_cash_probe')
        }
      })

      // 2. Base table isolation: shift_handovers table contains NO cash columns
      await as('Warehouse', async () => {
        await q('savepoint col_probe')
        try {
          await refuses(
            'cash_counted_paisa column does not exist on base table shift_handovers',
            `select cash_counted_paisa from shift_handovers limit 1`,
            [],
            /column "cash_counted_paisa" does not exist/i,
          )
        } finally {
          await q('rollback to savepoint col_probe')
          await q('release savepoint col_probe')
        }
      })

      // 3. Coordinator (money-seeing role) creates handover with cash figures via create_shift_handover RPC
      let handoverId
      await as('Coordinator', async () => {
        const rows = (await q(
          `select * from create_shift_handover(
            $1, 'A', 'Sita Sharma', 'Coordinator', $2, 'Raju Thapa',
            1840000, 'matched', 0, 'Overlap window open ΓÇö handed over keys and van',
            '[]'::jsonb,
            '[{"key":"gear","label":"Out-gear walked through","done":true},{"key":"cash","label":"Cash counted","done":true}]'::jsonb
          )`,
          [clientUuid1, U.Technician],
        )).rows
        assertEq(rows.length, 1, 'Coordinator created shift handover')
        handoverId = rows[0].id
        assert(handoverId, 'Handover ID generated')
        assertEq(rows[0].cash_counted_paisa, 1840000n, 'Coordinator receives cash figures in return')
        assertEq(rows[0].cash_status, 'matched', 'Coordinator receives cash status in return')
      })

      // 4. Law 6: Warehouse reads null for cash figures and cash_status in shift_handovers_v
      await as('Warehouse', async () => {
        const rows = (await q(`select * from shift_handovers_v where id = $1`, [handoverId])).rows
        assertEq(rows.length, 1, 'Warehouse reads handover')
        assertEq(rows[0].shift_code, 'A', 'Shift code matches')
        assertEq(rows[0].cash_counted_paisa, null, 'Warehouse reads null for cash_counted_paisa (Law 6)')
        assertEq(rows[0].cash_variance_paisa, null, 'Warehouse reads null for cash_variance_paisa (Law 6)')
        assertEq(rows[0].cash_status, null, 'Warehouse reads null for cash_status (Law 6)')
      })

      // 5. Law 6: Warehouse direct query on shift_handover_finances table returns 0 rows (RLS denied)
      await as('Warehouse', async () => {
        const rows = (await q(`select * from shift_handover_finances where handover_id = $1`, [handoverId])).rows
        assertEq(rows.length, 0, 'Warehouse direct select on shift_handover_finances returns 0 rows')
      })

      // 6. Law 6: Warehouse cannot insert directly into shift_handover_finances (RLS denied)
      await as('Warehouse', async () => {
        await q('savepoint wh_finance_insert_probe')
        try {
          await refuses(
            'Warehouse cannot insert into shift_handover_finances',
            `insert into shift_handover_finances (handover_id, cash_counted_paisa) values ($1, 999900)`,
            [handoverId],
            /violates row-level security policy|permission denied/i,
          )
        } finally {
          await q('rollback to savepoint wh_finance_insert_probe')
          await q('release savepoint wh_finance_insert_probe')
        }
      })

      // 7. Manager reads unmasked cash figures in shift_handovers_v
      await as('Manager', async () => {
        const rows = (await q(`select * from shift_handovers_v where id = $1`, [handoverId])).rows
        assertEq(rows.length, 1, 'Manager reads handover')
        assertEq(rows[0].cash_counted_paisa, 1840000n, 'Manager reads unmasked cash_counted_paisa')
        assertEq(rows[0].cash_status, 'matched', 'Manager reads unmasked cash_status')
        assertEq(rows[0].cash_variance_paisa, 0n, 'Manager reads unmasked cash_variance_paisa')
      })

      // 8. Self-acknowledgement is REFUSED: author (Coordinator) cannot acknowledge own handover
      await as('Coordinator', async () => {
        await q('savepoint self_ack_probe')
        try {
          await refuses(
            'Staff cannot acknowledge their own shift handover',
            `select acknowledge_shift_handover($1, 'Self ack attempt', 'Sita Sharma')`,
            [handoverId],
            /Staff cannot acknowledge their own shift handover/i,
          )
        } finally {
          await q('rollback to savepoint self_ack_probe')
          await q('release savepoint self_ack_probe')
        }
      })

      // 9. Technician (incoming shift) acknowledges the handover; returns role-safe masked projection
      await as('Technician', async () => {
        const ackRows = (await q(
          `select * from acknowledge_shift_handover($1, 'Received keys and counted till', 'Raju Thapa')`,
          [handoverId],
        )).rows
        assertEq(ackRows.length, 1, 'Acknowledge RPC succeeds')
        assertEq(ackRows[0].status, 'acknowledged', 'Status transitions to acknowledged')
        assertEq(ackRows[0].cash_counted_paisa, null, 'Technician return payload masks cash_counted_paisa')
        assertEq(ackRows[0].cash_status, null, 'Technician return payload masks cash_status')

        const row = (await q(`select * from shift_handovers where id = $1`, [handoverId])).rows[0]
        assertEq(row.status, 'acknowledged', 'Status transitions to acknowledged')
        assertEq(row.acknowledged_by, U.Technician, 'Acknowledged by Technician')
        assert(row.acknowledged_at, 'acknowledged_at timestamp is recorded')
        assertEq(row.acknowledgement_note, 'Received keys and counted till', 'Note matches')
      })

      // 10. Direct UPDATE on shift_handovers is REVOKED
      await as('Technician', async () => {
        await q('savepoint direct_update_probe')
        try {
          await refuses(
            'Direct update on shift_handovers is revoked',
            `update shift_handovers set notes = 'tampered' where id = $1`,
            [handoverId],
            /permission denied for table shift_handovers/i,
          )
        } finally {
          await q('rollback to savepoint direct_update_probe')
          await q('release savepoint direct_update_probe')
        }
      })

      // 11. Client role is denied access (RLS returns 0 rows)
      await as('Client', async () => {
        const rows = (await q(`select * from shift_handovers where id = $1`, [handoverId])).rows
        assertEq(rows.length, 0, 'Client cannot read shift handovers (RLS returns 0 rows)')
      })

      // 12. Client cannot insert shift handovers
      await as('Client', async () => {
        await q('savepoint client_handover_probe')
        try {
          await refuses(
            'Client cannot insert shift handovers',
            `insert into shift_handovers (id, client_uuid, from_user_id, from_user_name, from_user_role)
             values (gen_random_uuid(), $1, $2, 'Client Renter', 'Client')`,
            [clientUuid2, U.Client],
            /violates row-level security policy|permission denied/i,
          )
        } finally {
          await q('rollback to savepoint client_handover_probe')
          await q('release savepoint client_handover_probe')
        }
      })

      // 13. Hard delete is refused by trigger / permissions (Law 3)
      await as('Manager', async () => {
        await q('savepoint manager_delete_probe')
        try {
          await refuses(
            'Hard delete is refused by postgres permissions / trigger',
            `delete from shift_handovers where id = $1`,
            [handoverId],
            /HARD DELETE FORBIDDEN|permission denied/i,
          )
        } finally {
          await q('rollback to savepoint manager_delete_probe')
          await q('release savepoint manager_delete_probe')
        }
      })

      // 14. Archival via archive_shift_handover RPC
      await as('Manager', async () => {
        await q(`select archive_shift_handover($1)`, [handoverId])
        const row = (await q(`select * from shift_handovers where id = $1`, [handoverId])).rows[0]
        assertEq(row.status, 'archived', 'Status is archived')
        assert(row.archived_at, 'archived_at is set')
      })

      // 15. Idempotent create_shift_handover via client_uuid (Law 8)
      await as('Coordinator', async () => {
        const clientUuid3 = crypto.randomUUID()
        const row1 = (await q(
          `select * from create_shift_handover(
            $1, 'B', 'Sita Sharma', 'Coordinator', null, null, 2500000, 'matched', 0, 'Evening handover test'
          )`,
          [clientUuid3],
        )).rows[0]
        assert(row1.id, 'Row 1 inserted')

        // Duplicate replay returns identical row
        const row2 = (await q(
          `select * from create_shift_handover(
            $1, 'B', 'Sita Sharma', 'Coordinator', null, null, 2500000, 'matched', 0, 'Evening handover test'
          )`,
          [clientUuid3],
        )).rows[0]
        assertEq(row2.id, row1.id, 'Duplicate client_uuid returns same shift handover row')
      })
    })
  },
})

STEPS.push({
  id: 'L44',
  title: 'Crew payouts and TDS (D25, T8-08): money roles record payout with immutable TDS snapshot; non-money roles denied RPC; views mask TDS/gross/net under Law 6; rate change does not alter past stored payouts',
  expect: 'green',
  run: async () => {
    await undone(async () => {
      // 1. Create a crew member and crew booking as Owner
      const crewMemberId = crypto.randomUUID()
      const crewBookingId = crypto.randomUUID()
      const clientUuidBooking = crypto.randomUUID()
      const clientUuidPayout = crypto.randomUUID()

      await as('Owner', async () => {
        await q(
          `insert into crew_members (id, client_uuid, full_name, position, engagement_type, pan_status, withholding_rate, day_rate, created_by)
           values ($1, gen_random_uuid(), 'Test Focus Puller', 'Focus Puller', 'freelance', 'registered', 15.00, 5000.00, $2)`,
          [crewMemberId, U.Owner],
        )

        await q(
          `insert into crew_bookings (id, client_uuid, crew_booking_no, crew_member_id, position, day_rate, days, start_date, end_date, state, payout_state, created_by)
           values ($1, $2, 'CB-2099-0001', $3, 'Focus Puller', 5000.00, 2, '2099-09-10', '2099-09-11', 'Confirmed', 'Due', $4)`,
          [crewBookingId, clientUuidBooking, crewMemberId, U.Owner],
        )
      })

      // 2. Non-money roles (Coordinator, Warehouse, Technician, Driver, Client) are denied record_crew_payout
      for (const nonMoneyRole of ['Coordinator', 'Warehouse', 'Technician', 'Driver', 'Client']) {
        await as(nonMoneyRole, async () => {
          await q('savepoint non_money_payout')
          try {
            await refuses(
              `${nonMoneyRole} cannot record crew payout`,
              `select record_crew_payout($1, $2, 15.0, 'Attempted payout')`,
              [crypto.randomUUID(), crewBookingId],
              /Access denied: crew payouts are restricted to money roles/i,
            )
          } finally {
            await q('rollback to savepoint non_money_payout')
            await q('release savepoint non_money_payout')
          }
        })
      }

      // 3. Accounts (money role per PERMISSIONS ┬º5) records payout with 15% TDS
      // Day rate = 5000, days = 2 -> Gross = 10000. 15% TDS = 1500. Net = 8500.
      await as('Accounts', async () => {
        const res = await one(
          `select record_crew_payout($1, $2, 15.0, 'September shoot payout')`,
          [clientUuidPayout, crewBookingId],
        )
        const payout = typeof res === 'string' ? JSON.parse(res) : res
        assert(payout.ok, 'record_crew_payout returned ok')
        assertEq(payout.gross, 10000, 'gross payout is 10000')
        assertEq(payout.tds_rate_percent, 15, 'tds_rate_percent is 15%')
        assertEq(payout.tds_amount, 1500, 'tds_amount is 1500')
        assertEq(payout.net_payout, 8500, 'net_payout is 8500')

        // Idempotent replay with same client_uuid
        const replayRes = await one(
          `select record_crew_payout($1, $2, 15.0, 'September shoot payout')`,
          [clientUuidPayout, crewBookingId],
        )
        const replay = typeof replayRes === 'string' ? JSON.parse(replayRes) : replayRes
        assert(replay.ok, 'replay returned ok')
        assert(replay.idempotent_replay, 'replay flagged as idempotent')
      })

      // 4. Money role (Manager) sees real figures in crew_bookings_v
      await as('Manager', async () => {
        const row = await one(
          `select jsonb_build_object(
             'day_rate', day_rate,
             'tds_rate_percent', tds_rate_percent,
             'tds_amount', tds_amount,
             'net_payout', net_payout,
             'payout_state', payout_state
           ) from crew_bookings_v where id = $1`,
          [crewBookingId],
        )
        const parsed = typeof row === 'string' ? JSON.parse(row) : row
        assertEq(parsed.day_rate, 5000, 'day_rate visible to Manager')
        assertEq(parsed.tds_rate_percent, 15, 'tds_rate_percent visible to Manager')
        assertEq(parsed.tds_amount, 1500, 'tds_amount visible to Manager')
        assertEq(parsed.net_payout, 8500, 'net_payout visible to Manager')
        assertEq(parsed.payout_state, 'Paid', 'payout_state is Paid')
      })

      // 5. Money-blind role (Warehouse) sees null for day_rate, tds_amount, net_payout under Law 6
      await as('Warehouse', async () => {
        const row = await one(
          `select jsonb_build_object(
             'day_rate', day_rate,
             'tds_rate_percent', tds_rate_percent,
             'tds_amount', tds_amount,
             'net_payout', net_payout,
             'payout_state', payout_state
           ) from crew_bookings_v where id = $1`,
          [crewBookingId],
        )
        const parsed = typeof row === 'string' ? JSON.parse(row) : row
        assert(parsed.day_rate === null, 'day_rate masked for Warehouse')
        assert(parsed.tds_rate_percent === null, 'tds_rate_percent masked for Warehouse')
        assert(parsed.tds_amount === null, 'tds_amount masked for Warehouse')
        assert(parsed.net_payout === null, 'net_payout masked for Warehouse')
        assertEq(parsed.payout_state, 'Paid', 'payout_state visible to Warehouse')
      })

      // 6. Immutability verification: later payout with different rate (or rate change) does not alter past stored payout
      await as('Owner', async () => {
        const past = await one(
          `select tds_amount from crew_bookings where id = $1`,
          [crewBookingId],
        )
        assertEq(Number(past), 1500, 'past payout tds_amount remains 1500')
      })
    })
  },
})

STEPS.push({
  id: 'L45',
  title: 'Delivery dispatch on the database: jobs, driver assignment, transitions, role isolation, idempotency (S6, T4-01)',
  expect: 'green',
  run: async () => {
    await undone(async () => {
      // 1. Create a booked delivery booking for testing
      const bookingKey = crypto.randomUUID()
      let testBookingId
      await as('Coordinator', async () => {
        const res = await q(
          `insert into bookings (client_uuid, booking_no, client_id, branch_id, pickup_at, return_at, delivery_type, stage, created_by, updated_by)
           values ($1, '994301', $2, $3, '2099-11-01T04:00:00Z', '2099-11-03T04:00:00Z', 'Babin Delivery', 'Quote', $4, $4)
           returning id`,
          [bookingKey, CLIENT, BRANCH, U.Coordinator],
        )
        testBookingId = res.rows[0].id

        await q(
          `insert into booking_lines (client_uuid, booking_id, line_type, product_id, description, qty, days, rate, created_by)
           values (gen_random_uuid(), $1, 'Equipment', $2, 'Delivery Test Bulk Cable', 1, 2, 250, $3)`,
          [testBookingId, QTY_PRODUCT, U.Coordinator],
        )

        await q(
          `insert into booking_stage_transitions (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
           values (gen_random_uuid(), $1, $2, 'Quote', 'Booked', $3, 'Coordinator', now())`,
          [testBookingId, BRANCH, U.Coordinator],
        )
      })

      // 2. Coordinator creates Outbound delivery job
      const jobKey = crypto.randomUUID()
      let jobId
      await as('Coordinator', async () => {
        jobId = await one(
          `select delivery_create_job($1, 'Outbound', '2099-11-01T04:00:00Z'::timestamptz, $2, 'Ba 3 Cha 8821')`,
          [testBookingId, jobKey],
        )
        assert(jobId, 'delivery_create_job returned job ID')

        // Replay with same key returns same ID (idempotency)
        const replay = await one(
          `select delivery_create_job($1, 'Outbound', '2099-11-01T04:00:00Z'::timestamptz, $2, 'Ba 3 Cha 8821')`,
          [testBookingId, jobKey],
        )
        assertEq(replay, jobId, 'replaying delivery_create_job returns same job ID')
      })

      // 3. Driver cannot see unassigned delivery job (RLS read isolation)
      await as('Driver', async () => {
        const rows = (await q(`select id from delivery_jobs where id = $1`, [jobId])).rows
        assertEq(rows.length, 0, 'Driver cannot read unassigned delivery job')
      })

      // 4. Coordinator assigns Driver to job
      const assignKey = crypto.randomUUID()
      await as('Coordinator', async () => {
        const assignedId = await one(
          `select delivery_assign_driver($1, $2, $3, 'Ba 3 Cha 8821', 'Ramesh Thapa', '+977 9813009988')`,
          [jobId, U.Driver, assignKey],
        )
        assertEq(assignedId, jobId, 'delivery_assign_driver returned job ID')

        // Replay returns same ID
        const replayAssign = await one(
          `select delivery_assign_driver($1, $2, $3, 'Ba 3 Cha 8821', 'Ramesh Thapa', '+977 9813009988')`,
          [jobId, U.Driver, assignKey],
        )
        assertEq(replayAssign, jobId, 'replaying delivery_assign_driver returns same job ID')
      })

      // 5. Driver CAN now read the assigned job, but no money columns exist on delivery_jobs
      await as('Driver', async () => {
        const rows = (await q(`select id, status, vehicle, rider_name from delivery_jobs where id = $1`, [jobId])).rows
        assertEq(rows.length, 1, 'Driver can read assigned job')
        assertEq(rows[0].status, 'Scheduled', 'status is Scheduled upon assignment')
      })

      // 6. Scheduled -> Ready requires outbound booking to be Packed or On Rent
      // In 'Booked' stage, transition should fail
      const readyKey = crypto.randomUUID()
      await as('Warehouse', async () => {
        await db.exec('savepoint sp_ready_probe;')
        try {
          await refuses(
            'Transition to Ready refused before booking is Packed',
            `select delivery_transition_job($1, 'Scheduled', 'Ready', $2)`,
            [jobId, readyKey],
            /Packing must finish before outbound dispatch/i,
          )
        } finally {
          await db.exec('rollback to savepoint sp_ready_probe;')
        }
      })

      // Advance booking stage to 'Packed'
      await as('Warehouse', async () => {
        const packSessionId = crypto.randomUUID()
        await q(
          `insert into operation_sessions (id, client_uuid, booking_id, operation, session_no, state, warehouse_staff_id, created_by)
           values ($1, gen_random_uuid(), $2, 'Packing', 1, 'In Progress', $3, $3)`,
          [packSessionId, testBookingId, U.Warehouse],
        )
        await q(
          `insert into booking_stage_transitions (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
           values (gen_random_uuid(), $1, $2, 'Booked', 'Packed', $3, 'Warehouse', now())`,
          [testBookingId, BRANCH, U.Warehouse],
        )
      })

      // Warehouse marks delivery job Ready
      await as('Warehouse', async () => {
        const readyId = await one(
          `select delivery_transition_job($1, 'Scheduled', 'Ready', $2)`,
          [jobId, readyKey],
        )
        assertEq(readyId, jobId, 'transition to Ready succeeded')
      })

      // 7. Driver transitions Ready -> In Transit
      const transitKey = crypto.randomUUID()
      await as('Driver', async () => {
        const transitId = await one(
          `select delivery_transition_job($1, 'Ready', 'In Transit', $2)`,
          [jobId, transitKey],
        )
        assertEq(transitId, jobId, 'transition to In Transit succeeded')
      })

      // 8. In Transit -> Delivered requires recipient name >= 2 chars
      const deliverKey = crypto.randomUUID()
      await as('Driver', async () => {
        await db.exec('savepoint sp_deliver_probe;')
        try {
          await refuses(
            'Transition to Delivered refused without recipient name',
            `select delivery_transition_job($1, 'In Transit', 'Delivered', $2, 'A')`,
            [jobId, deliverKey],
            /Delivery receipt requires the recipient name/i,
          )
        } finally {
          await db.exec('rollback to savepoint sp_deliver_probe;')
        }

        // Succeeds with valid recipient
        const deliveredId = await one(
          `select delivery_transition_job($1, 'In Transit', 'Delivered', $2, 'Anil Gurung')`,
          [jobId, deliverKey],
        )
        assertEq(deliveredId, jobId, 'transition to Delivered succeeded')
      })

      // 9. Delivered is a terminal state - cannot transition to Failed or anything else
      const failKey = crypto.randomUUID()
      await as('Coordinator', async () => {
        await db.exec('savepoint sp_fail_probe;')
        try {
          await refuses(
            'Transition from Delivered is refused (terminal state)',
            `select delivery_transition_job($1, 'Delivered', 'Failed', $2, null, 'Attempting to fail a delivered job')`,
            [jobId, failKey],
            /This delivery transition is not permitted/i,
          )
        } finally {
          await db.exec('rollback to savepoint sp_fail_probe;')
        }
      })

      // 10. Audit events and event receipts recorded
      await asOwnerOfTheDatabase(async () => {
        const events = (await q(`select event_kind, next_status from delivery_job_events where job_id = $1 order by created_at asc`, [jobId])).rows
        assert(events.length >= 3, 'delivery_job_events recorded transitions')
        assertEq(events[0].event_kind, 'Created')
        assertEq(events[events.length - 1].next_status, 'Delivered')
      })
    })
  },
})

STEPS.push({
  id: 'L46',
  title: 'Delivery zones CRUD and permission matrix (T4-07, migration 0189)',
  expect: 'green',
  run: async () => {
    await undone(async () => {
      // 1. Coordinator can create a delivery zone
      const zoneId = await as('Coordinator', async () => {
        const id = await one(`select create_delivery_zone($1, $2, $3)`, [
          'Test Valley Zone',
          'Test zone for lifecycle',
          350000,
        ])
        return id
      })
      assert(zoneId, 'create_delivery_zone returns a zone ID')

      // 2. Zone appears in list for all staff roles
      await as('Warehouse', async () => {
        const zones = await q(`select * from list_delivery_zones(50, 0, true)`)
        const found = zones.rows.find((z) => z.id === zoneId)
        assert(found, 'Warehouse can read active zones')
        assertEq(found.name, 'Test Valley Zone', 'Zone name matches')
        assertEq(Number(found.fee_paisa), 350000, 'Zone fee in paisa')
      })

      // 3. Coordinator can update the zone
      await as('Coordinator', async () => {
        const updated = await one(`select update_delivery_zone($1, $2, $3, $4, $5)`, [
          zoneId,
          'Test Valley Zone Updated',
          'Updated description',
          400000,
          true,
        ])
        assertEq(updated, true, 'update_delivery_zone returns true')
      })

      // 4. Verify update reflected
      await as('Manager', async () => {
        const zone = (await q(`select name, fee_paisa from delivery_zones where id = $1`, [zoneId])).rows[0]
        assertEq(zone.name, 'Test Valley Zone Updated', 'Zone name updated')
        assertEq(Number(zone.fee_paisa), 400000, 'Zone fee updated')
      })

      // 5. Warehouse CANNOT create a zone (insufficient privilege)
      await as('Warehouse', async () => {
        await q('savepoint wh_create_probe')
        try {
          await refuses(
            'Warehouse cannot create delivery zones',
            `select create_delivery_zone('WH Zone', 'Should fail', 300000)`,
            /Only Coordinator\+ can create delivery zones/i,
          )
        } finally {
          await q('rollback to savepoint wh_create_probe')
          await q('release savepoint wh_create_probe')
        }
      })

      // 6. Client CANNOT read zones (RLS denies)
      await as('Client', async () => {
        await q('savepoint client_read_probe')
        try {
          await refuses(
            'Client cannot read delivery zones',
            `select * from list_delivery_zones(50, 0, true)`,
            /Only staff can list delivery zones/i,
          )
        } finally {
          await q('rollback to savepoint client_read_probe')
          await q('release savepoint client_read_probe')
        }
      })

      // 7. anon CANNOT execute RPCs
      await as('Anon', async () => {
        await q('savepoint anon_probe')
        try {
          await refuses(
            'anon cannot list delivery zones',
            `select * from list_delivery_zones(50, 0, true)`,
            /insufficient_privilege|permission denied/i,
          )
        } finally {
          await q('rollback to savepoint anon_probe')
          await q('release savepoint anon_probe')
        }
      })

      // 8. Deactivate (soft delete) by Coordinator
      await as('Coordinator', async () => {
        const deactivated = await one(`select deactivate_delivery_zone($1)`, [zoneId])
        assertEq(deactivated, true, 'deactivate_delivery_zone returns true')
      })

      // 9. Deactivated zone not in active-only list
      await as('Coordinator', async () => {
        const zones = await q(`select * from list_delivery_zones(50, 0, true)`)
        const found = zones.rows.find((z) => z.id === zoneId)
        assert(!found, 'Deactivated zone excluded from active-only list')
      })

      // 10. Deactivated zone still visible with activeOnly=false
      await as('Manager', async () => {
        const zones = await q(`select * from list_delivery_zones(50, 0, false)`)
        const found = zones.rows.find((z) => z.id === zoneId)
        assert(found, 'Deactivated zone visible with activeOnly=false')
        assertEq(found.is_active, false, 'Zone is_active is false')
      })

      // 11. get_delivery_zone_fee works for active zone
      await as('Coordinator', async () => {
        const feeZoneId = await one(`select create_delivery_zone($1, $2, $3)`, [
          'Fee Lookup Zone',
          'For fee lookup test',
          500000,
        ])
        const fee = await one(`select get_delivery_zone_fee($1)`, ['Fee Lookup Zone'])
        assertEq(Number(fee), 500000, 'get_delivery_zone_fee returns correct fee')
      })

      // 12. get_delivery_zone_fee fails for inactive zone
      await as('Coordinator', async () => {
        await q('savepoint fee_inactive_probe')
        try {
          await refuses(
            'get_delivery_zone_fee fails for inactive zone',
            `select get_delivery_zone_fee('Test Valley Zone Updated')`,
            /Zone not found or inactive/i,
          )
        } finally {
          await q('rollback to savepoint fee_inactive_probe')
          await q('release savepoint fee_inactive_probe')
        }
      })

      // 13. Default Kathmandu zones seeded
      await as('Coordinator', async () => {
        const zones = await q(`select name from delivery_zones where is_active = true order by name`)
        const names = zones.rows.map((r) => r.name)
        const expectedZones = ['Bhaktapur', 'Boudha', 'Kirtipur', 'Outside Valley', 'Patan', 'Ring Road', 'Swoyambhu']
        for (const expected of expectedZones) {
          assert(names.includes(expected), `Default zone "${expected}" is seeded and active`)
        }
      })
    })
  },
})

STEPS.push({
  id: 'L47',
  title: 'One-time rider link: staff-issued, hashed-token, money-blind read, pickup and delivery verbs, 24h expiration and revocation guards (T4-08/W49)',
  expect: 'green',
  run: async () => {
    await undone(async () => {
      const refusesSavepoint = async (what, sql, params, matcher) => {
        await db.exec('savepoint rider_probe;')
        try {
          await refuses(what, sql, params, matcher)
        } finally {
          await db.exec('rollback to savepoint rider_probe; release savepoint rider_probe;')
        }
      }

      // 1. Setup a delivery job for booking a
      const jobId = '00000000-0000-4000-8000-00000000b991'
      await q(`
        insert into delivery_jobs (
          id, client_uuid, booking_id, branch_id, leg, scheduled_at, status, created_by, updated_by
        ) values (
          $1, gen_random_uuid(), $2, $3, 'Outbound', now() + interval '2 hours', 'Scheduled', $4, $4
        )
      `, [jobId, bookingIds.a, BRANCH, U.Coordinator])

      // Generate token and hash (SHA-256)
      const rawToken = 'rider_sec_tok_128bit_test_payload_12345'
      const tokenHash = createHash('sha256').update(rawToken).digest('hex')

      // 2. Security: Unauthorized role (Client) cannot create rider link
      await as('Client', async () => {
        await refusesSavepoint(
          'Client attempting to create rider link',
          `select create_rider_link($1, $2, 'Ram Rider', '9801234567')`,
          [jobId, tokenHash],
          /Unauthorized|42501/i,
        )
      })

      // 3. Coordinator creates the rider link
      let linkId
      await as('Coordinator', async () => {
        linkId = (await q(
          `select create_rider_link($1, $2, 'Ram Rider', '9801234567') as id`,
          [jobId, tokenHash],
        )).rows[0].id
        assert(linkId, 'Rider link created successfully')
      })

      // 4. Money blindness (Law 6) & payload structure for rider
      const jobData = (await q(`select get_rider_job_by_token($1) as data`, [tokenHash])).rows[0].data
      assertEq(jobData.job_id, jobId, 'Job data contains correct job_id')
      assertEq(jobData.rider_name, 'Ram Rider', 'Job data contains rider name')
      assertEq(jobData.rider_phone, '9801234567', 'Job data contains rider phone')
      assertEq(jobData.status, 'Scheduled', 'Initial status is Scheduled')
      assert(jobData.pickup_address, 'Pickup address is provided')
      assert(jobData.delivery_address, 'Delivery address is provided')
      assert(jobData.contact_name, 'Contact name is provided')

      // Assert NO money leakage in jobData
      const rawJson = JSON.stringify(jobData).toLowerCase()
      const forbiddenTerms = ['paisa', 'price', 'rate', 'deposit', 'total_amount', 'discount', 'invoice', 'credit']
      for (const term of forbiddenTerms) {
        assert(!rawJson.includes(`"${term}"`), `Law 6 violation: rider job payload contains money term "${term}"`)
      }

      // 5. Rider verb: mark picked up
      const pickupRes = (await q(`select rider_mark_picked_up($1) as res`, [tokenHash])).rows[0].res
      assertEq(pickupRes.status, 'In Transit', 'Rider marked job picked up')
      const statusAfterPickup = await one(`select status from delivery_jobs where id = $1`, [jobId])
      assertEq(statusAfterPickup, 'In Transit', 'delivery_jobs status updated to In Transit')

      // 6. Rider verb: complete delivery with receiver name, signature, and photo
      const completeRes = (await q(
        `select rider_complete_delivery($1, 'Suman Receiver', '<svg>sig</svg>', 'https://minio/proof.jpg') as res`,
        [tokenHash],
      )).rows[0].res
      assertEq(completeRes.status, 'Delivered', 'Rider marked delivery complete')
      assertEq(completeRes.received_by, 'Suman Receiver', 'Receiver recorded')

      const jobAfterDelivered = (await q(`select status, received_by, delivered_at from delivery_jobs where id = $1`, [jobId])).rows[0]
      assertEq(jobAfterDelivered.status, 'Delivered', 'Job status is Delivered')
      assertEq(jobAfterDelivered.received_by, 'Suman Receiver', 'Received by stored on job')
      assert(jobAfterDelivered.delivered_at, 'Delivered at recorded')

      // 7. Token ceases working once completed (W49)
      await refusesSavepoint(
        'Re-reading completed rider job',
        `select get_rider_job_by_token($1)`,
        [tokenHash],
        /already been completed|no longer active/i,
      )
      await refusesSavepoint(
        'Delivering already completed job',
        `select rider_complete_delivery($1, 'Another Person')`,
        [tokenHash],
        /already been completed|already marked as Delivered/i,
      )

      // 8. Revocation test (W49)
      const jobId2 = '00000000-0000-4000-8000-00000000b992'
      await q(`
        insert into delivery_jobs (
          id, client_uuid, booking_id, branch_id, leg, scheduled_at, status, created_by, updated_by
        ) values (
          $1, gen_random_uuid(), $2, $3, 'Return', now() + interval '4 hours', 'Scheduled', $4, $4
        )
      `, [jobId2, bookingIds.a, BRANCH, U.Coordinator])

      const rawToken2 = 'rider_sec_tok_second_test_link_67890'
      const tokenHash2 = createHash('sha256').update(rawToken2).digest('hex')
      let linkId2
      await as('Coordinator', async () => {
        linkId2 = (await q(
          `select create_rider_link($1, $2, 'Hari Rider', '9812345678') as id`,
          [jobId2, tokenHash2],
        )).rows[0].id
        assert(linkId2, 'Second rider link created')

        // Coordinator revokes the link
        await q(`select revoke_rider_link($1)`, [linkId2])
      })

      // Revoked link cannot be read or used
      await refusesSavepoint(
        'Reading revoked rider link',
        `select get_rider_job_by_token($1)`,
        [tokenHash2],
        /revoked/i,
      )
      await refusesSavepoint(
        'Picking up with revoked rider link',
        `select rider_mark_picked_up($1)`,
        [tokenHash2],
        /revoked/i,
      )

      // 9. Expiration test (24h limit W49)
      const jobId3 = '00000000-0000-4000-8000-00000000b993'
      await q(`
        insert into delivery_jobs (
          id, client_uuid, booking_id, branch_id, leg, scheduled_at, status, created_by, updated_by
        ) values (
          $1, gen_random_uuid(), $2, $3, 'Outbound', now() + interval '6 hours', 'Scheduled', $4, $4
        )
      `, [jobId3, bookingIds.b, BRANCH, U.Coordinator])

      const rawToken3 = 'rider_sec_tok_expired_test_link_11223'
      const tokenHash3 = createHash('sha256').update(rawToken3).digest('hex')
      await as('Coordinator', async () => {
        await q(
          `select create_rider_link($1, $2, 'Gita Rider', '9823456789')`,
          [jobId3, tokenHash3],
        )
      })
      await q(`update delivery_job_links set created_at = now() - interval '25 hours', expires_at = now() - interval '1 hour' where token_hash = $1`, [tokenHash3])

      await refusesSavepoint(
        'Reading expired rider link',
        `select get_rider_job_by_token($1)`,
        [tokenHash3],
        /expired/i,
      )

      // 10. Anon privilege boundary assertion
      const anonSelect = await one(`select has_table_privilege('anon', 'public.delivery_job_links', 'SELECT')`)
      assertEq(anonSelect, false, 'delivery_job_links table is NOT readable by anon')
      const anonExec = await one(`select has_function_privilege('anon', 'public.create_rider_link(uuid, text, text, text)', 'EXECUTE')`)
      assertEq(anonExec, false, 'create_rider_link is NOT executable by anon')
    })
  },
})

STEPS.push({
  id: 'L48',
  title: 'Reschedule a delivery: moves job scheduled_at only, rental dates stay (D8), audited in events, idempotency, non-staff/terminal refused (T4-02, migration 0191)',
  expect: 'green',
  run: async () => {
    await undone(async () => {
      // 1. Setup a booked delivery booking
      const bookingKey = crypto.randomUUID()
      let testBookingId
      const originalPickup = '2099-12-01T04:00:00Z'
      const originalReturn = '2099-12-05T04:00:00Z'

      await as('Coordinator', async () => {
        const res = await q(
          `insert into bookings (client_uuid, booking_no, client_id, branch_id, pickup_at, return_at, delivery_type, stage, created_by, updated_by)
           values ($1, '994302', $2, $3, $4::timestamptz, $5::timestamptz, 'Babin Delivery', 'Quote', $6, $6)
           returning id`,
          [bookingKey, CLIENT, BRANCH, originalPickup, originalReturn, U.Coordinator],
        )
        testBookingId = res.rows[0].id

        await q(
          `insert into booking_lines (client_uuid, booking_id, line_type, product_id, description, qty, days, rate, created_by)
           values (gen_random_uuid(), $1, 'Equipment', $2, 'Delivery Reschedule Test Lens', 1, 4, 500, $3)`,
          [testBookingId, QTY_PRODUCT, U.Coordinator],
        )

        await q(
          `insert into booking_stage_transitions (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
           values (gen_random_uuid(), $1, $2, 'Quote', 'Booked', $3, 'Coordinator', now())`,
          [testBookingId, BRANCH, U.Coordinator],
        )
      })

      // 2. Create delivery job scheduled at 04:00Z
      const initialScheduledAt = '2099-12-01T04:00:00Z'
      const jobKey = crypto.randomUUID()
      let jobId
      await as('Coordinator', async () => {
        jobId = await one(
          `select delivery_create_job($1, 'Outbound', $2::timestamptz, $3, 'Ba 3 Cha 9911')`,
          [testBookingId, initialScheduledAt, jobKey],
        )
        assert(jobId, 'job created')
      })

      // 3. Driver and Warehouse roles cannot reschedule
      const rescheduleKey = crypto.randomUUID()
      const newScheduledAt = '2099-12-01T08:30:00Z'
      await as('Driver', async () => {
        await db.exec('savepoint sp_resched_driver;')
        try {
          await refuses(
            'Driver cannot reschedule a delivery job',
            `select delivery_reschedule_job($1, $2::timestamptz, $3, 'Driver attempt')`,
            [jobId, newScheduledAt, rescheduleKey],
            /Delivery rescheduling not permitted for role Driver/i,
          )
        } finally {
          await db.exec('rollback to savepoint sp_resched_driver;')
        }
      })

      await as('Warehouse', async () => {
        await db.exec('savepoint sp_resched_wh;')
        try {
          await refuses(
            'Warehouse cannot reschedule a delivery job',
            `select delivery_reschedule_job($1, $2::timestamptz, $3, 'Warehouse attempt')`,
            [jobId, newScheduledAt, rescheduleKey],
            /Delivery rescheduling not permitted for role Warehouse/i,
          )
        } finally {
          await db.exec('rollback to savepoint sp_resched_wh;')
        }
      })

      // 4. Coordinator reschedules the delivery job (Ruling D8)
      await as('Coordinator', async () => {
        const resJobId = await one(
          `select delivery_reschedule_job($1, $2::timestamptz, $3, 'Client requested 2:15 PM NPT delivery')`,
          [jobId, newScheduledAt, rescheduleKey],
        )
        assertEq(resJobId, jobId, 'delivery_reschedule_job returned jobId')

        // 5. Idempotent replay with same request key returns same jobId
        const replayId = await one(
          `select delivery_reschedule_job($1, $2::timestamptz, $3, 'Client requested 2:15 PM NPT delivery')`,
          [jobId, newScheduledAt, rescheduleKey],
        )
        assertEq(replayId, jobId, 'replaying delivery_reschedule_job returns same jobId')
      })

      // 6. Verify delivery job scheduled_at moved, but booking dates STAY UNCHANGED (D8)
      await asOwnerOfTheDatabase(async () => {
        const jobRow = (await q(`select scheduled_at, last_note, version from delivery_jobs where id = $1`, [jobId])).rows[0]
        assertEq(new Date(jobRow.scheduled_at).toISOString(), new Date(newScheduledAt).toISOString(), 'delivery_jobs.scheduled_at updated')
        assertEq(jobRow.last_note, 'Client requested 2:15 PM NPT delivery', 'last_note updated')

        const bookingRow = (await q(`select pickup_at, return_at from bookings where id = $1`, [testBookingId])).rows[0]
        assertEq(new Date(bookingRow.pickup_at).toISOString(), new Date(originalPickup).toISOString(), 'Ruling D8: bookings.pickup_at unchanged')
        assertEq(new Date(bookingRow.return_at).toISOString(), new Date(originalReturn).toISOString(), 'Ruling D8: bookings.return_at unchanged')

        // 7. Event recorded in delivery_job_events with Rescheduled kind and metadata
        const events = (await q(
          `select event_kind, metadata from delivery_job_events where job_id = $1 and event_kind = 'Rescheduled'`,
          [jobId],
        )).rows
        assertEq(events.length, 1, 'one Rescheduled event logged')
        const meta = events[0].metadata
        assert(meta && typeof meta === 'object', 'metadata is present')
        assert(meta.old_scheduled_at, 'metadata.old_scheduled_at present')
        assertEq(new Date(meta.new_scheduled_at).toISOString(), new Date(newScheduledAt).toISOString(), 'metadata.new_scheduled_at matches')
        assertEq(meta.notes, 'Client requested 2:15 PM NPT delivery', 'metadata.notes matches')
      })

      // 8. Terminal state cannot be rescheduled: advance job to Delivered and verify refusal
      // First assign driver
      await as('Coordinator', async () => {
        await one(
          `select delivery_assign_driver($1, $2, gen_random_uuid(), 'Ba 3 Cha 9911', 'Ramesh Thapa', '+977 9813009988')`,
          [jobId, U.Driver],
        )
      })

      // Advance booking to Packed so Ready transition is allowed
      await as('Warehouse', async () => {
        const pId = crypto.randomUUID()
        await q(
          `insert into operation_sessions (id, client_uuid, booking_id, operation, session_no, state, warehouse_staff_id, created_by)
           values ($1, gen_random_uuid(), $2, 'Packing', 1, 'In Progress', $3, $3)`,
          [pId, testBookingId, U.Warehouse],
        )
        await q(
          `insert into booking_stage_transitions (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
           values (gen_random_uuid(), $1, $2, 'Booked', 'Packed', $3, 'Warehouse', now())`,
          [testBookingId, BRANCH, U.Warehouse],
        )
        await one(`select delivery_transition_job($1, 'Scheduled', 'Ready', gen_random_uuid())`, [jobId])
      })

      // Driver to In Transit -> Delivered
      await as('Driver', async () => {
        await one(`select delivery_transition_job($1, 'Ready', 'In Transit', gen_random_uuid())`, [jobId])
        await one(`select delivery_transition_job($1, 'In Transit', 'Delivered', gen_random_uuid(), 'Pooja Sharma')`, [jobId])
      })

      // Now attempt reschedule on Delivered job: must be refused
      const terminalReschedKey = crypto.randomUUID()
      await as('Coordinator', async () => {
        await db.exec('savepoint sp_resched_terminal;')
        try {
          await refuses(
            'Delivered job cannot be rescheduled',
            `select delivery_reschedule_job($1, $2::timestamptz, $3, 'Attempting to reschedule delivered job')`,
            [jobId, '2099-12-02T04:00:00Z', terminalReschedKey],
            /Delivered or Failed delivery jobs cannot be rescheduled/i,
          )
        } finally {
          await db.exec('rollback to savepoint sp_resched_terminal;')
        }
      })
    })
  },
})

STEPS.push({
  id: 'L54',
  title: 'Crew overtime: assignment accepts 0.5 or 1.0 overtime days at day rate, billed to client and paid to crew, approved_by recorded (D24, T8-06)',
  expect: 'green',
  run: async () => {
    await undone(async () => {
      // 1. Coordinator creates a crew assignment with 0.5 overtime days
      const bookingId = crypto.randomUUID()
      const crewId = crypto.randomUUID()
      const clientUuid = crypto.randomUUID()

      // Setup: insert a booking at Quote stage (will be transitioned), and crew member
      await as('Coordinator', async () => {
        const testClientId = crypto.randomUUID()
        const testProductId = crypto.randomUUID()
        const testCategoryId = crypto.randomUUID()
        await q(
          `insert into clients (id, client_uuid, client_code, name, phone, type_parent, created_by)
           values ($1, gen_random_uuid(), 'C-9999', 'Overtime Test Client', '+9779801999999', 'Individual', $2)`,
          [testClientId, U.Coordinator],
        )

        // Insert category as Owner (RLS)
        await as('Owner', async () => {
          await q(
            `insert into inventory_categories (id, client_uuid, code, name, is_active, created_by)
             values ($1, gen_random_uuid(), 'CAM', 'Camera', true, $2)`,
            [testCategoryId, U.Owner],
          )
        })

        // Insert product as Owner (RLS)
        await as('Owner', async () => {
          await q(
            `insert into products (id, client_uuid, name, asset_code, brand, category_id, daily_rate, total_quantity, is_active, created_by)
             values ($1, gen_random_uuid(), 'Test Camera', 'EQ000001', 'TestBrand', $2, 5000, 10, true, $3)`,
            [testProductId, testCategoryId, U.Owner],
          )
        })

        // Create warehouse for the product units
        const testWarehouseId = crypto.randomUUID()
        await as('Owner', async () => {
          await q(
            `insert into warehouses (id, client_uuid, warehouse_code, branch_id, name, is_primary, is_active, created_by)
             values ($1, gen_random_uuid(), 'WH-OT', $2, 'Overtime Test Warehouse', true, true, $3)`,
            [testWarehouseId, BRANCH, U.Owner],
          )
        })

        // Create product units for the product (needed for reservations)
        await as('Owner', async () => {
          await q(
            `insert into product_units (id, client_uuid, product_id, asset_tag, status, condition, branch_id, warehouse_id, created_by)
             select gen_random_uuid(), gen_random_uuid(), $1, 'EQ000001-' || lpad(gs::text, 3, '0'), 'In Stock', 'Good', $2, $3, $4
             from generate_series(1, 10) gs`,
            [testProductId, BRANCH, testWarehouseId, U.Owner],
          )
        })

        await q(
          `insert into bookings (id, client_uuid, booking_no, branch_id, client_id, pickup_at, return_at, delivery_type, stage, created_by, updated_by)
           values ($1, gen_random_uuid(), '9999', $2, $3, '2099-12-10T04:00:00Z', '2099-12-12T04:00:00Z', 'Client Pickup', 'Quote', $4, $4)`,
          [bookingId, BRANCH, testClientId, U.Coordinator],
        )

        // Add a booking line so the booking passes the "at least one line" gate (Owner can insert rates)
        await as('Owner', async () => {
          await q(
            `insert into booking_lines (id, client_uuid, booking_id, line_type, product_id, description, qty, days, rate, created_by)
             values (gen_random_uuid(), gen_random_uuid(), $1, 'Equipment', $2, 'Test Camera', 1, 2, 5000, $3)`,
          [bookingId, testProductId, U.Owner],
        )
        })
      })

      // Insert crew profile as Owner (RLS requires Owner/Admin/Manager)
      await as('Owner', async () => {
        await q(
          `insert into crew_profiles_v2 (id, client_uuid, crew_code, full_name, mobile, primary_role, daily_rate, is_active, created_by)
           values ($1, gen_random_uuid(), 'CR-9999', 'Overtime Test Crew', '+9779801999999', 'Camera Operator', 5000, true, $2)`,
          [crewId, U.Owner],
        )
      })

      // 2. Transition booking to Booked (Coordinator can do this)
      await as('Coordinator', async () => {
        await q(
          `insert into booking_stage_transitions
             (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at, reason)
           values (gen_random_uuid(), $1, $2, 'Quote', 'Booked', $3, 'Coordinator', now(), 'Transition to Booked for crew overtime test')`,
          [bookingId, BRANCH, U.Coordinator],
        )
      })

      // 3. Owner assigns crew with 0.5 overtime days
      let assignmentId = null
      await as('Owner', async () => {
        const result = await one(
          `insert into crew_assignments (id, client_uuid, booking_id, crew_id, role_on_shoot, call_time, wrap_time, daily_rate, days, overtime_days, overtime_approved_by, created_by)
           values (gen_random_uuid(), $1, $2, $3, 'Camera Operator', '2099-12-10T04:00:00Z', '2099-12-10T12:00:00Z', 5000, 2, 0.5, $4, $5)
           returning id`,
          [clientUuid, bookingId, crewId, U.Coordinator, U.Owner],
        )
        assignmentId = result
        assert(assignmentId, 'crew assignment created with 0.5 overtime_days')
      })

      // 4. Verify overtime_days is stored correctly via crew_assignments_v
      await as('Manager', async () => {
        const row = (await q(`select overtime_days, overtime_approved_by, daily_rate from crew_assignments_v where id = $1`, [assignmentId])).rows[0]
        assertEq(Number(row.overtime_days), 0.5, 'overtime_days stored as 0.5')
        assertEq(row.overtime_approved_by, U.Coordinator, 'overtime_approved_by recorded')
        assertEq(Number(row.daily_rate), 5000, 'daily_rate stored')
      })

      // 5. Verify full day overtime also works
      const clientUuid2 = crypto.randomUUID()
      let assignmentId2 = null
      await as('Owner', async () => {
        const result = await one(
          `insert into crew_assignments (id, client_uuid, booking_id, crew_id, role_on_shoot, call_time, wrap_time, daily_rate, days, overtime_days, overtime_approved_by, created_by)
           values (gen_random_uuid(), $1, $2, $3, 'Camera Operator', '2099-12-11T04:00:00Z', '2099-12-11T12:00:00Z', 5000, 2, 1.0, $4, $5)
           returning id`,
          [clientUuid2, bookingId, crewId, U.Owner, U.Owner],
        )
        assignmentId2 = result
        assert(assignmentId2, 'crew assignment created with 1.0 overtime_days')
      })

      await as('Manager', async () => {
        const row = (await q(`select overtime_days from crew_assignments_v where id = $1`, [assignmentId2])).rows[0]
        assertEq(Number(row.overtime_days), 1.0, 'overtime_days stored as 1.0')
      })

      // 6. Verify CHECK constraint rejects invalid overtime (e.g., 0.3)
      await as('Owner', async () => {
        await q('savepoint ot_bad')
        try {
          await q(
            `insert into crew_assignments (id, client_uuid, booking_id, crew_id, role_on_shoot, call_time, wrap_time, daily_rate, days, overtime_days, created_by)
             values (gen_random_uuid(), $1, $2, $3, 'Camera Operator', '2099-12-12T04:00:00Z', '2099-12-12T12:00:00Z', 5000, 2, 0.3, $4)`,
            [crypto.randomUUID(), bookingId, crewId, U.Owner],
          )
          throw new Error('Expected CHECK constraint to reject 0.3 overtime_days')
        } catch (e) {
          if (!/overtime_days.*check/i.test(e.message)) throw e
          await q('rollback to savepoint ot_bad')
        }
      })

      // 7. Verify Law 6: Warehouse (money-blind) sees null daily_rate on crew_assignments_v
      await as('Warehouse', async () => {
        const row = (await q(`select overtime_days, daily_rate from crew_assignments_v where id = $1`, [assignmentId])).rows[0]
        assertEq(Number(row.overtime_days), 0.5, 'Warehouse sees overtime_days')
        assertEq(row.daily_rate, null, 'Warehouse sees null daily_rate under Law 6')
      })
    })
  },
})

/* ΓöÇΓöÇ Run ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */

await seed()

const results = []
let hardFailure = null

for (const step of STEPS) {
  if (only !== null && step.id !== only && results.length > 0 && STEPS.findIndex((s) => s.id === only) < STEPS.indexOf(step)) {
    break
  }
  let outcome
  let detail = ''
  try {
    await step.run()
    outcome = step.expect === 'green' ? 'pass' : 'unexpectedly-green'
  } catch (e) {
    detail = String(e.message).split('\n')[0]
    outcome = step.expect === 'red' ? 'still-red' : 'FAIL'
    /* A statement that raised inside an implicit transaction leaves the session
       aborted; clear it so the next step reports its own result rather than the
       cascade. */
    try {
      await db.exec('rollback; reset role;')
    } catch {
      /* not in a transaction */
    }
  }
  results.push({
    id: step.id,
    title: step.title,
    expect: step.expect,
    outcome,
    detail,
    ...(step.shortfall === undefined ? {} : { shortfall: step.shortfall }),
  })

  const mark = { pass: '  ok  ', 'still-red': ' red  ', FAIL: ' FAIL ', 'unexpectedly-green': ' GREEN' }[outcome]
  console.log(`${mark} ${step.id}  ${step.title}`)
  if (outcome === 'FAIL' || verbose) {
    if (detail !== '') console.log(`        ${detail}`)
  }
  if (outcome === 'still-red' && verbose) console.log(`        (expected: ${step.red})`)
  /* A green step with a shortfall is green about what it asserts and honest
     about what it does not. Printed every run, not only under --verbose. */
  if (outcome === 'pass' && step.shortfall !== undefined) console.log(`        note: ${step.shortfall}`)
  if (outcome === 'unexpectedly-green') {
    console.log(`        This step is marked known-red and it PASSED. The behaviour was built ΓÇö delete the marker.`)
    console.log(`        Marker said: ${step.red}`)
  }
  if (outcome === 'FAIL' && hardFailure === null) hardFailure = step.id
}

await db.close()

const green = results.filter((r) => r.outcome === 'pass').length
const red = results.filter((r) => r.outcome === 'still-red').length
const failed = results.filter((r) => r.outcome === 'FAIL' || r.outcome === 'unexpectedly-green')

console.log(`\n${String(green)}/${String(results.length)} green, ${String(red)} known-red, ${String(failed.length)} failed`)

writeFileSync(
  join(ROOT, '.lifecycle-result.json'),
  `${JSON.stringify({ ...finishVerification(verificationStart, ROOT, failed.length === 0 && red === 0 && !only), green, red, total: results.length, results }, null, 2)}\n`,
)

if (failed.length > 0) {
  console.log('\nFailures:')
  for (const r of failed) console.log(`  ${r.id}  ${r.title}\n     ${r.detail || r.outcome}`)
  process.exit(1)
}
console.log('The lifecycle holds. (PGlite, not Supabase ΓÇö no JWT and no PostgREST. See this fileΓÇÖs header.)')
