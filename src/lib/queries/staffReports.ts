import { supabase } from '../supabase'
import { rupees, type Paisa } from '../money'
import { completeReportRead, linesValue, readLineValues, rowsOf, type ReportFilterOptions } from './reportSupport'

/**
 * Staff Performance — per person, from the rows they are recorded against.
 *
 * RULING 2026-10-16 (R-P6-STATES, Law 16): this read fetched `users` and
 * `audit_events`, kept only a count, and the page rendered `data/staffReports`
 * — five invented people with invented revenue, collections, task counts,
 * response times and "performance scores" — on every path, including a failed
 * read. It now attributes what the schema records:
 *
 *   - bookings created and their value  — `bookings.created_by`, `booking_lines_v`
 *   - rental collections received       — `payments.received_by`, Advance Payment,
 *                                          status Received (deposits are a
 *                                          liability, never revenue — Law 4)
 *   - floor sessions completed          — `operation_sessions.completed_by`
 *
 * Response time and a performance score have no source and are not returned.
 * It throws on failure; a period with no activity is an empty list.
 * Revert = restore the seed re-exports and the `catch`.
 */

export interface StaffPerformanceRow {
  userId: string
  name: string
  role: string
  bookingsCreated: number
  bookingValue: Paisa
  collections: Paisa
  sessionsCompleted: number
}

export interface StaffReportsSummary {
  rows: StaffPerformanceRow[]
  totals: {
    bookingsCreated: number
    bookingValue: Paisa
    collections: Paisa
    sessionsCompleted: number
  }
}

export async function getStaffReportsSummary(options?: ReportFilterOptions): Promise<StaffReportsSummary> {
  let bookingsQ = supabase.from('bookings').select('id, created_by').is('cancelled_at', null)
  let paymentsQ = supabase
    .from('payments')
    .select('id, received_by, amount')
    .eq('status', 'Received')
    .eq('payment_type', 'Advance Payment')
  let sessionsQ = supabase.from('operation_sessions').select('id, completed_by').eq('state', 'Completed')
  if (options?.from) {
    bookingsQ = bookingsQ.gte('created_at', options.from)
    paymentsQ = paymentsQ.gte('payment_date', options.from)
    sessionsQ = sessionsQ.gte('completed_at', options.from)
  }
  if (options?.to) {
    bookingsQ = bookingsQ.lte('created_at', options.to)
    paymentsQ = paymentsQ.lte('payment_date', options.to)
    sessionsQ = sessionsQ.lte('completed_at', options.to)
  }
  if (options?.branchId) {
    bookingsQ = bookingsQ.eq('branch_id', options.branchId)
    paymentsQ = paymentsQ.eq('branch_id', options.branchId)
  }

  const [usersRes, bookingsRes, paymentsRes, sessionsRes, lineMap] = await Promise.all([
    completeReportRead(supabase.from('users').select('id, full_name, primary_role'), 'Staff read failed'),
    completeReportRead(bookingsQ, 'Bookings read failed'),
    completeReportRead(paymentsQ, 'Payments read failed'),
    completeReportRead(sessionsQ, 'Sessions read failed'),
    readLineValues(),
  ])
  // `users` is RLS-scoped (0120): a role that sees fewer staff gets '—' names, not a failure.
  const users = rowsOf<{ id: string; full_name: string | null; primary_role: string | null }>(usersRes, 'Staff read failed')
  const bookings = rowsOf<{ id: string; created_by: string | null }>(bookingsRes, 'Bookings read failed')
  const payments = rowsOf<{ received_by: string | null; amount: number | string | null }>(paymentsRes, 'Payments read failed')
  const sessions = rowsOf<{ completed_by: string | null }>(sessionsRes, 'Sessions read failed')

  const byUser = new Map<string, StaffPerformanceRow>()
  const userById = new Map(users.map((u) => [u.id, u]))
  const rowFor = (id: string): StaffPerformanceRow => {
    let row = byUser.get(id)
    if (!row) {
      const u = userById.get(id)
      row = {
        userId: id,
        name: u?.full_name?.trim() || '—',
        role: u?.primary_role ?? '—',
        bookingsCreated: 0,
        bookingValue: 0 as Paisa,
        collections: 0 as Paisa,
        sessionsCompleted: 0,
      }
      byUser.set(id, row)
    }
    return row
  }

  for (const b of bookings) {
    if (!b.created_by) continue
    const row = rowFor(b.created_by)
    row.bookingsCreated++
    row.bookingValue = (row.bookingValue + linesValue(lineMap.get(b.id))) as Paisa
  }
  for (const p of payments) {
    if (!p.received_by) continue
    const row = rowFor(p.received_by)
    row.collections = (row.collections + rupees(Number(p.amount ?? 0) || 0)) as Paisa
  }
  for (const s of sessions) {
    if (!s.completed_by) continue
    rowFor(s.completed_by).sessionsCompleted++
  }

  const rows = [...byUser.values()].sort((a, b) => b.collections - a.collections || b.bookingValue - a.bookingValue)
  return {
    rows,
    totals: {
      bookingsCreated: rows.reduce((a, r) => a + r.bookingsCreated, 0),
      bookingValue: rows.reduce((a, r) => a + r.bookingValue, 0) as Paisa,
      collections: rows.reduce((a, r) => a + r.collections, 0) as Paisa,
      sessionsCompleted: rows.reduce((a, r) => a + r.sessionsCompleted, 0),
    },
  }
}
