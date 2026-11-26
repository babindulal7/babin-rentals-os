import type { Row, Store } from './engine'
import { finalizeMockRescheduleAgreement } from './rescheduleAgreement'

function actorRow(store: Store, actor: string): Row {
  const user = store.users?.find(row => row.id === actor)
  if (!user || user.is_active === false || user.deactivated_at) throw new Error('An active staff session is required.')
  return user
}
function bounds(period: unknown): [string, string] {
  if (typeof period !== 'string') throw new Error('Recorded reservation intervals are unavailable.')
  const parts = period.slice(1, -1).split(',').map(value => value.trim().replace(/^"|"$/g, ''))
  const from = parts[0], to = parts[1]
  if (!from || !to || !Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to))) throw new Error('Recorded reservation intervals are invalid.')
  return [from, to]
}
function overlap(a: number, b: number, c: number, d: number): boolean { return a < d && c < b }
function usable(store: Store, unit: Row): boolean {
  return !unit.retired_at && !['Retired', 'Missing', 'Maintenance'].includes(String(unit.status))
    && !['Damaged', 'Lost'].includes(String(unit.condition))
    && !store.damage_findings?.some(row => row.unit_id === unit.id && !row.voided_at)
    && !store.maintenance_records?.some(row => row.product_unit_id === unit.id && !row.completed_at)
    && !store.cleaning_queue_entries?.some(row => row.unit_id === unit.id && (String(row.qc_fail_reason ?? '').trim() || (row.problem_state && row.problem_state !== 'No Problems')))
}

/** Same real mock tables as other workspaces; no fixture resources or fabricated allocations. */
export function calendarResourceWindow(store: Store, args: Record<string, unknown>, actor: string) {
  const user = actorRow(store, actor)
  if (!['Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician', 'Accounts'].includes(String(user.primary_role))) throw new Error('Resource planning is unavailable to this role.')
  const from = Date.parse(String(args.p_from)), to = Date.parse(String(args.p_to))
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) throw new Error('A complete resource window is required.')
  const global = ['Owner', 'Admin'].includes(String(user.primary_role))
  const resources: Row[] = [], allocations: Row[] = []
  const add = (row: Row) => { if (row.id) resources.push(row) }
  const booking = (id: unknown) => store.bookings?.find(row => row.id === id && !row.cancelled_at)
  for (const unit of store.product_units ?? []) {
    const product = store.products?.find(row => row.id === unit.product_id)
    if (!unit.id || !product || unit.retired_at || (!global && unit.branch_id !== user.branch_id)) continue
    add({ id: `unit:${unit.id}`, type: 'Equipment', name: product.name, code: unit.asset_tag,
      meta: `${unit.status ?? 'Status not recorded'} · ${unit.condition ?? 'Condition not recorded'}`, icon: 'box' })
  }
  for (const product of store.products ?? []) {
    if (!product.id || product.is_active === false || !['Quantity', 'Consumable'].includes(String(product.tracking_mode))) continue
    add({ id: `product:${product.id}`, type: 'Equipment', name: product.name, code: product.asset_code,
      meta: `${product.total_quantity} recorded quantity · global stock`, capacity: product.total_quantity, icon: 'box' })
  }
  for (const hold of store.inventory_reservations ?? []) {
    if (hold.released_at) continue
    const parent = booking(hold.booking_id)
    if (!parent) continue
    const [start, end] = bounds(hold.period)
    const resourceId = hold.asset_id ? `unit:${hold.asset_id}` : `product:${hold.product_id}`
    if (!resources.some(row => row.id === resourceId) || !overlap(from, to, Date.parse(start), Date.parse(end))) continue
    allocations.push({ id: `hold:${hold.id}`, resource_id: resourceId, booking_id: parent.id,
      booking_no: parent.booking_no, stage: parent.stage, start_at: start, end_at: end, quantity: hold.qty ?? 1 })
  }
  for (const person of store.crew_profiles_v2 ?? []) if (person.id && person.is_active !== false) {
    add({ id: `crew-v2:${person.id}`, type: 'Crew', name: person.full_name, code: person.crew_code, meta: 'Recorded crew assignments', icon: 'crew' })
  }
  let unallocated = 0
  for (const assignment of store.crew_assignments ?? []) {
    const parent = booking(assignment.booking_id)
    if (!parent) continue
    const start = Date.parse(String(assignment.call_time)), end = Date.parse(String(assignment.wrap_time))
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) { unallocated++; continue }
    if (!overlap(from, to, start, end) || !resources.some(row => row.id === `crew-v2:${assignment.crew_id}`)) continue
    allocations.push({ id: `crew-assignment:${assignment.id}`, resource_id: `crew-v2:${assignment.crew_id}`,
      booking_id: parent.id, booking_no: parent.booking_no, stage: parent.stage, kind: 'Crew Duty',
      start_at: assignment.call_time, end_at: assignment.wrap_time, quantity: 1 })
  }
  for (const person of store.crew_members ?? []) if (person.id && !person.deactivated_at) {
    add({ id: `crew-legacy:${person.id}`, type: 'Crew', name: person.full_name, meta: 'Recorded crew engagements · separate roster', icon: 'crew' })
  }
  for (const engagement of store.crew_bookings ?? []) {
    if (engagement.cancelled_at || !['Confirmed', 'Completed'].includes(String(engagement.state)) || !engagement.crew_member_id) continue
    const start = Date.parse(String(engagement.start_date) + 'T00:00:00+05:45')
    const end = Date.parse(String(engagement.end_date) + 'T00:00:00+05:45') + 86400000
    if (!Number.isFinite(start) || !Number.isFinite(end) || !overlap(from, to, start, end)) continue
    const parent = engagement.booking_id ? booking(engagement.booking_id) : undefined
    if (!resources.some(row => row.id === `crew-legacy:${engagement.crew_member_id}`)) continue
    allocations.push({ id: `crew-engagement:${engagement.id}`, resource_id: `crew-legacy:${engagement.crew_member_id}`,
      ...(parent ? { booking_id: parent.id, booking_no: parent.booking_no } : {}), label: engagement.crew_booking_no,
      stage: engagement.state === 'Completed' ? 'Closed' : 'Booked', kind: 'Crew Duty',
      start_at: new Date(start).toISOString(), end_at: new Date(end).toISOString(), quantity: 1, precision: 'day' })
  }
  for (const vehicle of store.vehicles ?? []) if (vehicle.id && vehicle.is_active !== false && (global || vehicle.branch_id === user.branch_id)) {
    add({ id: `vehicle:${vehicle.id}`, type: 'Vehicles', name: [vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.vehicle_code,
      code: vehicle.registration_plate, meta: 'Recorded fleet assignments', icon: 'truck' })
  }
  for (const day of store.crew_shoot_days ?? []) {
    if (!day.vehicle_id || !resources.some(row => row.id === `vehicle:${day.vehicle_id}`)) continue
    const engagement = store.crew_bookings?.find(row => row.id === day.crew_booking_id && !row.cancelled_at)
    if (!engagement) continue
    const start = day.actual_start ?? day.planned_start ?? day.call_time, end = day.actual_end ?? day.planned_end ?? day.wrap_time
    if (!Number.isFinite(Date.parse(String(start))) || !Number.isFinite(Date.parse(String(end))) || !overlap(from, to, Date.parse(String(start)), Date.parse(String(end)))) continue
    const parent = engagement.booking_id ? booking(engagement.booking_id) : undefined
    allocations.push({ id: `vehicle-day:${day.id}`, resource_id: `vehicle:${day.vehicle_id}`,
      ...(parent ? { booking_id: parent.id, booking_no: parent.booking_no } : {}), label: engagement.crew_booking_no,
      stage: day.actual_end ? 'Closed' : 'Booked', start_at: start, end_at: end, quantity: 1 })
  }
  return { resources, allocations, sources: [
    ...['serialized', 'quantity', 'crew-v2', 'crew-legacy', 'vehicles'].map(id => ({ id, status: 'complete',
      ...(id === 'crew-v2' ? { unallocated } : {}) })),
    { id: 'warehouse-bays', status: 'unavailable', reason: 'Warehouse bay allocations have no authoritative scheduling contract.' },
  ] }
}

export type FinalizeMockRescheduleAgreement = (store: Store, args: Record<string, unknown>, actor: string) => void
/** Caller runs on a cloned store and publishes it only after all helpers succeed. */
export function rescheduleCalendarRental(store: Store, args: Record<string, unknown>, actor: string,
  finalizeAgreement?: FinalizeMockRescheduleAgreement) {
  const user = actorRow(store, actor)
  if (!['Owner', 'Admin', 'Manager', 'Coordinator'].includes(String(user.primary_role))) throw new Error('You cannot reschedule this rental.')
  const key = String(args.p_key ?? ''), revision = String(args.p_revision ?? ''), days = args.p_shift_days
  if (!key || !revision || !Number.isSafeInteger(days) || days === 0 || String(args.p_reason ?? '').trim().length < 10) throw new Error('A rental revision, whole-day move, save key and reason of at least ten characters are required.')
  const request = JSON.stringify(args)
  const booking = store.bookings?.find(row => row.id === args.p_booking_id)
  if (!booking || booking.cancelled_at || booking.archived_at) throw new Error('This rental is unavailable for rescheduling.')
  if (!['Owner', 'Admin'].includes(String(user.primary_role)) && booking.branch_id !== user.branch_id) throw new Error('Rental branch access denied.')
  const receipt = store.calendar_reschedule_receipts?.find(row => row.id === key)
  if (receipt) { if (receipt.actor !== actor || receipt.request !== request) throw new Error('This save key belongs to another change.'); return receipt.response }
  if (Date.parse(String(booking.updated_at)) !== Date.parse(revision)) throw new Error('This rental changed. Reload before rescheduling.')
  if (!['Quote', 'Booked'].includes(String(booking.stage))) throw new Error('Calendar can move only Quote or Booked rentals before handover.')
  if (store.operation_sessions?.some(row => row.booking_id === booking.id && row.operation === 'Handover' && (row.state === 'Completed' || row.completed_at))
    || store.booking_line_units?.some(row => ['Picked Up', 'Returned'].includes(String(row.unit_state)) && store.booking_lines?.some(line => line.id === row.booking_line_id && line.booking_id === booking.id))) throw new Error('Handover has already started. Use existing rental actions.')
  if (store.crew_assignments?.some(row => row.booking_id === booking.id)
    || store.crew_bookings?.some(row => row.booking_id === booking.id && !row.cancelled_at)
    || store.delivery_jobs?.some(row => row.booking_id === booking.id)
    || store.booking_transport?.some(row => row.booking_id === booking.id && (row.scheduled_at || row.driver_id || (row.delivery_status && row.delivery_status !== 'Scheduled')))) throw new Error('This rental has independently scheduled crew or delivery work. Update that work in its workspace first.')
  const pickup = Date.parse(String(booking.pickup_at)) + Number(days) * 86400000
  const returned = Date.parse(String(booking.return_at)) + Number(days) * 86400000
  if (!Number.isFinite(pickup) || !Number.isFinite(returned) || pickup >= returned) throw new Error('Reload the recorded rental window.')
  const ownHolds = (store.inventory_reservations ?? []).filter(row => row.booking_id === booking.id && !row.released_at)
  const otherHolds = (store.inventory_reservations ?? []).filter(row => row.booking_id !== booking.id && !row.released_at)
  const lines = (store.booking_lines ?? []).filter(row => row.booking_id === booking.id && !row.voided_at && row.product_id)
  const required = new Map<unknown, number>()
  for (const line of lines) required.set(line.product_id, (required.get(line.product_id) ?? 0) + Number(line.qty))
  for (const [productId, quantity] of required) {
    const product = store.products?.find(row => row.id === productId)
    if (!product || !Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Equipment data is incomplete. No dates changed.')
    if (product.tracking_mode === 'Serialised') {
      const units = (store.product_units ?? []).filter(row => row.product_id === productId && usable(store, row)
        && !otherHolds.some(hold => { if (hold.asset_id !== row.id) return false; const [from, to] = bounds(hold.period); return overlap(pickup, returned, Date.parse(from), Date.parse(to)) }))
      const assigned = ownHolds.filter(hold => store.product_units?.some(row => row.id === hold.asset_id && row.product_id === productId))
      if (booking.stage === 'Booked' ? assigned.length !== quantity || assigned.some(hold => !units.some(unit => unit.id === hold.asset_id)) : units.filter(unit => unit.branch_id === booking.branch_id).length < quantity) throw new Error('An assigned unit is blocked or reserved during the proposed dates. No dates changed.')
    } else {
      const assigned = ownHolds.filter(row => row.product_id === productId && !row.asset_id)
        .reduce((sum, row) => sum + Number(row.qty), 0)
      if (booking.stage === 'Booked' && assigned !== quantity) throw new Error('Quantity reservations are incomplete. Reload the rental before moving it.')
      const holds = otherHolds.filter(row => row.product_id === productId).map(row => ({ row, interval: bounds(row.period) }))
      const points = [pickup, ...holds.map(hold => Math.max(pickup, Date.parse(hold.interval[0]))).filter(at => at < returned)]
      const peak = Math.max(0, ...points.map(at => holds.reduce((sum, hold) => sum + (Date.parse(hold.interval[0]) <= at && at < Date.parse(hold.interval[1]) ? Number(hold.row.qty) : 0), 0)))
      if (!Number.isSafeInteger(product.total_quantity) || peak + quantity > Number(product.total_quantity)) throw new Error('Recorded quantity is insufficient during the proposed dates. No dates changed.')
    }
  }
  const assignedCrew = (store.booking_crew_lines ?? []).filter(row => row.booking_id === booking.id && !row.voided_at && row.crew_member_id)
  const crewConflict = assignedCrew.some(crew => (store.booking_crew_lines ?? []).some(other => {
    if (other.booking_id === booking.id || other.voided_at || other.crew_member_id !== crew.crew_member_id) return false
    const otherBooking = store.bookings?.find(row => row.id === other.booking_id)
    return !!otherBooking && !otherBooking.cancelled_at && ['Booked', 'Packed', 'On Rent'].includes(String(otherBooking.stage))
      && overlap(pickup, returned, Date.parse(String(otherBooking.pickup_at)), Date.parse(String(otherBooking.return_at)))
  }))
  if (crewConflict) throw new Error('An assigned crew member has a conflicting rental. No dates changed.')
  const previous = { pickup_at: booking.pickup_at, return_at: booking.return_at }
  booking.pickup_at = new Date(pickup).toISOString(); booking.return_at = new Date(returned).toISOString()
  booking.updated_at = new Date().toISOString(); booking.updated_by = actor
  ;(finalizeAgreement ?? finalizeMockRescheduleAgreement)(store, args, actor)
  for (const hold of ownHolds) hold.period = `["${booking.pickup_at}","${booking.return_at}")`
  const response = { id: booking.id, booking_no: booking.booking_no, pickup_at: booking.pickup_at, return_at: booking.return_at, revision: booking.updated_at }
  ;(store.calendar_reschedule_receipts ??= []).push({ id: key, actor, request, response })
  ;(store.audit_events ??= []).push({ id: crypto.randomUUID(), client_uuid: key, table_name: 'bookings', record_id: booking.id,
    actor_id: actor, reason: args.p_reason, old_values: previous, new_values: response })
  return response
}
