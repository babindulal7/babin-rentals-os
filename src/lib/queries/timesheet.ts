/**
 * Crew timesheet — the hours people actually worked on shoot days, read from
 * `crew_shoot_days` (0003): one row per crew booking per working day, with the
 * recorded start/end (`actual_start`, `actual_end`), the unpaid break and the
 * submission / approval state.
 *
 * RULING 2026-10-20: this replaced `TIMESHEET_DATA`, five invented staff with
 * hand-typed hours that the page rendered as real (and a "Last Week" that was
 * this week × 0.9). Nothing here is seeded: an empty week is an empty week.
 *
 * Money (Law 6): the rate is `crew_bookings_v.day_rate`, which the view masks to
 * `null` for a money-blind role. So `rate` and `pay` arrive `null` for them —
 * withheld, never zero — and the page and the CSV omit those columns.
 *
 * D24 (Ruling 2026-10-26): Pay is by the day (days × day rate + recorded
 * overtime days) matching Crew Assist payouts (closes OPEN_DECISIONS §18).
 * Hours worked remain tracked for operational presence and visibility.
 * R-9.3 (RULINGS-2026-11-09): no hours-based overtime flag. Overtime is only
 * the recorded overtime days, never derived from hours.
 */
import { supabase } from '../supabase'
import { businessDayAd } from '../bs'
import { csvCell } from '../csv'
import type { ListQueryResult } from './useList'

// ── Types ────────────────────────────────────────────────────────────

export type TimesheetWeek = 'This Week' | 'Last Week'

/** The week's seven columns, Monday first (Nepal's weekend is Saturday, but the grid is Monday-based). */
export const TIMESHEET_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/** Display only: an 8-hour day is shaded as a full day. NOT an overtime threshold (R-9.3). */
export const STANDARD_DAY_HOURS = 8

/**
 * Where a person's week stands against the payout gate ("approval is the payout
 * gate", 0003). `Approved` only when every shoot day in the week is approved.
 */
export type TimesheetApproval = 'Approved' | 'Awaiting approval' | 'Not submitted'

export interface TimesheetRow {
  /** Crew member id — stable across weeks, unlike a display name. */
  key: string
  name: string
  role: string
  /** Day rate in NPR; `null` when withheld from this role. */
  rate: number | null
  /** Hours worked per day, Monday first, from recorded start/end minus break. */
  hrs: number[]
  totalHrs: number
  /** Shoot days worked in this week (count of shoot days). */
  daysWorked: number
  /** Overtime days recorded in this week (sum of overtime fractions, D24). */
  overtimeDays: number
  /** Pay in NPR ((daysWorked + overtimeDays) × day rate, D24); `null` when the rate is withheld. */
  pay: number | null
  /** Shoot days up to today with no recorded start/end — hours the grid cannot show. */
  unrecordedDays: number
  approval: TimesheetApproval
}

export interface TimesheetStats {
  totalHours: number
  /** `null` when no row carries a rate (money-blind session). */
  totalPay: number | null
  staffLogged: number
  totalStaff: number
}

/** The columns read from `crew_shoot_days`, as the database returns them. */
export interface ShootDayDbRow {
  crew_booking_id: string
  work_date: string
  actual_start: string | null
  actual_end: string | null
  break_minutes: number | null
  submission_state: string
  approval_state: string
  overtime_fraction?: number | null | undefined
}

export interface CrewBookingDbRow {
  id: string
  crew_member_id: string | null
  position: string
  day_rate: number | null
}

export interface CrewMemberDbRow {
  id: string
  full_name: string
  position: string | null
}

// ── Week arithmetic (business days, ISO dates) ───────────────────────

const DAY_MS = 86_400_000

function isoToUtc(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

function utcToIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function addDays(iso: string, days: number): string {
  return utcToIso(isoToUtc(iso) + days * DAY_MS)
}

/** Monday (index 0) … Sunday (index 6) of an ISO date. */
function weekdayIndex(iso: string): number {
  return (new Date(isoToUtc(iso)).getUTCDay() + 6) % 7
}

/**
 * The Monday-to-Sunday span for a week chip, in the business (Kathmandu) day —
 * not the browser's: a tablet set to another zone must agree with the warehouse
 * about which week "This Week" is.
 */
export function weekRange(week: TimesheetWeek, now: Date = new Date()): { start: string; end: string; today: string } {
  const today = businessDayAd(now)
  const thisMonday = addDays(today, -weekdayIndex(today))
  const start = week === 'Last Week' ? addDays(thisMonday, -7) : thisMonday
  return { start, end: addDays(start, 6), today }
}

// ── Pure builder ─────────────────────────────────────────────────────

/** Hours between recorded start and end, less the break; 0 when either end is missing. */
export function shootDayHours(day: Pick<ShootDayDbRow, 'actual_start' | 'actual_end' | 'break_minutes'>): number {
  if (!day.actual_start || !day.actual_end) return 0
  const ms = Date.parse(day.actual_end) - Date.parse(day.actual_start) - (day.break_minutes ?? 0) * 60_000
  if (!Number.isFinite(ms) || ms <= 0) return 0
  return Math.round((ms / 3_600_000) * 100) / 100
}

function summariseApproval(days: ShootDayDbRow[]): TimesheetApproval {
  if (days.every((d) => d.approval_state === 'Approved')) return 'Approved'
  if (days.some((d) => d.submission_state === 'Submitted')) return 'Awaiting approval'
  return 'Not submitted'
}

/**
 * One row per crew member who has a shoot day in the week. Shoot days on a
 * booking with no crew member yet (an open role) belong to nobody and are left
 * out — there is no one to attribute hours to.
 *
 * `today` bounds "not recorded": a future shoot day has no hours yet by nature.
 */
export function buildTimesheetRows(
  days: readonly ShootDayDbRow[],
  bookings: readonly CrewBookingDbRow[],
  members: readonly CrewMemberDbRow[],
  weekStart: string,
  today: string,
): TimesheetRow[] {
  const bookingById = new Map(bookings.map((b) => [b.id, b]))
  const memberById = new Map(members.map((m) => [m.id, m]))

  const byMember = new Map<
    string,
    {
      days: ShootDayDbRow[]
      hrs: number[]
      pay: number
      anyRate: boolean
      rate: number | null
      rateHrs: number
      daysWorked: number
      overtimeDays: number
      unrecorded: number
    }
  >()

  for (const day of days) {
    const booking = bookingById.get(day.crew_booking_id)
    if (!booking?.crew_member_id) continue
    const idx = Math.round((isoToUtc(day.work_date) - isoToUtc(weekStart)) / DAY_MS)
    if (idx < 0 || idx > 6) continue

    let acc = byMember.get(booking.crew_member_id)
    if (!acc) {
      acc = {
        days: [],
        hrs: [0, 0, 0, 0, 0, 0, 0],
        pay: 0,
        anyRate: false,
        rate: null,
        rateHrs: -1,
        daysWorked: 0,
        overtimeDays: 0,
        unrecorded: 0,
      }
      byMember.set(booking.crew_member_id, acc)
    }
    acc.days.push(day)

    const hours = shootDayHours(day)
    acc.hrs[idx] = Math.round(((acc.hrs[idx] ?? 0) + hours) * 100) / 100
    if (hours === 0 && day.work_date <= today) acc.unrecorded += 1

    const otFraction = Number(day.overtime_fraction ?? 0)
    acc.daysWorked += 1
    acc.overtimeDays = Math.round((acc.overtimeDays + otFraction) * 10) / 10

    if (booking.day_rate !== null) {
      acc.anyRate = true
      // D24: Day rate + overtime days (not hourly estimate)
      // Each shoot day is 1 day + overtime fraction at day rate
      const billableFraction = 1 + otFraction
      acc.pay += billableFraction * booking.day_rate
      // The rate shown is the one that carried the most hours this week.
      if (acc.rate === null || hours > acc.rateHrs) {
        acc.rateHrs = hours
        acc.rate = booking.day_rate
      }
    }
  }

  const rows: TimesheetRow[] = []
  for (const [memberId, acc] of byMember) {
    const member = memberById.get(memberId)
    const firstBooking = bookings.find((b) => b.crew_member_id === memberId)
    const totalHrs = Math.round(acc.hrs.reduce((a, b) => a + b, 0) * 100) / 100
    rows.push({
      key: memberId,
      name: member?.full_name ?? 'Unnamed crew member',
      role: member?.position || firstBooking?.position || '—',
      rate: acc.rate,
      hrs: acc.hrs,
      totalHrs,
      daysWorked: acc.daysWorked,
      overtimeDays: acc.overtimeDays,
      pay: acc.anyRate ? Math.round(acc.pay) : null,
      unrecordedDays: acc.unrecorded,
      approval: summariseApproval(acc.days),
    })
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name))
}

// ── Read ─────────────────────────────────────────────────────────────

/**
 * The week's timesheet. Three reads (shoot days → their bookings → the crew
 * members), the same shape as `listCrewAssignments`, because the money mask
 * lives on the `crew_bookings_v` view.
 */
export async function listTimesheetWeek(week: TimesheetWeek, now: Date = new Date()): Promise<ListQueryResult<TimesheetRow>> {
  const { start, end, today } = weekRange(week, now)

  const { data: dayData, error: dayError } = await supabase
    .from('crew_shoot_days')
    .select('crew_booking_id, work_date, actual_start, actual_end, break_minutes, submission_state, approval_state, overtime_fraction')
    .gte('work_date', start)
    .lte('work_date', end)
  if (dayError) throw new Error(`listTimesheetWeek failed: ${dayError.message}`)

  const days = (dayData ?? []) as unknown as ShootDayDbRow[]
  if (days.length === 0) return { rows: [], total: 0 }

  const bookingIds = [...new Set(days.map((d) => d.crew_booking_id))]
  const { data: bookingData, error: bookingError } = await supabase
    .from('crew_bookings_v')
    .select('id, crew_member_id, position, day_rate')
    .in('id', bookingIds)
  if (bookingError) throw new Error(`listTimesheetWeek failed: ${bookingError.message}`)
  const bookings = (bookingData ?? []) as unknown as CrewBookingDbRow[]

  const memberIds = [...new Set(bookings.map((b) => b.crew_member_id).filter((id): id is string => id !== null))]
  let members: CrewMemberDbRow[] = []
  if (memberIds.length > 0) {
    const { data: memberData, error: memberError } = await supabase
      .from('crew_members_v')
      .select('id, full_name, position')
      .in('id', memberIds)
    if (memberError) throw new Error(`listTimesheetWeek failed: ${memberError.message}`)
    members = (memberData ?? []) as unknown as CrewMemberDbRow[]
  }

  const rows = buildTimesheetRows(days, bookings, members, start, today)
  return { rows, total: rows.length }
}

// ── KPI stats ────────────────────────────────────────────────────────

export function getTimesheetStats(rows: readonly TimesheetRow[]): TimesheetStats {
  let totalHours = 0
  let totalPay = 0
  let anyPay = false
  let staffLogged = 0

  for (const row of rows) {
    totalHours += row.totalHrs
    if (row.pay !== null) {
      totalPay += row.pay
      anyPay = true
    }
    if (row.totalHrs > 0) staffLogged++
  }

  return {
    totalHours: Math.round(totalHours * 100) / 100,
    totalPay: anyPay ? totalPay : null,
    staffLogged,
    totalStaff: rows.length,
  }
}

/** `8` → "8", `8.5` → "8.5", `7.333` → "7.3". */
export function formatHours(h: number): string {
  const r = Math.round(h * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

// ── CSV ──────────────────────────────────────────────────────────────

/**
 * The CSV body. Money columns are included only when the session may see money —
 * the export button is money-gated too, but the file's own columns must not
 * depend on a caller remembering that.
 */
export function timesheetCsv(rows: readonly TimesheetRow[], canViewMoney: boolean): { columns: string[]; text: string } {
  const columns = [
    'Name',
    'Role',
    ...(canViewMoney ? ['Day rate (Rs)'] : []),
    ...TIMESHEET_DAYS,
    'Total hours',
    'Days',
    'OT days',
    ...(canViewMoney ? ['Pay (Rs)'] : []),
    'Approval',
  ]
  const lines = rows.map((r) => [
    r.name,
    r.role,
    ...(canViewMoney ? [r.rate === null ? '' : String(r.rate)] : []),
    ...r.hrs.map((h) => String(h)),
    String(r.totalHrs),
    String(r.daysWorked),
    String(r.overtimeDays),
    ...(canViewMoney ? [r.pay === null ? '' : String(r.pay)] : []),
    r.approval,
  ])
  return { columns, text: [columns, ...lines].map((line) => line.map(csvCell).join(',')).join('\n') }
}

export function downloadTimesheetCsv(text: string, week: TimesheetWeek): void {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `crew-timesheet-${week === 'Last Week' ? 'last-week' : 'this-week'}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
