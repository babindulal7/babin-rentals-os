import { supabase } from '../supabase'
import { completeReportRead, embeddedName, percentOf, rowsOf, type ReportFilterOptions } from './reportSupport'

export type { ReportFilterOptions } from './reportSupport'

export interface OperationMetrics {
  totalPickups: number
  /** No source yet: nothing records the scheduled handover time a session is measured against. */
  onTimePickupRate: number | null
  totalReturns: number
  /** Share of returned bookings whose `actual_return_at` is on or before `return_at`; null when none has returned. */
  onTimeReturnRate: number | null
  currentlyOverdue: number
  totalPackingJobs: number
  /** No source yet: packing does not record a verified-vs-expected line count. */
  packingFulfillmentRate: number | null
  /** Share of completed handovers with government ID verified; null when there were none. */
  idVerificationRate: number | null
}

export interface DeliveryMethodBreakdown {
  method: string
  count: number
  percent: number
}

export interface PickupSessionItem {
  id: string
  bookingNo: string
  clientName: string
  pickupAt: string
  deliveryType: string
  receiverName: string
  idVerified: boolean
  staffName: string
  status: string
}

export interface ReturnConditionBreakdown {
  condition: string
  count: number
  percent: number
}

export interface ReturnSessionItem {
  id: string
  bookingNo: string
  clientName: string
  returnAt: string
  returningPerson: string
  /** The worst inspected condition on the session's lines, or "Not inspected". */
  condition: string
  damageSuspected: boolean
  status: string
}

export interface OverdueRentalItem {
  id: string
  bookingNo: string
  clientName: string
  project: string
  scheduledReturn: string
  daysOverdue: number
  deliveryType: string
  severity: 'moderate' | 'critical' | 'severe'
}

export interface PackingJobItem {
  id: string
  bookingNo: string
  clientName: string
  project: string
  pickupScheduled: string
  itemCount: number
  state: 'pending' | 'packed' | 'partial'
}

export interface OperationsReportData {
  metrics: OperationMetrics
  deliveryMethods: DeliveryMethodBreakdown[]
  returnConditions: ReturnConditionBreakdown[]
  pickups: PickupSessionItem[]
  returns: ReturnSessionItem[]
  overdueList: OverdueRentalItem[]
  packingJobs: PackingJobItem[]
}

/*
 * RULING 2026-10-16 (R-P6-STATES, Law 16): this read returned MOCK_OPERATIONS on
 * a failure and on an empty database, and patched figures one by one with
 * `|| MOCK_OPERATIONS.metrics…` — the on-time, fulfilment and ID rates were
 * literals (93.5, 88.1, 98.2, 95.7) on every path. It now throws on failure,
 * returns honest empties, and a rate with no source is `null` ("Not tracked
 * yet" on the page). Also fixed, each of which hid every live session:
 *   - `operation_kind` is Handover/Return (0001), not 'dispatch'/'return';
 *   - `session_state` is 'Completed', not 'completed';
 *   - `return_lines` has no cleaning_required/damage_suspected columns — the
 *     read failed silently; damage is now `condition` Damaged/Lost (0001
 *     `item_condition`), and cleaning is not claimed at all;
 *   - the staff name was the literal 'Warehouse Staff'; it is now the
 *     session's `warehouse_staff_id` user.
 * Revert = restore MOCK_OPERATIONS and the `catch`.
 */

const CONDITION_RANK: Record<string, number> = { Excellent: 0, Good: 1, Fair: 2, Damaged: 3, Lost: 4 }

type BookingRow = {
  id: string
  booking_no: string
  stage: string
  pickup_at: string
  return_at: string
  actual_return_at: string | null
  delivery_type: string | null
  project: string | null
  cancelled_at: string | null
  clients?: unknown
  booking_lines?: { qty: number | null; voided_at: string | null }[] | null
}

type SessionRow = {
  id: string
  booking_id: string
  operation: string
  state: string
  started_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  warehouse_staff_id: string | null
  receiver_name: string | null
  pickup_person_name: string | null
  returning_person_name: string | null
  government_id_verified: boolean | null
}

type ReturnLineRow = { session_id: string | null; condition: string | null }

function severityOf(daysLate: number): OverdueRentalItem['severity'] {
  return daysLate >= 6 ? 'severe' : daysLate >= 3 ? 'critical' : 'moderate'
}

export async function getOperationsReport(options?: ReportFilterOptions, now: Date = new Date()): Promise<OperationsReportData> {
  let bookingsQuery = supabase
    .from('bookings')
    .select(
      'id, booking_no, stage, pickup_at, return_at, actual_return_at, delivery_type, project, cancelled_at, clients!client_id(name), booking_lines(qty, voided_at)',
    )
  if (options?.from) bookingsQuery = bookingsQuery.gte('pickup_at', options.from)
  if (options?.to) bookingsQuery = bookingsQuery.lte('pickup_at', options.to)
  if (options?.branchId) bookingsQuery = bookingsQuery.eq('branch_id', options.branchId)

  const [bookingsRes, sessionsRes, linesRes, usersRes] = await Promise.all([
    completeReportRead(bookingsQuery, 'Operations bookings read failed'),
    completeReportRead(supabase
      .from('operation_sessions')
      .select(
        'id, booking_id, operation, state, started_at, completed_at, cancelled_at, warehouse_staff_id, receiver_name, pickup_person_name, returning_person_name, government_id_verified',
      )
      .in('operation', ['Handover', 'Return'])
      .order('completed_at', { ascending: false }), 'Operation sessions read failed'),
    completeReportRead(supabase.from('return_lines').select('id, session_id, condition'), 'Return lines read failed'),
    completeReportRead(supabase.from('users').select('id, full_name'), 'Staff names read failed'),
  ])

  const bookings = rowsOf<BookingRow>(bookingsRes, 'Operations bookings read failed')
  const sessions = rowsOf<SessionRow>(sessionsRes, 'Operation sessions read failed')
  const returnLines = rowsOf<ReturnLineRow>(linesRes, 'Return lines read failed')
  const users = rowsOf<{ id: string; full_name: string | null }>(usersRes, 'Staff names read failed')

  const byId = new Map(bookings.map((b) => [b.id, b]))
  const staffName = new Map(users.map((u) => [u.id, u.full_name?.trim() || '—']))
  const nowMs = now.getTime()

  const deliveryMap = new Map<string, number>()
  const overdueList: OverdueRentalItem[] = []
  const packingJobs: PackingJobItem[] = []
  let returnedCount = 0
  let returnedOnTime = 0

  for (const b of bookings) {
    if (b.cancelled_at) continue
    const method = b.delivery_type || 'Not set'
    deliveryMap.set(method, (deliveryMap.get(method) ?? 0) + 1)

    if (b.actual_return_at) {
      returnedCount++
      if (Date.parse(b.actual_return_at) <= Date.parse(b.return_at)) returnedOnTime++
    }

    if (b.stage === 'On Rent' && !b.actual_return_at) {
      const retMs = Date.parse(b.return_at)
      if (!Number.isNaN(retMs) && retMs < nowMs) {
        const daysLate = Math.max(1, Math.floor((nowMs - retMs) / 86_400_000))
        overdueList.push({
          id: b.id,
          bookingNo: b.booking_no,
          clientName: embeddedName(b.clients),
          project: b.project?.trim() || '—',
          scheduledReturn: b.return_at,
          daysOverdue: daysLate,
          deliveryType: method,
          severity: severityOf(daysLate),
        })
      }
    }

    if (b.stage === 'Booked' || b.stage === 'Packed') {
      packingJobs.push({
        id: b.id,
        bookingNo: b.booking_no,
        clientName: embeddedName(b.clients),
        project: b.project?.trim() || '—',
        pickupScheduled: b.pickup_at,
        itemCount: (b.booking_lines ?? []).filter((l) => !l.voided_at).reduce((acc, l) => acc + (Number(l.qty) || 0), 0),
        state: b.stage === 'Packed' ? 'packed' : 'pending',
      })
    }
  }

  const worstBySession = new Map<string, string>()
  for (const l of returnLines) {
    if (!l.session_id || !l.condition) continue
    const prev = worstBySession.get(l.session_id)
    if (prev === undefined || (CONDITION_RANK[l.condition] ?? 0) > (CONDITION_RANK[prev] ?? 0)) worstBySession.set(l.session_id, l.condition)
  }

  const pickups: PickupSessionItem[] = []
  const returns: ReturnSessionItem[] = []
  let handovers = 0
  let idVerified = 0

  for (const s of sessions) {
    if (s.cancelled_at) continue
    const b = byId.get(s.booking_id)
    // A session outside the filtered bookings is outside the period/branch.
    if (!b || b.cancelled_at) continue
    const when = s.completed_at ?? s.started_at ?? ''
    const status = s.state
    if (s.operation === 'Handover') {
      if (s.state === 'Completed') {
        handovers++
        if (s.government_id_verified) idVerified++
      }
      pickups.push({
        id: s.id,
        bookingNo: b.booking_no,
        clientName: embeddedName(b.clients),
        pickupAt: when,
        deliveryType: b.delivery_type || 'Not set',
        receiverName: s.receiver_name?.trim() || s.pickup_person_name?.trim() || '—',
        idVerified: Boolean(s.government_id_verified),
        staffName: (s.warehouse_staff_id && staffName.get(s.warehouse_staff_id)) || '—',
        status,
      })
    } else if (s.operation === 'Return') {
      const condition = worstBySession.get(s.id) ?? 'Not inspected'
      returns.push({
        id: s.id,
        bookingNo: b.booking_no,
        clientName: embeddedName(b.clients),
        returnAt: when,
        returningPerson: s.returning_person_name?.trim() || '—',
        condition,
        damageSuspected: condition === 'Damaged' || condition === 'Lost',
        status,
      })
    }
  }

  const methodTotal = [...deliveryMap.values()].reduce((a, n) => a + n, 0)
  const condMap = new Map<string, number>()
  for (const r of returns) condMap.set(r.condition, (condMap.get(r.condition) ?? 0) + 1)

  return {
    metrics: {
      totalPickups: handovers,
      onTimePickupRate: null,
      totalReturns: returns.length,
      onTimeReturnRate: returnedCount > 0 ? Number(((returnedOnTime / returnedCount) * 100).toFixed(1)) : null,
      currentlyOverdue: overdueList.length,
      totalPackingJobs: packingJobs.length,
      packingFulfillmentRate: null,
      idVerificationRate: handovers > 0 ? Number(((idVerified / handovers) * 100).toFixed(1)) : null,
    },
    deliveryMethods: [...deliveryMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([method, count]) => ({ method, count, percent: percentOf(count, methodTotal) })),
    returnConditions: [...condMap.entries()]
      .sort((a, b) => (CONDITION_RANK[a[0]] ?? -1) - (CONDITION_RANK[b[0]] ?? -1))
      .map(([condition, count]) => ({ condition, count, percent: percentOf(count, returns.length) })),
    pickups: pickups.slice(0, 10),
    returns: returns.slice(0, 10),
    overdueList: overdueList.sort((a, b) => b.daysOverdue - a.daysOverdue),
    packingJobs: packingJobs.sort((a, b) => a.pickupScheduled.localeCompare(b.pickupScheduled)).slice(0, 10),
  }
}
