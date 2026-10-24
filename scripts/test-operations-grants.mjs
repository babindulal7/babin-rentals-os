#!/usr/bin/env node
// P0-B location scoping (0171): operations branch grants. Proves the three design
// promises on a database built from scratch: (1) narrowing-only — an empty table
// leaves the role matrix exactly as it was; (2) revoke scopes to nothing, never
// back to global; (3) the fail-closed trigger gate refuses cross-branch custody
// BEFORE the operational gates, while the assert RPC gives Reset — the verb with
// no stage and no session — the same refusal. Runs fully in local PGlite.
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

const branchA = (await db.query(`select id from branches order by created_at limit 1`)).rows[0].id
const branchB = uuid()
await db.query(
  `insert into branches (id, client_uuid, branch_code, name, address, phone, email, pan_vat_no, is_headquarters, is_active)
   values ($1, gen_random_uuid(), 'BR-PATAN', 'Patan Floor', 'Patan', '+977', 'patan@babinrentals.test', 'TEST-PAN-0002', false, true)`,
  [branchB],
)

const users = [
  ['Owner', '00000000-0000-0000-0000-000000000401'],
  ['Manager', '00000000-0000-0000-0000-000000000402'],
  ['Warehouse', '00000000-0000-0000-0000-000000000403'],
  ['OtherWarehouse', '00000000-0000-0000-0000-000000000404'],
]
const roles = { Owner: 'Owner', Manager: 'Manager', Warehouse: 'Warehouse', OtherWarehouse: 'Warehouse' }
const ids = Object.fromEntries(users)
for (const [name, id] of users) {
  const role = roles[name]
  await db.query(
    `insert into users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
     values ($1, gen_random_uuid(), $2, $3, $4, '+977-9800000000', $5, $6, true, $1) on conflict (id) do update set primary_role = $5`,
    [id, `EMP-G-${name}`, `${name.toLowerCase()}-g@babinrentals.test`, `Grant ${name}`, role, branchA],
  )
}
const as = (role) => db.exec(`reset role; select set_config('app.current_user_id', '${ids[role]}', false); set role authenticated;`)
const resetRole = () => db.exec(`reset role; select set_config('app.current_user_id', '', false);`)
const throws = async (fn, frag) => { try { await fn() } catch (e) { return frag ? e.message.includes(frag) : true } return false }
const passes = async (fn) => { try { await fn(); return true } catch { return false } }

const q = (sql, p = []) => db.query(sql, p)
const one = async (sql, p = []) => (await q(sql, p)).rows[0]
const may = (op, branch) => one('select auth_may_perform_operation($1, $2) as ok', [op, branch]).then((r) => r.ok)

// A client and two Booked-stage bookings, one per branch.
const client = uuid()
// 0047/0055 replaced the client-code format with `^C-[0-9]+$` and the sequence
// returns exactly that raw form ('C-74'). Read the aliased column — the bare
// `next_document_number` key is easy to miss and hands `undefined` to the
// insert, which is what the format check then refuses.
const clientCode = await one("select next_document_number('client') as code").then((r) => r.code)
await db.query(
  `insert into clients (id, client_uuid, client_code, name, phone, created_by)
   values ($1, gen_random_uuid(), $2, 'Grant Test Client', '+9779800000009', $3)`,
  [client, clientCode, ids.Owner],
)
const mkBooking = async (branch) => {
  const no = await one("select next_document_number('booking') as no").then((r) => r.no)
  await q(
    `insert into bookings (client_uuid, booking_no, client_id, branch_id, pickup_at, return_at, delivery_type, stage, created_by, updated_by)
     values (gen_random_uuid(), $2, $1, $3, '2099-12-01T04:00:00Z', '2099-12-03T04:00:00Z', 'Client Pickup', 'Booked', $4, $4)`,
    [client, no, branch, ids.Owner],
  )
  return one('select id from bookings where booking_no = $1', [no]).then((r) => r.id)
}
const bookingA = await mkBooking(branchA)
const bookingB = await mkBooking(branchB)

const transition = (booking, actor) =>
  q(
    `insert into booking_stage_transitions
       (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
     values (gen_random_uuid(), $1, (select branch_id from bookings where id = $1), 'Booked', 'Packed', $2, $3, now())`,
    [booking, ids[actor], actor],
  )
const assert = (op, booking) => q('select assert_operation_branch_grant($1, $2) as ok', [op, booking])
const stageOf = (booking) => one('select stage::text from bookings where id = $1', [booking]).then((r) => r.stage)

await resetRole()

// ── 1. Pristine: an empty operations_grants table changes nothing ────────────
await as('Warehouse')
check(await may('pack', branchA) && await may('pack', branchB), 'pristine staff may pack at every branch (narrowing-only)')
check(await may('handover', branchA) && await may('return', branchB) && await may('reset', branchA), 'pristine staff pass the other three verbs everywhere')
check(await passes(() => transition(bookingA, 'Warehouse')) && (await stageOf(bookingA)) === 'Packed', 'a pristine pack transition runs the full 0155 path and succeeds (behavior unchanged)')
await resetRole()
check((await one('select auth_may_perform_operation($1, $2) as ok', ['steal', branchA])).ok === false, 'an unknown operation is a denial')
check((await one('select auth_may_perform_operation($1, $2) as ok', ['pack', branchA])).ok === false, 'a call with no actor identity is a denial')

// ── 2. Issue: the first grant SCOPES, other operations stay pristine ─────────
await as('Owner')
const grantId = await one('select issue_operations_grant($1, $2, $3, $4) as id', [uuid(), ids.Warehouse, branchA, 'pack']).then((r) => r.id)
check(!!grantId, 'Owner issues a pack grant for branch A')
await resetRole()
await as('Warehouse')
check(await may('pack', branchA), 'the granted branch passes')
check(!(await may('pack', branchB)), 'the ungranted branch is refused')
check(await may('handover', branchB) && await may('reset', branchB), 'other operations stay pristine until their own first grant')
check(await passes(() => assert('pack', bookingA)), 'the assert RPC passes the granted branch')
check(await throws(() => assert('pack', bookingB), 'GATE:operations.grant|'), 'the assert RPC refuses the ungranted branch with the gate message')
await resetRole()

// ── 3. The fail-closed trigger gate: cross-branch custody cannot move ───────
// A fresh line-less booking packs without a session (0155's own rule), so the
// only thing that can refuse these transitions is the 0171 branch gate.
const bookingA2 = await mkBooking(branchA)
await as('Warehouse')
check(await passes(() => transition(bookingA2, 'Warehouse')) && (await stageOf(bookingA2)) === 'Packed', 'granted branch: the transition runs the full trigger and succeeds')
check(await throws(() => transition(bookingB, 'Warehouse'), 'GATE:operations.grant|'), 'ungranted branch: the transition is refused BY THE GRANT GATE, before any session check')
check((await stageOf(bookingB)) === 'Booked', 'the refused booking never moved')
await resetRole()

// ── 4. Reset has no stage and no session — the assert RPC is its gate ───────
await as('Owner')
await q('select issue_operations_grant($1, $2, $3, $4)', [uuid(), ids.Warehouse, branchA, 'reset'])
await resetRole()
await as('Warehouse')
check(await passes(() => assert('reset', bookingA)), 'reset passes on the granted branch')
check(await throws(() => assert('reset', bookingB), 'GATE:operations.grant|'), 'reset is refused on the ungranted branch')
await resetRole()

// ── 5. Revoke means scoped-to-nothing, never back-to-global ─────────────────
await as('Owner')
await q('select revoke_operations_grant($1, $2)', [uuid(), grantId])
await resetRole()
await as('Warehouse')
check(!(await may('pack', branchA)) && !(await may('pack', branchB)), 'revoking the ONLY pack grant scopes the user to NOTHING — never back to global')
await resetRole()
await as('Owner')
const reissue = await one('select issue_operations_grant($1, $2, $3, $4) as id', [uuid(), ids.Warehouse, branchA, 'pack']).then((r) => r.id)
check(!!reissue && reissue !== grantId, 're-issue after revoke mints a new active row (the partial unique covers active rows only)')
await resetRole()
await as('Warehouse')
check(await may('pack', branchA), 'the re-issued grant passes again')
await resetRole()

// ── 6. Issue/revoke are Owner·Admin only (B-1 stricter; Babin may widen) ────
await as('Manager')
check(await throws(() => q('select issue_operations_grant($1, $2, $3, $4)', [uuid(), ids.Warehouse, branchB, 'pack']), 'operations.grant.issue_role'), 'a Manager cannot issue grants')
await resetRole()
await as('Warehouse')
check(await throws(() => q('select revoke_operations_grant($1, $2)', [uuid(), reissue]), 'operations.grant.revoke_role'), 'a Warehouse user cannot revoke grants')
await resetRole()

// ── 7. Law 8: idempotent issue, idempotent revoke, honest not-found ─────────
await as('Owner')
const cu = uuid()
const first = await one('select issue_operations_grant($1, $2, $3, $4) as id', [cu, ids.Warehouse, branchB, 'handover']).then((r) => r.id)
const retry = await one('select issue_operations_grant($1, $2, $3, $4) as id', [cu, ids.Warehouse, branchB, 'handover']).then((r) => r.id)
check(first === retry, 'the same receipt key returns the same grant (Law 8)')
const twin = await one('select issue_operations_grant($1, $2, $3, $4) as id', [uuid(), ids.Warehouse, branchB, 'handover']).then((r) => r.id)
check(twin === first, 're-issuing the same active cell is the same grant')
await q('select revoke_operations_grant($1, $2)', [uuid(), first])
await q('select revoke_operations_grant($1, $2)', [uuid(), first])
check(true, 'revoking twice is a no-op (idempotent)')
check(await throws(() => q('select revoke_operations_grant($1, $2)', [uuid(), uuid()]), 'operations.grant.not_found'), 'a receipt against an unknown grant id is refused')
await resetRole()

// ── 8. RLS: own rows for the user, all rows for Manager+, no direct writes ──
const countGrants = (extra = '', p = []) => one(`select count(*) as c from operations_grants ${extra}`, p).then((r) => Number(r.c))
await as('Warehouse')
const mine = await countGrants('where user_id = $1', [ids.Warehouse])
check(mine > 0 && (await countGrants()) === mine, 'a staff member reads exactly their own grants')
await resetRole()
await as('OtherWarehouse')
check((await countGrants()) === 0, 'another staff member reads none of them')
await resetRole()
await as('Manager')
check((await countGrants()) > 0, 'a Manager reads every grant')
const beforeWrite = await countGrants()
check(
  await throws(
    () => q('insert into operations_grants (client_uuid, user_id, branch_id, operation, granted_by) values ($1, $2, $3, $4, $5)', [uuid(), ids.Warehouse, branchA, 'pack', ids.Manager]),
  ) && (await countGrants()) === beforeWrite,
  'direct writes are refused and insert nothing — issuance lives only in the security-definer RPC',
)
await resetRole()

if (failed > 0) {
  console.log(`\n${failed} check(s) FAILED`)
  process.exit(1)
}
console.log('\nOPERATIONS BRANCH GRANTS VERIFIED')
