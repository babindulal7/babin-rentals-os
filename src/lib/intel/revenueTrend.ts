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

export interface RevenueMonth {
  periodStartUtc: string
  label: string
  amountPaisa: Paisa
  invoiceCount: number
}

export interface RevenueTrend {
  months: RevenueMonth[]
  totalPaisa: Paisa
  issuedCount: number
  fromAd: string
  toAd: string
}

const DATE_RE = /^\\d{4}-\\d{2}-\\d{2}$/
const MONEY_RE = /^(?:0|[1-9]\\d*)(?:\\.\\d{1,2})?$/
const ISSUED = new Set(['Sent', 'Partially Paid', 'Paid'])

function asDate(s: string): Date {
  if (!DATE_RE.test(s)) throw new Error('Report dates must use YYYY-MM-DD')
  const value = new Date(s + 'T00:00:00.000Z')
  if (!Number.isFinite(value.getTime()) || value.toISOString().slice(0, 10) !== s) {
    throw new Error('Invalid report date')
  }
  return value
}

function monthId(date: Date): string {
  return date.toISOString().slice(0, 7)
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

/**
 * Requires the caller to have fetched a COMPLETE, deduplicated period.
 * An incomplete page is not an actual trend.
 */
export function aggregateIssuedRevenue(
  invoices: readonly IssuedInvoiceSource[],
  fromAd: string,
  toAd: string,
): RevenueTrend {
  const start = asDate(fromAd)
  const end = asDate(toAd)
  if (start.getTime() > end.getTime()) throw new Error('Report start is after end')
  const firstMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
  const lastMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1))
  const months: RevenueMonth[] = []
  for (let cursor = firstMonth; cursor <= lastMonth; cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))) {
    if (months.length >= 24) throw new Error('Choose a report window of 24 months or less')
    months.push({
      periodStartUtc: cursor.toISOString(),
      label: cursor.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
      amountPaisa: 0 as Paisa,
      invoiceCount: 0,
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
