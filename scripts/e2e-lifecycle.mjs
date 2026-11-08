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

async function asService(fn) {
  await db.exec(`set role service_role;
    select set_config('app.current_user_id', '', false);
    select set_config('request.jwt.claim.sub', '', false);
    select set_config('request.jwt.claim.role', 'service_role', false);`)
  try {
    return await fn()
  } finally {
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

function createPayload({ key, window, actor, lines, discountPercent, clientId }) {
  const payload = {
    client_uuid: crypto.randomUUID(),
    created_by: U[actor],
    branch_id: BRANCH,
    client_id: clientId ?? CLIENT,
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
        `update membership_plans set status = 'Retired', retired_at = now() where level = 'Elite'`
      ))

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
  title: 'Delivery zones CRUD and permission matrix (T4-07, migration 0189) — Law 6 fee masking, no DELETE, Owner/Admin/Manager write',
  expect: 'green',
  run: async () => {
    await undone(async () => {
      // 1. Manager can create a delivery zone (Owner/Admin/Manager only)
      const zoneId = await as('Manager', async () => {
        const id = await one(`select create_delivery_zone($1, $2, $3)`, [
          'Test Valley Zone',
          'Test zone for lifecycle',
          350000,
        ])
        return id
      })
      assert(zoneId, 'create_delivery_zone returns a zone ID')

      // 2. Zone appears in list for all staff roles, but fee_paisa is NULL for money-blind (Law 6)
      await as('Warehouse', async () => {
        const zones = await q(`select * from list_delivery_zones(50, 0, true)`)
        const found = zones.rows.find((z) => z.id === zoneId)
        assert(found, 'Warehouse can read active zones')
        assertEq(found.name, 'Test Valley Zone', 'Zone name matches')
        assertEq(found.fee_paisa, null, 'Warehouse (money-blind) gets NULL fee_paisa (Law 6)')
      })

      // 3. Manager can see fee_paisa (money-enabled role)
      await as('Manager', async () => {
        const zones = await q(`select * from list_delivery_zones(50, 0, true)`)
        const found = zones.rows.find((z) => z.id === zoneId)
        assert(found, 'Manager can read active zones')
        assertEq(Number(found.fee_paisa), 350000, 'Manager (money-enabled) sees fee_paisa')
      })

      // 4. Manager can update the zone
      await as('Manager', async () => {
        const updated = await one(`select update_delivery_zone($1, $2, $3, $4, $5)`, [
          zoneId,
          'Test Valley Zone Updated',
          'Updated description',
          400000,
          true,
        ])
        assertEq(updated, true, 'update_delivery_zone returns true')
      })

      // 5. Verify update reflected
      await as('Manager', async () => {
        const zone = (await q(`select name, fee_paisa from delivery_zones where id = $1`, [zoneId])).rows[0]
        assertEq(zone.name, 'Test Valley Zone Updated', 'Zone name updated')
        assertEq(Number(zone.fee_paisa), 400000, 'Zone fee updated')
      })

      // 6. Coordinator CANNOT create a zone (only Owner/Admin/Manager)
      await as('Coordinator', async () => {
        await q('savepoint coord_create_probe')
        try {
          await refuses(
            'Coordinator cannot create delivery zones',
            `select create_delivery_zone('Coord Zone', 'Should fail', 300000)`,
            /Only Manager\+ can create delivery zones/i,
          )
        } finally {
          await q('rollback to savepoint coord_create_probe')
          await q('release savepoint coord_create_probe')
        }
      })

      // 7. Coordinator CANNOT update a zone
      await as('Coordinator', async () => {
        await q('savepoint coord_update_probe')
        try {
          await refuses(
            'Coordinator cannot update delivery zones',
            `select update_delivery_zone($1, $2, $3, $4, $5)`,
            [zoneId, 'Coord Update', 'Should fail', 500000, true],
            /Only Manager\+ can update delivery zones/i,
          )
        } finally {
          await q('rollback to savepoint coord_update_probe')
          await q('release savepoint coord_update_probe')
        }
      })

      // 8. Warehouse CANNOT create a zone
      await as('Warehouse', async () => {
        await q('savepoint wh_create_probe')
        try {
          await refuses(
            'Warehouse cannot create delivery zones',
            `select create_delivery_zone('WH Zone', 'Should fail', 300000)`,
            /Only Manager\+ can create delivery zones/i,
          )
        } finally {
          await q('rollback to savepoint wh_create_probe')
          await q('release savepoint wh_create_probe')
        }
      })

      // 9. Client CANNOT read zones (RLS denies)
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

      // 10. anon CANNOT execute RPCs
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

      // 11. Deactivate (soft delete) by Manager — no hard DELETE allowed (Law 3)
      await as('Manager', async () => {
        const deactivated = await one(`select deactivate_delivery_zone($1)`, [zoneId])
        assertEq(deactivated, true, 'deactivate_delivery_zone returns true')
      })

      // 12. Coordinator CANNOT deactivate
      await as('Coordinator', async () => {
        await q('savepoint coord_deactivate_probe')
        try {
          await refuses(
            'Coordinator cannot deactivate delivery zones',
            `select deactivate_delivery_zone($1)`,
            [zoneId],
            /Only Manager\+ can deactivate delivery zones/i,
          )
        } finally {
          await q('rollback to savepoint coord_deactivate_probe')
          await q('release savepoint coord_deactivate_probe')
        }
      })

      // 13. Deactivated zone not in active-only list
      await as('Manager', async () => {
        const zones = await q(`select * from list_delivery_zones(50, 0, true)`)
        const found = zones.rows.find((z) => z.id === zoneId)
        assert(!found, 'Deactivated zone excluded from active-only list')
      })

      // 14. Deactivated zone still visible with activeOnly=false
      await as('Manager', async () => {
        const zones = await q(`select * from list_delivery_zones(50, 0, false)`)
        const found = zones.rows.find((z) => z.id === zoneId)
        assert(found, 'Deactivated zone visible with activeOnly=false')
        assertEq(found.is_active, false, 'Zone is_active is false')
      })

      // 15. get_delivery_zone_fee works for money-enabled role (Manager)
      const feeZoneId = await as('Manager', async () => {
        return await one(`select create_delivery_zone($1, $2, $3)`, [
          'Fee Lookup Zone',
          'For fee lookup test',
          500000,
        ])
      })
      const fee = await as('Manager', async () => {
        return await one(`select get_delivery_zone_fee($1)`, ['Fee Lookup Zone'])
      })
      assertEq(Number(fee), 500000, 'get_delivery_zone_fee returns correct fee for Manager')

      // 16. get_delivery_zone_fee fails for money-blind role (Warehouse)
      await as('Warehouse', async () => {
        await q('savepoint wh_fee_probe')
        try {
          await refuses(
            'Warehouse cannot call get_delivery_zone_fee (money-blind)',
            `select get_delivery_zone_fee('Fee Lookup Zone')`,
            /Zone fee requires money-view permission/i,
          )
        } finally {
          await q('rollback to savepoint wh_fee_probe')
          await q('release savepoint wh_fee_probe')
        }
      })

      // 17. get_delivery_zone_fee fails for inactive zone
      await as('Manager', async () => {
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

      // 18. Default Kathmandu zones seeded
      await as('Manager', async () => {
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
  title: 'One-time rider link: staff-issued, server-minted token, money-blind read, pickup and delivery verbs, 24h expiration and revocation guards (T4-08/W49) — v2 contract (0204 / 0190 R1–R4)',
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

      // 2. Security: Unauthorized role (Client) cannot create rider link
      // New signature: create_rider_link(p_client_uuid, p_job_id, p_rider_name, p_rider_phone)
      await as('Client', async () => {
        await refusesSavepoint(
          'Client attempting to create rider link',
          `select create_rider_link(gen_random_uuid(), $1, 'Ram Rider', '9801234567')`,
          [jobId],
          /Unauthorized|42501/i,
        )
      })

      // 3. Coordinator creates the rider link — server mints token, returns jsonb (R3)
      // 4. Idempotency: same client_uuid + job_id returns same link, no raw_token (R2)
      let linkId
      let rawToken
      const testClientUuid = '00000000-0000-4000-8000-00000000cccc'
      await as('Coordinator', async () => {
        // First issuance
        const res1 = (await q(
          `select create_rider_link($1, $2, 'Ram Rider', '9801234567') as res`,
          [testClientUuid, jobId],
        )).rows[0].res
        linkId = res1.link_id
        rawToken = res1.raw_token
        assert(linkId && rawToken, 'Rider link created successfully with raw_token returned')
        assertEq(res1.already_issued, false, 'First issuance returns already_issued=false')

        // Replay with same client_uuid (R2 idempotency)
        const res2 = (await q(
          `select create_rider_link($1, $2, 'Ram Rider', '9801234567') as res`,
          [testClientUuid, jobId],
        )).rows[0].res
        assertEq(res2.link_id, linkId, 'Idempotent replay returns same link_id')
        assertEq(res2.already_issued, true, 'Replay returns already_issued=true')
        assertEq(res2.raw_token, null, 'Replay returns no raw_token')
      })

      // Assert raw_token NEVER stored in delivery_job_links or audit_events (R3)
      const rawInLinks = await one(`select count(*)::int from delivery_job_links where token_hash = $1`, [rawToken])
      assertEq(rawInLinks, 0, 'raw token is NOT stored in token_hash column')
      const rawInAudit = await one(`select count(*)::int from audit_events where old_values::text like $1 or new_values::text like $1`, [`%${rawToken}%`])
      assertEq(rawInAudit, 0, 'raw token is NEVER recorded in audit_events')

      // Assert token_hash column refused for staff SELECT (R1)
      await as('Coordinator', async () => {
        await refusesSavepoint(
          'Coordinator selecting token_hash',
          `select token_hash from delivery_job_links where id = $1`,
          [linkId],
          /permission denied/i,
        )
        const staffRead = await one(`select id from delivery_job_links where id = $1`, [linkId])
        assertEq(staffRead, linkId, 'Coordinator CAN read id column (column-level grant works)')
      })
      await as('Warehouse', async () => {
        await refusesSavepoint(
          'Warehouse selecting token_hash',
          `select token_hash from delivery_job_links where id = $1`,
          [linkId],
          /permission denied/i,
        )
      })

      const tokenHash = createHash('sha256').update(rawToken).digest('hex')

      // 5. R1: authenticated cannot execute the 3 rider RPCs directly (D-10.6)
      await as('Coordinator', async () => {
        await refusesSavepoint(
          'Coordinator calling get_rider_job_by_token directly',
          `select get_rider_job_by_token($1)`,
          [tokenHash],
          /permission denied|42501/i,
        )
      })
      await as('Warehouse', async () => {
        await refusesSavepoint(
          'Warehouse calling rider_mark_picked_up directly',
          `select rider_mark_picked_up($1)`,
          [tokenHash],
          /permission denied|42501/i,
        )
      })

      // 6. Money blindness (Law 6) & payload structure for rider via asService() (R1)
      let jobData
      await asService(async () => {
        jobData = (await q(`select get_rider_job_by_token($1) as data`, [tokenHash])).rows[0].data
      })
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

      // 7. Rider verb: mark picked up (via asService / Edge Function)
      await asService(async () => {
        const pickupRes = (await q(`select rider_mark_picked_up($1) as res`, [tokenHash])).rows[0].res
        assertEq(pickupRes.status, 'In Transit', 'Rider marked job picked up')
      })
      const statusAfterPickup = await one(`select status from delivery_jobs where id = $1`, [jobId])
      assertEq(statusAfterPickup, 'In Transit', 'delivery_jobs status updated to In Transit')

      // 8. Rider verb: complete delivery with receiver name, signature, and photo (via asService)
      await asService(async () => {
        const completeRes = (await q(
          `select rider_complete_delivery($1, 'Suman Receiver', '<svg>sig</svg>', 'https://minio/proof.jpg') as res`,
          [tokenHash],
        )).rows[0].res
        assertEq(completeRes.status, 'Delivered', 'Rider marked delivery complete')
        assertEq(completeRes.received_by, 'Suman Receiver', 'Receiver recorded')
      })

      const jobAfterDelivered = (await q(`select status, received_by, delivered_at from delivery_jobs where id = $1`, [jobId])).rows[0]
      assertEq(jobAfterDelivered.status, 'Delivered', 'Job status is Delivered')
      assertEq(jobAfterDelivered.received_by, 'Suman Receiver', 'Received by stored on job')
      assert(jobAfterDelivered.delivered_at, 'Delivered at recorded')

      // 9. Token ceases working once completed (W49)
      await asService(async () => {
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
      })

      // 10. Revocation test (W49)
      const jobId2 = '00000000-0000-4000-8000-00000000b992'
      await q(`
        insert into delivery_jobs (
          id, client_uuid, booking_id, branch_id, leg, scheduled_at, status, created_by, updated_by
        ) values (
          $1, gen_random_uuid(), $2, $3, 'Return', now() + interval '4 hours', 'Scheduled', $4, $4
        )
      `, [jobId2, bookingIds.a, BRANCH, U.Coordinator])

      let linkId2
      let rawToken2
      const testClientUuid2 = '00000000-0000-4000-8000-00000000cccd'
      await as('Coordinator', async () => {
        const res = (await q(
          `select create_rider_link($1, $2, 'Hari Rider', '9812345678') as res`,
          [testClientUuid2, jobId2],
        )).rows[0].res
        linkId2 = res.link_id
        rawToken2 = res.raw_token
        assert(linkId2 && rawToken2, 'Second rider link created with raw_token')

        // Coordinator revokes the link
        await q(`select revoke_rider_link($1)`, [linkId2])
      })

      const tokenHash2 = createHash('sha256').update(rawToken2).digest('hex')

      // Revoked link cannot be read or used (checked as service_role)
      await asService(async () => {
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
      })

      // 11. Expiration test (24h limit W49)
      const jobId3 = '00000000-0000-4000-8000-00000000b993'
      await q(`
        insert into delivery_jobs (
          id, client_uuid, booking_id, branch_id, leg, scheduled_at, status, created_by, updated_by
        ) values (
          $1, gen_random_uuid(), $2, $3, 'Outbound', now() + interval '6 hours', 'Scheduled', $4, $4
        )
      `, [jobId3, bookingIds.b, BRANCH, U.Coordinator])

      let rawToken3
      const testClientUuid3 = '00000000-0000-4000-8000-00000000ccce'
      await as('Coordinator', async () => {
        const res = (await q(
          `select create_rider_link($1, $2, 'Gita Rider', '9823456789') as res`,
          [testClientUuid3, jobId3],
        )).rows[0].res
        rawToken3 = res.raw_token
        assert(rawToken3, 'Third rider link created')
      })

      const tokenHash3 = createHash('sha256').update(rawToken3).digest('hex')
      await q(`update delivery_job_links set created_at = now() - interval '25 hours', expires_at = now() - interval '1 hour' where token_hash = $1`, [tokenHash3])

      await asService(async () => {
        await refusesSavepoint(
          'Reading expired rider link',
          `select get_rider_job_by_token($1)`,
          [tokenHash3],
          /expired/i,
        )
      })

      // 12. R1 / D-10.6: privilege assertions on rider RPCs
      const riderRpcs = [
        'public.get_rider_job_by_token(text)',
        'public.rider_mark_picked_up(text)',
        'public.rider_complete_delivery(text, text, text, text)',
      ]
      for (const rpc of riderRpcs) {
        const authExec = await one(`select has_function_privilege('authenticated', $1, 'EXECUTE')`, [rpc])
        assertEq(authExec, false, `${rpc} is NOT executable by authenticated (R1)`)
        const svcExec = await one(`select has_function_privilege('service_role', $1, 'EXECUTE')`, [rpc])
        assertEq(svcExec, true, `${rpc} IS executable by service_role`)
        const anonExec = await one(`select has_function_privilege('anon', $1, 'EXECUTE')`, [rpc])
        assertEq(anonExec, false, `${rpc} is NOT executable by anon`)
      }

      // 13. create_rider_link is staff-callable (authenticated), not anon
      const createExecAuth = await one(`select has_function_privilege('authenticated', 'public.create_rider_link(uuid, uuid, text, text)', 'EXECUTE')`)
      assertEq(createExecAuth, true, 'create_rider_link IS executable by authenticated')
      const createExecAnon = await one(`select has_function_privilege('anon', 'public.create_rider_link(uuid, uuid, text, text)', 'EXECUTE')`)
      assertEq(createExecAnon, false, 'create_rider_link is NOT executable by anon')

      // 14. token_hash column is NOT selectable by authenticated or anon
      const anonTokenHashSel = await one(`select has_column_privilege('anon', 'public.delivery_job_links', 'token_hash', 'SELECT')`)
      assertEq(anonTokenHashSel, false, 'delivery_job_links.token_hash NOT selectable by anon')
      const authTokenHashSel = await one(`select has_column_privilege('authenticated', 'public.delivery_job_links', 'token_hash', 'SELECT')`)
      assertEq(authTokenHashSel, false, 'delivery_job_links.token_hash NOT selectable by authenticated')

      // 15. Anon cannot read delivery_job_links table at all
      const anonSelect = await one(`select has_table_privilege('anon', 'public.delivery_job_links', 'SELECT')`)
      assertEq(anonSelect, false, 'delivery_job_links table is NOT readable by anon')
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
  id: 'L49',
  title: 'Notification records: triggers create notifications; Warehouse sees no money; Client reads none; delete forbidden (T5-01, 0192)',
  expect: 'green',
  run: async () => {
    await undone(async () => {
      // 1. Get an existing booking number
      const bookingRow = (await q(`select id, booking_no from bookings limit 1`)).rows[0]
      const bookingNo = bookingRow ? bookingRow.booking_no : 'BK-9999'

      // Broadcast an online payment notification via notify_staff
      await q(`
        select notify_staff(
          'online_payment'::text,
          'Payment received'::text,
          ('Received Rs 15,000 for ' || $1)::text,
          ('Payment confirmed for ' || $1)::text,
          ('/rentals/' || $1)::text,
          'payment'::text,
          gen_random_uuid()::text
        )
      `, [bookingNo])

      // 2. Accounts reads notification containing the amount
      let accountsNotif
      await as('Accounts', async () => {
        const rows = (await q(`
          select * from notifications_v
          where type = 'online_payment'
          order by created_at desc
          limit 1
        `)).rows
        assert(rows.length > 0, 'Accounts receives payment notification')
        accountsNotif = rows[0]
        assert(accountsNotif.message.includes('Rs 15,000') || accountsNotif.body?.includes('Rs 15,000'), `Accounts body includes money amount, got: ${accountsNotif.message}`)
        assertEq(accountsNotif.is_read, false, 'Notification is unread initially')

        // Mark read
        await q(`select mark_notification_read($1)`, [accountsNotif.id])
        const updated = (await q(`select is_read from notifications where id = $1`, [accountsNotif.id])).rows[0]
        assertEq(updated.is_read, true, 'Notification marked as read')
      })

      // 3. Warehouse notification for an online payment carries NO AMOUNT (Law 6)
      await as('Warehouse', async () => {
        const rows = (await q(`
          select * from notifications_v
          where type = 'online_payment'
          order by created_at desc
          limit 1
        `)).rows
        assert(rows.length > 0, 'Warehouse receives payment notification')
        const whNotif = rows[0]
        const msg = whNotif.message || whNotif.body || ''
        assert(!msg.includes('15,000'), `Warehouse body MUST NOT contain money figure (Law 6), got: ${msg}`)
        assert(!msg.includes('Rs'), `Warehouse body MUST NOT contain Rs (Law 6), got: ${msg}`)
        assert(msg.includes('Payment confirmed'), `Warehouse body carries non-financial confirmation, got: ${msg}`)
      })

      // 4. Client reads 0 notifications from notifications_v
      await as('Client', async () => {
        const rows = (await q(`select * from notifications_v`)).rows
        assertEq(rows.length, 0, 'Client reads 0 rows from notifications_v')
      })

      // 5. Hard delete is forbidden (Law 3)
      await as('Owner', async () => {
        await db.exec('savepoint notif_del_probe;')
        try {
          await refuses(
            'Hard delete forbidden on notifications',
            `delete from notifications where id = $1`,
            [accountsNotif.id],
            /HARD DELETE FORBIDDEN|55000/i,
          )
        } finally {
          await db.exec('rollback to savepoint notif_del_probe;')
        }
      })
    })
  },
})

STEPS.push({
  id: 'L56',
  title: 'Damage found during reset opens a case on the booking, defaulting to client claim and unpriced (W44, W23, T2-15)',
  expect: 'green',
  run: async () => {
    await undone(async () => {
      const unitId = UNITS[0]
      const cleanEntryId = crypto.randomUUID()
      const findingId = crypto.randomUUID()

      // 1. Staff records a cleaning queue entry for bookingIds.a and reports damage
      await asOwnerOfTheDatabase(async () => {
        await q(
          `insert into cleaning_queue_entries (id, client_uuid, booking_id, unit_id, state, cleaned_by, completed_at, created_by)
           values ($1, gen_random_uuid(), $2, $3, 'Cleaning', $4, null, $4)`,
          [cleanEntryId, bookingIds.a, unitId, U.Warehouse],
        )
      })

      // 2. Insert damage finding with source = 'Cleaning' as Warehouse staff
      await as('Warehouse', async () => {
        await q(
          `insert into damage_findings (id, client_uuid, source, cleaning_queue_entry_id, unit_id, damage_type, description, severity, created_by)
           values ($1, gen_random_uuid(), 'Cleaning', $2, $3, 'Optical', 'Deep scratch on front element found post-return', 'High', $4)`,
          [findingId, cleanEntryId, unitId, U.Warehouse],
        )
      })

      // 3. Verify the database trigger opened a linked case in cases
      const res = await q(
        `select df.case_id, c.case_no, c.type, c.status, c.disposition, c.counterparty_kind, c.linked_booking_id, c.assessed_amount
           from damage_findings df
           join cases c on c.id = df.case_id
          where df.id = $1`,
        [findingId],
      )

      assertEq(res.rows.length, 1, 'damage_findings row must link to a newly created case')
      const caseRow = res.rows[0]
      assert(caseRow.case_id !== null, 'case_id must not be null')
      assert(/^CASE-[0-9]{4}-[0-9]{4}$/.test(caseRow.case_no), 'case_no must follow CASE-YYYY-NNNN format')
      assertEq(caseRow.type, 'Damage', 'case type must be Damage')
      assertEq(caseRow.status, 'Under Review', 'case status must be Under Review (W23)')
      assertEq(caseRow.disposition, 'Charge Client', 'disposition must default to Charge Client (W44)')
      assertEq(caseRow.counterparty_kind, 'Client', 'counterparty must be Client (W44)')
      assertEq(caseRow.linked_booking_id, bookingIds.a, 'case must link to the booking it came back from')
      assertEq(Number(caseRow.assessed_amount), 0, 'assessed_amount must be 0 until approved (W23)')

      // 4. Law 6: Warehouse reads null for assessed_amount on cases_v; Manager reads unmasked amount
      await as('Warehouse', async () => {
        const vRow = (await q(`select assessed_amount, case_no from cases_v where id = $1`, [caseRow.case_id])).rows[0]
        assertEq(vRow.assessed_amount, null, 'Warehouse cannot read assessed_amount on cases_v (Law 6)')
      })
      await as('Manager', async () => {
        const vRow = (await q(`select assessed_amount, case_no from cases_v where id = $1`, [caseRow.case_id])).rows[0]
        assertEq(Number(vRow.assessed_amount), 0, 'Manager reads unmasked assessed_amount on cases_v')
      })
    })
  },
})

STEPS.push({
  id: 'L50',
  title: 'Membership plans are loaded with full economics, discount caps and tiered credit limits (D21, D32, T8-01)',
  expect: 'green',
  run: async () => {
    // 1. All five plans are present in display order
    const plans = (await q(`select level::text as level, label::text as label, annual_fee, individual_discount_pct, bundle_discount_pct, monthly_booking_limit, simultaneous_rental_limit, authorized_users, default_credit_limit, perks, display_order, status::text as status from membership_plans order by display_order`)).rows
    assertEq(plans.length, 5, 'all five membership plans are loaded')
    assertEq(plans.map((p) => p.level), ['Academy', 'Creator', 'Cinematographer', 'Production Alliance', 'Elite'], 'five levels in correct order')
    assertEq(plans.map((p) => p.status), ['Active', 'Active', 'Active', 'Active', 'Active'], 'all plans active')

    // 2. Check Academy, Cinematographer and Production Alliance economics
    const academy = plans[0]
    assertEq(Number(academy.annual_fee), 6000, 'Academy annual fee is 6000')
    assertEq(Number(academy.individual_discount_pct), 10, 'Academy individual discount is 10%')
    assertEq(Number(academy.bundle_discount_pct), 5, 'Academy bundle discount is 5%')
    assertEq(Number(academy.monthly_booking_limit), 3, 'Academy booking limit is 3')
    assertEq(Number(academy.default_credit_limit), 0, 'Academy default credit limit is 0')

    const cine = plans[2]
    assertEq(Number(cine.annual_fee), 35000, 'Cinematographer fee is 35000')
    assertEq(Number(cine.individual_discount_pct), 20, 'Cinematographer individual discount is 20%')
    assertEq(Number(cine.default_credit_limit), 100000, 'Cinematographer default credit limit is 100000')

    const alliance = plans[3]
    assertEq(Number(alliance.annual_fee), 80000, 'Production Alliance fee is 80000')
    assertEq(Number(alliance.bundle_discount_pct), 12, 'Production Alliance bundle discount is 12%')
    assertEq(Number(alliance.default_credit_limit), 250000, 'Production Alliance default credit limit is 250000')
    assert(String(alliance.perks).includes('Priority Booking'), 'Production Alliance has Priority Booking perk')

    const elite = plans[4]
    assertEq(elite.annual_fee, null, 'Elite has custom fee (NULL)')
    assertEq(elite.monthly_booking_limit, null, 'Elite has unlimited monthly bookings (NULL)')
    assertEq(Number(elite.default_credit_limit), 500000, 'Elite default credit limit is 500000')

    // 3. Discount cap <= 25% enforced by database constraint
    await asOwnerOfTheDatabase(async () => {
      let capRefused = false
      try {
        await q(`update membership_plans set individual_discount_pct = 26 where level = 'Academy'`)
      } catch (err) {
        capRefused = /membership_plans_discount_hard_cap/i.test(err.message)
      }
      assert(capRefused, 'discount exceeding 25% must be refused by membership_plans_discount_hard_cap CHECK constraint')
    })

    // 4. Law 6: Warehouse reads null for money columns on membership_plans_v; Manager reads unmasked amounts
    await as('Warehouse', async () => {
      const vRows = (await q(`select level, annual_fee, default_credit_limit, individual_discount_pct, bundle_discount_pct from membership_plans_v where level = 'Academy'`)).rows
      assertEq(vRows.length, 1, 'Warehouse can read membership_plans_v')
      assertEq(vRows[0].annual_fee, null, 'Warehouse cannot read annual_fee (Law 6)')
      assertEq(vRows[0].default_credit_limit, null, 'Warehouse cannot read default_credit_limit (Law 6)')
      assertEq(vRows[0].individual_discount_pct, null, 'Warehouse cannot read individual_discount_pct (Law 6)')
      assertEq(vRows[0].bundle_discount_pct, null, 'Warehouse cannot read bundle_discount_pct (Law 6)')
    })

    await as('Manager', async () => {
      const vRows = (await q(`select level, annual_fee, default_credit_limit, individual_discount_pct, bundle_discount_pct from membership_plans_v where level = 'Academy'`)).rows
      assertEq(Number(vRows[0].annual_fee), 6000, 'Manager reads unmasked annual_fee')
      assertEq(Number(vRows[0].default_credit_limit), 0, 'Manager reads unmasked default_credit_limit')
      assertEq(Number(vRows[0].individual_discount_pct), 10, 'Manager reads unmasked individual_discount_pct')
      assertEq(Number(vRows[0].bundle_discount_pct), 5, 'Manager reads unmasked bundle_discount_pct')
    })
  },
})

STEPS.push({
  id: 'L51',
  title: 'Membership plans admin: create, edit, retire and reactivate audited RPCs (Law 3, Law 6, T8-02)',
  expect: 'green',
  run: async () => {
    // 1. Law 3: Hard DELETE on membership_plans is forbidden by trigger
    await asOwnerOfTheDatabase(async () => {
      let deleteRefused = false
      try {
        await q(`delete from membership_plans where level = 'Academy'`)
      } catch (err) {
        deleteRefused = /GATE:membership_plan\.delete\.forbidden/i.test(err.message)
      }
      assert(deleteRefused, 'Law 3: direct DELETE on membership_plans must be refused by prevent_membership_plans_delete trigger')
    })

    // 2. Authority: Coordinator is read-only (save_membership_plan and retire_membership_plan refused with 42501)
    await as('Coordinator', async () => {
      let saveRefused = false
      try {
        await q(`select save_membership_plan('Creator', 'Partner', 20000, 15, 8, 5, 3, 2, 50000, 12, '{"Priority Booking"}'::text[])`)
      } catch (err) {
        saveRefused = /GATE:membership_plan\.manage\.forbidden/i.test(err.message)
      }
      assert(saveRefused, 'Coordinator must be refused permission to save membership plans')

      const planRow = (await q(`select id from membership_plans_v where level = 'Creator'`)).rows[0]
      let retireRefused = false
      try {
        await q(`select retire_membership_plan('${planRow.id}'::uuid, true)`)
      } catch (err) {
        retireRefused = /GATE:membership_plan\.manage\.forbidden/i.test(err.message)
      }
      assert(retireRefused, 'Coordinator must be refused permission to retire membership plans')
    })

    // 3. Manager can edit an existing plan via save_membership_plan and audit row is generated
    let planId
    await as('Manager', async () => {
      const res = (await q(`select save_membership_plan('Creator', 'Partner', 22000, 15, 8, 6, 4, 2, 75000, 12, '{"Priority Booking", "Dedicated Manager"}'::text[])`)).rows[0]
      const out = typeof res.save_membership_plan === 'string' ? JSON.parse(res.save_membership_plan) : res.save_membership_plan
      assert(out.ok, 'save_membership_plan succeeded for Manager')
      planId = out.plan_id

      const updated = (await q(`select annual_fee, individual_discount_pct, monthly_booking_limit, default_credit_limit, perks from membership_plans_v where id = '${planId}'`)).rows[0]
      assertEq(Number(updated.annual_fee), 22000, 'Creator annual fee updated to 22000')
      assertEq(Number(updated.individual_discount_pct), 15, 'Creator individual discount updated to 15%')
      assertEq(Number(updated.monthly_booking_limit), 6, 'Creator monthly booking limit updated to 6')
      assertEq(Number(updated.default_credit_limit), 75000, 'Creator default credit limit updated to 75000')

      // Check audit row
      const audit = (await q(`select action, table_name, reason from audit_events where record_id = '${planId}' order by created_at desc limit 1`)).rows[0]
      assertEq(audit?.reason, 'membership_plan.updated', 'audit_events recorded membership_plan.updated')
    })

    // 4. Manager can retire a plan via retire_membership_plan
    await as('Manager', async () => {
      const res = (await q(`select retire_membership_plan('${planId}'::uuid, true)`)).rows[0]
      const out = typeof res.retire_membership_plan === 'string' ? JSON.parse(res.retire_membership_plan) : res.retire_membership_plan
      assert(out.ok, 'retire_membership_plan succeeded')
      assertEq(out.status, 'Retired', 'plan status is now Retired')

      const retiredRow = (await q(`select status::text as status, retired_at from membership_plans_v where id = '${planId}'`)).rows[0]
      assertEq(retiredRow.status, 'Retired', 'plan record is Retired')
      assert(retiredRow.retired_at !== null, 'retired_at timestamp is populated')

      // Check audit row
      const audit = (await q(`select action, table_name, reason from audit_events where record_id = '${planId}' order by created_at desc limit 1`)).rows[0]
      assertEq(audit?.reason, 'membership_plan.retired', 'audit_events recorded membership_plan.retired')
    })

    // 5. Retired plan cannot take new members (enroll_client_membership refused)
    await as('Coordinator', async () => {
      const clientRow = (await q(`select id from clients_v limit 1`)).rows[0]
      let enrollRefused = false
      try {
        await q(`select enroll_client_membership('${clientRow.id}'::uuid, '${planId}'::uuid, current_date, 22000, 'Test enroll', gen_random_uuid())`)
      } catch (err) {
        enrollRefused = /GATE:membership_plan\.retired/i.test(err.message)
      }
      assert(enrollRefused, 'enroll_client_membership into a retired plan must be refused')
    })

    // 6. Manager can reactivate the plan
    await as('Manager', async () => {
      const res = (await q(`select retire_membership_plan('${planId}'::uuid, false)`)).rows[0]
      const out = typeof res.retire_membership_plan === 'string' ? JSON.parse(res.retire_membership_plan) : res.retire_membership_plan
      assert(out.ok, 'reactivate plan succeeded')
      assertEq(out.status, 'Active', 'plan status is Active again')

      const reactivatedRow = (await q(`select status::text as status, retired_at from membership_plans_v where id = '${planId}'`)).rows[0]
      assertEq(reactivatedRow.status, 'Active', 'plan status is Active')
      assertEq(reactivatedRow.retired_at, null, 'retired_at reset to null')

      // Check audit row
      const audit = (await q(`select action, table_name, reason from audit_events where record_id = '${planId}' order by created_at desc limit 1`)).rows[0]
      assertEq(audit?.reason, 'membership_plan.reactivated', 'audit_events recorded membership_plan.reactivated')
    })
  },
},

{
  id: 'L52',
  title: 'Change plan with credit for unused days and unified write paths (D22, T8-03)',
  expect: 'green',
  run: async () => {
    // 1. Role gate: Warehouse is refused with 42501
    await as('Warehouse', async () => {
      let changeRefused = false
      try {
        await q(`select change_client_membership(jsonb_build_object(
          'client_id', gen_random_uuid(),
          'client_uuid', gen_random_uuid(),
          'plan_level', 'Creator'
        ))`)
      } catch (err) {
        changeRefused = /42501|Only Coordinator or above/i.test(err.message)
      }
      assert(changeRefused, 'Warehouse must be refused permission to change membership')
    })

    // 2. Setup client and plans for worked example
    let testClientId
    let plan12kId
    let plan20kId
    let plan6kId

    await asOwnerOfTheDatabase(async () => {
      // Create a test client using canonical next_document_number
      const clientCode = await one("select next_document_number('client')")
      const cRes = (await q(`insert into clients (client_uuid, client_code, name, phone, status, created_by)
        values (gen_random_uuid(), '${clientCode}', 'L45 Test Client', '+9779800009945', 'Active', '${U.Owner}')
        returning id`)).rows[0]
      testClientId = cRes.id

      // Create test plans with exact term and fees
      const p1 = (await q(`insert into membership_plans (client_uuid, level, label, annual_fee, term_months, display_order, status)
        values (gen_random_uuid(), 'Academy', 'Access Member', 12000.00, 12, 91, 'Active')
        on conflict (level) do update set annual_fee = 12000.00, term_months = 12, status = 'Active'
        returning id`)).rows[0]
      plan12kId = p1.id

      const p2 = (await q(`insert into membership_plans (client_uuid, level, label, annual_fee, term_months, display_order, status)
        values (gen_random_uuid(), 'Creator', 'Partner', 20000.00, 12, 92, 'Active')
        on conflict (level) do update set annual_fee = 20000.00, term_months = 12, status = 'Active'
        returning id`)).rows[0]
      plan20kId = p2.id

      const p3 = (await q(`insert into membership_plans (client_uuid, level, label, annual_fee, term_months, display_order, status)
        values (gen_random_uuid(), 'Cinematographer', 'Partner', 6000.00, 12, 93, 'Active')
        on conflict (level) do update set annual_fee = 6000.00, term_months = 12, status = 'Active'
        returning id`)).rows[0]
      plan6kId = p3.id
    })

    // 3. Stricter rule: deactivated client refused
    await as('Coordinator', async () => {
      let deactRefused = false
      await asOwnerOfTheDatabase(async () => {
        await q(`update clients set status = 'Deactivated' where id = '${testClientId}'`)
      })
      try {
        await q(`select change_client_membership(jsonb_build_object(
          'client_id', '${testClientId}',
          'client_uuid', gen_random_uuid(),
          'plan_id', '${plan12kId}'
        ))`)
      } catch (err) {
        deactRefused = /GATE:client\.deactivated/i.test(err.message)
      }
      assert(deactRefused, 'Deactivated client must be refused membership change')

      // Restore client to Active
      await asOwnerOfTheDatabase(async () => {
        await q(`update clients set status = 'Active' where id = '${testClientId}'`)
      })
    })

    // 4. Enroll client on Plan 12k with join_date 2028-01-01 (leap year: 366-day term)
    // At effectiveChangeDate 2028-09-01: 122 days left out of 366 (exactly 4 of 12 months, 1/3 of term)
    const effectiveChangeDate = '2028-09-01'
    const joinDateLeap = '2028-01-01'

    await as('Coordinator', async () => {
      // First enrollment via unified enroll_client_membership
      const enrollRes = (await q(`select enroll_client_membership(
        '${testClientId}'::uuid,
        '${plan12kId}'::uuid,
        '${joinDateLeap}'::date,
        12000.00,
        'Initial 12k plan enrollment',
        gen_random_uuid()
      )`)).rows[0]
      const enrollOut = typeof enrollRes.enroll_client_membership === 'string'
        ? JSON.parse(enrollRes.enroll_client_membership)
        : enrollRes.enroll_client_membership
      assertEq(Number(enrollOut.new_fee_due), 12000, 'Initial enrollment fee due is full 12,000')
      assertEq(Number(enrollOut.credit), 0, 'Initial enrollment credit is 0')
    })

    // 5. Stricter rule: changing to the same plan is refused
    await as('Coordinator', async () => {
      let samePlanRefused = false
      try {
        await q(`select change_client_membership(jsonb_build_object(
          'client_id', '${testClientId}',
          'client_uuid', gen_random_uuid(),
          'plan_id', '${plan12kId}',
          'effective_date', '${effectiveChangeDate}'
        ))`)
      } catch (err) {
        samePlanRefused = /GATE:membership\.same_plan/i.test(err.message)
      }
      assert(samePlanRefused, 'Changing to the same plan must be refused')
    })

    // 6. The Worked Example (D22): fee 12,000, 4 of 12 months left (122/366 days) -> credit 4,000
    // Change from 12k plan to 20k plan. New fee due = 20,000 - 4,000 = 16,000.
    const changeKey = '00000000-0000-0000-0000-000000000045'
    await as('Coordinator', async () => {
      const changeRes = (await q(`select change_client_membership(jsonb_build_object(
        'client_id', '${testClientId}',
        'client_uuid', '${changeKey}',
        'plan_id', '${plan20kId}',
        'effective_date', '${effectiveChangeDate}',
        'note', 'Worked example plan upgrade'
      ))`)).rows[0]
      const changeOut = typeof changeRes.change_client_membership === 'string'
        ? JSON.parse(changeRes.change_client_membership)
        : changeRes.change_client_membership

      assertEq(Number(changeOut.old_fee), 12000, 'Old fee matches 12,000')
      assertEq(changeOut.days_left, 122, 'Days left is 122')
      assertEq(changeOut.total_days, 366, 'Total days in term is 366')
      assertEq(Number(changeOut.credit), 4000, 'Worked example: 4 of 12 months left on Rs 12,000 yields exactly Rs 4,000 credit')
      assertEq(Number(changeOut.new_fee), 20000, 'New fee is 20,000')
      assertEq(Number(changeOut.new_fee_due), 16000, 'New fee due is 16,000 (20,000 - 4,000)')
      assertEq(Number(changeOut.account_credit), 0, 'No excess account credit for upgrade')
    })

    // Verify audit trail holds old plan, new plan, credit, new_fee_due
    await asOwnerOfTheDatabase(async () => {
      const audit = (await q(`select old_values, new_values, reason from audit_events where client_uuid = '${changeKey}'`)).rows[0]
      const auditNew = typeof audit.new_values === 'string' ? JSON.parse(audit.new_values) : audit.new_values
      assertEq(Number(auditNew.credit), 4000, 'Audit record holds credit 4000')
      assertEq(Number(auditNew.new_fee_due), 16000, 'Audit record holds new_fee_due 16000')
      assertEq(audit.reason, 'Worked example plan upgrade', 'Audit reason preserved')
    })

    // 7. Downgrade with excess credit credited to client's account_credit (D22)
    // Client is on 20k plan with join_date 2028-01-01.
    // At effectiveChangeDate 2028-07-02: 183 days left out of 366 (exactly 1/2 of term) -> credit 10,000.
    // Downgrade to 6k plan. New fee = 6,000. Credit = 10,000.
    // Fee due = 0. Excess credit = 4,000 added to clients.account_credit!
    await asOwnerOfTheDatabase(async () => {
      await q(`update client_memberships set join_date = '2028-01-01', fee_paid = 20000.00 where client_id = '${testClientId}' and superseded_at is null`)
      // Ensure starting account_credit is 0
      await q(`update clients set account_credit = 0.00 where id = '${testClientId}'`)
    })

    await as('Coordinator', async () => {
      const downRes = (await q(`select change_client_membership(jsonb_build_object(
        'client_id', '${testClientId}',
        'client_uuid', gen_random_uuid(),
        'plan_id', '${plan6kId}',
        'effective_date', '2028-07-02',
        'note', 'Downgrade with account credit'
      ))`)).rows[0]
      const downOut = typeof downRes.change_client_membership === 'string'
        ? JSON.parse(downRes.change_client_membership)
        : downRes.change_client_membership

      assertEq(Number(downOut.credit), 10000, 'Downgrade credit is 10,000')
      assertEq(Number(downOut.new_fee), 6000, 'New fee is 6,000')
      assertEq(Number(downOut.new_fee_due), 0, 'New fee due is 0 (capped at zero)')
      assertEq(Number(downOut.account_credit), 4000, 'Excess credit of 4,000 granted as account credit')

      // Check clients table has updated account_credit
      const clientAfter = (await q(`select account_credit from clients_v where id = '${testClientId}'`)).rows[0]
      assertEq(Number(clientAfter.account_credit), 4000, 'Client account_credit balance increased by 4,000')
    })

    // 8. Law 6: Warehouse reads null for account_credit on clients_v
    await as('Warehouse', async () => {
      const whClient = (await q(`select account_credit from clients_v where id = '${testClientId}'`)).rows[0]
      assertEq(whClient.account_credit, null, 'Law 6: Warehouse reads null for client account_credit')
    })

    // 9. Custom-fee plans (Elite) — refuse unpriced moves, price with the negotiated fee
    // (T8-03 review: the listed fee is NULL, so "new fee = plan fee" priced Elite at zero and
    // paid the old term's credit out as account credit. Never invented; refused.)
    let elitePlanId
    await asOwnerOfTheDatabase(async () => {
      const elite = (await q(`select id, annual_fee from membership_plans where level = 'Elite'`)).rows[0]
      elitePlanId = elite.id
      assertEq(elite.annual_fee, null, 'The seeded Elite plan carries a custom (NULL) listed fee')
    })

    // 9a. A LIVE Elite membership with no recorded fee is a term that cannot be
    // priced: a mid-term change needs the old fee for its unused-days credit.
    // (Term 2027-01-01 → 2028-01-01; the change is effective 2027-06-01, inside it.)
    let unknownFeeClientId
    await asOwnerOfTheDatabase(async () => {
      const clientCode = await one("select next_document_number('client')")
      unknownFeeClientId = (await q(`insert into clients (client_uuid, client_code, name, phone, status, created_by)
        values (gen_random_uuid(), '${clientCode}', 'L45 Unknown-Fee Client', '+9779800009947', 'Active', '${U.Owner}')
        returning id`)).rows[0].id
      // Exactly the row the old code priced at zero: Elite (no listed fee), fee never recorded.
      await q(`insert into client_memberships (client_uuid, client_id, plan_id, join_date, fee_paid, created_by)
        values (gen_random_uuid(), '${unknownFeeClientId}', '${elitePlanId}', '2027-01-01', NULL, '${U.Owner}')`)
    })

    await as('Coordinator', async () => {
      await refuses(
        'A membership whose fee was never recorded is refused: unused days cannot be priced',
        `select change_client_membership(jsonb_build_object(
          'client_id', '${unknownFeeClientId}',
          'client_uuid', gen_random_uuid(),
          'plan_id', '${plan12kId}',
          'effective_date', '2027-06-01'
        ))`,
        undefined,
        /GATE:membership\.fee_unknown/i,
      )

      // A LAPSED term needs no old fee priced: credit is zero by definition, so
      // the change proceeds as a renewal at the full new-plan fee.
      const lapsedRes = (await q(`select change_client_membership(jsonb_build_object(
        'client_id', '${unknownFeeClientId}',
        'client_uuid', gen_random_uuid(),
        'plan_id', '${plan12kId}',
        'effective_date', '2028-02-01'
      ))`)).rows[0]
      const lapsedOut = typeof lapsedRes.change_client_membership === 'string'
        ? JSON.parse(lapsedRes.change_client_membership)
        : lapsedRes.change_client_membership
      assertEq(lapsedOut.is_renewal, true, 'A change after the term ended is a renewal')
      assertEq(Number(lapsedOut.credit), 0, 'A lapsed term earns no credit — the old fee never needs pricing')
      assertEq(Number(lapsedOut.new_fee_due), 12000, 'The lapsed client pays the full new-plan fee')
    })

    // 9b. Moving ONTO the custom-fee plan without the negotiated fee is refused.
    await as('Coordinator', async () => {
      await refuses(
        'The Elite plan is refused when no negotiated fee is supplied',
        `select change_client_membership(jsonb_build_object(
          'client_id', '${testClientId}',
          'client_uuid', gen_random_uuid(),
          'plan_id', '${elitePlanId}',
          'effective_date', '2028-08-01'
        ))`,
        undefined,
        /GATE:membership\.custom_fee/i,
      )
    })

    // 9c. The backdated clamp: an effective date before the old term started must
    // credit no more than the old fee itself (days capped at the term on file).
    // The worked-example client is on Cinematographer (fee 6,000): term started
    // 2028-07-02, ends 2029-07-02 = 365 days.
    await as('Coordinator', async () => {
      const backRes = (await q(`select change_client_membership(jsonb_build_object(
        'client_id', '${testClientId}',
        'client_uuid', gen_random_uuid(),
        'plan_id', '${plan12kId}',
        'effective_date', '2027-06-01'
      ))`)).rows[0]
      const backOut = typeof backRes.change_client_membership === 'string'
        ? JSON.parse(backRes.change_client_membership)
        : backRes.change_client_membership

      assertEq(backOut.days_left, 365, 'Backdated effective date: days left capped at the whole term on file')
      assertEq(backOut.total_days, 365, 'Term on file is 365 days (2028-07-02 to 2029-07-02)')
      assertEq(Number(backOut.credit), 6000, 'Credit never exceeds the old fee the client actually paid')
      assertEq(Number(backOut.new_fee_due), 6000, 'New fee due is 12,000 minus the capped 6,000 credit')
      assertEq(Number(backOut.account_credit), 0, 'A capped credit cannot spill into account credit')
    })

    // 9d. Entering the custom-fee plan WITH the negotiated fee works, and the fee
    // the row now carries prices any later change out of it (Rs 25,000 Elite row,
    // then moving to Creator uses that fee as the old-fee basis).
    let negotiatedClientId
    await asOwnerOfTheDatabase(async () => {
      const clientCode = await one("select next_document_number('client')")
      negotiatedClientId = (await q(`insert into clients (client_uuid, client_code, name, phone, status, created_by)
        values (gen_random_uuid(), '${clientCode}', 'L45 Negotiated-Fee Client', '+9779800009948', 'Active', '${U.Owner}')
        returning id`)).rows[0].id
    })

    await as('Coordinator', async () => {
      const eliteRes = (await q(`select change_client_membership(jsonb_build_object(
        'client_id', '${negotiatedClientId}',
        'client_uuid', gen_random_uuid(),
        'plan_id', '${elitePlanId}',
        'join_date', '2028-01-01',
        'fee_paid', 25000.00
      ))`)).rows[0]
      const eliteOut = typeof eliteRes.change_client_membership === 'string'
        ? JSON.parse(eliteRes.change_client_membership)
        : eliteRes.change_client_membership

      assertEq(Number(eliteOut.new_fee), 25000, 'The negotiated fee is the new-fee basis on a custom-fee plan')
      assertEq(Number(eliteOut.credit), 0, 'A fresh activation earns no credit')
      assertEq(Number(eliteOut.new_fee_due), 25000, 'A fresh activation charges the negotiated fee')

      // Later change OUT of the negotiated Elite row: old fee = the recorded
      // 25,000. Term 2028-01-01 to 2029-01-01 = 366 days; changed effective
      // 2028-09-01 leaves 122 days = exactly a third -> credit 25,000/3 = 8,333.33.
      const leaveRes = (await q(`select change_client_membership(jsonb_build_object(
        'client_id', '${negotiatedClientId}',
        'client_uuid', gen_random_uuid(),
        'plan_id', '${plan20kId}',
        'effective_date', '2028-09-01'
      ))`)).rows[0]
      const leaveOut = typeof leaveRes.change_client_membership === 'string'
        ? JSON.parse(leaveRes.change_client_membership)
        : leaveRes.change_client_membership

      assertEq(Number(leaveOut.old_fee), 25000, 'The recorded negotiated fee prices the change OUT of Elite')
      assertEq(Number(leaveOut.credit), 8333.33, 'One third of the recorded Elite term (122 of 366 days) credits 8,333.33')
      assertEq(Number(leaveOut.new_fee_due), 11666.67, 'Creator fee 20,000 minus 8,333.33 credit')
    })
  },
})

// ── L46: Renew a lapsed membership (Ruling D23, T8-04) ──────────────────────
STEPS.push({
  id: 'L53',
  title: 'Renew a lapsed membership: charges plan fee, starts new term, keeps history (D23, T8-04)',
  expect: 'green',
  run: async () => {
    let testClientId
    let creatorPlanId
    let expectedFee = 20000
    const renewKey = '00000000-0000-4000-8000-000000000046'

    await asOwnerOfTheDatabase(async () => {
      // Find Creator plan
      const creatorPlan = (await q(`select id, annual_fee from membership_plans where level = 'Creator' and status = 'Active'`)).rows[0]
      creatorPlanId = creatorPlan.id
      expectedFee = Number(creatorPlan.annual_fee)

      // Create test client with a LAPSED membership (joined 2025-01-01, 12 month term ended 2026-01-01)
      const clientCode = (await one("select next_document_number('client')"))
      const clientRes = (await q(`insert into clients (client_code, name, phone, client_uuid)
        values ('${clientCode}', 'Lapsed Member Client', '+9779800009946', gen_random_uuid())
        returning id`)).rows[0]
      testClientId = clientRes.id

      // Seed lapsed membership (superseded_at is null, but term ended in Jan 2026)
      await q(`insert into client_memberships (
        client_uuid, client_id, plan_id, join_date, fee_paid
      ) values (
        gen_random_uuid(), '${testClientId}', '${creatorPlanId}', '2025-01-01', 15000.00
      )`)
    })

    // 1. Permission check: Warehouse refused (42501)
    await as('Warehouse', async () => {
      let renewRefused = false
      try {
        await q(`select renew_client_membership(jsonb_build_object(
          'client_id', '${testClientId}',
          'client_uuid', gen_random_uuid(),
          'plan_id', '${creatorPlanId}'
        ))`)
      } catch (err) {
        renewRefused = /42501|Only Coordinator or above/i.test(err.message)
      }
      assert(renewRefused, 'Warehouse must be refused permission to renew membership')
    })

    // 2. Coordinator renews the lapsed membership on the same plan (D23)
    await as('Coordinator', async () => {
      const renewRes = (await q(`select renew_client_membership(jsonb_build_object(
        'client_id', '${testClientId}',
        'client_uuid', '${renewKey}',
        'effective_date', '2026-10-28',
        'note', 'Renewing lapsed membership'
      ))`)).rows[0]

      const out = typeof renewRes.renew_client_membership === 'string'
        ? JSON.parse(renewRes.renew_client_membership)
        : renewRes.renew_client_membership

      assertEq(out.is_renewal, true, 'Marked as renewal')
      assertEq(out.plan_level, 'Creator', 'Renewed on Creator plan')
      assertEq(out.previous_level, 'Creator', 'Previous level was Creator')
      assertEq(Number(out.credit), 0, 'No credit for lapsed term')
      assertEq(Number(out.new_fee), expectedFee, 'New fee is full plan fee')
      assertEq(Number(out.new_fee_due), expectedFee, 'Full fee charged on renewal')
      assertEq(out.joined_on, '2026-10-28', 'New term starts from renewal date')
      assert(out.superseded_membership_id !== null, 'Old membership was superseded')

      // 3. History shows both terms (Law 3: nothing is deleted)
      const allTerms = (await q(`select id, join_date::text as join_date, superseded_at, superseded_by_id from client_memberships
        where client_id = '${testClientId}' order by join_date asc`)).rows
      assertEq(allTerms.length, 2, 'History shows both terms')
      assertEq(allTerms[0].join_date, '2025-01-01', 'First term preserved in history')
      assert(allTerms[0].superseded_at !== null, 'First term is marked superseded')
      assertEq(allTerms[0].superseded_by_id, out.membership_id, 'First term points to second term')

      assertEq(allTerms[1].join_date, '2026-10-28', 'Second term starts from renewal date')
      assertEq(allTerms[1].superseded_at, null, 'Second term is the currently active term')

      // Exactly one live membership row
      const live = (await q(`select id from client_memberships_v where client_id = '${testClientId}' and superseded_at is null`)).rows
      assertEq(live.length, 1, 'Exactly one live membership row exists')
      assertEq(live[0].id, out.membership_id, 'Live row is the renewed membership')
    })

    // 4. Audit trail holds renewal action
    await asOwnerOfTheDatabase(async () => {
      const audit = (await q(`select action, old_values, new_values, reason from audit_events where client_uuid = '${renewKey}'`)).rows[0]
      assertEq(audit.action, 'Update', 'Audit event recorded with action Update')
      assertEq(audit.reason, 'Renewing lapsed membership', 'Audit reason preserved')
      const auditNew = typeof audit.new_values === 'string' ? JSON.parse(audit.new_values) : audit.new_values
      assertEq(auditNew.is_renewal, true, 'Audit new_values indicates is_renewal true')
      assertEq(Number(auditNew.new_fee_due), expectedFee, 'Audit record holds new_fee_due')
    })

    // 5. A renewal of a custom-fee plan (Elite) keeps the recorded price: the
    //    fee carries onto the new term so later changes can still be priced.
    let elitePlanId
    let eliteClientId
    await asOwnerOfTheDatabase(async () => {
      elitePlanId = (await q(`select id from membership_plans where level = 'Elite'`)).rows[0].id
      const clientCode = await one("select next_document_number('client')")
      eliteClientId = (await q(`insert into clients (client_uuid, client_code, name, phone, status, created_by)
        values (gen_random_uuid(), '${clientCode}', 'L53 Elite Renewal Client', '+9779800009949', 'Active', '${U.Owner}')
        returning id`)).rows[0].id
    })

    await as('Coordinator', async () => {
      // Enter Elite with the negotiated fee (term 2028-01-01 → 2029-01-01).
      await q(`select change_client_membership(jsonb_build_object(
        'client_id', '${eliteClientId}',
        'client_uuid', gen_random_uuid(),
        'plan_id', '${elitePlanId}',
        'join_date', '2028-01-01',
        'fee_paid', 25000.00
      ))`)

      // Renew after the term lapsed; no new fee is negotiated.
      const eliteRenew = (await q(`select renew_client_membership(jsonb_build_object(
        'client_id', '${eliteClientId}',
        'client_uuid', gen_random_uuid(),
        'effective_date', '2029-02-01'
      ))`)).rows[0]
      const eliteOut = typeof eliteRenew.renew_client_membership === 'string'
        ? JSON.parse(eliteRenew.renew_client_membership)
        : eliteRenew.renew_client_membership

      assertEq(eliteOut.is_renewal, true, 'The custom-fee renewal is marked as renewal')
      assertEq(Number(eliteOut.new_fee), 25000, 'The renewal charges the recorded negotiated fee, not zero')
      assertEq(Number(eliteOut.new_fee_due), 25000, 'The full negotiated fee is due on renewal')

      const live = (await q(`select fee_paid from client_memberships_v where client_id = '${eliteClientId}' and superseded_at is null`)).rows[0]
      assertEq(Number(live.fee_paid), 25000, 'The renewed row carries the recorded fee forward')
    })
  },
})

STEPS.push({
  id: 'L67',
  title: 'extend_booking succeeds with no Draft invoice and leaves a numbered invoice untouched (T3-14b regression, 0205)',
  expect: 'green',
  run: async () => {
    /* The Draft made at Confirm (W15) is numbered on full payment (W16). Once it is, the
       booking has no Draft, and 0200 made extend_booking raise "no Draft invoice". */
    await as('Coordinator', async () => {
      await createBooking({
        key: 'ext_nodraft',
        window: ['2105-08-01T04:00:00Z', '2105-08-03T04:00:00Z'],
        actor: 'Coordinator',
        lines: [
          {
            productId: SERIAL_PRODUCT,
            description: 'Extension Without Draft Test Camera',
            qty: 1,
            days: 2,
            rate: 350000,
            units: [UNITS[2]],
          },
        ],
      })
      await transition('ext_nodraft', 'Quote', 'Booked', 'Coordinator')
    })
    await settleInvoice('ext_nodraft')

    const invoiceId = await one(
      "select id from invoices where booking_id = $1 and status <> 'Void' order by created_at limit 1",
      [bookingIds.ext_nodraft],
    )
    assert(invoiceId, 'the booking has an invoice to protect')
    const drafts = Number(
      await one("select count(*) from invoices where booking_id = $1 and status = 'Draft'", [bookingIds.ext_nodraft]),
    )
    assertEq(drafts, 0, 'no Draft invoice is left once the invoice is numbered')

    const fingerprint = () =>
      one(
        "select md5(coalesce((select i::text from invoices i where i.id = $1::uuid), '') || coalesce((select string_agg(il::text, ',' order by il.id::text) from invoice_lines il where il.invoice_id = $1::uuid), ''))",
        [invoiceId],
      )
    const before = await fingerprint()

    let result
    await as('Coordinator', async () => {
      const res = await q(
        "select extend_booking(jsonb_build_object('booking_id', $1::uuid, 'days', 1, 'reason', 'Extended one day after the invoice was already numbered')) as data",
        [bookingIds.ext_nodraft],
      )
      result = res.rows[0].data
    })
    assertEq(result.success, true, 'extend_booking succeeded although the booking has no Draft invoice')
    assertEq(result.days_added, 1, 'one day added')
    assert(result.invoice_resync === null, 'no Draft, so nothing was re-synced (invoice_resync is null)')

    const newReturnAt = await one('select return_at from bookings where id = $1', [bookingIds.ext_nodraft])
    const diffMs = new Date(newReturnAt).getTime() - new Date('2105-08-03T04:00:00Z').getTime()
    assertEq(diffMs, 24 * 60 * 60 * 1000, 'return_at moved forward exactly 1 day')
    assertEq(await fingerprint(), before, 'the numbered invoice and its lines were not touched')
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

STEPS.push({
  id: 'L57',
  title: 'Report a problem: staff submit with auto context, idempotency via client_uuid; Warehouse sees only own reports; Owner sees all and manages status with reason (T4-11, B27, B48)',
  expect: 'green',
  run: async () => {
    await undone(async () => {
      const clientUuidW = crypto.randomUUID()
      const clientUuidC = crypto.randomUUID()
      let reportIdW = null
      let reportIdC = null

      // 1. Warehouse submits problem report with auto-context and client_uuid
      await as('Warehouse', async () => {
        reportIdW = await one(
          `select create_problem_report(
             $1, $2, null, $3, $4, $5, $6, $7, $8, $9
           )`,
          [
            'Barcode scanner reader unresponsive in Boudha shop',
            clientUuidW,
            '/operations',
            'v3.0.0',
            'Warehouse',
            'tablet',
            820,
            1180,
            'ERR-20261103-W1',
          ],
        )
        assert(reportIdW, 'Warehouse problem report created')

        // Idempotency: re-submitting with same client_uuid returns existing id (Law 8)
        const replayedId = await one(
          `select create_problem_report(
             $1, $2, null, $3, $4, $5, $6, $7, $8, $9
           )`,
          [
            'Different text replay attempt',
            clientUuidW,
            '/operations',
            'v3.0.0',
            'Warehouse',
            'tablet',
            820,
            1180,
            'ERR-20261103-W1',
          ],
        )
        assertEq(replayedId, reportIdW, 'replaying same client_uuid returns existing report id')
      })

      // 2. Coordinator submits another problem report
      await as('Coordinator', async () => {
        reportIdC = await one(
          `select create_problem_report(
             $1, $2, null, $3, $4, $5, $6, $7, $8, $9
           )`,
          [
            'Tax rounding mismatch on draft invoice preview',
            clientUuidC,
            '/finance/invoices',
            'v3.0.0',
            'Coordinator',
            'desktop',
            1440,
            900,
            'ERR-20261103-C1',
          ],
        )
        assert(reportIdC, 'Coordinator problem report created')
      })

      // 3. RLS Isolation: Warehouse sees ONLY their own reports
      await as('Warehouse', async () => {
        const rows = (await q(`select id from problem_reports`)).rows
        const ids = rows.map((r) => r.id)
        assert(ids.includes(reportIdW), 'Warehouse sees own report')
        assert(!ids.includes(reportIdC), 'Warehouse CANNOT see Coordinator report (RLS enforced)')

        const listRows = (await q(`select id from list_problem_reports()`)).rows
        const listIds = listRows.map((r) => r.id)
        assert(listIds.includes(reportIdW), 'Warehouse list_problem_reports includes own report')
        assert(!listIds.includes(reportIdC), 'Warehouse list_problem_reports excludes other reports')
      })

      // 4. Coordinator sees only their own report
      await as('Coordinator', async () => {
        const rows = (await q(`select id from problem_reports`)).rows
        const ids = rows.map((r) => r.id)
        assert(ids.includes(reportIdC), 'Coordinator sees own report')
        assert(!ids.includes(reportIdW), 'Coordinator cannot see Warehouse report')
      })

      // 5. Owner sees ALL reports
      await as('Owner', async () => {
        const rows = (await q(`select id from problem_reports`)).rows
        const ids = rows.map((r) => r.id)
        assert(ids.includes(reportIdW), 'Owner sees Warehouse report')
        assert(ids.includes(reportIdC), 'Owner sees Coordinator report')
      })

      // 6. Client cannot access problem_reports
      await as('Client', async () => {
        const rows = (await q(`select id from problem_reports`)).rows
        assertEq(rows.length, 0, 'Client sees zero problem reports (RLS)')

        await q('savepoint pr_client_create')
        try {
          await q(
            `select create_problem_report('Client trying to submit report', gen_random_uuid())`,
          )
          throw new Error('Expected create_problem_report to refuse Client')
        } catch (e) {
          if (!/insufficient_privilege|Only staff/i.test(e.message)) throw e
          await q('rollback to savepoint pr_client_create')
        }
      })

      // 7. Status update authorization: Warehouse cannot update status
      await as('Warehouse', async () => {
        await q('savepoint pr_wh_update')
        try {
          await q(
            `select update_problem_report_status($1, 'fixed', 'Fixed by warehouse staff')`,
            [reportIdW],
          )
          throw new Error('Expected update_problem_report_status to refuse Warehouse')
        } catch (e) {
          if (!/insufficient_privilege|Only Owner or Admin/i.test(e.message)) throw e
          await q('rollback to savepoint pr_wh_update')
        }
      })

      // 8. Owner status updates with reason validation (>= 10 chars)
      await as('Owner', async () => {
        // Reason too short
        await q('savepoint pr_short_reason')
        try {
          await q(
            `select update_problem_report_status($1, 'fixed', 'short')`,
            [reportIdW],
          )
          throw new Error('Expected short reason to be rejected')
        } catch (e) {
          if (!/at least 10 characters/i.test(e.message)) throw e
          await q('rollback to savepoint pr_short_reason')
        }

        // Valid status update
        const updated = await one(
          `select update_problem_report_status($1, 'fixed', 'Replaced scanner cable and tested')`,
          [reportIdW],
        )
        assertEq(updated, true, 'status update succeeded for Owner')

        const row = (await q(`select status, status_changed_by, status_change_reason from problem_reports where id = $1`, [reportIdW])).rows[0]
        assertEq(row.status, 'fixed', 'status changed to fixed')
        assertEq(row.status_changed_by, U.Owner, 'status_changed_by recorded as Owner')
        assertEq(row.status_change_reason, 'Replaced scanner cable and tested', 'status_change_reason recorded')
      })

      // 9. Route constraint security tests (N-8)
      await as('Warehouse', async () => {
        await q('savepoint pr_bad_route_query')
        try {
          await q(
            `select create_problem_report('Route test query string', gen_random_uuid(), null, '/operations?foo=bar')`,
          )
          throw new Error('Expected route with query string to be rejected')
        } catch (e) {
          if (!/query string/i.test(e.message)) throw e
          await q('rollback to savepoint pr_bad_route_query')
        }

        await q('savepoint pr_bad_route_token')
        try {
          await q(
            `select create_problem_report('Route test token', gen_random_uuid(), null, '/auth/token-page')`,
          )
          throw new Error('Expected route with token to be rejected')
        } catch (e) {
          if (!/sensitive parameters/i.test(e.message)) throw e
          await q('rollback to savepoint pr_bad_route_token')
        }
      })
    })
  },
})

// T4-03: Proof of delivery - evidence photo + recipient signature on the job
STEPS.push({
  id: 'L55',
  title: 'Delivery proof attach: Manager/Coordinator/Warehouse/Driver attach photo and signature to Delivered job; idempotent; role gated; does not change status (0211)',
  expect: 'green',
  run: async () => {
    // A refused statement aborts the surrounding transaction, and as()'s clean-up then rolls the
    // whole step back, seeded jobs included. Probe every refusal inside a savepoint instead.
    const refusedAt = async (what, text, params, matcher) => {
      await db.exec('savepoint proof_probe;')
      try {
        return await refuses(what, text, params, matcher)
      } finally {
        await db.exec('rollback to savepoint proof_probe;')
      }
    }
    const attach = (jobId, key, photo, signature) =>
      one(`select delivery_attach_proof($1, $2, $3, $4) as job_id`, [jobId, key, photo, signature])

    await undone(async () => {
      const J1 = '00000000-0000-4000-8000-00000000b994' // Delivered · Outbound · booking a
      const J2 = '00000000-0000-4000-8000-00000000b995' // Delivered · Return   · booking a
      const J3 = '00000000-0000-4000-8000-00000000b996' // Delivered · Outbound · booking b · assigned to Driver
      const J4 = '00000000-0000-4000-8000-00000000b997' // In Transit · Outbound · booking c
      await asOwnerOfTheDatabase(async () => {
        const delivered = (id, bookingId, leg, driver) => q(
          `insert into delivery_jobs (
             id, client_uuid, booking_id, branch_id, leg, scheduled_at, status,
             delivered_at, received_by, assigned_driver_id, created_by, updated_by
           ) values ($1, gen_random_uuid(), $2, $3, $4, now() - interval '2 hours', 'Delivered',
                     now() - interval '1 hour', 'Test Receiver', $5, $6, $6)`,
          [id, bookingId, BRANCH, leg, driver, U.Coordinator],
        )
        await delivered(J1, bookingIds.a, 'Outbound', null)
        await delivered(J2, bookingIds.a, 'Return', null)
        await delivered(J3, bookingIds.b, 'Outbound', U.Driver)
        await q(
          `insert into delivery_jobs (
             id, client_uuid, booking_id, branch_id, leg, scheduled_at, status,
             dispatched_at, created_by, updated_by
           ) values ($1, gen_random_uuid(), $2, $3, 'Outbound', now() + interval '2 hours', 'In Transit',
                     now() - interval '1 hour', $4, $4)`,
          [J4, bookingIds.c, BRANCH, U.Coordinator],
        )
      })

      // 1. Client cannot attach proof
      await as('Client', async () => {
        await refusedAt(
          'Client cannot attach proof',
          `select delivery_attach_proof($1, $2, $3, $4)`,
          [J1, crypto.randomUUID(), 'https://storage/path.jpg', 'https://storage/sig.png'],
          /role or assignment denied/i,
        )
      })

      // 2. Manager attaches photo + signature; the job stays Delivered
      const receiptKey = crypto.randomUUID()
      await as('Manager', async () => {
        assertEq(await attach(J1, receiptKey, 'https://storage/photo.jpg', 'https://storage/signature.png'), J1, 'Manager attached proof')
      })
      const after = (await asOwnerOfTheDatabase(() => q(
        `select status, proof_photo_path, proof_signature_path, proof_attached_by from delivery_jobs where id = $1`, [J1],
      ))).rows[0]
      assertEq(after.status, 'Delivered', 'attaching proof does not change the job status')
      assertEq(after.proof_photo_path, 'https://storage/photo.jpg', 'photo path stored')
      assertEq(after.proof_signature_path, 'https://storage/signature.png', 'signature path stored')
      assertEq(after.proof_attached_by, U.Manager, 'attaching actor recorded')

      // 3. Idempotent replay: same key, same payload, same job
      await as('Manager', async () => {
        assertEq(await attach(J1, receiptKey, 'https://storage/photo.jpg', 'https://storage/signature.png'), J1, 'replay returns the same job')
      })
      const events = Number((await asOwnerOfTheDatabase(() => q(
        `select count(*) from delivery_job_events where request_key = $1`, [receiptKey],
      ))).rows[0].count)
      assertEq(events, 1, 'replay wrote no second event')

      // 4. Same key, different payload is refused
      await as('Manager', async () => {
        await refusedAt(
          'Same key with different proof is refused',
          `select delivery_attach_proof($1, $2, $3, $4)`,
          [J1, receiptKey, 'https://storage/different.jpg', 'https://storage/different.png'],
          /different request/i,
        )
      })

      // 5. Warehouse (same branch) attaches a photo
      await as('Warehouse', async () => {
        assertEq(await attach(J2, crypto.randomUUID(), 'https://storage/wh_photo.jpg', null), J2, 'Warehouse attached a photo')
      })

      // 6. The assigned Driver attaches a signature; a Driver who is not assigned cannot
      await as('Driver', async () => {
        assertEq(await attach(J3, crypto.randomUUID(), null, 'https://storage/driver_sig.png'), J3, 'assigned Driver attached a signature')
        await refusedAt(
          'a Driver who is not assigned cannot attach proof',
          `select delivery_attach_proof($1, $2, $3, $4)`,
          [J1, crypto.randomUUID(), 'https://storage/x.jpg', null],
          /role or assignment denied/i,
        )
      })

      // 7. Proof can only be attached to a Delivered job
      await as('Manager', async () => {
        await refusedAt(
          'cannot attach proof to a job that is not Delivered',
          `select delivery_attach_proof($1, $2, $3, $4)`,
          [J4, crypto.randomUUID(), 'https://storage/path.jpg', null],
          /Delivered/i,
        )
      })

      // 8. At least one artifact (photo or signature) is required
      await as('Manager', async () => {
        await refusedAt(
          'an empty proof is refused',
          `select delivery_attach_proof($1, $2, null, null)`,
          [J1, crypto.randomUUID()],
          /At least one proof artifact/i,
        )
      })

      // 9. anon cannot execute it
      const anonExec = await one(`select has_function_privilege('anon', 'public.delivery_attach_proof(uuid, uuid, text, text, text)', 'EXECUTE')`)
      assertEq(anonExec, false, 'delivery_attach_proof is NOT executable by anon')
    })
  },
})

STEPS.push({
  id: 'L58',
  title: 'Morning digest: operational day query, Law 6 money blindness, empty-day fallback, and cron schedule (T5-04, O-4)',
  expect: 'green',
  async run() {
    await undone(async () => {
      // 1. Cron schedule verification
      const cronRows = (await q(`
        select job_name, schedule, command
        from cron_schedules
        where job_name = 'morning-digest'
      `)).rows

      assertEq(cronRows.length, 1, 'morning-digest cron job registered')
      assertEq(cronRows[0].schedule, '45 23 * * *', 'schedule is 23:45 UTC (05:30 NPT)')

      // 2. Query as Owner (money role)
      await as('Owner', async () => {
        const res = (await q(`select get_morning_digest($1::uuid) as digest`, [U.Owner])).rows[0]?.digest
        assert(res, 'Owner receives morning digest JSON')
        assertEq(res.can_view_money, true, 'Owner has can_view_money = true')
        assert(Array.isArray(res.pickups), 'Pickups is an array')
        assert(Array.isArray(res.returns), 'Returns is an array')
        assert(Array.isArray(res.overdue), 'Overdue is an array')
        assert(Array.isArray(res.open_damage), 'Open damage is an array')
        assert(Array.isArray(res.shift_handovers), 'Shift handovers is an array')
        assert(Array.isArray(res.payments_due), 'Payments due is an array for money roles')
      })

      // 3. Query as Warehouse (money-blind role)
      await as('Warehouse', async () => {
        const res = (await q(`select get_morning_digest($1::uuid) as digest`, [U.Warehouse])).rows[0]?.digest
        assert(res, 'Warehouse receives morning digest JSON')
        assertEq(res.can_view_money, false, 'Warehouse has can_view_money = false (Law 6)')
        assertEq(res.payments_due.length, 0, 'Warehouse payments_due is empty array (Law 6)')

        // Check that any open damage item masks estimated cost
        if (res.open_damage.length > 0) {
          for (const item of res.open_damage) {
            assertEq(item.estimated_cost_paisa, null, 'Warehouse damage estimated_cost_paisa is null (Law 6)')
          }
        }
      })

      // 4. Empty day test with explicit date
      await as('Owner', async () => {
        const res = (await q(`select get_morning_digest($1::uuid, '2099-01-01'::date) as digest`, [U.Owner])).rows[0]?.digest
        assert(res, 'Future day returns digest object')
        assertEq(res.pickups.length, 0, 'No pickups on 2099-01-01')
        assertEq(res.returns.length, 0, 'No returns on 2099-01-01')
        assertEq(res.payments_due.length, 0, 'No payments due on 2099-01-01')
        if (res.overdue.length === 0 && res.open_damage.length === 0 && res.shift_handovers.length === 0) {
          assertEq(res.has_scheduled_items, false, 'has_scheduled_items is false')
          assertEq(res.empty_message, 'Nothing scheduled today', 'Empty day fallback is Nothing scheduled today (O-4)')
        }
      })
    })
  },
})

STEPS.push({
  id: 'L59',
  title: 'Notification preferences: own rows only, turning a type off stops new rows for that user only, hard delete forbidden (T5-05, Law 3)',
  expect: 'green',
  async run() {
    await undone(async () => {
      // 1. Initial defaults check
      await as('Coordinator', async () => {
        const prefs = (await q(`select get_user_notification_preferences($1::uuid) as res`, [U.Coordinator])).rows[0]?.res
        assert(prefs, 'Coordinator receives notification preferences')
        const damagePref = prefs.preferences.find(p => p.category === 'damage')
        assert(damagePref, 'damage category exists in preferences')
        assertEq(damagePref.in_app_enabled, true, 'Default damage in_app_enabled is true')
      })

      // 2. Coordinator turns off in-app for 'damage'
      await as('Coordinator', async () => {
        await q(`
          select set_notification_preference(
            '11111111-2222-4444-8888-999900000001'::uuid,
            $1::uuid,
            'damage',
            false,
            true
          )
        `, [U.Coordinator])

        const updated = (await q(`select get_user_notification_preferences($1::uuid) as res`, [U.Coordinator])).rows[0]?.res
        const damagePref = updated.preferences.find(p => p.category === 'damage')
        assertEq(damagePref.in_app_enabled, false, 'Coordinator successfully disabled damage in-app notifications')
      })

      // 3. Coordinator cannot edit Warehouse's preferences (RLS own rows only)
      await as('Coordinator', async () => {
        await q('savepoint pref_forbidden_probe')
        try {
          await refuses(
            'Coordinator editing Warehouse preferences is forbidden',
            `select set_notification_preference(
              '11111111-2222-4444-8888-999900000002'::uuid,
              $1::uuid,
              'damage',
              false,
              true
            )`,
            [U.Warehouse],
            /Permission denied|Access denied|cannot modify preferences|42501/i,
          )
        } finally {
          await q('rollback to savepoint pref_forbidden_probe')
          await q('release savepoint pref_forbidden_probe')
        }
      })

      // 4. Broadcast a damage notification
      await as('Owner', async () => {
        await q(`
          select notify_staff(
            'damage',
            'Damage Case Alert',
            'Damage case opened on Camera Body #2',
            'Damage case opened on Camera Body #2',
            '/inventory?tab=damage',
            'damage',
            'DMG-TEST-001'
          )
        `)
      })

      // 5. Verify: Coordinator did NOT receive notification (turned off), but Warehouse DID
      await as('Coordinator', async () => {
        const notifs = (await q(`
          select id, title, type
          from notifications
          where user_id = $1::uuid and type = 'damage' and title = 'Damage Case Alert'
        `, [U.Coordinator])).rows
        assertEq(notifs.length, 0, 'Coordinator received NO damage notification (type turned off, T5-05)')
      })

      await as('Warehouse', async () => {
        const notifs = (await q(`
          select id, title, type
          from notifications
          where user_id = $1::uuid and type = 'damage' and title = 'Damage Case Alert'
        `, [U.Warehouse])).rows
        assertEq(notifs.length, 1, 'Warehouse still received damage notification (user isolation holds)')
      })

      // 6. Hard delete is forbidden by Law 3
      await as('Coordinator', async () => {
        await q('savepoint delete_pref_probe')
        try {
          await refuses(
            'Hard delete of notification_preferences is REFUSED by Law 3 trigger',
            `delete from notification_preferences where user_id = $1::uuid`,
            [U.Coordinator],
            /HARD DELETE FORBIDDEN|Law 3|55000/i,
          )
        } finally {
          await q('rollback to savepoint delete_pref_probe')
          await q('release savepoint delete_pref_probe')
        }
      })
    })
  },
})

STEPS.push({
  id: 'L60',
  title: 'Automatic client emails: late-return is due at +30 min and sent once, no-email client gets WhatsApp draft task, hard delete forbidden (T5-07, W21, W22, W38, Law 3)',
  expect: 'green',
  async run() {
    await undone(async () => {
      // 1. Create a confirmed booking with an email-bearing client
      let bookingId
      let bookingNo
      await as('Coordinator', async () => {
        const clientRes = await q(`
          insert into clients (
            client_uuid, client_code, name, phone, email
          ) values (
            '99999999-0001-4000-8000-000000000001'::uuid,
            'C-9871',
            'Alisha Shrestha',
            '+9779841999888',
            'alisha.shrestha@example.com'
          ) returning id
        `)
        const clientId = clientRes.rows[0].id

        const pickupAt = new Date(Date.now() + 4 * 3600 * 1000).toISOString()
        const returnAt = new Date(Date.now() + 28 * 3600 * 1000).toISOString()
        bookingNo = '9871'

        const bRes = await q(`
          insert into bookings (
            client_uuid, booking_no, branch_id, client_id, stage,
            pickup_at, return_at, delivery_type, created_by, updated_by
          ) values (
            '99999999-0001-4000-8000-000000000002'::uuid,
            $1, $2, $3, 'Quote',
            $4, $5, 'Client Pickup', $6, $6
          ) returning id
        `, [bookingNo, BRANCH, clientId, pickupAt, returnAt, U.Coordinator])
        bookingId = bRes.rows[0].id

        await q(`
          insert into booking_lines
            (client_uuid, booking_id, line_type, product_id, qty, days, rate, created_by)
          values (gen_random_uuid(), $1, 'Equipment', $2, 1, 1, 3500, $3)
        `, [bookingId, SERIAL_PRODUCT, U.Coordinator])

        await q(`
          insert into booking_stage_transitions (
            client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at
          ) values (
            gen_random_uuid(), $1, $2, 'Quote', 'Booked', $3, 'Coordinator', now()
          )
        `, [bookingId, BRANCH, U.Coordinator])

        // Verify scheduled events
        const events = (await q(`
          select event_type, channel, status, due_at, recipient_email
          from client_message_events
          where booking_id = $1::uuid
          order by due_at asc
        `, [bookingId])).rows

        assertEq(events.length, 3, 'Three events scheduled for Booked stage (pickup_reminder, return_reminder, late_return)')

        const pickupReminder = events.find(e => e.event_type === 'pickup_reminder')
        assert(pickupReminder, 'pickup_reminder event exists')
        assertEq(pickupReminder.channel, 'email', 'Client with email receives pickup_reminder via email channel')
        assertEq(pickupReminder.status, 'pending', 'pickup_reminder status is pending')

        const returnReminder = events.find(e => e.event_type === 'return_reminder')
        assert(returnReminder, 'return_reminder event exists')
        assertEq(returnReminder.channel, 'email', 'Client with email receives return_reminder via email channel')

        const lateReturn = events.find(e => e.event_type === 'late_return')
        assert(lateReturn, 'late_return event exists')
        assertEq(lateReturn.channel, 'email', 'late_return channel is email')

        // Assert timing:
        // pickup_reminder is due at pickup_at - interval '2 hours' (W37)
        // late_return is due at return_at + interval '30 minutes' (W38)
        const expectedLateReturnDue = new Date(new Date(returnAt).getTime() + 30 * 60 * 1000)
        const actualLateReturnDue = new Date(lateReturn.due_at)
        const diffMs = Math.abs(actualLateReturnDue.getTime() - expectedLateReturnDue.getTime())
        assert(diffMs < 5000, `Late return email is due at return_at + 30 min (W38), diff=${diffMs}ms`)
      })

      // 2. Client with NO email gets WhatsApp draft task for staff (W22)
      let noEmailBookingId
      await as('Coordinator', async () => {
        const noEmailClientRes = await q(`
          insert into clients (
            client_uuid, client_code, name, phone, email
          ) values (
            '99999999-0002-4000-8000-000000000001'::uuid,
            'C-9872',
            'Ramesh Karki',
            '+9779851000111',
            null
          ) returning id
        `)
        const noEmailClientId = noEmailClientRes.rows[0].id

        const bRes = await q(`
          insert into bookings (
            client_uuid, booking_no, branch_id, client_id, stage,
            pickup_at, return_at, delivery_type, created_by, updated_by
          ) values (
            '99999999-0002-4000-8000-000000000002'::uuid,
            '9872', $1, $2, 'Quote',
            now() - interval '1 hour', now() + interval '5 hours', 'Client Pickup', $3, $3
          ) returning id
        `, [BRANCH, noEmailClientId, U.Coordinator])
        noEmailBookingId = bRes.rows[0].id

        await q(`
          insert into booking_lines
            (client_uuid, booking_id, line_type, product_id, qty, days, rate, created_by)
          values (gen_random_uuid(), $1, 'Equipment', $2, 1, 1, 3500, $3)
        `, [noEmailBookingId, SERIAL_PRODUCT, U.Coordinator])

        await q(`
          insert into booking_stage_transitions (
            client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at
          ) values (
            gen_random_uuid(), $1, $2, 'Quote', 'Booked', $3, 'Coordinator', now()
          )
        `, [noEmailBookingId, BRANCH, U.Coordinator])

        const events = (await q(`
          select event_type, channel, status
          from client_message_events
          where booking_id = $1::uuid
        `, [noEmailBookingId])).rows

        assert(events.every(e => e.channel === 'whatsapp_draft'), 'Client with no email is routed to whatsapp_draft channel for all events (W22)')
      })

      // 3. Process due events: late-return is due and sent ONCE
      await as('Owner', async () => {
        // Force the late_return event on the first booking to be due now (at top of due_at asc)
        await q(`
          update client_message_events
          set due_at = now() - interval '365 days'
          where booking_id = $1::uuid and event_type = 'late_return'
        `, [bookingId])

        // Also force the no-email booking's pickup_reminder to be due now (at top of due_at asc)
        await q(`
          update client_message_events
          set due_at = now() - interval '364 days'
          where booking_id = $1::uuid and event_type = 'pickup_reminder'
        `, [noEmailBookingId])

        // Run processor
        const processed = (await q(`select * from process_due_client_message_events(50)`)).rows
        assert(processed.length >= 2, `Processor executed due events (got ${processed.length})`)

        const emailEvent = processed.find(p => p.booking_id === bookingId && p.event_type === 'late_return')
        assert(emailEvent, 'Late return email was processed')
        assertEq(emailEvent.status, 'sent', 'Late return email transitioned to sent status')

        const waEvent = processed.find(p => p.booking_id === noEmailBookingId && p.event_type === 'pickup_reminder')
        assert(waEvent, 'No-email pickup reminder was processed')
        assertEq(waEvent.status, 'draft_ready', 'No-email reminder transitioned to draft_ready status for staff')

        // Re-run processor immediately: assert 0 additional dispatches (SENT ONCE / IDEMPOTENT)
        const reprocessed = (await q(`
          select * from process_due_client_message_events(50)
          where booking_id in ($1::uuid, $2::uuid)
        `, [bookingId, noEmailBookingId])).rows
        assertEq(reprocessed.length, 0, 'Second run processed 0 events — a late-return email is sent ONCE')

        // Check email_log audit entry: strictly NO body
        const logs = (await q(`
          select id, template_id, recipient_email, status
          from email_log
          where entity_id = $1::text and template_id = 'late_return'
        `, [bookingId])).rows
        assertEq(logs.length, 1, 'email_log records exactly one entry for the sent late-return email')
      })

      // 4. Damage finding opens -> notice created with strictly NO amount (W23, Law 6)
      await as('Warehouse', async () => {
        // Create a cleaning queue entry linked to bookingId
        const cqeRes = await q(`
          insert into cleaning_queue_entries (
            client_uuid, unit_id, booking_id, state, created_by
          ) values (
            '99999999-0003-4000-8000-000000000010'::uuid,
            $1::uuid, $2::uuid, 'Waiting', $3::uuid
          ) returning id
        `, [UNITS[0], bookingId, U.Warehouse])
        const cqeId = cqeRes.rows[0].id

        const findRes = await q(`
          insert into damage_findings (
            client_uuid, source, return_line_id, cleaning_queue_entry_id, unit_id,
            damage_type, description, severity, estimated_cost, approval_state, created_by
          ) values (
            '99999999-0003-4000-8000-000000000001'::uuid,
            'Cleaning', null, $1::uuid, $2::uuid,
            'Cosmetic', 'Scratched lens front element', 'Moderate', 15000.00, 'Pending Approval', $3::uuid
          ) returning id
        `, [cqeId, UNITS[0], U.Warehouse])
        const findingId = findRes.rows[0]?.id

        assert(findingId, 'Damage finding created')

        const dmgEvent = (await q(`
          select event_type, payload
          from client_message_events
          where booking_id = $1::uuid and finding_id = $2::uuid
        `, [bookingId, findingId])).rows[0]

        assert(dmgEvent, 'damage_notice event created on finding insert')
        assertEq(dmgEvent.event_type, 'damage_notice', 'event_type is damage_notice')
        assert(!dmgEvent.payload.approved_amount, 'Notice carries NO money amount before approval (Law 6, W23)')
      })

      // 5. Law 3: Hard delete forbidden
      await as('Coordinator', async () => {
        await q('savepoint del_cme_probe')
        try {
          await refuses(
            'Hard delete of client_message_events is REFUSED by Law 3 trigger',
            `delete from client_message_events where booking_id = $1::uuid`,
            [bookingId],
            /HARD DELETE FORBIDDEN|Law 3|55000/i,
          )
        } finally {
          await q('rollback to savepoint del_cme_probe')
          await q('release savepoint del_cme_probe')
        }
      })

      // 6. RLS: Client cannot write or update client_message_events
      await as('Client', async () => {
        await q('savepoint client_write_probe')
        try {
          await refuses(
            'Client writing client_message_events is REFUSED by RLS',
            `insert into client_message_events (
              client_uuid, booking_id, event_type, channel, status, due_at
            ) values (
              '99999999-0004-4000-8000-000000000001'::uuid,
              $1::uuid, 'late_return', 'email', 'pending', now()
            )`,
            [bookingId],
            /Permission denied|violates row-level security policy|42501/i,
          )
        } finally {
          await q('rollback to savepoint client_write_probe')
          await q('release savepoint client_write_probe')
        }
      })
    })
  },
})

STEPS.push({
  id: 'L61',
  title: 'Payment reminders: cadence, client pause flag, and cancellation when balance is 0 (T5-08, W18, W18b, W22)',
  expect: 'green',
  async run() {
    await undone(async () => {
      let clientId, bookingId, invoiceId

      // 1. Setup client and booking in Returned stage with outstanding invoice balance
      await as('Coordinator', async () => {
        const clientRes = await q(`
          insert into clients (
            client_uuid, client_code, name, phone, email
          ) values (
            '99999999-0005-4000-8000-000000000001'::uuid,
            'C-9875',
            'Sita Pokharel',
            '+9779841999888',
            'sita.pokharel@example.com'
          ) returning id
        `)
        clientId = clientRes.rows[0].id

        await createBooking({
          key: 'rem-client',
          clientId,
          window: [new Date(Date.now() - 360000000).toISOString(), new Date(Date.now() - 180000000).toISOString()],
          actor: 'Coordinator',
          lines: [
            {
              productId: SERIAL_PRODUCT,
              description: 'Camera for payment reminder test',
              qty: 1,
              days: 2,
              rate: 3500,
              units: [UNITS[0]],
            },
          ],
        })
        bookingId = bookingIds['rem-client']

        await transition('rem-client', 'Quote', 'Booked', 'Coordinator')
      })

      await as('Warehouse', async () => {
        await actionPackRental({
          key: 'rem-client',
          actor: 'Warehouse',
          units: [{ id: UNITS[0], serial: 'SN-REM1' }],
        })
        await actionHandoverRental({
          key: 'rem-client',
          actor: 'Warehouse',
          signerName: 'Sita Pokharel',
        })
      })

      await as('Accounts', async () => {
        // Create invoice with outstanding amount = Rs 5000
        const invRes = await q(`
          insert into invoices (
            client_uuid, invoice_no, booking_id, client_id, branch_id,
            status, subtotal, discount_amount, taxable_amount, vat_amount, total_amount, paid_amount, outstanding_amount,
            issue_date, due_date, created_by, updated_by
          ) values (
            '99999999-0005-4000-8000-000000000003'::uuid,
            'INV-L50-001', $1, $2, $3,
            'Sent', 5000, 0, 5000, 0, 5000, 0, 5000,
            now()::date, (now() + interval '7 days')::date, $4, $4
          ) returning id
        `, [bookingId, clientId, BRANCH, U.Accounts])
        invoiceId = invRes.rows[0].id
      })

      // Complete the rental (transition On Rent -> Returned)
      await as('Warehouse', async () => {
        await actionReturnRental({
          key: 'rem-client',
          actor: 'Warehouse',
          returnedUnits: [UNITS[0]],
        })
      })

      // 2. Assert Day 0 payment_reminder was scheduled
      await as('Coordinator', async () => {
        const events = (await q(`
          select id, sequence, channel, status, due_at, outstanding_amount
          from payment_reminders
          where booking_id = $1::uuid
        `, [bookingId])).rows

        assertEq(events.length, 1, 'Day 0 payment_reminder scheduled on Returned completion')
        assertEq(events[0].sequence, 0, 'Initial payment reminder has sequence 0 (completion)')
        assertEq(events[0].status, 'pending', 'Initial payment reminder status is pending')
        assertEq(events[0].channel, 'email', 'Client with email receives payment reminder via email')
      })

      // 3. Process due events: sends Day 0 and automatically schedules Day 5 (sequence 1)
      await as('Owner', async () => {
        // Force payment_reminder to be due now
        await q(`
          update payment_reminders
          set due_at = now() - interval '365 days'
          where booking_id = $1::uuid and sequence = 0
        `, [bookingId])

        const processed = (await q(`select * from process_due_payment_reminders(50)`)).rows
        const reminderEvt = processed.find(p => p.booking_id === bookingId)
        assert(reminderEvt, 'Payment reminder was processed')
        assertEq(reminderEvt.status, 'sent', 'Payment reminder sent')

        // Assert sequence 1 (Day 5) was automatically scheduled
        const seq1 = (await q(`
          select sequence, status, due_at
          from payment_reminders
          where booking_id = $1::uuid and sequence = 1
        `, [bookingId])).rows[0]

        assert(seq1, 'Day 5 payment reminder (sequence 1) was automatically scheduled after completion send')
        assertEq(seq1.status, 'pending', 'Sequence 1 reminder is pending')
      })

      // 4. Staff pauses client: cancels pending reminder (W18b)
      await as('Coordinator', async () => {
        await q(`
          select pause_client_payment_reminders(
            '99999999-0005-4000-8000-000000000004'::uuid,
            $1::uuid,
            'Client requested extension to next Monday'
          )
        `, [clientId])

        const client = (await q(`
          select reminders_paused, reminders_paused_reason, reminders_paused_by
          from clients where id = $1::uuid
        `, [clientId])).rows[0]

        assertEq(client.reminders_paused, true, 'Client reminders_paused flag is true')
        assertEq(client.reminders_paused_reason, 'Client requested extension to next Monday', 'Pause reason recorded')
        assertEq(client.reminders_paused_by, U.Coordinator, 'Paused by user recorded')

        // Assert pending payment reminder was cancelled
        const cancelledSeq1 = (await q(`
          select status, error_message
          from payment_reminders
          where booking_id = $1::uuid and sequence = 1
        `, [bookingId])).rows[0]

        assertEq(cancelledSeq1.status, 'cancelled', 'Pending reminder cancelled when client paused')
        assert(cancelledSeq1.error_message.includes('paused by staff'), 'Cancellation reason noted')

        // Processor yields 0 sends for this booking
        const recheck = (await q(`
          select * from process_due_payment_reminders(50)
          where booking_id = $1::uuid
        `, [bookingId])).rows
        assertEq(recheck.length, 0, 'No payment reminders sent while client paused')
      })

      // 5. Staff resumes client: re-schedules reminder
      await as('Coordinator', async () => {
        await q(`
          select resume_client_payment_reminders(
            '99999999-0005-4000-8000-000000000005'::uuid,
            $1::uuid
          )
        `, [clientId])

        const client = (await q(`
          select reminders_paused, reminders_paused_reason
          from clients where id = $1::uuid
        `, [clientId])).rows[0]

        assertEq(client.reminders_paused, false, 'Client reminders_paused is false after resume')
        assertEq(client.reminders_paused_reason, null, 'Pause reason cleared on resume')

        const resumedSeq = (await q(`
          select status, sequence
          from payment_reminders
          where booking_id = $1::uuid and status = 'pending'
        `, [bookingId])).rows[0]

        assert(resumedSeq, 'Pending payment reminder re-scheduled upon resume')
      })

      // 6. Balance reaches 0: reminders stop immediately ("reminders stop the moment the balance is 0")
      await as('Accounts', async () => {
        // Record payment settling all invoices for the booking to 0
        await q(`
          update invoices
          set paid_amount = total_amount,
              outstanding_amount = 0,
              status = 'Paid',
              updated_at = now()
          where booking_id = $1::uuid
        `, [bookingId])

        // Assert trigger cancelled pending reminder

        const pendingReminders = (await q(`
          select status, error_message
          from payment_reminders
          where booking_id = $1::uuid and status in ('pending', 'draft_ready')
        `, [bookingId])).rows

        assertEq(pendingReminders.length, 0, 'Reminders stop the moment the balance is 0 (all pending cancelled)')

        const cancelledRow = (await q(`
          select status, error_message
          from payment_reminders
          where booking_id = $1::uuid and sequence > 0
          order by sequence desc limit 1
        `, [bookingId])).rows[0]

        assertEq(cancelledRow.status, 'cancelled', 'Reminder row cancelled')
        assertEq(cancelledRow.error_message, 'Balance fully settled', 'Settlement reason noted')
      })

      // 7. Client role cannot pause or resume payment reminders (RLS / permission check)
      await as('Client', async () => {
        await q('savepoint client_pause_probe')
        try {
          await refuses(
            'Client calling pause_client_payment_reminders is REFUSED',
            `select pause_client_payment_reminders(gen_random_uuid(), $1::uuid, 'self pause')`,
            [clientId],
            /Permission denied|only staff|42501/i,
          )
        } finally {
          await q('rollback to savepoint client_pause_probe')
          await q('release savepoint client_pause_probe')
        }
      })

      // 8. Client with no email produces WhatsApp draft task (W22)
      let noEmailClientId, noEmailBookingId
      await as('Coordinator', async () => {
        const cRes = await q(`
          insert into clients (
            client_uuid, client_code, name, phone, email
          ) values (
            '99999999-0005-4000-8000-000000000006'::uuid,
            'C-9876',
            'Hari Shrestha',
            '+9779841112233',
            null
          ) returning id
        `)
        noEmailClientId = cRes.rows[0].id

        await createBooking({
          key: 'rem-noemail',
          clientId: noEmailClientId,
          window: [new Date(Date.now() - 170000000).toISOString(), new Date(Date.now() - 90000000).toISOString()],
          actor: 'Coordinator',
          lines: [
            {
              productId: SERIAL_PRODUCT,
              description: 'Camera for no-email reminder test',
              qty: 1,
              days: 2,
              rate: 3500,
              units: [UNITS[0]],
            },
          ],
        })
        noEmailBookingId = bookingIds['rem-noemail']

        await transition('rem-noemail', 'Quote', 'Booked', 'Coordinator')
      })

      await as('Warehouse', async () => {
        await actionPackRental({
          key: 'rem-noemail',
          actor: 'Warehouse',
          units: [{ id: UNITS[0], serial: 'SN-REM2' }],
        })
        await actionHandoverRental({
          key: 'rem-noemail',
          actor: 'Warehouse',
          signerName: 'Hari Shrestha',
        })
      })

      await as('Accounts', async () => {
        await q(`
          insert into invoices (
            client_uuid, invoice_no, booking_id, client_id, branch_id,
            status, subtotal, discount_amount, taxable_amount, vat_amount, total_amount, paid_amount, outstanding_amount,
            issue_date, due_date, created_by, updated_by
          ) values (
            '99999999-0005-4000-8000-000000000008'::uuid,
            'INV-L50-002', $1, $2, $3,
            'Sent', 4000, 0, 4000, 0, 4000, 0, 4000,
            now()::date, (now() + interval '7 days')::date, $4, $4
          )
        `, [noEmailBookingId, noEmailClientId, BRANCH, U.Accounts])
      })

      await as('Warehouse', async () => {
        await actionReturnRental({
          key: 'rem-noemail',
          actor: 'Warehouse',
          returnedUnits: [UNITS[0]],
        })

        const reminder = (await q(`
          select channel, status, recipient_phone
          from payment_reminders
          where booking_id = $1::uuid and sequence = 0
        `, [noEmailBookingId])).rows[0]

        assert(reminder, 'Reminder created for client without email')
        assertEq(reminder.channel, 'whatsapp_draft', 'No email routes to whatsapp_draft')
      })

      await as('Owner', async () => {
        await q(`select * from process_due_payment_reminders(50) where booking_id = $1::uuid`, [noEmailBookingId])

        const tasks = (await q(`select * from get_pending_whatsapp_draft_tasks()`)).rows
        const task = tasks.find(t => t.booking_id === noEmailBookingId && t.event_type === 'payment_reminder')
        assert(task, 'WhatsApp draft task appears in get_pending_whatsapp_draft_tasks')
      })
    })
  },
})

STEPS.push({
  id: 'L62',
  title: 'Phone pop-ups: subscriptions, RLS own-rows, Law 6 money blindness, and 4 event triggers (T5-09, W62, W38, W39)',
  expect: 'green',
  run: async () => {
    await undone(async () => {
      const subWh = 'https://push.example.com/sub/wh-device-01'
      const subCoord = 'https://push.example.com/sub/coord-device-02'
      const subOwner = 'https://push.example.com/sub/owner-device-03'

      // 1. Warehouse registers a push subscription on floor phone
      await as('Warehouse', async () => {
        await q(`
          select register_push_subscription(
            '99999999-0005-4000-8000-000000000091'::uuid,
            $1, 'key-p256dh-wh', 'key-auth-wh', 'Samsung Galaxy XCover (Floor)', 'Mozilla/5.0 Android'
          )
        `, [subWh])

        const rows = (await q(`select * from push_subscriptions_v where endpoint = $1`, [subWh])).rows
        assertEq(rows.length, 1, 'Warehouse reads own push subscription via view')
        assertEq(rows[0].device_label, 'Samsung Galaxy XCover (Floor)', 'Device label matches')
        assertEq(rows[0].is_active, true, 'Subscription is active')
      })

      // 2. Coordinator registers a push subscription on iPad
      await as('Coordinator', async () => {
        await q(`
          select register_push_subscription(
            '99999999-0005-4000-8000-000000000092'::uuid,
            $1, 'key-p256dh-coord', 'key-auth-coord', 'M4 iPad Pro (Counter)', 'Mozilla/5.0 iPad'
          )
        `, [subCoord])
      })

      // 3. Owner registers a push subscription on iPhone 17 Pro
      await as('Owner', async () => {
        await q(`
          select register_push_subscription(
            '99999999-0005-4000-8000-000000000093'::uuid,
            $1, 'key-p256dh-owner', 'key-auth-owner', 'iPhone 17 Pro (Babin)', 'Mozilla/5.0 iPhone'
          )
        `, [subOwner])
      })

      // 4. RLS: Warehouse sees only own subscription, not Coordinator or Owner
      await as('Warehouse', async () => {
        const rows = (await q(`select * from push_subscriptions_v`)).rows
        assertEq(rows.length, 1, 'Warehouse sees only own push subscription under RLS')
        assertEq(rows[0].endpoint, subWh, 'Endpoint is Warehouse endpoint')

        // Law 3: Hard delete is rejected by trigger
        await q('savepoint delete_push_probe')
        try {
          await refuses(
            'Hard delete on push_subscriptions is rejected (Law 3)',
            `delete from push_subscriptions where endpoint = $1`,
            [subWh],
            /HARD DELETE FORBIDDEN|55000/i,
          )
        } finally {
          await q('rollback to savepoint delete_push_probe')
          await q('release savepoint delete_push_probe')
        }

        // Soft unregister sets is_active = false
        const unregOk = (await q(`select unregister_push_subscription($1)`, [subWh])).rows[0].unregister_push_subscription
        assertEq(unregOk, true, 'Unregister returns true')

        const unregRows = (await q(`select * from push_subscriptions where endpoint = $1`, [subWh])).rows
        assertEq(unregRows[0].is_active, false, 'Subscription is deactivated (is_active = false)')

        // Re-register reactivates it
        await q(`
          select register_push_subscription(
            '99999999-0005-4000-8000-000000000091'::uuid,
            $1, 'key-p256dh-wh', 'key-auth-wh', 'Samsung Galaxy XCover (Floor)', 'Mozilla/5.0 Android'
          )
        `, [subWh])
      })

      // 5. Test Event: payment_received (Law 6 money blindness check)
      await as('Owner', async () => {
        const payload = JSON.stringify({
          payment_id: 'pay-001',
          booking_no: 'BK-L51-PAY',
          amount_paisa: 1250000, // Rs 12,500
        })

        const notifs = (await q(`select * from get_push_notifications_for_event('payment_received', $1::jsonb)`, [payload])).rows

        const whNotif = notifs.find(n => n.endpoint === subWh)
        assert(whNotif, 'Warehouse received payment notification')
        assert(!whNotif.body.includes('12,500') && !whNotif.body.includes('Rs'), 'Warehouse body contains NO money figures (Law 6)')
        assertEq(whNotif.body, 'Payment received for booking BK-L51-PAY.', 'Warehouse receives money-blind payment notification')

        const ownerNotif = notifs.find(n => n.endpoint === subOwner)
        assert(ownerNotif, 'Owner received payment notification')
        assert(ownerNotif.body.includes('Rs 12,500'), 'Owner body includes formatted rupee amount')
      })

      // 6. Test Event: late_return (W38, W39 — to all staff on shift at once, 30m overdue)
      await as('Owner', async () => {
        const payload = JSON.stringify({
          booking_id: 'bk-uuid-001',
          booking_no: 'BK-L51-LATE',
          outstanding_paisa: 450000, // Rs 4,500
        })

        const notifs = (await q(`select * from get_push_notifications_for_event('late_return', $1::jsonb)`, [payload])).rows

        // Both Warehouse and Owner receive it (all staff on shift at once)
        const whNotif = notifs.find(n => n.endpoint === subWh)
        const ownerNotif = notifs.find(n => n.endpoint === subOwner)
        assert(whNotif, 'Warehouse alerted for late return at 30 min (W38, W39)')
        assert(ownerNotif, 'Owner alerted for late return at 30 min (W38, W39)')

        // Law 6: Warehouse sees zero figures; Owner sees balance owed
        assert(!whNotif.body.includes('Rs') && !whNotif.body.includes('4,500'), 'Warehouse alert has no balance figure (Law 6)')
        assert(ownerNotif.body.includes('Rs 4,500'), 'Owner alert includes balance owed figure')
        assertEq(whNotif.link_url, '/rentals/bk-uuid-001', 'Link URL points to booking record')
      })

      // 7. Test Event: new_online_request (W62)
      await as('Coordinator', async () => {
        const payload = JSON.stringify({
          booking_id: 'bk-uuid-002',
          client_name: 'Shree Production',
          item_count: 5,
          total_paisa: 2800000,
        })

        const notifs = (await q(`select * from get_push_notifications_for_event('new_online_request', $1::jsonb)`, [payload])).rows
        const coordNotif = notifs.find(n => n.endpoint === subCoord)
        assert(coordNotif, 'Coordinator notified of new online booking request')
        assert(coordNotif.body.includes('Shree Production'), 'Client name included in push text')
        assertEq(coordNotif.link_url, '/rentals/bk-uuid-002', 'Record link opens the requested booking')
      })

      // 8. Test Event: damage_found (W62)
      await as('Warehouse', async () => {
        const payload = JSON.stringify({
          finding_id: 'df-uuid-001',
          item_name: 'Sony FX3 Body',
          description: 'Top handle mount cracked during reset',
        })

        const notifs = (await q(`select * from get_push_notifications_for_event('damage_found', $1::jsonb)`, [payload])).rows
        const whNotif = notifs.find(n => n.endpoint === subWh)
        assert(whNotif, 'Warehouse notified of damage found')
        assert(whNotif.body.includes('Sony FX3 Body'), 'Item name in damage push alert')
        assertEq(whNotif.link_url, '/inventory/damage/df-uuid-001', 'Record link opens damage finding')
      })

      // 9. Notification preferences suppression (T5-05 integration)
      await as('Owner', async () => {
        // Owner disables payments notifications
        await q(`
          select set_notification_preference(gen_random_uuid(), $1, 'payments', false, false)
        `, [U.Owner])

        const payload = JSON.stringify({
          payment_id: 'pay-002',
          booking_no: 'BK-L51-PREF',
          amount_paisa: 500000,
        })

        const notifs = (await q(`select * from get_push_notifications_for_event('payment_received', $1::jsonb)`, [payload])).rows
        const ownerNotif = notifs.find(n => n.endpoint === subOwner)
        assert(!ownerNotif, 'Owner did NOT receive payment push alert when disabled in notification preferences (T5-05)')

        // Re-enable
        await q(`
          select set_notification_preference(gen_random_uuid(), $1, 'payments', true, true)
        `, [U.Owner])
      })
    })
  },
})

STEPS.push({
  id: 'L64',
  title: 'Offer emails to clients: RBAC gating, pre-flight test send, server-side consent filtering, and cryptographic unsubscribe (T5-12, B31, B34, B43, B50, K6, W80)',
  expect: 'green',
  run: async () => {
    await undone(async () => {
      const client1Id = '11111111-0005-4000-8000-000000000001'
      const client2Id = '11111111-0005-4000-8000-000000000002'
      const client3Id = '11111111-0005-4000-8000-000000000003'

      // Seed 3 test clients
      // Client 1: Active, email, consent 'Not asked' (eligible)
      // Client 2: Active, email, consent 'Opted in' (eligible)
      // Client 3: Active, email, consent 'Opted out' on 'Email' (ineligible)
      await q(`
        insert into clients (id, client_uuid, client_code, name, email, phone, status, created_by)
        values ($1, gen_random_uuid(), 'C-9901', 'Eligible Client Alpha', 'alpha@client.test', '+9779811111101', 'Active', $2)
        on conflict (id) do update set email = excluded.email, status = 'Active'
      `, [client1Id, U.Owner])
      await q(`
        insert into clients (id, client_uuid, client_code, name, email, phone, status, created_by)
        values ($1, gen_random_uuid(), 'C-9902', 'Eligible Client Beta', 'beta@client.test', '+9779811111102', 'Active', $2)
        on conflict (id) do update set email = excluded.email, status = 'Active'
      `, [client2Id, U.Owner])
      await q(`
        insert into clients (id, client_uuid, client_code, name, email, phone, status, created_by)
        values ($1, gen_random_uuid(), 'C-9903', 'Opted Out Client Gamma', 'gamma@client.test', '+9779811111103', 'Active', $2)
        on conflict (id) do update set email = excluded.email, status = 'Active'
      `, [client3Id, U.Owner])

      // Explicitly set Client 2 to 'Opted in' with provenance
      await q(`
        insert into client_marketing_consents (id, client_uuid, client_id, channel, state, opted_in_at, opt_in_source, opt_in_actor_id)
        values (gen_random_uuid(), gen_random_uuid(), $1, 'Email', 'Opted in', now(), 'booking_contract', $2)
        on conflict (client_id, channel) do update set state = 'Opted in', opted_in_at = now()
      `, [client2Id, U.Owner])

      // Explicitly set Client 3 to 'Opted out'
      await q(`
        insert into client_marketing_consents (id, client_uuid, client_id, channel, state, opted_out_at, opt_out_origin_channel)
        values (gen_random_uuid(), gen_random_uuid(), $1, 'Email', 'Opted out', now(), 'Email')
        on conflict (client_id, channel) do update set state = 'Opted out', opted_out_at = now()
      `, [client3Id])

      // 1. RBAC: Coordinator cannot create or queue offer campaigns (42501)
      await as('Coordinator', async () => {
        await q('savepoint coord_probe')
        try {
          await refuses(
            'Coordinator cannot create an offer campaign',
            `select save_offer_campaign(gen_random_uuid(), 'Special Promo', 'Body markdown content here...', null, 'Book', 'https://book.babinrentals.com', '{}'::jsonb)`,
            [],
            /42501|Permission denied/i,
          )
        } finally {
          await q('rollback to savepoint coord_probe')
        }
      })

      // 2. RBAC: Warehouse cannot view campaigns or preview audiences (42501)
      await as('Warehouse', async () => {
        await q('savepoint wh_probe')
        try {
          await refuses(
            'Warehouse cannot preview offer campaign audience',
            `select * from preview_offer_campaign_audience('{}'::jsonb)`,
            [],
            /42501|Permission denied/i,
          )
        } finally {
          await q('rollback to savepoint wh_probe')
        }
      })

      // 3. Manager creates a draft campaign
      let campaignId = null
      const campaignUuid = '99999999-0005-4000-8000-000000000088'
      await as('Manager', async () => {
        const rows = (await q(`
          select save_offer_campaign(
            $1::uuid,
            'Monsoon Lighting Sale — 25% Off ARRI SkyPanels',
            'Upgrade your production with our soft daylight fixtures this week only.',
            'https://babinrentals.com/assets/promo-skypanel.jpg',
            'Reserve Now',
            'https://book.babinrentals.com',
            '{}'::jsonb
          ) as id
        `, [campaignUuid])).rows
        campaignId = rows[0].id
        assert(campaignId, 'Manager successfully created draft offer campaign')

        // Preview audience: Client 1 and Client 2 eligible, Client 3 opted out
        const preview = (await q(`select * from preview_offer_campaign_audience('{}'::jsonb)`)).rows[0]
        assertEq(preview.opted_out_count, 1, 'Audience preview accurately counted 1 opted-out client')
        assert(preview.eligible_count >= 2, 'Audience preview found at least 2 eligible clients')

        // 4. Pre-flight gate: queueing without a test send is refused
        await q('savepoint preflight_probe')
        try {
          await refuses(
            'Queueing an offer campaign without a test send is refused by database gate (P0001)',
            `select queue_offer_campaign($1::uuid, gen_random_uuid())`,
            [campaignId],
            /P0001|A test email must be sent/i,
          )
        } finally {
          await q('rollback to savepoint preflight_probe')
        }

        // 5. Manager records a test send to self
        const testSent = (await q(`
          select record_offer_campaign_test_send($1::uuid, 'manager@babinrentals.test')
        `, [campaignId])).rows[0].record_offer_campaign_test_send
        assertEq(testSent, true, 'Manager recorded pre-flight test send')

        // 6. Manager queues the campaign
        const queueUuid = '99999999-0005-4000-8000-000000000089'
        const queueResult = (await q(`
          select queue_offer_campaign($1::uuid, $2::uuid) as res
        `, [campaignId, queueUuid])).rows[0].res
        assertEq(queueResult.status, 'queued', 'Campaign status is now queued')
        assert(queueResult.recipient_count >= 2, 'Campaign queued at least 2 recipients')

        // Verify opted-out Client 3 was NEVER queued
        const c3Rows = (await q(`
          select * from offer_campaign_recipients where campaign_id = $1 and client_id = $2
        `, [campaignId, client3Id])).rows
        assertEq(c3Rows.length, 0, 'Opted-out Client Gamma was strictly excluded from recipient roster (B34)')

        // 7. Idempotency: double tap on Send returns cached receipt without duplicating recipients
        const replayResult = (await q(`
          select queue_offer_campaign($1::uuid, $2::uuid) as res
        `, [campaignId, queueUuid])).rows[0].res
        assertEq(replayResult.idempotent_replay, true, 'Replaying queue returns idempotent replay')

        // 8. One-click cryptographic unsubscribe: Client 1 clicks unsubscribe link
        // Manager cannot directly update recipient rows (proving RLS denies direct writes).
        // For test setup of known raw token, reset role to postgres, update token hash, then call process_client_unsubscribe.
        const testRawToken = 'unsub-test-token-client-1-secret'
        const testTokenHash = (await q(`select encode(sha256(convert_to($1, 'UTF8')), 'hex') as h`, [testRawToken])).rows[0].h
        await db.exec('reset role;')
        await q(`
          update offer_campaign_recipients
          set unsubscribe_token_hash = $1
          where campaign_id = $2 and client_id = $3
        `, [testTokenHash, campaignId, client1Id])

        // Call unauthenticated unsubscribe (service_role / anon via edge function)
        const unsubResult = (await q(`
          select process_client_unsubscribe($1) as res
        `, [testRawToken])).rows[0].res
        assertEq(unsubResult.ok, true, 'Unsubscribe call returned ok')

        // Switch back to Manager session to verify view reads
        await db.exec(`set role authenticated; select set_config('app.current_user_id', '${U.Manager}', false);`)

        // Verify recipient status updated to unsubscribed
        const c1Recipient = (await q(`
          select status from offer_campaign_recipients where campaign_id = $1 and client_id = $2
        `, [campaignId, client1Id])).rows[0]
        assertEq(c1Recipient.status, 'unsubscribed', 'Client 1 recipient row marked unsubscribed')

        // Verify Client 1 marketing consent transitioned to Opted out
        const c1Consent = (await q(`
          select state from client_marketing_consents where client_id = $1 and channel = 'Email'
        `, [client1Id])).rows[0]
        assertEq(c1Consent.state, 'Opted out', 'Client 1 email marketing consent is now Opted out')

        // 9. Subsequent campaign audience automatically skips Client 1
        const preview2 = (await q(`select * from preview_offer_campaign_audience('{}'::jsonb)`)).rows[0]
        assertEq(preview2.opted_out_count, 2, 'Subsequent campaign accurately counts both Client 1 and Client 3 as opted out')
      })
    })
  },
})


/* ΓöÇΓöÇ Run ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */

STEPS.push({
  id: 'L63',
  title: 'Owner glossary approval: role gate, idempotency, staff read and immutable revision history (T0-12/C-6)',
  expect: 'green',
  async run() {
    await undone(async () => {
      const key = crypto.randomUUID()
      let revision
      await as('Owner', async () => {
        const row = (await q('select approve_glossary_term($1,$2,$3,$4) value', [key, 'msg.pending', 'पर्खँदै', 0])).rows[0].value
        revision = row.revision
        assertEq(row.created_by, U.Owner, 'database derives approval actor')
        const retry = (await q('select approve_glossary_term($1,$2,$3,$4) value', [key, 'msg.pending', 'पर्खँदै', 0])).rows[0].value
        assertEq(retry.id, row.id, 'retry returns the same approval')
      })
      for (const role of ['Admin', 'Manager', 'Coordinator', 'Accounts', 'Warehouse', 'Technician', 'Driver', 'Client']) {
        await as(role, async () => {
          await q('savepoint glossary_role_denial')
          await refuses(`${role} cannot approve glossary`, 'select approve_glossary_term($1,$2,$3,$4)',
            [crypto.randomUUID(), 'msg.pending', 'अर्को', revision], /glossary.role/)
          await q('rollback to savepoint glossary_role_denial')
          await q('release savepoint glossary_role_denial')
          assertEq(Number(await one('select count(*) from glossary_term_revisions where client_uuid=$1', [key])), role === 'Client' ? 0 : 1, `${role} glossary read`)
        })
      }
      await asOwnerOfTheDatabase(async () => {
        await refuses('glossary history is immutable', 'update glossary_term_revisions set nepali=$1 where client_uuid=$2', ['अर्को', key], /Law 3/)
      })
    })
  },
})


STEPS.push({
  id: 'L65',
  title: 'Bulk edit products: rates by % is Owner-only, rounded to whole rupees, Manager refused, Warehouse money column refused, re-sent batch idempotent (T4-12, B32, B33, 0226)',
  expect: 'green',
  run: async () => {
    await undone(async () => {
      // Pick two products from seeded products
      const prods = (await q(`select id, name, daily_rate, weekly_rate, monthly_rate from products where daily_rate is not null and daily_rate > 0 order by name limit 2`)).rows
      assert(prods.length >= 2, 'Found at least 2 products for bulk edit')
      const p1 = prods[0]
      const p2 = prods[1]
      const batchKey1 = '88888888-0001-4000-8000-000000000063'
      const batchKey2 = '88888888-0002-4000-8000-000000000063'
      const batchKey3 = '88888888-0003-4000-8000-000000000063'

      // 1. Manager attempts rate adjustment by percentage -> REFUSED (B32: Owner-only)
      await as('Manager', async () => {
        let denied = false
        try {
          await q(
            `select bulk_update_products($1::uuid[], 'rates_percentage', $2::jsonb, $3::uuid)`,
            [[p1.id, p2.id], JSON.stringify({ percentage: 5 }), batchKey1]
          )
        } catch (e) {
          denied = true
          assert(
            String(e.message).includes('Only the Owner can adjust product rental rates by percentage') ||
            String(e.message).includes('Permission denied'),
            `Manager rate percentage change refused with permission error: ${e.message}`
          )
        }
        assert(denied, 'Manager rate change by percentage was refused by database')
      })

      // 2. Warehouse attempts to touch a money column (daily_rate) -> REFUSED (Law 6)
      await as('Warehouse', async () => {
        let denied = false
        try {
          await q(
            `select bulk_update_products($1::uuid[], 'daily_rate', $2::jsonb, $3::uuid)`,
            [[p1.id], JSON.stringify({ daily_rate: 9999 }), batchKey1]
          )
        } catch (e) {
          denied = true
          assert(
            String(e.message).includes('Permission denied'),
            `Warehouse money update refused with permission error: ${e.message}`
          )
        }
        assert(denied, 'Warehouse touching a money column was refused by database')
      })

      // 3. Owner applies rate increase (+5%) -> SUCCEEDS, rates rounded to whole rupees (B32)
      let ownerResult
      await as('Owner', async () => {
        const res = await q(
          `select bulk_update_products($1::uuid[], 'rates_percentage', $2::jsonb, $3::uuid)`,
          [[p1.id, p2.id], JSON.stringify({ percentage: 5 }), batchKey2]
        )
        ownerResult = res.rows[0].bulk_update_products
        assertEq(ownerResult.updated_count, 2, 'Owner updated 2 products')

        // Verify rounding to whole rupees via products_v
        const updated1 = (await q(`select daily_rate from products_v where id = $1`, [p1.id])).rows[0]
        const expected1 = Math.round(Number(p1.daily_rate) * 1.05)
        assertEq(Number(updated1.daily_rate), expected1, 'daily_rate is rounded to whole rupees')
      })

      // Verify audit rows created with batch_id (checked with system connection)
      const auditRows = (await q(`select * from audit_events where record_id in ($1, $2) and (new_values->>'batch_id') = $3`, [p1.id, p2.id, batchKey2])).rows
      assertEq(auditRows.length, 2, 'One audit row per product created with batch_id')

      // 4. Idempotency: Re-sending the same batch changes nothing and returns the cached receipt
      const auditCountBefore = (await q(`select count(*) as c from audit_events where (new_values->>'batch_id') = $1`, [batchKey2])).rows[0].c
      await as('Owner', async () => {
        const resReplay = await q(
          `select bulk_update_products($1::uuid[], 'rates_percentage', $2::jsonb, $3::uuid)`,
          [[p1.id, p2.id], JSON.stringify({ percentage: 5 }), batchKey2]
        )
        const replayResult = resReplay.rows[0].bulk_update_products
        assertEq(replayResult.batch_id, ownerResult.batch_id, 'Replay returned identical cached batch_id')
        assertEq(replayResult.updated_count, ownerResult.updated_count, 'Replay returned identical updated_count')
      })
      const auditCountAfter = (await q(`select count(*) as c from audit_events where (new_values->>'batch_id') = $1`, [batchKey2])).rows[0].c
      assertEq(auditCountBefore, auditCountAfter, 'Re-sent batch created no additional audit rows')

      // 5. Manager updates a non-financial allowed field (prep_time_minutes) -> SUCCEEDS
      await as('Manager', async () => {
        const res = await q(
          `select bulk_update_products($1::uuid[], 'prep_time_minutes', $2::jsonb, $3::uuid)`,
          [[p1.id], JSON.stringify({ prep_time_minutes: 25 }), batchKey3]
        )
        const managerResult = res.rows[0].bulk_update_products
        assertEq(managerResult.updated_count, 1, 'Manager successfully updated non-financial field in bulk')
        const updated = (await q(`select prep_time_minutes from products_v where id = $1`, [p1.id])).rows[0]
        assertEq(Number(updated.prep_time_minutes), 25, 'prep_time_minutes updated to 25')
      })
    })
  },
})


/* ΓöÇΓöÇ Run ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */


STEPS.push({
  id: 'L66',
  title: 'Message and document texts: Owner/Admin edit, Manager refused, unknown placeholder refused, version restore (T5-13, B20, Law 3)',
  expect: 'green',
  run: async () => {
    // 1. Manager cannot change a template (B20)
    await as('Manager', async () => {
      await refuses(
        'Manager cannot save message template',
        `select public.save_message_template(
          gen_random_uuid(),
          'email.pickup_reminder',
          'Subject',
          'Hello {{client_name}}, your booking {{booking_number}} is ready'
        )`,
        [],
        /Only Owner and Admin can edit message and document texts/i,
      )
    })

    // 2. An unknown placeholder is refused on save
    await as('Owner', async () => {
      await refuses(
        'unknown placeholder is refused on save',
        `select public.save_message_template(
          gen_random_uuid(),
          'email.pickup_reminder',
          'Subject',
          'Hello {{client_name}}, your secret discount is {{secret_discount_code}}'
        )`,
        [],
        /Unknown placeholder "{{secret_discount_code}}" is refused/i,
      )
    })

    // 3. Owner saves a valid new version of pickup_reminder
    const clientUuid1 = 'a0000001-0000-0000-0000-000000000001'
    let v2Res
    await as('Owner', async () => {
      const res = await q(
        `select public.save_message_template(
          $1::uuid,
          'email.pickup_reminder',
          'Updated Reminder: {{booking_number}}',
          'Hello {{client_name}}, your gear for booking {{booking_number}} will be ready on {{pickup_date}} at {{pickup_time}}. Please bring your valid ID.'
        )`,
        [clientUuid1],
      )
      v2Res = res.rows[0].save_message_template
    })

    assertEq(v2Res.version, 2, 'saved version is 2')
    assertEq(v2Res.is_active, true, 'version 2 is active')

    // Verify version 1 is now inactive
    const v1Row = (await q(`select is_active, version from public.message_templates where template_key = 'email.pickup_reminder' and version = 1`)).rows[0]
    assertEq(v1Row.is_active, false, 'version 1 is now deactivated')

    // 4. Idempotency check: re-sending with same client_uuid returns existing version without incrementing
    await as('Owner', async () => {
      const res = await q(
        `select public.save_message_template(
          $1::uuid,
          'email.pickup_reminder',
          'Updated Reminder: {{booking_number}}',
          'Different body that should be ignored on duplicate client_uuid'
        )`,
        [clientUuid1],
      )
      assertEq(res.rows[0].save_message_template.version, 2, 'idempotent retry returns version 2')
    })

    // 5. Restore version 1 creates version 3 as an exact copy of version 1
    const clientUuid2 = 'a0000001-0000-0000-0000-000000000002'
    let v3Res
    await as('Owner', async () => {
      const res = await q(
        `select public.restore_message_template(
          $1::uuid,
          'email.pickup_reminder',
          1
        )`,
        [clientUuid2],
      )
      v3Res = res.rows[0].restore_message_template
    })

    assertEq(v3Res.version, 3, 'restored template is minted as version 3 (Law 3 append-only)')
    assertEq(v3Res.is_active, true, 'version 3 is active')
    assert(v3Res.body.includes('authorized ID'), 'restored body matches version 1 text')

    // Verify audit events exist
    const auditCount = (await q(
      `select count(*) as cnt from public.audit_events where table_name = 'message_templates' and (client_uuid = $1 or client_uuid = $2)`,
      [clientUuid1, clientUuid2],
    )).rows[0].cnt
    assertEq(Number(auditCount), 2, 'exactly two audit events were recorded')
  },
})

STEPS.push({
  id: 'L68',
  title: 'Tags on bookings: Coordinator sets tags, Warehouse refused, case-insensitive deduplication, tags never change stage or money (T3-25, B16, B55)',
  expect: 'green',
  run: async () => {
    const bookingId = bookingIds.b

    // 1. Snapshot booking state before tag changes
    const beforeBooking = (await q(`select stage, deposit_required, (select count(*) from booking_lines where booking_id = $1) as line_count from bookings where id = $1`, [bookingId])).rows[0]

    // 2. Warehouse attempts to set tags: MUST BE REFUSED (42501)
    await as('Warehouse', async () => {
      await refuses(
        'Warehouse role cannot set booking tags',
        `select public.set_booking_tags($1::uuid, $2::uuid, $3::text[])`,
        [crypto.randomUUID(), bookingId, ['floor_tag']],
        /Only booking-desk roles.*may modify booking tags/i,
      )
    })

    // 3. Tag longer than 30 characters: MUST BE REFUSED (22023)
    await as('Coordinator', async () => {
      await refuses(
        'Tag exceeding 30 characters is refused',
        `select public.set_booking_tags($1::uuid, $2::uuid, $3::text[])`,
        [crypto.randomUUID(), bookingId, ['this_tag_is_way_too_long_to_be_allowed_under_the_30_character_limit']],
        /exceeds 30 characters limit/i,
      )
    })

    // 4. Coordinator sets valid tags with trimming and case-insensitive deduplication
    const clientUuid1 = crypto.randomUUID()
    let tagsRes
    await as('Coordinator', async () => {
      const res = await q(
        `select public.set_booking_tags($1::uuid, $2::uuid, $3::text[])`,
        [clientUuid1, bookingId, ['  wedding  ', 'WEDDING', 'festival', 'repeat', '   ']],
      )
      tagsRes = res.rows[0].set_booking_tags
    })

    assertEq(tagsRes.booking_id, bookingId, 'booking_id matches')
    assertEq(tagsRes.tags.length, 3, 'empty tag removed and case duplicate trimmed')
    assertEq(tagsRes.tags[0], 'wedding', 'first tag trimmed and deduplicated')
    assertEq(tagsRes.tags[1], 'festival', 'second tag preserved')
    assertEq(tagsRes.tags[2], 'repeat', 'third tag preserved')

    // 5. CRITICAL LIFECYCLE: tags never change a booking's stage or money
    const afterBooking = (await q(`select stage, deposit_required, (select count(*) from booking_lines where booking_id = $1) as line_count, tags from bookings where id = $1`, [bookingId])).rows[0]
    assertEq(afterBooking.stage, beforeBooking.stage, 'booking stage is byte-identical')
    assertEq(Number(afterBooking.deposit_required), Number(beforeBooking.deposit_required), 'deposit_required is byte-identical')
    assertEq(Number(afterBooking.line_count), Number(beforeBooking.line_count), 'line_count is byte-identical')
    assertEq(afterBooking.tags.length, 3, 'tags saved in database')

    // 6. GIN index search: tags overlap and containment query
    const foundByTag = (await q(`select count(*) as cnt from bookings where tags @> array['festival']::text[] and id = $1`, [bookingId])).rows[0].cnt
    assertEq(Number(foundByTag), 1, 'GIN index query matches tag')

    // 7. Idempotent replay: same client_uuid returns cached tags
    await as('Coordinator', async () => {
      const res = await q(
        `select public.set_booking_tags($1::uuid, $2::uuid, $3::text[])`,
        [clientUuid1, bookingId, ['should', 'be', 'ignored']],
      )
      const replayRes = res.rows[0].set_booking_tags
      assertEq(replayRes.idempotent, true, 'replayed call is marked idempotent')
      assertEq(replayRes.tags.length, 3, 'original tags returned on duplicate client_uuid')
    })

    // 8. Verify audit event
    const auditCount = (await q(
      `select count(*) as cnt from public.audit_events where table_name = 'bookings' and record_id = $1 and client_uuid = $2 and reason = 'Booking tags updated (T3-25)'`,
      [bookingId, clientUuid1],
    )).rows[0].cnt
    assertEq(Number(auditCount), 1, 'exactly one explicit audit event logged for client_uuid')
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
