import { supabase } from '../supabase'
import { rupees, type Paisa } from '../money'
import {
  PERIODS,
  DEFAULT_PERIOD,
  DEFINITIONS,
  PERIOD_BASIS,
  RECONCILIATION,
  SCHEDULES,
  UPCOMING,
  LEDGER_ASSERTION_ERRORS,
  FLEET_RECONCILIATION_ERRORS,
  MODEL_DISCLOSURE,
  figuresFor,
  previousPeriod,
  rangeLabel,
  dueStatus,
  exportHeader,
  type ChartView,
  type PeriodFigures,
  type EquipmentRow,
  type ScheduleRow,
} from '../../data/pulse'

export {
  PERIODS,
  DEFAULT_PERIOD,
  DEFINITIONS,
  PERIOD_BASIS,
  RECONCILIATION,
  SCHEDULES,
  UPCOMING,
  LEDGER_ASSERTION_ERRORS,
  FLEET_RECONCILIATION_ERRORS,
  MODEL_DISCLOSURE,
  figuresFor,
  previousPeriod,
  rangeLabel,
  dueStatus,
  exportHeader,
}

export type { ChartView, PeriodFigures, EquipmentRow, ScheduleRow }

export interface PulseLiveSummary {
  bookingCount: number
  activeBookings: number
  invoicedTotal: Paisa
  collectedTotal: Paisa
  inventoryUnitsCount: number
}

/**
 * Queries PostgreSQL database for live operational and financial aggregates
 * behind the executive Pulse dashboard.
 *
 * RULING 2026-10-15: a failed read THROWS. It used to resolve to zeros — on a
 * caught exception, and silently on any one of the four reads returning an
 * error — so an outage read as "0 bookings, Rs 0 collected", a figure nobody
 * recorded (Law 16). Pulse draws its Error state (with Retry) from the throw,
 * and its "nothing yet" Empty state only from a read that genuinely returned
 * no rows. Revert = restore the `catch` returning zeros.
 */
export async function getPulseLiveSummary(): Promise<PulseLiveSummary> {
  const [bookingsRes, invoicesRes, paymentsRes, unitsRes] = await Promise.all([
    supabase.from('bookings').select('id, stage'),
    supabase.from('invoices').select('id, total_amount, status'),
    supabase.from('payments').select('id, amount, status').eq('status', 'Completed'),
    supabase.from('product_units').select('id, status'),
  ])

  const reads = { bookings: bookingsRes, invoices: invoicesRes, payments: paymentsRes, product_units: unitsRes }
  for (const [table, res] of Object.entries(reads)) {
    if (res.error) throw new Error(`getPulseLiveSummary failed on ${table}: ${res.error.message}`)
  }

  const bookings = bookingsRes.data ?? []
  const invoices = invoicesRes.data ?? []
  const payments = paymentsRes.data ?? []
  const units = unitsRes.data ?? []

  const activeBookings = bookings.filter((b) =>
    ['Confirmed', 'Packed', 'On Rent'].includes(b.stage),
  ).length

  const invoicedTotal = rupees(
    invoices.reduce((sum, inv) => sum + (Number(inv.total_amount) || 0), 0),
  )

  const collectedTotal = rupees(
    payments.reduce((sum, pay) => sum + (Number(pay.amount) || 0), 0),
  )

  return {
    bookingCount: bookings.length,
    activeBookings,
    invoicedTotal,
    collectedTotal,
    inventoryUnitsCount: units.length,
  }
}

/**
 * Whether the business has recorded nothing Pulse could summarise — no
 * bookings and no units. Pulse's "nothing yet" Empty state reads this, so the
 * first-run screen is a different sentence from "this period has no figures".
 */
export function isPulseNothingYet(summary: PulseLiveSummary): boolean {
  return summary.bookingCount === 0 && summary.inventoryUnitsCount === 0
}
