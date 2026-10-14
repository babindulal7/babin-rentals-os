import { describe, expect, it } from 'vitest'
import {
  addDays,
  aggregatePrevious,
  aggregateRevenue,
  bucketLongLabel,
  buildRevenueTrendReport,
  changeLabel,
  coverageNotes,
  daysInclusive,
  emptyBuckets,
  previousWindow,
  resolveWindow,
  RevenueSourceError,
  shiftedBuckets,
  summarySentence,
  type InvoiceRevenueSource,
} from '../revenueTrend'
import { rupees } from '../../money'

const TODAY = '2026-10-14'

const inv = (patch: Partial<InvoiceRevenueSource> = {}): InvoiceRevenueSource => ({
  id: 'inv-1',
  invoice_no: 'INV-1',
  issue_date: '2026-09-12',
  status: 'Sent',
  currency: 'NPR',
  taxable_amount: 10000,
  vat_amount: 1300,
  total_amount: 11300,
  voided_at: null,
  ...patch,
})

describe('resolveWindow', () => {
  it('uses the first issued invoice as the start of "All dates" and today as the end', () => {
    const r = resolveWindow({ fromDay: null, toDay: null, earliestIssuedDay: '2026-03-04', today: TODAY })
    expect(r).toEqual({ kind: 'ok', window: { fromDay: '2026-03-04', toDay: TODAY }, granularity: 'month', clampedToToday: false })
  })

  it('switches to daily points for windows of 62 days or fewer', () => {
    const r = resolveWindow({ fromDay: '2026-08-14', toDay: TODAY, earliestIssuedDay: null, today: TODAY })
    expect(r.kind === 'ok' && r.granularity).toBe('day')
    const r2 = resolveWindow({ fromDay: '2026-08-13', toDay: TODAY, earliestIssuedDay: null, today: TODAY })
    expect(r2.kind === 'ok' && r2.granularity).toBe('month')
  })

  it('never plots an actual in the future: a future end is clamped to today', () => {
    const r = resolveWindow({ fromDay: '2026-01-01', toDay: '2026-12-31', earliestIssuedDay: null, today: TODAY })
    expect(r).toMatchObject({ kind: 'ok', window: { toDay: TODAY }, clampedToToday: true })
    expect(resolveWindow({ fromDay: '2026-11-01', toDay: '2026-11-30', earliestIssuedDay: null, today: TODAY })).toEqual({ kind: 'future' })
  })

  it('distinguishes no history, an inverted range and an over-long range', () => {
    expect(resolveWindow({ fromDay: null, toDay: null, earliestIssuedDay: null, today: TODAY })).toEqual({ kind: 'no-history' })
    expect(resolveWindow({ fromDay: null, toDay: '2026-01-01', earliestIssuedDay: '2026-03-01', today: TODAY })).toEqual({ kind: 'no-history' })
    expect(resolveWindow({ fromDay: '2026-09-02', toDay: '2026-09-01', earliestIssuedDay: null, today: TODAY })).toEqual({ kind: 'inverted' })
    expect(resolveWindow({ fromDay: '2020-01-01', toDay: TODAY, earliestIssuedDay: null, today: TODAY })).toEqual({ kind: 'too-long', months: 82 })
  })
})

describe('emptyBuckets', () => {
  it('marks a clipped first month and a month-to-date last month', () => {
    const b = emptyBuckets({ fromDay: '2026-07-17', toDay: TODAY }, 'month', TODAY)
    expect(b.map((x) => [x.key, x.startDay, x.endDay, x.coverage])).toEqual([
      ['2026-07', '2026-07-17', '2026-07-31', 'clipped'],
      ['2026-08', '2026-08-01', '2026-08-31', 'full'],
      ['2026-09', '2026-09-01', '2026-09-30', 'full'],
      ['2026-10', '2026-10-01', '2026-10-14', 'in-progress'],
    ])
    expect(bucketLongLabel(b[3]!, 'month')).toBe('1–14 October 2026 (month to date)')
    expect(bucketLongLabel(b[0]!, 'month')).toBe('17–31 July 2026 (part month)')
  })

  it('crosses a year boundary and marks only today as in progress for days', () => {
    const months = emptyBuckets({ fromDay: '2025-11-01', toDay: '2026-02-28' }, 'month', TODAY)
    expect(months.map((m) => m.key)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
    expect(months.every((m) => m.coverage === 'full')).toBe(true)
    const days = emptyBuckets({ fromDay: '2026-10-12', toDay: TODAY }, 'day', TODAY)
    expect(days.map((d) => d.coverage)).toEqual(['full', 'full', 'in-progress'])
  })
})

describe('previous period', () => {
  it('is the same number of days immediately before — daily and monthly alike', () => {
    expect(previousWindow({ fromDay: '2026-10-01', toDay: '2026-10-14' })).toEqual({ fromDay: '2026-09-17', toDay: '2026-09-30' })
    // "Last 90 days" ending 15 Oct: no gap, no overlap.
    expect(previousWindow({ fromDay: '2026-07-18', toDay: '2026-10-15' })).toEqual({ fromDay: '2026-04-19', toDay: '2026-07-17' })
  })

  it('shifts each bucket back by the period length, so buckets line up 1:1 and tile the previous window', () => {
    const w = { fromDay: '2026-07-01', toDay: TODAY } // 106 days, 4 month buckets
    const cur = emptyBuckets(w, 'month', TODAY)
    const prev = shiftedBuckets(cur, w)
    expect(prev.map((b) => [b.startDay, b.endDay])).toEqual([
      ['2026-03-17', '2026-04-16'],
      ['2026-04-17', '2026-05-17'],
      ['2026-05-18', '2026-06-16'],
      ['2026-06-17', '2026-06-30'],
    ])
    const pw = previousWindow(w)
    expect(prev[0]!.startDay).toBe(pw.fromDay)
    expect(prev[prev.length - 1]!.endDay).toBe(pw.toDay)
    for (let i = 1; i < prev.length; i += 1) expect(prev[i]!.startDay).toBe(addDays(prev[i - 1]!.endDay, 1))
    expect(prev.map((b) => daysInclusive(b.startDay, b.endDay))).toEqual(cur.map((b) => daysInclusive(b.startDay, b.endDay)))
    expect(prev.every((b) => b.coverage !== 'in-progress')).toBe(true)
  })

  it('sums the previous window into the shifted buckets and reconciles', () => {
    const current = aggregateRevenue([], { fromDay: '2026-07-01', toDay: TODAY }, 'month', TODAY)
    const prev = aggregatePrevious(
      [inv({ issue_date: '2026-03-17' }), inv({ id: 'b', issue_date: '2026-05-17' }), inv({ id: 'c', issue_date: '2026-06-30' })],
      current,
    )
    expect(prev.layout).toBe('shifted')
    expect(prev.buckets.map((b) => b.invoiceCount)).toEqual([1, 1, 0, 1])
    expect(prev.totals.revenue).toBe(rupees(30000))
    expect(bucketLongLabel(prev.buckets[1]!, 'month', 'shifted')).toBe('17 Apr 2026 – 17 May 2026')
    expect(() => aggregatePrevious([inv({ issue_date: '2026-07-01' })], current)).toThrow(/outside/)
  })
})

describe('aggregateRevenue', () => {
  const w = { fromDay: '2026-08-01', toDay: '2026-10-14' }

  it('sums taxable amount (before VAT) per month in exact paisa and reconciles to the total', () => {
    const s = aggregateRevenue(
      [
        inv(),
        inv({ id: 'inv-2', invoice_no: 'INV-2', issue_date: '2026-09-30', status: 'Paid', taxable_amount: '1000.50', vat_amount: '130.07', total_amount: '1130.57' }),
        inv({ id: 'inv-3', invoice_no: 'INV-3', issue_date: '2026-10-01', status: 'Partially Paid', taxable_amount: 0.01, vat_amount: 0, total_amount: 0.01 }),
      ],
      w,
      'month',
      TODAY,
    )
    expect(s.buckets.map((b) => b.revenue)).toEqual([0, rupees(11000.5), 1])
    expect(s.buckets.map((b) => b.invoiceCount)).toEqual([0, 2, 1])
    expect(s.totals).toEqual({ revenue: 1100051, vat: 143007, gross: 1243058, invoiceCount: 3 })
    expect(s.buckets.reduce((a, b) => a + b.revenue, 0)).toBe(s.totals.revenue)
    expect(s.unreconciledInvoices).toEqual([])
  })

  it('a month with no invoices is a real zero, kept in the series rather than dropped', () => {
    const s = aggregateRevenue([], w, 'month', TODAY)
    expect(s.buckets).toHaveLength(3)
    expect(s.buckets.every((b) => b.revenue === 0 && b.invoiceCount === 0)).toBe(true)
    expect(s.totals.revenue).toBe(0)
  })

  it('never counts drafts or voided invoices — voids are excluded by timestamp, not only by label', () => {
    const s = aggregateRevenue(
      [
        inv({ status: 'Draft' }),
        inv({ id: 'v1', status: 'Void' }),
        inv({ id: 'v2', status: 'Paid', voided_at: '2026-09-20T10:00:00Z' }),
      ],
      w,
      'month',
      TODAY,
    )
    expect(s.totals.invoiceCount).toBe(0)
    expect(s.totals.revenue).toBe(0)
  })

  it('accepts a stored Overdue status as an issued invoice', () => {
    expect(aggregateRevenue([inv({ status: 'Overdue' })], w, 'month', TODAY).totals.invoiceCount).toBe(1)
  })

  it('refuses rather than double counts a repeated invoice', () => {
    expect(() => aggregateRevenue([inv(), inv()], w, 'month', TODAY)).toThrow(RevenueSourceError)
    expect(() => aggregateRevenue([inv(), inv()], w, 'month', TODAY)).toThrow(/returned twice/)
  })

  it('refuses out-of-window rows, foreign currency, unreadable dates and amounts', () => {
    expect(() => aggregateRevenue([inv({ issue_date: '2026-07-31' })], w, 'month', TODAY)).toThrow(/outside/)
    expect(() => aggregateRevenue([inv({ currency: 'USD' })], w, 'month', TODAY)).toThrow(/NPR only/)
    expect(() => aggregateRevenue([inv({ issue_date: '2026-09-31' })], w, 'month', TODAY)).toThrow(/issue date/)
    expect(() => aggregateRevenue([inv({ taxable_amount: 'NaN' })], w, 'month', TODAY)).toThrow(/unreadable taxable/)
    expect(() => aggregateRevenue([inv({ taxable_amount: -5 })], w, 'month', TODAY)).toThrow(/unreadable/)
    expect(() => aggregateRevenue([inv({ taxable_amount: '10.123' })], w, 'month', TODAY)).toThrow(/unreadable/)
  })

  it('flags, without dropping, an invoice whose stored total is not amount + VAT', () => {
    const s = aggregateRevenue([inv({ total_amount: 11299 })], w, 'month', TODAY)
    expect(s.unreconciledInvoices).toEqual(['INV-1'])
    expect(s.totals.revenue).toBe(rupees(10000))
  })

  it('refuses a total too large to add exactly in integer paisa', () => {
    const huge = inv({ taxable_amount: '90071992547409.91', vat_amount: 0, total_amount: '90071992547409.91' })
    expect(() => aggregateRevenue([huge, { ...huge, id: 'inv-9' }], w, 'month', TODAY)).toThrow(/too large|supported range/)
  })

  it('daily buckets key on the civil issue date', () => {
    const s = aggregateRevenue([inv({ issue_date: '2026-10-13' })], { fromDay: '2026-10-12', toDay: TODAY }, 'day', TODAY)
    expect(s.buckets.map((b) => b.revenue)).toEqual([0, rupees(10000), 0])
  })
})

describe('buildRevenueTrendReport', () => {
  const w = { fromDay: '2026-09-01', toDay: '2026-09-30' }
  const current = aggregateRevenue([inv()], w, 'day', TODAY)

  it('is Actual when nothing is left unreconciled', () => {
    const r = buildRevenueTrendReport({ current, previous: null, unnettedCreditNotes: 0, calculatedAt: new Date('2026-10-14T06:00:00Z') })
    expect(r.status).toBe('actual')
    expect(r.partialReasons).toEqual([])
    expect(r.calculatedAt).toBe('2026-10-14T06:00:00.000Z')
  })

  it('is Partial, with a reason, when a credit note sits against a live invoice', () => {
    const r = buildRevenueTrendReport({ current, previous: null, unnettedCreditNotes: 2, calculatedAt: new Date() })
    expect(r.status).toBe('partial')
    expect(r.partialReasons[0]).toMatch(/2 credit notes are recorded/)
  })

  it('is Partial when a stored total does not reconcile', () => {
    const bad = aggregateRevenue([inv({ total_amount: 1 })], w, 'day', TODAY)
    const r = buildRevenueTrendReport({ current: bad, previous: null, unnettedCreditNotes: 0, calculatedAt: new Date() })
    expect(r.status).toBe('partial')
    expect(r.partialReasons[0]).toMatch(/INV-1/)
  })
})

describe('copy helpers', () => {
  it('describes coverage in words, not colour', () => {
    const s = aggregateRevenue([], { fromDay: '2026-07-17', toDay: TODAY }, 'month', TODAY)
    expect(coverageNotes(s)).toEqual([
      'Oct 2026 is month to date, through 14 Oct 2026.',
      'Jul 2026 covers 17–31 July 2026 only.',
    ])
  })

  it('never divides by a zero comparison', () => {
    expect(changeLabel(rupees(1125), rupees(1000))).toBe('+12.5%')
    expect(changeLabel(rupees(900), rupees(1000))).toBe('−10%')
    expect(changeLabel(rupees(5), 0)).toBe('new')
    expect(changeLabel(0, 0)).toBe('no change')
  })

  it('summarises the period with the exact formatter', () => {
    const s = aggregateRevenue([inv()], { fromDay: '2026-09-01', toDay: '2026-09-30' }, 'day', TODAY)
    expect(summarySentence(s)).toBe('Rs 10,000 billed before VAT across 1 issued invoice, 1 Sep 2026 – 30 Sep 2026.')
  })
})
