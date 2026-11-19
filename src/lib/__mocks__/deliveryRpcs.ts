/*
 * MOCK ONLY (dev:mock). The delivery RPCs the app calls for zones, the zone x vehicle fee grid, road-distance
 * bands, booking zones, job vehicle classes, outsourced-vehicle quotes and waiting charges
 * (migrations 0189, 0244, 0246-0251). Before this file the mock answered every one of them with
 * "not implemented", so none of those screens could be driven in a browser.
 *
 * The SEED below is demo data for the mock store ONLY. Its names and amounts are NOT Babin's zones or prices
 * and are NOT the draft rates in OPEN_DECISIONS §23; they exist so the screens have something to show.
 * Gates mirror the real functions in outline (roles, validation, R-03 refusal) but the database stays the
 * authority: these mocks prove the SCREENS, not the rules, which PGlite checks (`npm run test:*`).
 */

type Row = Record<string, unknown>
type Store = Record<string, Row[]>
type MockResult = Promise<{ data: unknown; error: { code: string; message: string; details: string; hint: string } | null }>

export interface DeliveryMockEnv {
  store: Store
  actorId: () => string | null
}

const ZONE_WRITERS = ['Owner', 'Admin', 'Manager']
const QUOTE_WRITERS = ['Owner', 'Admin', 'Manager', 'Coordinator']
const MOCK_ZONES = [
  { id: '00000000-0000-4000-8000-0000000000a1', name: 'Mock zone A', description: 'Mock data, not a real zone' },
  { id: '00000000-0000-4000-8000-0000000000b2', name: 'Mock zone B', description: 'Mock data, not a real zone' },
  { id: '00000000-0000-4000-8000-0000000000c3', name: 'Mock zone Q (quoted per trip)', description: 'Mock data, not a real zone' },
]

function err(code: string, message: string): MockResult {
  return Promise.resolve({ data: null, error: { code, message, details: '', hint: '' } })
}
function ok(data: unknown): MockResult {
  return Promise.resolve({ data, error: null })
}

/** Idempotent: seeds the delivery tables once per store. */
export function seedDeliveryMock(store: Store): void {
  if ((store['delivery_zones'] ?? []).length > 0) return
  const now = new Date().toISOString()
  store['delivery_zones'] = MOCK_ZONES.map((z) => ({
    ...z, fee_paisa: null, is_active: true, created_at: now, updated_at: now,
  }))
  store['delivery_zone_vehicle_fees'] = [
    { zone_id: '00000000-0000-4000-8000-0000000000a1', vehicle_class: 'Motorbike', fee_paisa: 100000 },
    { zone_id: '00000000-0000-4000-8000-0000000000a1', vehicle_class: 'Van / larger vehicle', fee_paisa: 200000 },
    { zone_id: '00000000-0000-4000-8000-0000000000b2', vehicle_class: 'Motorbike', fee_paisa: null },
  ]
  store['delivery_zone_quoted'] = [{ zone_id: '00000000-0000-4000-8000-0000000000c3', quoted: true }]
  store['delivery_zone_distance_bands'] = [
    { zone_id: '00000000-0000-4000-8000-0000000000a1', min_km: 0, max_km: 3 },
    { zone_id: '00000000-0000-4000-8000-0000000000b2', min_km: 3, max_km: 7 },
  ]
  store['booking_outsourced_vehicle_quotes'] ??= []
}

function upsert(rows: Row[], match: (r: Row) => boolean, next: Row): void {
  const hit = rows.find(match)
  if (hit) Object.assign(hit, next)
  else rows.push(next)
}

export function mockDeliveryRpc(name: string, args: Record<string, unknown>, env: DeliveryMockEnv): MockResult | null {
  const handled = [
    'list_delivery_zones', 'create_delivery_zone', 'update_delivery_zone', 'deactivate_delivery_zone', 'set_delivery_zone_distance_band', 'set_delivery_zone_vehicle_fee',
    'set_booking_delivery_zone', 'set_delivery_job_vehicle_class', 'record_outsourced_vehicle_quote', 'add_waiting_charge_line',
  ]
  if (!handled.includes(name)) return null
  const { store } = env
  seedDeliveryMock(store)
  const actor = env.actorId()
  const role = (store['users'] ?? []).find((u) => u['id'] === actor)?.['primary_role'] as string | undefined
  const zones = store['delivery_zones'] as Row[]

  if (name === 'list_delivery_zones') {
    const activeOnly = args['p_active_only'] !== false
    const offset = Number(args['p_offset'] ?? 0)
    const limit = Number(args['p_limit'] ?? 50)
    return ok(zones.filter((z) => !activeOnly || z['is_active'] === true).slice(offset, offset + limit))
  }

  if (name === 'create_delivery_zone') {
    if (!role || !ZONE_WRITERS.includes(role)) return err('42501', 'Only Owner, Admin or Manager can create a delivery zone')
    const zoneName = String(args['p_name'] ?? '').trim()
    if (!zoneName) return err('23514', 'Zone name cannot be empty')
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    zones.push({ id, name: zoneName, description: String(args['p_description'] ?? ''), fee_paisa: null, is_active: true, created_at: now, updated_at: now })
    return ok(id)
  }

  if (name === 'update_delivery_zone' || name === 'deactivate_delivery_zone') {
    if (!role || !ZONE_WRITERS.includes(role)) return err('42501', 'Only Owner, Admin or Manager can change a delivery zone')
    const zone = zones.find((z) => z['id'] === String(args['p_zone_id']))
    if (!zone) return err('P0002', 'Unknown delivery zone')
    if (name === 'deactivate_delivery_zone') {
      zone['is_active'] = false
    } else {
      if (typeof args['p_name'] === 'string' && args['p_name']) zone['name'] = args['p_name']
      if (typeof args['p_description'] === 'string') zone['description'] = args['p_description']
      if (typeof args['p_is_active'] === 'boolean') zone['is_active'] = args['p_is_active']
    }
    zone['updated_at'] = new Date().toISOString()
    return ok(true)
  }

  if (name === 'set_delivery_zone_distance_band') {
    if (!role || !ZONE_WRITERS.includes(role)) return err('42501', 'Only the Owner, Admin or Manager can set a delivery zone distance band (O-28b)')
    const zoneId = String(args['p_zone_id'])
    if (!zones.some((z) => z['id'] === zoneId)) return err('23503', 'Unknown delivery zone')
    const min = args['p_min_km'] === null ? null : Number(args['p_min_km'])
    const max = args['p_max_km'] === null ? null : Number(args['p_max_km'])
    if (min === null && max !== null) return err('23514', 'A distance band needs a lower bound before an upper bound')
    if (min !== null && min < 0) return err('23514', 'Distance cannot be negative')
    if (max !== null && min !== null && max <= min) return err('23514', 'The upper distance must be greater than the lower distance')
    upsert(store['delivery_zone_distance_bands'] as Row[], (r) => r['zone_id'] === zoneId, { zone_id: zoneId, min_km: min, max_km: max })
    return ok(true)
  }

  if (name === 'set_delivery_zone_vehicle_fee') {
    if (!role || !['Owner', 'Manager'].includes(role)) return err('42501', 'Only the Owner or Manager can set delivery fee amounts (R-9.18, O-29)')
    const zoneId = String(args['p_zone_id'])
    const fee = args['p_fee_paisa'] === null ? null : Number(args['p_fee_paisa'])
    const quoted = (store['delivery_zone_quoted'] as Row[]).some((q) => q['zone_id'] === zoneId && q['quoted'] === true)
    if (fee !== null && quoted) return err('23514', 'This zone is quoted per trip; no fixed amount can be set (R-9.20)')
    const cls = String(args['p_vehicle_class'])
    upsert(store['delivery_zone_vehicle_fees'] as Row[], (r) => r['zone_id'] === zoneId && r['vehicle_class'] === cls, { zone_id: zoneId, vehicle_class: cls, fee_paisa: fee })
    return ok(true)
  }

  if (name === 'set_booking_delivery_zone') {
    if (!role || !['Owner', 'Admin', 'Manager', 'Coordinator'].includes(role)) return err('42501', 'Only Owner, Admin, Manager or Coordinator may choose a delivery zone (O-30)')
    const booking = (store['bookings'] ?? []).find((b) => b['id'] === String(args['p_booking_id']))
    if (!booking || booking['cancelled_at']) return err('P0002', 'No active booking to set a delivery zone on')
    booking['delivery_zone_id'] = args['p_zone_id'] ?? null
    return ok(true)
  }

  if (name === 'set_delivery_job_vehicle_class') {
    if (!role || !['Owner', 'Admin', 'Manager', 'Coordinator'].includes(role)) return err('42501', 'Only Owner, Admin, Manager or Coordinator may set a delivery job vehicle class')
    const job = (store['delivery_jobs'] ?? []).find((j) => j['id'] === String(args['p_job_id']))
    if (!job) return err('P0002', 'No delivery job to set a vehicle class on')
    if (['Delivered', 'Failed'].includes(String(job['status']))) return err('P0001', 'A finished delivery job keeps its vehicle class')
    job['vehicle_class'] = args['p_vehicle_class'] ?? null
    return ok(true)
  }

  if (name === 'record_outsourced_vehicle_quote') {
    if (!role || !QUOTE_WRITERS.includes(role)) return err('42501', 'Only Owner, Admin, Manager or Coordinator may record an outsourced vehicle quote')
    const booking = (store['bookings'] ?? []).find((b) => b['id'] === String(args['p_booking_id']))
    if (!booking || booking['cancelled_at']) return err('P0002', 'No active booking to record an outsourced vehicle quote on')
    const vendor = String(args['p_vendor'] ?? '').trim()
    const noteText = String(args['p_approval_note'] ?? '').trim()
    const quote = Number(args['p_quote_paisa'])
    if (!vendor || vendor.length > 120) return err('23514', 'Enter the vendor (1 to 120 characters)')
    if (!Number.isFinite(quote) || quote <= 0) return err('23514', 'The quote must be more than 0')
    if (!noteText || noteText.length > 500) return err('23514', 'Enter the approval note (1 to 500 characters)')
    const rows = store['booking_outsourced_vehicle_quotes'] as Row[]
    const key = String(args['p_client_uuid'])
    if (!rows.some((r) => r['booking_id'] === booking['id'] && r['client_uuid'] === key)) {
      rows.push({ id: crypto.randomUUID(), client_uuid: key, booking_id: booking['id'], vendor, quote_paisa: quote, approval_note: noteText, approved_by: actor, approved_at: new Date().toISOString() })
    }
    return ok(true)
  }

  // add_waiting_charge_line
  if (!role || !QUOTE_WRITERS.includes(role)) return err('42501', 'Only Owner, Admin, Manager or Coordinator may add a waiting charge')
  const booking = (store['bookings'] ?? []).find((b) => b['id'] === String(args['p_booking_id']))
  if (!booking) return err('P0002', 'No booking to add a waiting charge to')
  if (booking['cancelled_at'] || ['Returned', 'Closed'].includes(String(booking['stage']))) {
    return err('P0002', 'Cannot add a waiting charge to a cancelled, returned or closed booking')
  }
  const minutes = Number(args['p_minutes'])
  const paisa = Number(args['p_amount_paisa'])
  if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 1440) return err('23514', 'Enter the minutes waited (1 to 1440)')
  if (!Number.isFinite(paisa) || paisa <= 0) return err('23514', 'The waiting charge must be more than 0')
  const invoice = (store['invoices'] ?? []).find((i) => i['booking_id'] === booking['id'] && i['status'] !== 'Void')
  if (invoice && invoice['status'] !== 'Draft') {
    return err('P0001', `This booking's invoice (${String(invoice['invoice_no'] ?? 'unnumbered')}) is already issued (${String(invoice['status'])}). A waiting charge cannot be added to an issued invoice: corrections after issue are Void + Credit Note (R-03). Nothing was added.`)
  }
  const key = String(args['p_client_uuid'])
  const lines = (store['booking_lines'] ??= [])
  let line = lines.find((l) => l['client_uuid'] === key)
  if (!line) {
    line = {
      id: crypto.randomUUID(), client_uuid: key, booking_id: booking['id'], line_type: 'Service',
      description: `Waiting charge (${minutes} min)`, qty: 1, days: 1, rate: paisa / 100, discount_amount: 0,
      line_total: paisa / 100, service_basis: 'Flat', line_note: args['p_note'] ?? null, created_at: new Date().toISOString(), created_by: actor,
    }
    lines.push(line)
  }
  return ok([{ line_id: line['id'], invoice_id: invoice ? invoice['id'] : null, appended_to_draft: Boolean(invoice) }])
}
