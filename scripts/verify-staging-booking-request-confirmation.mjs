import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
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

console.log('=== Staging Booking Request Confirmation Acceptance (T7-04) ===\n')

const coord = await getToken('Coordinator')
console.log(`✓ Authenticated Coordinator (${coord.user.id})`)
const warehouse = await getToken('Warehouse')
console.log(`✓ Authenticated Warehouse (${warehouse.user.id})`)
const client = await getToken('Client')
console.log(`✓ Authenticated Client (${client.user.id})\n`)

const checks = []
function record(name, pass, detail = '') {
  checks.push({ name, status: pass ? 'PASS' : 'FAIL', detail })
  const symbol = pass ? '✓' : '✗'
  console.log(`  ${symbol} [${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ` (${detail})` : ''}`)
}

// 1. Fetch request REQ-20261121-1001
const reqRes = await fetch(`${BASE_URL}/rest/v1/booking_requests_v?request_number=eq.REQ-20261121-1001`, {
  headers: { 'apikey': anonKey, 'Authorization': `Bearer ${coord.token}` }
})
const requests = await reqRes.json()
const req = requests[0]
record('Coordinator: REQ-20261121-1001 visible in staff queue', reqRes.status === 200 && !!req)
record('Request status is confirmed or pending', req?.status === 'confirmed' || req?.status === 'pending', `status: ${req?.status}`)
record('Request has server-computed VAT (13%) and advance due', req?.vat_paisa === 195000 && req?.advance_due_paisa === 847500)

const requestId = req?.id
const clientId = 'e0000000-0000-4000-8000-000000000001'
const branchId = '00000000-0000-0000-0000-000000000001'
const productId = '10000000-0000-4000-8000-000000000001'

// 2. Coordinator creates confirmed booking using create_booking RPC
const bookingClientUuid = crypto.randomUUID()
const bookingPayload = {
  client_uuid: bookingClientUuid,
  created_by: coord.user.id,
  branch_id: branchId,
  client_id: clientId,
  project_name: 'Staging Verification Shoot',
  shoot_location: 'Boudha, Kathmandu',
  pickup_at: '2026-11-23T06:00:00Z',
  return_at: '2026-11-25T06:00:00Z',
  delivery_type: 'Client Pickup',
  lines: [
    {
      client_uuid: crypto.randomUUID(),
      line_type: 'Equipment',
      product_id: productId,
      qty: 1,
      days: 3,
      rate: 5000
    }
  ]
}

const createRes = await fetch(`${BASE_URL}/rest/v1/rpc/create_booking`, {
  method: 'POST',
  headers: {
    'apikey': anonKey,
    'Authorization': `Bearer ${coord.token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ p_payload: bookingPayload })
})
const createData = await createRes.json()
const bookingId = createData?.booking_id
record('Coordinator: create_booking RPC returns new booking', createRes.status === 200 && !!bookingId, `booking_id: ${bookingId}`)

// 3. Coordinator confirms the booking request via confirm_booking_request RPC
const confirmTargetBookingId = req?.status === 'confirmed' ? req.booking_id : bookingId
const confirmRes = await fetch(`${BASE_URL}/rest/v1/rpc/confirm_booking_request`, {
  method: 'POST',
  headers: {
    'apikey': anonKey,
    'Authorization': `Bearer ${coord.token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    p_request_id: requestId,
    p_booking_id: confirmTargetBookingId
  })
})
const confirmData = await confirmRes.json()
record('Coordinator: confirm_booking_request RPC succeeds', confirmRes.status === 200 && (confirmData?.status === 'confirmed' || confirmData?.already_confirmed === true))
record('Booking request linked to created booking', (confirmData?.booking_id || req?.booking_id) === confirmTargetBookingId)

// 4. Test idempotency of confirm_booking_request
const reconfirmRes = await fetch(`${BASE_URL}/rest/v1/rpc/confirm_booking_request`, {
  method: 'POST',
  headers: {
    'apikey': anonKey,
    'Authorization': `Bearer ${coord.token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    p_request_id: requestId,
    p_booking_id: confirmTargetBookingId
  })
})
const reconfirmData = await reconfirmRes.json()
record('Confirm idempotency: re-confirm returns already_confirmed', reconfirmRes.status === 200 && reconfirmData?.already_confirmed === true)

// 5. Verify queue state as Coordinator
const verifyCoordRes = await fetch(`${BASE_URL}/rest/v1/booking_requests_v?id=eq.${requestId}`, {
  headers: { 'apikey': anonKey, 'Authorization': `Bearer ${coord.token}` }
})
const coordReq = (await verifyCoordRes.json())[0]
record('Queue state in coordinator view updated to confirmed', coordReq?.status === 'confirmed' && coordReq?.booking_id === confirmTargetBookingId)

// 6. Verify queue state as Warehouse (Law 6 money masking)
const verifyWhRes = await fetch(`${BASE_URL}/rest/v1/booking_requests_v?id=eq.${requestId}`, {
  headers: { 'apikey': anonKey, 'Authorization': `Bearer ${warehouse.token}` }
})
const whReq = (await verifyWhRes.json())[0]
record('Warehouse: confirmed request visible in queue', verifyWhRes.status === 200 && whReq?.status === 'confirmed')
record('Warehouse: total_paisa masked to null (Law 6)', whReq?.total_paisa === null)
record('Warehouse: vat_paisa masked to null (Law 6)', whReq?.vat_paisa === null)
record('Warehouse: advance_due_paisa masked to null (Law 6)', whReq?.advance_due_paisa === null)

// 7. Non-coordinator refusal check: Warehouse cannot confirm requests
const whRefuseRes = await fetch(`${BASE_URL}/rest/v1/rpc/confirm_booking_request`, {
  method: 'POST',
  headers: {
    'apikey': anonKey,
    'Authorization': `Bearer ${warehouse.token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    p_request_id: requestId,
    p_booking_id: bookingId
  })
})
record('Non-coordinator refusal: Warehouse denied confirm_booking_request', whRefuseRes.status >= 400)

const allPassed = checks.every(c => c.status === 'PASS')
console.log('\n------------------------------------------------------------')
console.log(`STAGING REQUEST CONFIRMATION: ${allPassed ? 'PASS' : 'FAIL'} (${checks.filter(c => c.status === 'PASS').length}/${checks.length} assertions)`)
console.log('------------------------------------------------------------')

const reportDir = resolve('artifacts/staging-verification', new Date().toISOString().replace(/[:.]/g, '-'))
mkdirSync(reportDir, { recursive: true })
const report = {
  project: PROJECT_REF,
  status: allPassed ? 'PASS' : 'FAIL',
  timestamp: new Date().toISOString(),
  requestId,
  bookingId,
  checks
}
writeFileSync(resolve(reportDir, 'REQUEST_CONFIRMATION_REPORT.json'), JSON.stringify(report, null, 2))
console.log(`\nEvidence receipt written to: ${reportDir}`)
process.exit(allPassed ? 0 : 1)
