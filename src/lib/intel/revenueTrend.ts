import { formatMoney, parseMoney, type Paisa } from '../money'

/**
 * # Billed revenue — the one definition the Revenue report charts
 *
 * RULING 2026-10-14: Billed revenue = Σ `invoices.taxable_amount` (after discount,
 * BEFORE VAT) over issued, non-voided NPR invoices, bucketed by `issue_date`
 * (an AD calendar date). Revert = change `measureOf` and the page copy together.
 *
 * Why each part:
 *  · **Issued only.** `Draft` has been sent to nobody. 'Overdue' is derived, not
 *    stored (0001:1010), but is accepted if a row ever carries it — it is still
 *    an issued invoice.
 *  · **Voided invoices are excluded entirely**, by `voided_at` (the timestamp is
 *    the fact; the enum member is a label — `queries/finance.ts`). Credit notes
 *    are then NOT subtracted as well: today the only writer of `credit_notes` is
 *    `void_invoice()` (0121), which mints one for a paid invoice it is voiding.
 *    Subtracting it again would count the same reversal twice. A credit note
 *    found against an invoice that is still live means that assumption broke,
 *    and the report says "Partial" rather than quietly netting or ignoring it.
 *  · **Before VAT.** Output VAT is owed to the government, not earned. The
 *    0098 trigger fixes `taxable = subtotal − discount` and
 *    `total = taxable + VAT`, so VAT and the VAT-inclusive total are carried
 *    alongside for reconciliation with Finance ▸ Invoices, never mixed into one
 *    axis with revenue.
 *  · **Deposits never appear** — they are not invoiced revenue (Law 5).
 *  · **Not cash.** Collections are a different metric with a different date.
 *
 * Nothing here fetches. The caller hands over a COMPLETE, verified row set
 * (`queries/reportRevenueTrend.ts` checks the server's exact count); a
 * truncated page is not an actual trend.
 */

export const ISSUED_INVOICE_STATUSES = ['Sent', 'Partially Paid', 'Paid', 'Overdue'] as const

export type Granularity = 'day' | 'month'

/** At most 62 daily points — two months — before the trend switches to months. */
export const MAX_DAY_BUCKETS = 62
/** Five years of months. Beyond that a monthly line stops being readable. */
export const MAX_MONTH_BUCKETS = 60

/** One invoice as PostgREST returns it. `numeric(14,2)` arrives as a JSON number or string. */
export interface InvoiceRevenueSource {
  id: string
  invoice_no: string | null
  issue_date: string
  status: string
  currency: string
  taxable_amount: number | string
  vat_amount: number | string
  total_amount: number | string
  voided_at: string | null
}

/** Inclusive civil-day bounds, `YYYY-MM-DD`, in Kathmandu. */
export interface RevenueWindow {
  fromDay: string
  toDay: string
}

/**
 * How much of a bucket's calendar span the window covers.
 * `in-progress` — the bucket contains today, so it is "to date", not complete.
 * `clipped`     — the window starts or ends inside the bucket.
 */
export type BucketCoverage = 'full' | 'in-progress' | 'clipped'

export interface RevenueBucket {
  /** `YYYY-MM-DD` (day) or `YYYY-MM` (month). Sorted, unique. */
  key: string
  startDay: string
  endDay: string
  coverage: BucketCoverage
  revenue: Paisa
  vat: Paisa
  gross: Paisa
  invoiceCount: number
}

export interface RevenueTotals {
  revenue: Paisa
  vat: Paisa
  gross: Paisa
  invoiceCount: number
}

/**
 * `calendar` — buckets are days or AD calendar months (the period itself).
 * `shifted`  — the comparison: the period's buckets moved back by its length.
 */
export type BucketLayout = 'calendar' | 'shifted'

export interface RevenueSeries {
  window: RevenueWindow
  granularity: Granularity
  layout: BucketLayout
  buckets: RevenueBucket[]
  totals: RevenueTotals
  /** Invoice numbers whose stored VAT + taxable amount does not equal the stored total. */
  unreconciledInvoices: string[]
}

/** The source could not be summed safely. Shown as an inline error, never as zeros. */
export class RevenueSourceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RevenueSourceError'
  }
}

/* ── civil-day arithmetic ──────────────────────────────────────────────── */

const DAY_MS = 86_400_000
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const MONEY_RE = /^\d+(?:\.\d{1,2})?$/
const ZERO = 0 as Paisa

export function isCivilDay(s: string): boolean {
  if (!DAY_RE.test(s)) return false
  const t = Date.parse(`${s}T00:00:00.000Z`)
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s
}

function dayMs(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`)
}

function msDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function addDays(day: string, n: number): string {
  return msDay(dayMs(day) + n * DAY_MS)
}

/** Days from `from` to `to`, both included. */
export function daysInclusive(from: string, to: string): number {
  return Math.round((dayMs(to) - dayMs(from)) / DAY_MS) + 1
}

function ym(day: string): [number, number] {
  return [Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1]
}

function monthKey(year: number, month0: number): string {
  return `${year}-${String(month0 + 1).padStart(2, '0')}`
}

function lastDayOfMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate()
}

function dayOf(year: number, month0: number, date: number): string {
  return msDay(Date.UTC(year, month0, date))
}

function monthsSpanned(window: RevenueWindow): number {
  const [fy, fm] = ym(window.fromDay)
  const [ty, tm] = ym(window.toDay)
  return (ty - fy) * 12 + (tm - fm) + 1
}

/* ── the window ────────────────────────────────────────────────────────── */

export type WindowResolution =
  | { kind: 'ok'; window: RevenueWindow; granularity: Granularity; clampedToToday: boolean }
  /** No start was chosen and no issued invoice exists on or before the end. */
  | { kind: 'no-history' }
  /** The whole period lies after today; no actual figure can exist for it. */
  | { kind: 'future' }
  | { kind: 'inverted' }
  | { kind: 'too-long'; months: number }

/**
 * The window the trend is drawn over.
 *
 * `fromDay`/`toDay` are what the report toolbar chose (either may be absent —
 * "All dates" is neither). An absent start becomes the first issued invoice; an
 * absent or future end becomes today, because an actual cannot be plotted in a
 * period that has not happened.
 */
export function resolveWindow(input: {
  fromDay: string | null
  toDay: string | null
  earliestIssuedDay: string | null
  today: string
}): WindowResolution {
  const { today } = input
  if (input.fromDay && input.toDay && input.fromDay > input.toDay) return { kind: 'inverted' }
  if (input.fromDay && input.fromDay > today) return { kind: 'future' }

  const requestedTo = input.toDay ?? today
  const toDay = requestedTo > today ? today : requestedTo
  const clampedToToday = requestedTo > today

  let fromDay = input.fromDay
  if (!fromDay) {
    if (!input.earliestIssuedDay || input.earliestIssuedDay > toDay) return { kind: 'no-history' }
    fromDay = input.earliestIssuedDay
  }

  const window = { fromDay, toDay }
  if (daysInclusive(fromDay, toDay) <= MAX_DAY_BUCKETS) {
    return { kind: 'ok', window, granularity: 'day', clampedToToday }
  }
  const months = monthsSpanned(window)
  if (months > MAX_MONTH_BUCKETS) return { kind: 'too-long', months }
  return { kind: 'ok', window, granularity: 'month', clampedToToday }
}

/**
 * The comparison window: the same number of days, immediately before the
 * period — what the report toolbar's "Compare: previous period" promises.
 * "18 Jul – 15 Oct" (90 days) compares with "19 Apr – 17 Jul" (90 days).
 */
export function previousWindow(window: RevenueWindow): RevenueWindow {
  const n = daysInclusive(window.fromDay, window.toDay)
  return { fromDay: addDays(window.fromDay, -n), toDay: addDays(window.fromDay, -1) }
}

/**
 * The comparison's buckets: each of the period's buckets moved back by the
 * period's length, so bucket `i` of the comparison covers exactly as many days
 * as bucket `i` of the period and the shifted buckets tile the comparison
 * window with no gap or overlap. (A shifted "August" is "3 May – 2 Jun" — it is
 * labelled by its dates, never as a calendar month.)
 */
export function shiftedBuckets(current: readonly RevenueBucket[], window: RevenueWindow): RevenueBucket[] {
  const n = daysInclusive(window.fromDay, window.toDay)
  return current.map((b) => ({
    key: `prev:${b.key}`,
    startDay: addDays(b.startDay, -n),
    endDay: addDays(b.endDay, -n),
    // The comparison lies wholly in the past; "to date" does not apply to it.
    coverage: b.coverage === 'in-progress' ? 'full' : b.coverage,
    revenue: ZERO,
    vat: ZERO,
    gross: ZERO,
    invoiceCount: 0,
  }))
}

/* ── buckets ───────────────────────────────────────────────────────────── */

export function emptyBuckets(window: RevenueWindow, granularity: Granularity, today: string): RevenueBucket[] {
  const out: RevenueBucket[] = []
  if (granularity === 'day') {
    for (let d = window.fromDay; d <= window.toDay; d = addDays(d, 1)) {
      out.push({ key: d, startDay: d, endDay: d, coverage: d === today ? 'in-progress' : 'full', revenue: ZERO, vat: ZERO, gross: ZERO, invoiceCount: 0 })
    }
    return out
  }
  let [y, m] = ym(window.fromDay)
  const [ty, tm] = ym(window.toDay)
  while (y < ty || (y === ty && m <= tm)) {
    const first = dayOf(y, m, 1)
    const last = dayOf(y, m, lastDayOfMonth(y, m))
    const startDay = first < window.fromDay ? window.fromDay : first
    const endDay = last > window.toDay ? window.toDay : last
    const coverage: BucketCoverage =
      endDay === today && endDay < last ? 'in-progress' : startDay > first || endDay < last ? 'clipped' : 'full'
    out.push({ key: monthKey(y, m), startDay, endDay, coverage, revenue: ZERO, vat: ZERO, gross: ZERO, invoiceCount: 0 })
    m += 1
    if (m === 12) {
      m = 0
      y += 1
    }
  }
  return out
}

/* ── aggregation ───────────────────────────────────────────────────────── */

function amount(raw: number | string, field: string, invoice: string): Paisa {
  const text = typeof raw === 'number' ? String(raw) : raw.trim()
  if (!MONEY_RE.test(text)) throw new RevenueSourceError(`Invoice ${invoice} has an unreadable ${field}.`)
  const parsed = parseMoney(text)
  if (parsed === null || !Number.isSafeInteger(parsed)) {
    throw new RevenueSourceError(`Invoice ${invoice} has a ${field} outside the supported range.`)
  }
  return parsed
}

function safeAdd(a: Paisa, b: Paisa): Paisa {
  const sum = a + b
  if (!Number.isSafeInteger(sum)) throw new RevenueSourceError('The revenue total is too large to add up exactly.')
  return sum as Paisa
}

const ISSUED = new Set<string>(ISSUED_INVOICE_STATUSES)

/**
 * Sums a complete invoice set into the window's buckets.
 *
 * Throws `RevenueSourceError` — so the page shows an error, not a plausible
 * chart — on: a malformed or out-of-window date, the same invoice twice, a
 * non-NPR invoice, an unreadable amount. Drafts and voided rows are skipped if
 * the server ever returns them; they are never revenue.
 */
export function aggregateRevenue(
  rows: readonly InvoiceRevenueSource[],
  window: RevenueWindow,
  granularity: Granularity,
  today: string,
): RevenueSeries {
  if (!isCivilDay(window.fromDay) || !isCivilDay(window.toDay)) {
    throw new RevenueSourceError('The report period is not a valid date range.')
  }
  return aggregateIntoBuckets(rows, window, granularity, emptyBuckets(window, granularity, today), 'calendar')
}

/** The comparison series: the previous window, summed into the period's shifted buckets. */
export function aggregatePrevious(
  rows: readonly InvoiceRevenueSource[],
  current: RevenueSeries,
): RevenueSeries {
  const window = previousWindow(current.window)
  return aggregateIntoBuckets(rows, window, current.granularity, shiftedBuckets(current.buckets, current.window), 'shifted')
}

function aggregateIntoBuckets(
  rows: readonly InvoiceRevenueSource[],
  window: RevenueWindow,
  granularity: Granularity,
  buckets: RevenueBucket[],
  layout: BucketLayout,
): RevenueSeries {
  // Buckets are sorted and tile the window, so the first whose end is on or
  // after the date is the one it falls in.
  const find = (day: string) => buckets.find((b) => day <= b.endDay && day >= b.startDay)
  const seen = new Set<string>()
  const unreconciled: string[] = []
  let totals: RevenueTotals = { revenue: ZERO, vat: ZERO, gross: ZERO, invoiceCount: 0 }

  for (const row of rows) {
    const name = row.invoice_no ?? row.id
    if (seen.has(row.id)) throw new RevenueSourceError(`Invoice ${name} was returned twice.`)
    seen.add(row.id)
    if (!isCivilDay(row.issue_date)) throw new RevenueSourceError(`Invoice ${name} has an unreadable issue date.`)
    if (row.issue_date < window.fromDay || row.issue_date > window.toDay) {
      throw new RevenueSourceError(`Invoice ${name} falls outside the requested period.`)
    }
    if (row.voided_at !== null || !ISSUED.has(row.status)) continue
    if (row.currency !== 'NPR') {
      throw new RevenueSourceError(`Invoice ${name} is in ${row.currency}; this report sums NPR only.`)
    }

    const revenue = amount(row.taxable_amount, 'taxable amount', name)
    const vat = amount(row.vat_amount, 'VAT amount', name)
    const gross = amount(row.total_amount, 'total', name)
    if (revenue + vat !== gross) unreconciled.push(name)

    const bucket = find(row.issue_date)
    if (!bucket) throw new RevenueSourceError(`Invoice ${name} has no period to fall in.`)
    bucket.revenue = safeAdd(bucket.revenue, revenue)
    bucket.vat = safeAdd(bucket.vat, vat)
    bucket.gross = safeAdd(bucket.gross, gross)
    bucket.invoiceCount += 1
    totals = {
      revenue: safeAdd(totals.revenue, revenue),
      vat: safeAdd(totals.vat, vat),
      gross: safeAdd(totals.gross, gross),
      invoiceCount: totals.invoiceCount + 1,
    }
  }

  // The chart and the KPI strip must be the same number. Prove it.
  const check = buckets.reduce(
    (acc, b) => ({ revenue: acc.revenue + b.revenue, vat: acc.vat + b.vat, gross: acc.gross + b.gross, n: acc.n + b.invoiceCount }),
    { revenue: 0, vat: 0, gross: 0, n: 0 },
  )
  if (
    check.revenue !== totals.revenue ||
    check.vat !== totals.vat ||
    check.gross !== totals.gross ||
    check.n !== totals.invoiceCount
  ) {
    throw new RevenueSourceError('The period buckets do not add up to the period total.')
  }

  return { window, granularity, layout, buckets, totals, unreconciledInvoices: unreconciled }
}

/* ── the report ────────────────────────────────────────────────────────── */

export type ReportStatus = 'actual' | 'partial'

export interface RevenueTrendReport {
  current: RevenueSeries
  /** Same-shape comparison series, or null when compare is off. */
  previous: RevenueSeries | null
  status: ReportStatus
  /** Why the figures are not a complete actual. Empty when `status` is `actual`. */
  partialReasons: string[]
  calculatedAt: string
}

export function buildRevenueTrendReport(args: {
  current: RevenueSeries
  previous: RevenueSeries | null
  /** Credit notes recorded against invoices in the period that are NOT voided. */
  unnettedCreditNotes: number
  calculatedAt: Date
}): RevenueTrendReport {
  const reasons: string[] = []
  if (args.unnettedCreditNotes > 0) {
    reasons.push(
      `${args.unnettedCreditNotes} credit note${args.unnettedCreditNotes === 1 ? ' is' : 's are'} recorded against invoices that are still live. Revenue is shown before ${args.unnettedCreditNotes === 1 ? 'it' : 'them'}.`,
    )
  }
  const mismatched = [...args.current.unreconciledInvoices, ...(args.previous?.unreconciledInvoices ?? [])]
  if (mismatched.length > 0) {
    reasons.push(
      `${mismatched.length} invoice${mismatched.length === 1 ? '' : 's'} (${mismatched.slice(0, 5).join(', ')}${mismatched.length > 5 ? ', …' : ''}) ${mismatched.length === 1 ? 'has' : 'have'} a stored total that is not amount + VAT.`,
    )
  }
  return {
    current: args.current,
    previous: args.previous,
    status: reasons.length > 0 ? 'partial' : 'actual',
    partialReasons: reasons,
    calculatedAt: args.calculatedAt.toISOString(),
  }
}

/* ── labels (deterministic: no locale data) ────────────────────────────── */

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

/** "14 Oct 2026" — a civil day. */
export function dayLabel(day: string): string {
  const [y, m] = ym(day)
  return `${Number(day.slice(8, 10))} ${MONTHS_SHORT[m]} ${y}`
}

/** Axis label: "Oct 2026" for a month bucket, "14 Oct" for a day. */
export function bucketAxisLabel(b: RevenueBucket, granularity: Granularity): string {
  const [y, m] = ym(b.startDay)
  return granularity === 'month' ? `${MONTHS_SHORT[m]} ${y}` : `${Number(b.startDay.slice(8, 10))} ${MONTHS_SHORT[m]}`
}

/** Full label: "October 2026", "1–14 October 2026 (month to date)", "14 Oct 2026". */
export function bucketLongLabel(b: RevenueBucket, granularity: Granularity, layout: BucketLayout = 'calendar'): string {
  if (layout === 'shifted') return windowLabel({ fromDay: b.startDay, toDay: b.endDay })
  const [y, m] = ym(b.startDay)
  if (granularity === 'day') return `${dayLabel(b.startDay)}${b.coverage === 'in-progress' ? ' (today, so far)' : ''}`
  const month = `${MONTHS_LONG[m]} ${y}`
  if (b.coverage === 'full') return month
  const span = `${Number(b.startDay.slice(8, 10))}–${Number(b.endDay.slice(8, 10))} ${month}`
  return b.coverage === 'in-progress' ? `${span} (month to date)` : `${span} (part month)`
}

/** "1 Jul 2026 – 14 Oct 2026". */
export function windowLabel(w: RevenueWindow): string {
  return w.fromDay === w.toDay ? dayLabel(w.fromDay) : `${dayLabel(w.fromDay)} – ${dayLabel(w.toDay)}`
}

/**
 * Plain sentences about coverage, for under the chart. Not partial-data
 * reasons: a month-to-date bucket is complete for the days it covers.
 */
export function coverageNotes(series: RevenueSeries): string[] {
  const notes: string[] = []
  const { buckets, granularity } = series
  const first = buckets[0]
  const last = buckets[buckets.length - 1]
  if (!first || !last) return notes
  if (last.coverage === 'in-progress') {
    notes.push(
      granularity === 'month'
        ? `${bucketAxisLabel(last, 'month')} is month to date, through ${dayLabel(last.endDay)}.`
        : `Today (${dayLabel(last.endDay)}) is still in progress.`,
    )
  }
  if (granularity === 'month' && first.coverage === 'clipped') {
    notes.push(`${bucketAxisLabel(first, 'month')} covers ${bucketLongLabel(first, 'month').replace(' (part month)', '')} only.`)
  }
  if (granularity === 'month' && last.coverage === 'clipped' && buckets.length > 1) {
    notes.push(`${bucketAxisLabel(last, 'month')} covers ${bucketLongLabel(last, 'month').replace(' (part month)', '')} only.`)
  }
  return notes
}

/** "+12.5%", "−4%", "new" (nothing before), "no change". Never a percentage of zero. */
export function changeLabel(current: Paisa | number, previous: Paisa | number): string {
  if (previous === 0) return current === 0 ? 'no change' : 'new'
  const pct = ((current - previous) / previous) * 100
  if (pct === 0) return 'no change'
  const rounded = Math.round(Math.abs(pct) * 10) / 10
  return `${pct > 0 ? '+' : '−'}${rounded}%`
}

/** One-sentence summary under the chart. */
export function summarySentence(series: RevenueSeries): string {
  const { totals } = series
  const n = totals.invoiceCount
  return `${formatMoney(totals.revenue)} billed before VAT across ${n} issued invoice${n === 1 ? '' : 's'}, ${windowLabel(series.window)}.`
}
