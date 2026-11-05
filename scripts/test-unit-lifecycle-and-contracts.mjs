#!/usr/bin/env node
// Test Server Contracts: save_record_section, add_equipment_units, retire_equipment_unit, enroll_client_membership
// Run against real isolated PGlite Postgres with migrations 0001 through 0173.
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })
const sql = (statement, params = []) => db.query(statement, params)

console.log('Bootstrapping PGlite database and migrations...')
await db.exec(readFileSync(join(ROOT, 'supabase/pglite-prelude.sql'), 'utf8'))
const migrationDir = join(ROOT, 'supabase/migrations')
for (const file of readdirSync(migrationDir).filter(f => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(join(migrationDir, file), 'utf8'))
}
console.log('Migrations applied successfully. Setting up test fixtures...')

// Fixtures
const ownerId = '00000000-0000-0000-0000-000000000901'
const driverId = '00000000-0000-0000-0000-000000000902'
let branch = (await sql('select id from branches order by created_at limit 1')).rows[0]?.id
if (!branch) {
  const bRes = await sql(`insert into branches (client_uuid, branch_code, name, address, phone, email, pan_vat_no, is_headquarters, is_active)
    values (gen_random_uuid(), 'BR-KTM', 'Kathmandu HQ', 'Kathmandu', '+977-1-4444444', 'hq@babinrentals.com', '123456789', true, true) returning id`)
  branch = bRes.rows[0].id
}

// Create Owner user first so created_by FKs succeed
await sql(`insert into users
  (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
  values ($1, gen_random_uuid(), 'EMP-OWNER-901', 'owner-test@babinrentals.com', 'Owner Tester', '+977-9800000901', 'Owner', $2, true, $1)
  on conflict (id) do update set primary_role = 'Owner'`, [ownerId, branch])

// Create Driver user (restricted)
await sql(`insert into users
  (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
  values ($1, gen_random_uuid(), 'EMP-DRIVER-902', 'driver-test@babinrentals.com', 'Driver Tester', '+977-9800000902', 'Driver', $2, true, $1)
  on conflict (id) do update set primary_role = 'Driver'`, [driverId, branch])

let warehouse = (await sql('select id from warehouses where branch_id = $1 limit 1', [branch])).rows[0]?.id
if (!warehouse) {
  const wRes = await sql(`insert into warehouses (client_uuid, branch_id, warehouse_code, name)
    values (gen_random_uuid(), $1, 'WH-MAIN', 'Main Kathmandu Vault') returning id`, [branch])
  warehouse = wRes.rows[0].id
}

let client = (await sql('select id from clients order by created_at limit 1')).rows[0]?.id
if (!client) {
  const cRes = await sql(`insert into clients (client_uuid, name, type_parent, contact_person, phone, created_by)
    values (gen_random_uuid(), 'Sagarmatha Productions', 'Business', 'Nima Sherpa', '+977-9812345678', $1) returning id`, [ownerId])
  client = cRes.rows[0].id
}

let plan = (await sql('select id from membership_plans order by created_at limit 1')).rows[0]?.id
if (!plan) {
  const pRes = await sql(`insert into membership_plans
    (client_uuid, level, label, annual_fee, individual_discount_pct, monthly_booking_limit, simultaneous_rental_limit, authorized_users, default_credit_limit, display_order, created_by)
    values (gen_random_uuid(), 'Creator', 'Access Member', 50000, 10, 20, 5, 2, 500000, 1, $1) returning id`, [ownerId])
  plan = pRes.rows[0].id
}

// Migration 0195 seeds a 'Cinematographer' plan and membership_plans.level is unique,
// so reuse the seeded row when present and only insert it on a database without the seed.
let plan2 = (await sql(`select id from membership_plans where level = 'Cinematographer'`)).rows[0]?.id
if (!plan2) {
  const pRes2 = await sql(`insert into membership_plans
    (client_uuid, level, label, annual_fee, individual_discount_pct, monthly_booking_limit, simultaneous_rental_limit, authorized_users, default_credit_limit, display_order, created_by)
    values (gen_random_uuid(), 'Cinematographer', 'Partner', 100000, 15, 30, 8, 4, 1000000, 2, $1) returning id`, [ownerId])
  plan2 = pRes2.rows[0].id
}

const category = (await sql('select id from inventory_categories order by name limit 1')).rows[0]?.id

// Create a serialized test product
const prodRes = await sql(`insert into products
  (client_uuid, name, brand, category_id, tracking_mode, asset_code, total_quantity, daily_rate, created_by)
  values (gen_random_uuid(), 'ARRI Alexa Mini LF Test', 'ARRI', $1, 'Serialised', 'EQ000101', 0, 2500000, $2)
  returning id`, [category, ownerId])
const productId = prodRes.rows[0].id

async function asUser(userId) {
  await sql('select set_config($1, $2, false)', ['app.current_user_id', userId])
  await sql('select set_config($1, $2, false)', ['request.jwt.claim.sub', userId])
}

let testsPassed = 0
let testsFailed = 0

function assert(condition, message) {
  if (!condition) {
    testsFailed++
    console.error(`  FAIL: ${message}`)
    throw new Error(message)
  }
  testsPassed++
  console.log(`  PASS: ${message}`)
}

async function expectThrows(fn, expectedSubstr, testName) {
  try {
    await fn()
    testsFailed++
    console.error(`  FAIL: ${testName} (did not throw)`)
    throw new Error(`Expected error containing "${expectedSubstr}", but no error thrown`)
  } catch (err) {
    if (err.message && err.message.includes(expectedSubstr)) {
      testsPassed++
      console.log(`  PASS: ${testName} (threw expected "${expectedSubstr}")`)
    } else {
      testsFailed++
      console.error(`  FAIL: ${testName} (unexpected error: ${err.message})`)
      throw err
    }
  }
}

// ---------------------------------------------------------------------------
console.log('\n--- 1. Testing add_equipment_units ---')
// ---------------------------------------------------------------------------

// 1.1 Permission test: Driver cannot add equipment units
await asUser(driverId)
await expectThrows(
  () => sql(`select add_equipment_units($1, $2, $3)`, [
    productId,
    JSON.stringify([{ serial_no: 'SN-001', warehouse_id: warehouse }]),
    crypto.randomUUID()
  ]),
  'Permission denied',
  'Driver role cannot add equipment units'
)

// 1.2 Owner can add serialized units
await asUser(ownerId)
const addKey1 = crypto.randomUUID()
const addUnitsPayload = JSON.stringify([
  { serial_no: 'AML-SN-101', warehouse_id: warehouse, rack: 'A', shelf: '1', condition: 'Good' },
  { serial_no: 'AML-SN-102', warehouse_id: warehouse, rack: 'A', shelf: '2', condition: 'Good' }
])
const addRes = await sql(`select add_equipment_units($1, $2::jsonb, $3::uuid) as result`, [productId, addUnitsPayload, addKey1])
const addResult = addRes.rows[0].result
assert(addResult.added_count === 2, 'Added exactly 2 units')
assert(addResult.total_quantity === 2, 'Total quantity synced to 2')
const unitIds = addResult.unit_ids
assert(unitIds.length === 2, 'Returned 2 unit ids')

// 1.3 Verify product_units row persistence
const unitsInDb = await sql(`select id, serial_no, asset_tag, status from product_units where product_id = $1 order by serial_no`, [productId])
assert(unitsInDb.rows.length === 2, 'Two units persisted in product_units table')
assert(unitsInDb.rows[0].serial_no === 'AML-SN-101', 'Serial 101 matched')
assert(unitsInDb.rows[0].asset_tag.startsWith('EQ000101-'), 'Asset tag formatted properly')

// 1.4 Idempotency test: Replaying with same key returns cached receipt without inserting duplicates
const addReplay = await sql(`select add_equipment_units($1, $2::jsonb, $3::uuid) as result`, [productId, addUnitsPayload, addKey1])
assert(addReplay.rows[0].result.added_count === 2, 'Idempotent replay returned matching added_count')
const countAfterReplay = await sql(`select count(*) as cnt from product_units where product_id = $1`, [productId])
assert(Number(countAfterReplay.rows[0].cnt) === 2, 'No duplicate units inserted on replay')

// 1.5 Duplicate serial rejection
await expectThrows(
  () => sql(`select add_equipment_units($1, $2::jsonb, $3::uuid)`, [
    productId,
    JSON.stringify([{ serial_no: 'AML-SN-101', warehouse_id: warehouse }]),
    crypto.randomUUID()
  ]),
  'is already in use',
  'Duplicate serial number is rejected'
)

// ---------------------------------------------------------------------------
console.log('\n--- 2. Testing retire_equipment_unit ---')
// ---------------------------------------------------------------------------
const unitToRetireId = unitIds[0]
const unitHeldId = unitIds[1]

// 2.1 Driver cannot retire
await asUser(driverId)
await expectThrows(
  () => sql(`select retire_equipment_unit($1, 'Retiring this lens unit for parts', $2)`, [unitToRetireId, crypto.randomUUID()]),
  'Permission denied',
  'Driver role cannot retire unit'
)

// 2.2 Short reason (<10 chars) rejected
await asUser(ownerId)
await expectThrows(
  () => sql(`select retire_equipment_unit($1, 'Too short', $2)`, [unitToRetireId, crypto.randomUUID()]),
  'at least 10 characters',
  'Retirement reason < 10 chars is rejected'
)

// 2.3 Refusal when unit is reserved by an active booking.
// Reservation triggers set the unit status to Reserved; the active-status gate
// runs before the explicit active-reservation gate. Both prevent retirement.
// Create a booking holding unitHeldId
const bkRes = await sql(`insert into bookings
  (client_uuid, booking_no, client_id, branch_id, stage, pickup_at, return_at, delivery_type, created_by, updated_by)
  values (gen_random_uuid(), '9000101', $1, $2, 'Booked', now() - interval '1 day', now() + interval '3 days', 'Client Pickup', $3, $3)
  returning id`, [client, branch, ownerId])
const bookingId = bkRes.rows[0].id

const blRes = await sql(`insert into booking_lines
  (client_uuid, booking_id, line_type, product_id, description, qty, days, rate, created_by)
  values (gen_random_uuid(), $1, 'Equipment', $2, 'Active rental hold line', 1, 4, 1000000, $3)
  returning id`, [bookingId, productId, ownerId])
const bookingLineId = blRes.rows[0].id

await sql(`insert into inventory_reservations
  (client_uuid, booking_id, booking_line_id, asset_id, period, created_by)
  select gen_random_uuid(), $1, $2, $3, tstzrange(pickup_at, return_at, '[)'), $4 from bookings where id = $1`,
  [bookingId, bookingLineId, unitHeldId, ownerId])

await expectThrows(
  () => sql(`select retire_equipment_unit($1, 'Damaged beyond repair in transit', $2)`, [unitHeldId, crypto.randomUUID()]),
  'GATE:unit.retire.active_status',
  'Cannot retire a Reserved unit with an active booking hold'
)

// 2.4 Successfully retire unheld unit
const retireKey = crypto.randomUUID()
const retireRes = await sql(`select retire_equipment_unit($1, 'Damaged sensor beyond economic repair', $2) as result`, [unitToRetireId, retireKey])
const retireResult = retireRes.rows[0].result
assert(retireResult.status === 'Retired', 'Unit marked Retired')
assert(retireResult.total_quantity === 1, 'Product total_quantity reduced to 1')

// Check DB state
const retiredDb = await sql(`select status, retirement_reason, retired_by from product_units where id = $1`, [unitToRetireId])
assert(retiredDb.rows[0].status === 'Retired', 'DB status is Retired')
assert(retiredDb.rows[0].retirement_reason === 'Damaged sensor beyond economic repair', 'Retirement reason saved')
assert(retiredDb.rows[0].retired_by === ownerId, 'Retired by matches actor')

// 2.5 Cannot re-retire
await expectThrows(
  () => sql(`select retire_equipment_unit($1, 'Trying to retire again for reasons', $2)`, [unitToRetireId, crypto.randomUUID()]),
  'already retired',
  'Cannot retire an already retired unit'
)

// ---------------------------------------------------------------------------
console.log('\n--- 3. Testing enroll_client_membership ---')
// ---------------------------------------------------------------------------

// 3.1 Driver cannot enroll membership
await asUser(driverId)
await expectThrows(
  () => sql(`select enroll_client_membership($1, $2, current_date, 50000, 'Test', $3)`, [client, plan, crypto.randomUUID()]),
  'Only Coordinator or above can change a client membership',
  'Driver role cannot enroll client membership'
)

// 3.2 Owner enrolls initial tier
await asUser(ownerId)
const enrollKey1 = crypto.randomUUID()
const enroll1 = await sql(`select enroll_client_membership($1, $2, current_date, 50000, 'VIP member', $3) as result`, [client, plan, enrollKey1])
const mem1Id = enroll1.rows[0].result.membership_id ?? enroll1.rows[0].result.id
assert(mem1Id !== undefined, 'First membership enrolled with ID')

// Verify active membership exists
const memDb1 = await sql(`select id, superseded_at, superseded_by_id from client_memberships where client_id = $1 and superseded_at is null`, [client])
assert(memDb1.rows.length === 1, 'Exactly one active membership exists in database')
assert(memDb1.rows[0].id === mem1Id, 'Active membership id matches initial enrollment')

// 3.3 Enroll upgrade / new tier -> supersedes initial membership atomically
const enrollKey2 = crypto.randomUUID()
const enroll2 = await sql(`select enroll_client_membership($1, $2, current_date, 100000, 'Upgrade to Cinematographer', $3) as result`, [client, plan2, enrollKey2])
const mem2Id = enroll2.rows[0].result.membership_id ?? enroll2.rows[0].result.id
assert(enroll2.rows[0].result.superseded_membership_id === mem1Id, 'Superseded membership ID points to mem1')

// Verify old membership was superseded and new one is the single active membership
const oldMem = await sql(`select superseded_at, superseded_by_id from client_memberships where id = $1`, [mem1Id])
assert(oldMem.rows[0].superseded_at !== null, 'Initial membership marked superseded_at')
assert(oldMem.rows[0].superseded_by_id === mem2Id, 'Initial membership superseded_by_id points to mem2')

const activeMems = await sql(`select id from client_memberships where client_id = $1 and superseded_at is null`, [client])
assert(activeMems.rows.length === 1 && activeMems.rows[0].id === mem2Id, 'Exactly one active membership survives (mem2)')

// ---------------------------------------------------------------------------
console.log('\n--- 4. Testing save_record_section ---')
// ---------------------------------------------------------------------------

// 4.1 Save identity section for client
const clientSnapshot = (await sql('select read_record_editor($1, $2::text) as snap', ['client', client])).rows[0].snap
const clientRev = clientSnapshot.revision
const saveKey1 = crypto.randomUUID()
const saveRes1 = await sql(`select save_record_section($1, $2, $3, $4, $5, $6::jsonb) as result`, [
  'client',
  client,
  'identity',
  clientRev,
  saveKey1,
  JSON.stringify({ name: 'Sagarmatha Films Pvt Ltd', pan_vat: '987654321' })
])
assert(saveRes1.rows[0].result.values.name === 'Sagarmatha Films Pvt Ltd', 'Client name updated in snapshot')
assert(saveRes1.rows[0].result.revision !== clientRev, 'New revision returned after section save')

// 4.2 Optimistic concurrency refusal on stale revision
await expectThrows(
  () => sql(`select save_record_section($1, $2, $3, $4, $5, $6::jsonb)`, [
    'client',
    client,
    'identity',
    clientRev, // Stale revision!
    crypto.randomUUID(),
    JSON.stringify({ name: 'Conflict Films' })
  ]),
  'This record changed since you opened it',
  'Stale revision rejected with conflict error'
)

console.log(`\n========================================`)
console.log('--- 5. Real section payloads and preservation contracts ---')
async function snapshot(kind, id) {
  return (await sql('select read_record_editor($1,$2::text) as result', [kind,id])).rows[0].result
}
async function section(kind, id, name, values, rows = [], key = crypto.randomUUID(), revision) {
  const before = await snapshot(kind,id)
  const result = (await sql('select save_record_section($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb) as result',
    [kind,id,name,revision ?? before.revision,key,JSON.stringify(values),JSON.stringify(rows)])).rows[0].result
  return { before, result, key }
}
await sql('set role authenticated')
const contact = await section('client',client,'contact',{website:'https://example.invalid'},[
  {full_name:'Test Producer',designation:'Producer',phone:'+9779800000901',email:'producer@example.invalid'},
])
assert(contact.result.values.website === 'https://example.invalid', 'Contact website saves through the actual allowlist')
assert(contact.result.rows[0].full_name === 'Test Producer', 'Primary contact persists with the Contact section')
const contactId = contact.result.rows[0].id
const address = await section('client',client,'address',{address_line:'Kathmandu',city:'Kathmandu',country:'Nepal'})
assert(address.result.values.city === 'Kathmandu', 'Address section accepts the canonical singular key')
assert(address.result.rows[0].id === contactId, 'Address save preserves untouched primary contact')
const notes = await section('client',client,'notes',{notes:'Recorded notes'})
assert(notes.result.values.website === 'https://example.invalid', 'Notes save preserves saved Contact fields')
assert(notes.result.rows[0].id === contactId, 'Notes save preserves contact identity')
const replay = await section('client',client,'notes',{notes:'Recorded notes'},[],notes.key,notes.before.revision)
assert(replay.result.revision === notes.result.revision, 'Ambiguous response retry returns the same section receipt')
await expectThrows(() => section('client',client,'notes',{notes:'Different request'},[],notes.key,notes.before.revision),
  'different change','A section request key cannot be reused for a different payload')
await expectThrows(() => section('client',client,'notes',{notes:'Unsafe',approved_credit_limit:999999}),
  'cannot be edited','Section allowlist refuses a commercial field smuggled through Notes')
assert((await snapshot('client',client)).values.notes === 'Recorded notes', 'Refused section write leaves the record unchanged')
const locationBefore = await snapshot('equipment',productId)
const location = await section('equipment',productId,'location',{},[{id:unitHeldId,warehouse_id:warehouse,rack:'B',shelf:'4',bin:'2'}])
assert(location.result.rows.find(row=>row.id===unitHeldId).rack === 'B', 'Location saves existing unit location instead of product columns')
assert(location.result.rows.length === locationBefore.rows.length, 'Location save preserves all other unit rows including retired history')
assert(location.result.values.total_quantity === locationBefore.values.total_quantity, 'Location save cannot change stock quantity')
await expectThrows(() => section('equipment',productId,'location',{},[{id:unitHeldId,warehouse_id:warehouse,status:'In Stock'}]),
  'Only unit location','Location section refuses custody/status fields')
const stock = await section('equipment',productId,'stock',{reorder_level:3,quantity_unit:'piece'})
assert(stock.result.values.reorder_level === 3, 'Stock metadata section saves independently')
await expectThrows(() => section('equipment',productId,'stock',{total_quantity:55}),
  'cannot be edited','Stock metadata cannot replace deliberate stock adjustment')
const purchase = await section('equipment',productId,'purchase',{replacement_value:500000})
assert(purchase.result.values.replacement_value === 500000, 'Purchase section persists its own data')
const pricing = await section('equipment',productId,'pricing',{daily_rate:2500,min_rental_days:1})
assert(pricing.result.values.daily_rate === 2500, 'Pricing section persists without losing unit locations')
assert(pricing.result.rows.find(row=>row.id===unitHeldId).rack === 'B', 'Pricing save retains unit location')
const maintenance = await section('equipment',productId,'maintenance',{notes_warehouse:'Inspect caps',prep_time_minutes:15})
assert(maintenance.result.values.prep_time_minutes === 15, 'Maintenance section persists independently')
await sql('reset role')
const bundle = (await sql(`insert into bundles(client_uuid,bundle_code,name,daily_rate,created_by)
  values(gen_random_uuid(),'BD-SECTION-TEST','Section bundle',1000,$1) returning id`,[ownerId])).rows[0].id
await sql(`insert into bundle_items(client_uuid,bundle_id,product_id,quantity,days,is_mandatory,sort_order,created_by)
  values(gen_random_uuid(),$1,$2,1,1,true,0,$3)`,[bundle,productId,ownerId])
await sql('set role authenticated')
const bundleIdentity = await section('bundle',bundle,'identity',{name:'Verified section bundle',is_active:true})
assert(bundleIdentity.result.values.is_active === true, 'Active Bundle Builder identity round-trips through snapshot')
const oldItem = bundleIdentity.result.rows[0].id
const bundleRate = await section('bundle',bundle,'rates',{daily_rate:1500})
assert(bundleRate.result.rows[0].id === oldItem, 'Bundle rate save preserves component identity')
const bundleComponents = await section('bundle',bundle,'components',{},[
  {product_id:productId,quantity:2,days:3,is_mandatory:false,sort_order:0},
])
assert(bundleComponents.result.rows.length === 1 && bundleComponents.result.rows[0].quantity === 2, 'Bundle component replacement persists transactionally')
assert(bundleComponents.result.values.daily_rate === 1500, 'Component save preserves separately saved rate')
const oldItemState = (await sql('select is_active from bundle_items where id=$1',[oldItem])).rows[0]
assert(oldItemState.is_active === false, 'Removed bundle component is deactivated with history retained')
await expectThrows(() => section('bundle',bundle,'components',{},[]),'at least one component','Active bundle refuses an empty component section')
assert((await snapshot('bundle',bundle)).rows.length === 1, 'Rejected empty bundle leaves previous components intact')
await asUser(driverId)
await expectThrows(()=> section('client',client,'notes',{notes:'Denied'}),'Permission denied','Driver cannot enter the section editor')
await sql('reset role')
await asUser(ownerId)
console.log(`All ${testsPassed} integration assertions PASSED (0 failures)!`)
console.log(`========================================\n`)
await db.close()
