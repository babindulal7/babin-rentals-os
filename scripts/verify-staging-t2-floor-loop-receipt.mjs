import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PROJECT_REF = 'klhmsrunqrdxjudyhnkm'
const BASE_URL = `https://${PROJECT_REF}.supabase.co`
const anonKey = process.env.BABIN_STAGING_ANON_KEY || 'sb_publishable_I8NeNGI8ZLbGHybUYHm-SQ_ypCLh1La'

async function getToken(role) {
  const email = `staging-${role.toLowerCase()}@babinrentals.test`
  const password = 'StagingPass2026!'
  const res = await fetch(`${BASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  if (!res.ok) throw new Error(`Auth failed for ${role}: ${res.status}`)
  const data = await res.json()
  return { token: data.access_token, user: data.user }
}

console.log('=== Staging Complete Floor Operations Loop Acceptance Receipt (T2 Loop) ===\n')

const warehouse = await getToken('Warehouse')
console.log(`✓ Authenticated Warehouse (${warehouse.user.id})`)
const technician = await getToken('Technician')
console.log(`✓ Authenticated Technician (${technician.user.id})`)
const coord = await getToken('Coordinator')
console.log(`✓ Authenticated Coordinator (${coord.user.id})\n`)

const checks = []
function record(name, pass, detail = '') {
  checks.push({ name, status: pass ? 'PASS' : 'FAIL', detail })
  const symbol = pass ? '✓' : '✗'
  console.log(`  ${symbol} [${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ` (${detail})` : ''}`)
}

const bookingId = 'f861dab2-e4a6-43cc-a723-71b7481b96e2'
const lineId = '29d498a3-58bc-4447-8018-61b2fdd7286c'
const productId = '10000000-0000-4000-8000-000000000001'
const unitId = '7c75ea7f-6e07-43ed-b8ec-a66efceecb88'

// 1. Verify Booking Lifecycle Record in Database
const bRes = await fetch(`${BASE_URL}/rest/v1/bookings?id=eq.${bookingId}&select=id,booking_no,stage,project_name,pickup_at,return_at`, {
  headers: { 'apikey': anonKey, 'Authorization': `Bearer ${coord.token}` }
})
const booking = (await bRes.json())[0]
record('Booking exists and has reached Returned stage', booking?.stage === 'Returned', `stage: ${booking?.stage}, no: ${booking?.booking_no}`)

// 2. Verify Complete Transition Trail (Quote -> Booked -> Packed -> On Rent -> Returned)
const transRes = await fetch(`${BASE_URL}/rest/v1/booking_stage_transitions?booking_id=eq.${bookingId}&select=id,from_stage,to_stage,actor_role,reason&order=occurred_at.asc`, {
  headers: { 'apikey': anonKey, 'Authorization': `Bearer ${coord.token}` }
})
const transitions = await transRes.json()
const stagePairs = transitions.map(t => `${t.from_stage}->${t.to_stage}`)
record('Complete stage transition audit trail exists in Postgres', transitions.length >= 4, `stages: ${stagePairs.join(', ')}`)
record('Contains Quote -> Booked transition', stagePairs.includes('Quote->Booked'))
record('Contains Booked -> Packed transition', stagePairs.includes('Booked->Packed'))
record('Contains Packed -> On Rent transition', stagePairs.includes('Packed->On Rent'))
record('Contains On Rent -> Returned transition', stagePairs.includes('On Rent->Returned'))

// 3. Verify Operational Sessions and Movements
const sessRes = await fetch(`${BASE_URL}/rest/v1/operation_sessions?booking_id=eq.${bookingId}&select=id,operation,state,delivery_method,government_id_verified&order=created_at.asc`, {
  headers: { 'apikey': anonKey, 'Authorization': `Bearer ${coord.token}` }
})
const sessions = await sessRes.json()
const ops = sessions.map(s => s.operation)
record('Packing, Handover, and Return sessions recorded', ops.includes('Packing') && ops.includes('Handover') && ops.includes('Return'))

const handoverSess = sessions.find(s => s.operation === 'Handover')
record('Handover session recorded Law 17 delivery method: Client Pickup', handoverSess?.delivery_method === 'Client Pickup')
record('Handover session recorded government ID verified', handoverSess?.government_id_verified === true)

// 4. Verify Handover Signatures
const sigRes = await fetch(`${BASE_URL}/rest/v1/signatures?session_id=eq.${handoverSess?.id}&select=id,signature_role,signer_name,device`, {
  headers: { 'apikey': anonKey, 'Authorization': `Bearer ${coord.token}` }
})
const signatures = await sigRes.json()
const sigRoles = signatures.map(s => s.signature_role)
record('Receiver signature captured on glass', sigRoles.includes('Receiver'))
record('Warehouse staff signature captured on glass', sigRoles.includes('Warehouse staff'))

// 5. Verify Return Inspection State
const retLineRes = await fetch(`${BASE_URL}/rest/v1/return_lines?booking_line_id=eq.${lineId}&select=id,state,inspection_state,condition`, {
  headers: { 'apikey': anonKey, 'Authorization': `Bearer ${coord.token}` }
})
const retLine = (await retLineRes.json())[0]
record('Return line state is Returned and inspection condition is Good', retLine?.state === 'Returned' && retLine?.condition === 'Good')

// 6. Verify Reset & Cleaning Queue (Technician Alone-on-Shift Self-QC, T2-13 / 0183)
const cleanRes = await fetch(`${BASE_URL}/rest/v1/cleaning_queue_entries?unit_id=eq.${unitId}&select=id,state,qc_self_checked,problem_state&order=created_at.desc&limit=1`, {
  headers: { 'apikey': anonKey, 'Authorization': `Bearer ${technician.token}` }
})
const cleanEntry = (await cleanRes.json())[0]
record('Cleaning queue entry recorded Ready with alone-on-shift self-QC', cleanEntry?.state === 'Ready' && cleanEntry?.qc_self_checked === true)
record('No damage problems reported during reset', cleanEntry?.problem_state === 'No Problems')

// 7. Verify Law 1 Engine Invariant on product_units
const puDirectRes = await fetch(`${BASE_URL}/rest/v1/product_units?id=eq.${unitId}`, {
  method: 'PATCH',
  headers: {
    'apikey': anonKey,
    'Authorization': `Bearer ${technician.token}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  },
  body: JSON.stringify({ status: 'In Stock' })
})
record('Law 1 Invariant: direct client update to product_units.status refused (0114)', puDirectRes.status === 400)

// 8. Verify Law 6 Money Masking for Non-Financial Roles
const whReqRes = await fetch(`${BASE_URL}/rest/v1/booking_requests_v?request_number=eq.REQ-20261121-1001`, {
  headers: { 'apikey': anonKey, 'Authorization': `Bearer ${warehouse.token}` }
})
const whReq = (await whReqRes.json())[0]
record('Law 6: Warehouse view nulls total_paisa', whReq?.total_paisa === null)
record('Law 6: Warehouse view nulls vat_paisa', whReq?.vat_paisa === null)
record('Law 6: Warehouse view nulls advance_due_paisa', whReq?.advance_due_paisa === null)

const whBookingsRes = await fetch(`${BASE_URL}/rest/v1/bookings?select=*&limit=1`, {
  headers: { 'apikey': anonKey, 'Authorization': `Bearer ${warehouse.token}` }
})
record('Law 6: Warehouse denied blanket select on bookings table (403)', whBookingsRes.status === 403)

const allPassed = checks.every(c => c.status === 'PASS')
console.log('\n------------------------------------------------------------')
console.log(`STAGING FLOOR OPERATIONS ACCEPTANCE: ${allPassed ? 'PASS' : 'FAIL'} (${checks.filter(c => c.status === 'PASS').length}/${checks.length} assertions)`)
console.log('------------------------------------------------------------')

const reportDir = resolve('artifacts/staging-verification', new Date().toISOString().replace(/[:.]/g, '-'))
mkdirSync(reportDir, { recursive: true })
const report = {
  project: PROJECT_REF,
  status: allPassed ? 'PASS' : 'FAIL',
  timestamp: new Date().toISOString(),
  bookingId,
  productId,
  unitId,
  checks
}
writeFileSync(resolve(reportDir, 'STAGING_FLOOR_LOOP_ACCEPTANCE_REPORT.json'), JSON.stringify(report, null, 2))
console.log(`\nEvidence receipt written to: ${reportDir}`)
process.exit(allPassed ? 0 : 1)
