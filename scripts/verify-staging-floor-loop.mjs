import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

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

console.log('=== Staging Floor Operations Loop Acceptance (T2 Loop) ===\n')

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
const branchId = '00000000-0000-0000-0000-000000000001'
const lineId = '29d498a3-58bc-4447-8018-61b2fdd7286c'
const productId = '10000000-0000-4000-8000-000000000001'
const unitId = '7c75ea7f-6e07-43ed-b8ec-a66efceecb88'

// 1. Current Booking Stage
const bInitRes = await fetch(`${BASE_URL}/rest/v1/bookings?id=eq.${bookingId}&select=id,stage,booking_no`, {
  headers: { 'apikey': anonKey, 'Authorization': `Bearer ${coord.token}` }
})
const bInit = (await bInitRes.json())[0]
record('Booking stage is Packed', bInit?.stage === 'Packed', `stage: ${bInit?.stage}`)

// 2. Verify unit assigned in booking_line_units
const bluRes = await fetch(`${BASE_URL}/rest/v1/booking_line_units?booking_line_id=eq.${lineId}&asset_id=eq.${unitId}`, {
  headers: { 'apikey': anonKey, 'Authorization': `Bearer ${coord.token}` }
})
const bluData = await bluRes.json()
record('Unit assigned in booking_line_units', bluData.length > 0 && bluData[0].asset_id === unitId)

// 3. Handover Operation (Packed -> On Rent)
const handoverSessionId = crypto.randomUUID()
const hoSessionRes = await fetch(`${BASE_URL}/rest/v1/operation_sessions`, {
  method: 'POST',
  headers: {
    'apikey': anonKey,
    'Authorization': `Bearer ${warehouse.token}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  },
  body: JSON.stringify({
    id: handoverSessionId,
    client_uuid: crypto.randomUUID(),
    booking_id: bookingId,
    operation: 'Handover',
    session_no: 1,
    state: 'In Progress',
    started_at: new Date().toISOString(),
    started_by: warehouse.user.id,
    warehouse_staff_id: warehouse.user.id,
    delivery_method: 'Client Pickup',
    receiver_name: 'Synthetic Client Alpha',
    pickup_person_name: 'Synthetic Client Alpha',
    government_id_verified: true,
    booking_authorization_verified: true,
    created_by: warehouse.user.id
  })
})
record('Warehouse: open handover session (In Progress, ID verified)', hoSessionRes.status === 201)

// Upload Handover signature to evidence bucket (path: <bookingId>/<handoverSessionId>/signature-receiver.png)
const sigBuffer = Buffer.from('FAKE-PNG-CLIENT-SIGNATURE-STAGING-20261121', 'utf8')
const sigHash = createHash('sha256').update(sigBuffer).digest('hex')
const sigStoragePath = `${bookingId}/${handoverSessionId}/signature-receiver.png`
const uploadSigRes = await fetch(`${BASE_URL}/storage/v1/object/evidence/${sigStoragePath}`, {
  method: 'POST',
  headers: {
    'apikey': anonKey,
    'Authorization': `Bearer ${warehouse.token}`,
    'Content-Type': 'image/png',
    'x-upsert': 'true'
  },
  body: sigBuffer
})
record('Warehouse: upload handover signature to storage', [200, 201].includes(uploadSigRes.status))

// Register signature evidence file
const sigFileId = crypto.randomUUID()
const sigFileRes = await fetch(`${BASE_URL}/rest/v1/evidence_files`, {
  method: 'POST',
  headers: {
    'apikey': anonKey,
    'Authorization': `Bearer ${warehouse.token}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  },
  body: JSON.stringify({
    id: sigFileId,
    client_uuid: crypto.randomUUID(),
    content_hash: sigHash,
    storage_path: sigStoragePath,
    original_filename: 'signature-receiver.png',
    media_type: 'Image',
    format: 'png',
    size_bytes: sigBuffer.length,
    category: 'Pickup / Delivery',
    created_by: warehouse.user.id
  })
})
record('Warehouse: insert signature evidence_files record', sigFileRes.status === 201)

// Register handover line
const hoLineRes = await fetch(`${BASE_URL}/rest/v1/handover_lines`, {
  method: 'POST',
  headers: {
    'apikey': anonKey,
    'Authorization': `Bearer ${warehouse.token}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  },
  body: JSON.stringify({
    client_uuid: crypto.randomUUID(),
    booking_line_id: lineId,
    state: 'Picked Up',
    qty_required: 1,
    first_session_id: handoverSessionId,
    completed_session_id: handoverSessionId,
    picked_up_at: new Date().toISOString(),
    created_by: warehouse.user.id
  })
})
record('Warehouse: insert handover_lines (state: Picked Up)', hoLineRes.status === 201)

// Register handover line movement
const hoMvRes = await fetch(`${BASE_URL}/rest/v1/session_line_movements`, {
  method: 'POST',
  headers: {
    'apikey': anonKey,
    'Authorization': `Bearer ${warehouse.token}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  },
  body: JSON.stringify({
    client_uuid: crypto.randomUUID(),
    session_id: handoverSessionId,
    booking_line_id: lineId,
    unit_id: unitId,
    qty: 1,
    resulting_item_state: 'Picked Up',
    moved_at: new Date().toISOString(),
    created_by: warehouse.user.id
  })
})
record('Warehouse: insert session_line_movements (Handover Picked Up)', hoMvRes.status === 201)

// Insert receiver and warehouse signatures
const sigRecRes = await fetch(`${BASE_URL}/rest/v1/signatures`, {
  method: 'POST',
  headers: {
    'apikey': anonKey,
    'Authorization': `Bearer ${warehouse.token}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  },
  body: JSON.stringify({
    client_uuid: crypto.randomUUID(),
    session_id: handoverSessionId,
    signature_role: 'Receiver',
    signer_name: 'Synthetic Client Alpha',
    signed_at: new Date().toISOString(),
    device: 'iPad Floor Station 01',
    signature_evidence_file_id: sigFileId,
    is_required: true,
    created_by: warehouse.user.id
  })
})
record('Handover: capture Receiver signature', sigRecRes.status === 201)

const sigWhRes = await fetch(`${BASE_URL}/rest/v1/signatures`, {
  method: 'POST',
  headers: {
    'apikey': anonKey,
    'Authorization': `Bearer ${warehouse.token}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  },
  body: JSON.stringify({
    client_uuid: crypto.randomUUID(),
    session_id: handoverSessionId,
    signature_role: 'Warehouse staff',
    signer_name: 'Staging Warehouse Operator',
    signed_at: new Date().toISOString(),
    device: 'iPad Floor Station 01',
    is_required: true,
    created_by: warehouse.user.id
  })
})
record('Handover: capture Warehouse staff signature', sigWhRes.status === 201)

// Transition: Packed -> On Rent
const hoTransRes = await fetch(`${BASE_URL}/rest/v1/booking_stage_transitions`, {
  method: 'POST',
  headers: {
    'apikey': anonKey,
    'Authorization': `Bearer ${warehouse.token}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  },
  body: JSON.stringify({
    client_uuid: crypto.randomUUID(),
    booking_id: bookingId,
    branch_id: branchId,
    from_stage: 'Packed',
    to_stage: 'On Rent',
    actor_id: warehouse.user.id,
    actor_role: 'Warehouse',
    reason: 'Handover complete: receiver ID verified and signatures signed on iPad'
  })
})
record('Transition: Packed -> On Rent succeeds', hoTransRes.status === 201)

// Close handover session
await fetch(`${BASE_URL}/rest/v1/operation_sessions?id=eq.${handoverSessionId}`, {
  method: 'PATCH',
  headers: {
    'apikey': anonKey,
    'Authorization': `Bearer ${warehouse.token}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  },
  body: JSON.stringify({
    state: 'Completed',
    completed_at: new Date().toISOString(),
    completed_by: warehouse.user.id
  })
})

const bOnRentRes = await fetch(`${BASE_URL}/rest/v1/bookings?id=eq.${bookingId}&select=id,stage`, {
  headers: { 'apikey': anonKey, 'Authorization': `Bearer ${coord.token}` }
})
const bOnRent = (await bOnRentRes.json())[0]
record('Booking stage verified as On Rent', bOnRent?.stage === 'On Rent')

// 4. Return Operation (On Rent -> Returned)
const returnSessionId = crypto.randomUUID()
const retSessionRes = await fetch(`${BASE_URL}/rest/v1/operation_sessions`, {
  method: 'POST',
  headers: {
    'apikey': anonKey,
    'Authorization': `Bearer ${warehouse.token}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  },
  body: JSON.stringify({
    id: returnSessionId,
    client_uuid: crypto.randomUUID(),
    booking_id: bookingId,
    operation: 'Return',
    session_no: 1,
    state: 'In Progress',
    started_at: new Date().toISOString(),
    started_by: warehouse.user.id,
    warehouse_staff_id: warehouse.user.id,
    returning_person_name: 'Synthetic Client Alpha',
    created_by: warehouse.user.id
  })
})
record('Warehouse: open return session (In Progress)', retSessionRes.status === 201)

const returnLineId = crypto.randomUUID()
const retLineRes = await fetch(`${BASE_URL}/rest/v1/return_lines`, {
  method: 'POST',
  headers: {
    'apikey': anonKey,
    'Authorization': `Bearer ${warehouse.token}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  },
  body: JSON.stringify({
    id: returnLineId,
    client_uuid: crypto.randomUUID(),
    session_id: returnSessionId,
    booking_line_id: lineId,
    state: 'Returned',
    qty_expected: 1,
    returned_at: new Date().toISOString(),
    inspection_state: 'Inspected',
    condition: 'Good',
    inspected_by: warehouse.user.id,
    inspected_at: new Date().toISOString(),
    returned_by_name: 'Synthetic Client Alpha',
    created_by: warehouse.user.id
  })
})
record('Warehouse: insert return_lines (state: Returned, inspection: Good)', retLineRes.status === 201)

const retMvRes = await fetch(`${BASE_URL}/rest/v1/session_line_movements`, {
  method: 'POST',
  headers: {
    'apikey': anonKey,
    'Authorization': `Bearer ${warehouse.token}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  },
  body: JSON.stringify({
    client_uuid: crypto.randomUUID(),
    session_id: returnSessionId,
    booking_line_id: lineId,
    unit_id: unitId,
    qty: 1,
    resulting_item_state: 'Returned',
    moved_at: new Date().toISOString(),
    created_by: warehouse.user.id
  })
})
record('Warehouse: insert session_line_movements (Return Returned)', retMvRes.status === 201)

const retTransRes = await fetch(`${BASE_URL}/rest/v1/booking_stage_transitions`, {
  method: 'POST',
  headers: {
    'apikey': anonKey,
    'Authorization': `Bearer ${warehouse.token}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  },
  body: JSON.stringify({
    client_uuid: crypto.randomUUID(),
    booking_id: bookingId,
    branch_id: branchId,
    from_stage: 'On Rent',
    to_stage: 'Returned',
    actor_id: warehouse.user.id,
    actor_role: 'Warehouse',
    reason: 'Gear returned intact, functional check passed'
  })
})
record('Transition: On Rent -> Returned succeeds', retTransRes.status === 201)

// Close return session
await fetch(`${BASE_URL}/rest/v1/operation_sessions?id=eq.${returnSessionId}`, {
  method: 'PATCH',
  headers: {
    'apikey': anonKey,
    'Authorization': `Bearer ${warehouse.token}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  },
  body: JSON.stringify({
    state: 'Completed',
    completed_at: new Date().toISOString(),
    completed_by: warehouse.user.id
  })
})

const bReturnedRes = await fetch(`${BASE_URL}/rest/v1/bookings?id=eq.${bookingId}&select=id,stage`, {
  headers: { 'apikey': anonKey, 'Authorization': `Bearer ${coord.token}` }
})
const bReturned = (await bReturnedRes.json())[0]
record('Booking stage verified as Returned', bReturned?.stage === 'Returned')

// 5. Reset / QC Operation (Technician)
const cleanQueueId = crypto.randomUUID()
const cleanRes = await fetch(`${BASE_URL}/rest/v1/cleaning_queue_entries`, {
  method: 'POST',
  headers: {
    'apikey': anonKey,
    'Authorization': `Bearer ${technician.token}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  },
  body: JSON.stringify({
    id: cleanQueueId,
    client_uuid: crypto.randomUUID(),
    unit_id: unitId,
    booking_id: bookingId,
    return_line_id: returnLineId,
    state: 'Ready',
    requires_clean: true,
    requires_reset: true,
    cleaned_by: technician.user.id,
    clean_completed_at: new Date().toISOString(),
    qc_by: technician.user.id,
    qc_self_checked: true,
    qc_at: new Date().toISOString(),
    problem_state: 'No Problems',
    reset_completed_at: new Date().toISOString(),
    created_by: technician.user.id
  })
})
record('Technician: complete cleaning queue entry (alone-on-shift self-QC)', cleanRes.status === 201)

// Technician marks product_unit back In Stock
const puUpdateRes = await fetch(`${BASE_URL}/rest/v1/product_units?id=eq.${unitId}`, {
  method: 'PATCH',
  headers: {
    'apikey': anonKey,
    'Authorization': `Bearer ${technician.token}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  },
  body: JSON.stringify({
    status: 'In Stock'
  })
})
record('Technician: update product_unit status to In Stock', puUpdateRes.status === 204)

// 6. Law 6 Money Masking Assertions
const whReqRes = await fetch(`${BASE_URL}/rest/v1/booking_requests_v?request_number=eq.REQ-20261121-1001`, {
  headers: { 'apikey': anonKey, 'Authorization': `Bearer ${warehouse.token}` }
})
const whReq = (await whReqRes.json())[0]
record('Law 6: Warehouse cannot see total_paisa', whReq?.total_paisa === null)
record('Law 6: Warehouse cannot see vat_paisa', whReq?.vat_paisa === null)
record('Law 6: Warehouse cannot see advance_due_paisa', whReq?.advance_due_paisa === null)

const whBookingsRes = await fetch(`${BASE_URL}/rest/v1/bookings?select=*&limit=1`, {
  headers: { 'apikey': anonKey, 'Authorization': `Bearer ${warehouse.token}` }
})
record('Law 6: Warehouse denied blanket select on bookings table', whBookingsRes.status === 403)

const allPassed = checks.every(c => c.status === 'PASS')
console.log('\n------------------------------------------------------------')
console.log(`STAGING FLOOR OPERATIONS LOOP: ${allPassed ? 'PASS' : 'FAIL'} (${checks.filter(c => c.status === 'PASS').length}/${checks.length} assertions)`)
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
writeFileSync(resolve(reportDir, 'FLOOR_OPERATIONS_LOOP_REPORT.json'), JSON.stringify(report, null, 2))
console.log(`\nEvidence receipt written to: ${reportDir}`)
process.exit(allPassed ? 0 : 1)
