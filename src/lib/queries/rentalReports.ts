import { supabase } from '../supabase'
import type { Paisa } from '../money'
import { rentalDaysBetween } from '../rentalDays'
import { completeReportRead, embeddedName, isPermissionDenied, linesValue, percentOf, readLineValues, rowsOf, type ReportFilterOptions } from './reportSupport'

export type { ReportFilterOptions } from './reportSupport'

export interface RentalPerformanceMetrics {
  totalBookings: number
  activeRentals: number
  completedRentals: number
  cancelledRentals: number
  totalRevenue: Paisa
  averageBookingValue: Paisa
  totalRentalDays: number
  averageDurationDays: number
}

export interface StageBreakdownItem {
  stage: string
  count: number
  revenue: Paisa
  percent: number
}

export interface ProjectTypeBreakdownItem {
  projectType: string
  count: number
  revenue: Paisa
  percent: number
}

export interface TopBookingItem {
  id: string
  bookingNo: string
  clientName: string
  project: string
  days: number
  stage: string
  value: Paisa
}

export interface RentalPerformanceReportData {
  metrics: RentalPerformanceMetrics
  stages: StageBreakdownItem[]
  /**
   * Null when this session may not read `bookings.project_type` — the column
   * is granted by 0161/0162, which live does not have yet. The card then says
   * so instead of failing the whole report.
   */
  projectTypes: ProjectTypeBreakdownItem[] | null
  topBookings: TopBookingItem[]
}

export interface DurationBucket {
  key: string
  label: string
  minDays: number
  maxDays: number
  count: number
  sharePercent: number
  totalDays: number
  revenue: Paisa
  avgDailyRate: Paisa
}

export interface RentalDurationReportData {
  totalRentals: number
  averageDuration: number
  medianDuration: number
  longestDuration: number
  shortestDuration: number
  buckets: DurationBucket[]
}

export interface CancellationReasonItem {
  reason: string
  count: number
  percent: number
  lostRevenue: Paisa
}

export interface CancelledBookingItem {
  id: string
  bookingNo: string
  clientName: string
  project: string
  cancelledAt: string
  scheduledPickup: string
  lostRevenue: Paisa
  reason: string
}

export interface CancellationsReportData {
  totalCancellations: number
  cancellationRate: number
  totalLostRevenue: Paisa
  /** Mean days between cancelling and the scheduled pickup; null when no cancellation carries both dates. */
  averageNoticeDays: number | null
  reasons: CancellationReasonItem[]
  cancelledBookings: CancelledBookingItem[]
}

/*
 * RULING 2026-10-16 (R-P6-STATES, Law 16): these reads returned MOCK_PERFORMANCE /
 * MOCK_DURATION / MOCK_CANCELLATIONS on a failed read AND on an empty one, and
 * the trend was always the mock block. They now throw on failure (the page
 * draws Error + Retry) and return honest zeros on an empty period. Also fixed
 * while here, each of which made a live figure wrong:
 *   - cancellation is `bookings.cancelled_at` (0015), not `stage = 'Cancelled'`
 *     — Postgres rejects that literal, so the Cancellations tab could only ever
 *     show the mock block;
 *   - "completed" is Returned/Closed (the canonical six have no 'Completed');
 *   - money was computed in rupees then divided by 100 again (see `lineValue`);
 *   - line money was read from base `booking_lines`, whose rate columns 0062
 *     revokes — it now comes from `booking_lines_v` (`readLineValues`).
 * Revert = restore the MOCK_* constants and each `catch`.
 */

type BookingRow = {
  id: string
  booking_no: string
  stage: string
  pickup_at: string
  return_at: string
  project: string | null
  cancelled_at: string | null
  cancellation_reason?: string | null
  clients?: unknown
}

// Loosely typed on purpose: supabase-js's builder generics recurse past tsc's
// depth limit when threaded through a helper (TS2589).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuery = any

function filtered(q: AnyQuery, options?: ReportFilterOptions): AnyQuery {
  let out = q
  if (options?.from) out = out.gte('pickup_at', options.from)
  if (options?.to) out = out.lte('pickup_at', options.to)
  if (options?.branchId) out = out.eq('branch_id', options.branchId)
  return out
}

function daysOf(b: Pick<BookingRow, 'pickup_at' | 'return_at'>): number {
  return rentalDaysBetween(b.pickup_at, b.return_at) ?? 1
}

export async function getRentalPerformanceReport(options?: ReportFilterOptions): Promise<RentalPerformanceReportData> {
  const [res, typeRes, lineMap] = await Promise.all([
    completeReportRead(filtered(
      supabase.from('bookings').select('id, booking_no, stage, pickup_at, return_at, project, cancelled_at, clients!client_id(name)'),
      options,
    ), 'Rental performance read failed'),
    completeReportRead(filtered(supabase.from('bookings').select('id, project_type'), options), 'Project type read failed'),
    readLineValues(),
  ])
  const rows = rowsOf<BookingRow>(res, 'Rental performance read failed')
  // The one tolerated refusal: a column grant live has not received yet.
  const typesReadable = !(typeRes.error && isPermissionDenied(typeRes.error))
  const typeById = new Map(
    (typesReadable ? rowsOf<{ id: string; project_type: string | null }>(typeRes, 'Project type read failed') : []).map((r) => [
      r.id,
      r.project_type,
    ]),
  )

  let totalRevenue = 0
  let totalRentalDays = 0
  let active = 0
  let completed = 0
  let cancelled = 0
  const stageMap = new Map<string, { count: number; revenue: number }>()
  const typeMap = new Map<string, { count: number; revenue: number }>()
  const top: TopBookingItem[] = []

  for (const b of rows) {
    const days = daysOf(b)
    const value = linesValue(lineMap.get(b.id), days)
    const isCancelled = b.cancelled_at != null
    const stage = isCancelled ? 'Cancelled' : b.stage
    if (isCancelled) cancelled++
    else if (b.stage === 'Packed' || b.stage === 'On Rent') active++
    else if (b.stage === 'Returned' || b.stage === 'Closed') completed++

    const st = stageMap.get(stage) ?? { count: 0, revenue: 0 }
    st.count++
    st.revenue += value
    stageMap.set(stage, st)

    const type = typeById.get(b.id)?.trim() || 'Not set'
    const pt = typeMap.get(type) ?? { count: 0, revenue: 0 }
    pt.count++
    pt.revenue += value
    typeMap.set(type, pt)

    if (isCancelled) continue
    totalRevenue += value
    totalRentalDays += days
    top.push({
      id: b.id,
      bookingNo: b.booking_no,
      clientName: embeddedName(b.clients),
      project: b.project?.trim() || '—',
      days,
      stage,
      value,
    })
  }

  const total = rows.length
  const live = total - cancelled
  top.sort((a, b) => b.value - a.value)

  return {
    metrics: {
      totalBookings: total,
      activeRentals: active,
      completedRentals: completed,
      cancelledRentals: cancelled,
      totalRevenue: totalRevenue as Paisa,
      averageBookingValue: (live > 0 ? Math.round(totalRevenue / live) : 0) as Paisa,
      totalRentalDays,
      averageDurationDays: live > 0 ? Number((totalRentalDays / live).toFixed(1)) : 0,
    },
    stages: [...stageMap.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([stage, v]) => ({ stage, count: v.count, revenue: v.revenue as Paisa, percent: percentOf(v.count, total) })),
    projectTypes: !typesReadable
      ? null
      : [...typeMap.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([projectType, v]) => ({ projectType, count: v.count, revenue: v.revenue as Paisa, percent: percentOf(v.count, total) })),
    topBookings: top.slice(0, 5),
  }
}

const BUCKETS = [
  { key: '1d', label: '1 Day', minDays: 1, maxDays: 1 },
  { key: '2-3d', label: '2–3 Days', minDays: 2, maxDays: 3 },
  { key: '4-7d', label: '4–7 Days', minDays: 4, maxDays: 7 },
  { key: '8-14d', label: '8–14 Days', minDays: 8, maxDays: 14 },
  { key: '15d+', label: '15+ Days', minDays: 15, maxDays: 9999 },
] as const

export async function getRentalDurationReport(options?: ReportFilterOptions): Promise<RentalDurationReportData> {
  const [res, lineMap] = await Promise.all([
    completeReportRead(filtered(supabase.from('bookings').select('id, pickup_at, return_at').is('cancelled_at', null), options), 'Rental duration read failed'),
    readLineValues(),
  ])
  const rows = rowsOf<Pick<BookingRow, 'id' | 'pickup_at' | 'return_at'>>(res, 'Rental duration read failed')

  const acc = BUCKETS.map((b) => ({ ...b, count: 0, totalDays: 0, revenue: 0 }))
  const durations: number[] = []
  for (const b of rows) {
    const days = daysOf(b)
    durations.push(days)
    const bucket = acc.find((d) => days >= d.minDays && days <= d.maxDays) ?? acc[acc.length - 1]
    if (!bucket) continue
    bucket.count++
    bucket.totalDays += days
    bucket.revenue += linesValue(lineMap.get(b.id), days)
  }
  durations.sort((a, b) => a - b)
  const n = durations.length
  const sum = durations.reduce((a, d) => a + d, 0)

  return {
    totalRentals: n,
    averageDuration: n > 0 ? Number((sum / n).toFixed(1)) : 0,
    medianDuration: n > 0 ? (durations[Math.floor(n / 2)] ?? 0) : 0,
    longestDuration: durations[n - 1] ?? 0,
    shortestDuration: durations[0] ?? 0,
    buckets: acc.map((b) => ({
      key: b.key,
      label: b.label,
      minDays: b.minDays,
      maxDays: b.maxDays,
      count: b.count,
      sharePercent: percentOf(b.count, n),
      totalDays: b.totalDays,
      revenue: b.revenue as Paisa,
      avgDailyRate: (b.totalDays > 0 ? Math.round(b.revenue / b.totalDays) : 0) as Paisa,
    })),
  }
}

export async function getCancellationsReport(options?: ReportFilterOptions): Promise<CancellationsReportData> {
  const [allRes, cancelRes, lineMap] = await Promise.all([
    completeReportRead(filtered(supabase.from('bookings').select('id'), options), 'Booking count read failed'),
    completeReportRead(filtered(
      supabase
        .from('bookings')
        .select('id, booking_no, pickup_at, return_at, project, cancelled_at, cancellation_reason, clients!client_id(name)')
        .not('cancelled_at', 'is', null),
      options,
    ), 'Cancellations read failed'),
    readLineValues(),
  ])
  const totalAll = rowsOf(allRes, 'Booking count read failed').length
  const rows = rowsOf<BookingRow>(cancelRes, 'Cancellations read failed')

  let lostTotal = 0
  let noticeHours = 0
  let noticeCount = 0
  const reasonMap = new Map<string, { count: number; lost: number }>()
  const list: CancelledBookingItem[] = []

  for (const b of rows) {
    const lost = linesValue(lineMap.get(b.id), daysOf(b))
    lostTotal += lost
    // The DB refuses a cancellation without a reason (0002/0015 check); an
    // empty one here is an older row, and it says so rather than guessing.
    const reason = b.cancellation_reason?.trim() || 'No reason recorded'
    const r = reasonMap.get(reason) ?? { count: 0, lost: 0 }
    r.count++
    r.lost += lost
    reasonMap.set(reason, r)

    const c = b.cancelled_at ? Date.parse(b.cancelled_at) : NaN
    const p = Date.parse(b.pickup_at)
    if (!Number.isNaN(c) && !Number.isNaN(p)) {
      noticeHours += Math.max(0, (p - c) / 3_600_000)
      noticeCount++
    }

    list.push({
      id: b.id,
      bookingNo: b.booking_no,
      clientName: embeddedName(b.clients),
      project: b.project?.trim() || '—',
      cancelledAt: b.cancelled_at ?? '',
      scheduledPickup: b.pickup_at,
      lostRevenue: lost,
      reason,
    })
  }

  const n = rows.length
  return {
    totalCancellations: n,
    cancellationRate: totalAll > 0 ? Number(((n / totalAll) * 100).toFixed(1)) : 0,
    totalLostRevenue: lostTotal as Paisa,
    averageNoticeDays: noticeCount > 0 ? Number((noticeHours / noticeCount / 24).toFixed(1)) : null,
    reasons: [...reasonMap.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([reason, v]) => ({ reason, count: v.count, percent: percentOf(v.count, n), lostRevenue: v.lost as Paisa })),
    cancelledBookings: list,
  }
}
