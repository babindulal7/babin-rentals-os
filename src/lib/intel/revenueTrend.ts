import { parseMoney, type Paisa } from '../money'

/**
 * An issued-invoice measure, NOT cash collected or accounting profit.
 * Date buckets are Gregorian calendar months (invoices.issue_date is AD DATE).
 * No hardcoded fallback values or demo totals are permitted.
 */
export interface IssuedInvoiceSource {
  id: string
  issue_date: string
  status: string
  taxable_amount: string | number
  currency: string
  voided_at: string | null
}

export type BucketCoverage = 'full' | 'in-progress' | 'clipped' | 'future-inclusive'

export interface RevenueMonth {
  periodStartUtc: string
  label: string
  amountPaisa: Paisa
  invoiceCount: number
  startDay?: string | undefined
  endDay?: string | undefined
  coverage?: BucketCoverage | undefined
  longLabel?: string | undefined
}

export interface RevenueTrend {
  months: RevenueMonth[]
  totalPaisa: Paisa
  issuedCount: number
  fromAd: string
  toAd: string
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MONEY_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/
const ISSUED = new Set(['Sent', 'Partially Paid', 'Paid'])

function asDate(s: string): Date {
  if (!DATE_RE.test(s)) throw new Error('Report dates must use YYYY-MM-DD')
  const value = new Date(s + 'T00:00:00.000Z')
  if (!Number.isFinite(value.getTime()) || value.toISOString().slice(0, 10) !== s) {
    throw new Error('Invalid report date')
  }
  return value
}

function sourcePaisa(source: string | number): Paisa {
  const text = String(source)
  if (!MONEY_RE.test(text)) throw new Error('Unusable taxable invoice amount')
  const parsed = parseMoney(text)
  if (parsed === null || !Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error('Invoice amount cannot be reconciled safely')
  }
  return parsed
}

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/** "14 Oct 2026" — a civil day. Deterministic: no locale data. */
export function dayLabel(day: string): string {
  const monthIdx = Number(day.slice(5, 7)) - 1
  const monthName = MONTHS_SHORT[monthIdx] ?? ''
  return `${Number(day.slice(8, 10))} ${monthName} ${day.slice(0, 4)}`
}

/** "1 Jul 2026 – 14 Oct 2026". */
export function windowLabel(fromAd: string, toAd: string): string {
  return fromAd === toAd ? dayLabel(fromAd) : `${dayLabel(fromAd)} – ${dayLabel(toAd)}`
}

/** "17–31 July 2026", or "31 July 2026" for a one-day bucket. */
export function monthSpan(startDay: string, endDay: string): string {
  const monthIdx = Number(startDay.slice(5, 7)) - 1
  const month = `${MONTHS_LONG[monthIdx] ?? ''} ${startDay.slice(0, 4)}`
  const from = Number(startDay.slice(8, 10))
  const to = Number(endDay.slice(8, 10))
  return from === to ? `${from} ${month}` : `${from}–${to} ${month}`
}

/**
 * RULING 2026-10-17 (R17-3): "month to date" only when the bucket starts on the
 * 1st — a "Last 7 days" bucket holding today is "part month, to date", never a
 * claim about the whole month so far.
 */
export function monthLongLabel(startDay: string, endDay: string, coverage: BucketCoverage): string {
  const monthIdx = Number(startDay.slice(5, 7)) - 1
  if (coverage === 'full') return `${MONTHS_LONG[monthIdx] ?? ''} ${startDay.slice(0, 4)}`
  const span = monthSpan(startDay, endDay)
  if (coverage === 'clipped') return `${span} (part month)`
  if (coverage === 'future-inclusive') return `${span} (includes future dates)`
  return startDay.endsWith('-01') ? `${span} (month to date)` : `${span} (part month, to date)`
}

/** Plain sentences about coverage, for under the chart. */
export function coverageNotes(trend: RevenueTrend): string[] {
  const notes: string[] = []
  const first = trend.months[0]
  const last = trend.months[trend.months.length - 1]
  if (!first || !last) return notes
  if (trend.months.some(month => month.coverage === 'future-inclusive')) {
    notes.push('Selected reporting window includes future dates; issued-invoice totals are not a forecast.')
  }
  if (last.coverage === 'in-progress' && last.startDay && last.endDay) {
    notes.push(
      last.startDay.endsWith('-01')
        ? `${last.label} is month to date, through ${dayLabel(last.endDay)}.`
        : `${last.label} covers ${monthSpan(last.startDay, last.endDay)} only, to date.`,
    )
  }
  if (first.coverage === 'clipped' && first.startDay && first.endDay) {
    notes.push(`${first.label} covers ${monthSpan(first.startDay, first.endDay)} only.`)
  }
  if (last.coverage === 'clipped' && trend.months.length > 1 && last.startDay && last.endDay) {
    notes.push(`${last.label} covers ${monthSpan(last.startDay, last.endDay)} only.`)
  }
  return notes
}

/**
 * Requires the caller to have fetched a COMPLETE, deduplicated period.
 * An incomplete page is not an actual trend.
 */
export function aggregateIssuedRevenue(
  invoices: readonly IssuedInvoiceSource[],
  fromAd: string,
  toAd: string,
  today?: string,
): RevenueTrend {
  const start = asDate(fromAd)
  const end = asDate(toAd)
  if (start.getTime() > end.getTime()) throw new Error('Report start is after end')
  const firstMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
  const lastMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1))
  const months: RevenueMonth[] = []
  for (let cursor = firstMonth; cursor <= lastMonth; cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))) {
    if (months.length >= 24) throw new Error('Choose a report window of 24 months or less')
    const first = cursor.toISOString().slice(0, 10)
    const last = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
    const startDay = first < fromAd ? fromAd : first
    const endDay = last > toAd ? toAd : last
    // RULING 2026-10-17 (R17-3): the month holding today is "to date" even on
    // its last day — invoices for today can still be issued until the day ends.
    const coverage: BucketCoverage =
      today !== undefined && today < endDay
        ? 'future-inclusive'
        : today !== undefined && today >= startDay && today === endDay
          ? 'in-progress'
          : startDay > first || endDay < last
            ? 'clipped'
            : 'full'
    months.push({
      periodStartUtc: cursor.toISOString(),
      label: cursor.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
      amountPaisa: 0 as Paisa,
      invoiceCount: 0,
      startDay,
      endDay,
      coverage,
      longLabel: monthLongLabel(startDay, endDay, coverage),
    })
  }
  const byMonth = new Map(months.map((m) => [m.periodStartUtc.slice(0, 7), m]))
  const seen = new Set<string>()
  let total = 0
  let issuedCount = 0
  for (const invoice of invoices) {
    if (seen.has(invoice.id)) throw new Error('Duplicate invoice in report source')
    seen.add(invoice.id)
    asDate(invoice.issue_date)
    if (invoice.issue_date < fromAd || invoice.issue_date > toAd) {
      throw new Error('Invoice outside requested reporting window')
    }
    if (invoice.voided_at !== null || invoice.status === 'Void' || invoice.status === 'Draft') continue
    if (!ISSUED.has(invoice.status)) throw new Error('Unrecognized invoice status in reporting source')
    if (invoice.currency !== 'NPR') throw new Error('Mixed-currency invoices require a separate report')
    const amount = sourcePaisa(invoice.taxable_amount)
    const month = byMonth.get(invoice.issue_date.slice(0, 7))
    if (!month) throw new Error('Invoice month missing from report window')
    const nextMonth = month.amountPaisa + amount
    const nextTotal = total + amount
    if (!Number.isSafeInteger(nextMonth) || !Number.isSafeInteger(nextTotal)) {
      throw new Error('Revenue total exceeds safe integer paisa')
    }
    month.amountPaisa = nextMonth as Paisa
    month.invoiceCount++
    issuedCount++
    total = nextTotal
  }
  if (months.reduce((sum, month) => sum + month.amountPaisa, 0) !== total) {
    throw new Error('Revenue buckets failed reconciliation')
  }
  return { months, totalPaisa: total as Paisa, issuedCount, fromAd, toAd }
}


/**
 * Credit notes currently record the paid/refunded rupee amount (migration 0117,
 * void_invoice in 0150), not a VAT-exclusive sales adjustment. Do not subtract
 * credit_notes.amount from taxable revenue or label it net sales.
 *
 * This audit joins notes to ALL invoices issued in the selected AD window,
 * including voided invoices excluded from the revenue chart. Credit notes on
 * invoices issued outside the window belong to a different audit population.
 */
export interface IssuedInvoiceWithPayment extends IssuedInvoiceSource {
  paid_amount: string | number
}

export interface InvoiceCreditNoteSource {
  id: string
  invoice_id: string
  amount: string | number
}

export interface RevenueCreditReconciliation {
  voidedInvoiceCount: number
  voidedTaxablePaisa: Paisa
  creditNoteCount: number
  creditNoteAmountPaisa: Paisa
  paidVoidMismatchCount: number
  activeInvoiceCreditNoteCount: number
}

/** No fallback or estimated values: missing/malformed source records fail closed. */
export function reconcileInvoiceCredits(
  invoices: readonly IssuedInvoiceWithPayment[],
  notes: readonly InvoiceCreditNoteSource[],
): RevenueCreditReconciliation {
  const byId = new Map<string, IssuedInvoiceWithPayment>()
  const noteAmounts = new Map<string, number>()
  const seenNotes = new Set<string>()
  let creditNoteAmount = 0
  let voidedTaxable = 0
  let voidedInvoiceCount = 0
  let activeInvoiceCreditNoteCount = 0

  for (const invoice of invoices) {
    if (byId.has(invoice.id)) throw new Error('Duplicate invoice in credit reconciliation')
    asDate(invoice.issue_date)
    byId.set(invoice.id, invoice)
    if (invoice.voided_at !== null || invoice.status === 'Void') {
      // Credit notes have no currency column: only an NPR parent establishes
      // that settlement and taxable amounts can be displayed as NPR.
      if (invoice.currency !== 'NPR') throw new Error('Mixed-currency voided invoices require separate reconciliation')
      voidedInvoiceCount++
      const taxable = sourcePaisa(invoice.taxable_amount)
      voidedTaxable += taxable
      if (!Number.isSafeInteger(voidedTaxable)) throw new Error('Voided taxable amount exceeds safe paisa')
    }
  }

  for (const note of notes) {
    if (seenNotes.has(note.id)) throw new Error('Duplicate credit note in report source')
    seenNotes.add(note.id)
    const invoice = byId.get(note.invoice_id)
    if (!invoice) throw new Error('Credit note has no invoice in the report source')
    if (invoice.currency !== 'NPR') throw new Error('Mixed-currency credit notes require separate reconciliation')
    const amount = sourcePaisa(note.amount)
    if (amount <= 0) throw new Error('Credit note must carry a positive amount')
    creditNoteAmount += amount
    const combined = (noteAmounts.get(note.invoice_id) ?? 0) + amount
    if (!Number.isSafeInteger(combined) || !Number.isSafeInteger(creditNoteAmount)) {
      throw new Error('Credit note totals exceed safe paisa')
    }
    noteAmounts.set(note.invoice_id, combined)
    if (invoice.voided_at === null && invoice.status !== 'Void') activeInvoiceCreditNoteCount++
  }

  let paidVoidMismatchCount = 0
  for (const invoice of invoices) {
    if (invoice.voided_at === null && invoice.status !== 'Void') continue
    const paid = sourcePaisa(invoice.paid_amount)
    if (paid > 0 && (noteAmounts.get(invoice.id) ?? 0) !== paid) paidVoidMismatchCount++
  }

  return {
    voidedInvoiceCount,
    voidedTaxablePaisa: voidedTaxable as Paisa,
    creditNoteCount: notes.length,
    creditNoteAmountPaisa: creditNoteAmount as Paisa,
    paidVoidMismatchCount,
    activeInvoiceCreditNoteCount,
  }
}
