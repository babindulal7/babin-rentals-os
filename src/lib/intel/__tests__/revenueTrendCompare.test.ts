import { describe, expect, it } from 'vitest'
import {
  aggregateIssuedRevenue,
  aggregateShiftedRevenue,
  changeLabel,
  coverageNotes,
  previousWindow,
  type IssuedInvoiceSource,
} from '../revenueTrend'
import { rupees } from '../../money'

const TODAY = '2026-10-14'

const inv = (patch: Partial<IssuedInvoiceSource> = {}): IssuedInvoiceSource => ({
  id: 'inv-1',
  issue_date: '2026-09-12',
  status: 'Paid',
  taxable_amount: '100.00',
  currency: 'NPR',
  voided_at: null,
  ...patch,
})

const daysIn = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)

describe('month coverage', () => {
  it('labels a clipped first month and a month-to-date last month in words', () => {
    const t = aggregateIssuedRevenue([], '2026-07-17', TODAY, TODAY)
    expect(t.months.map((m) => [m.startDay, m.endDay, m.coverage])).toEqual([
      ['2026-07-17', '2026-07-31', 'clipped'],
      ['2026-08-01', '2026-08-31', 'full'],
      ['2026-09-01', '2026-09-30', 'full'],
      ['2026-10-01', '2026-10-14', 'in-progress'],
    ])
    expect(t.months.map((m) => m.longLabel)).toEqual([
      '17–31 July 2026 (part month)',
      'August 2026',
      'September 2026',
      '1–14 October 2026 (month to date)',
    ])
    expect(coverageNotes(t)).toEqual(['Oct 2026 is month to date, through 14 Oct 2026.', 'Jul 2026 covers 17–31 July 2026 only.'])
  })

  it('the month holding today is month to date even on its last day', () => {
    const t = aggregateIssuedRevenue([], '2026-08-03', '2026-10-31', '2026-10-31')
    const last = t.months[t.months.length - 1]!
    expect(last.coverage).toBe('in-progress')
    expect(last.longLabel).toBe('1–31 October 2026 (month to date)')
  })

  it('without today, a window ending on a month end is a full month (existing callers unchanged)', () => {
    const t = aggregateIssuedRevenue([], '2026-08-01', '2026-09-30')
    expect(t.months.map((m) => m.coverage)).toEqual(['full', 'full'])
  })
})

describe('previous period', () => {
  it('is the same number of days immediately before', () => {
    expect(previousWindow('2026-07-18', '2026-10-15')).toEqual({ fromAd: '2026-04-19', toAd: '2026-07-17' })
    expect(previousWindow('2026-10-01', '2026-10-14')).toEqual({ fromAd: '2026-09-17', toAd: '2026-09-30' })
  })

  it('shifts each bucket back by the period length; shifted buckets tile the previous window', () => {
    const current = aggregateIssuedRevenue([], '2026-07-01', TODAY, TODAY)
    const prev = aggregateShiftedRevenue([], current)
    const pw = previousWindow('2026-07-01', TODAY)
    expect(prev.fromAd).toBe(pw.fromAd)
    expect(prev.toAd).toBe(pw.toAd)
    expect(prev.months[0]!.startDay).toBe(pw.fromAd)
    expect(prev.months[prev.months.length - 1]!.endDay).toBe(pw.toAd)
    for (let i = 1; i < prev.months.length; i += 1) expect(prev.months[i]!.startDay).toBe(nextDay(prev.months[i - 1]!.endDay))
    expect(prev.months.map((m) => daysIn(m.startDay, m.endDay))).toEqual(current.months.map((m) => daysIn(m.startDay, m.endDay)))
    expect(prev.months.every((m) => m.coverage !== 'in-progress')).toBe(true)
    expect(prev.months[1]!.longLabel).toBe('17 Apr 2026 – 17 May 2026')
  })

  it('sums the previous window with the same definition and reconciles', () => {
    const current = aggregateIssuedRevenue([], '2026-07-01', TODAY, TODAY)
    const prev = aggregateShiftedRevenue(
      [
        inv({ id: 'a', issue_date: '2026-03-17' }),
        inv({ id: 'b', issue_date: '2026-05-17' }),
        inv({ id: 'c', issue_date: '2026-06-30' }),
        inv({ id: 'v', issue_date: '2026-06-01', status: 'Void', voided_at: '2026-06-02T00:00:00Z' }),
      ],
      current,
    )
    expect(prev.months.map((m) => m.invoiceCount)).toEqual([1, 1, 0, 1])
    expect(prev.totalPaisa).toBe(rupees(300))
    expect(prev.issuedCount).toBe(3)
    expect(() => aggregateShiftedRevenue([inv({ issue_date: '2026-07-01' })], current)).toThrow(/outside/)
    expect(() => aggregateShiftedRevenue([inv(), inv()].map((r) => ({ ...r, issue_date: '2026-04-01' })), current)).toThrow(/Duplicate/)
  })
})

describe('changeLabel', () => {
  it('never divides by a zero comparison and never prints "+0%"', () => {
    expect(changeLabel(rupees(1125), rupees(1000))).toBe('+12.5%')
    expect(changeLabel(rupees(900), rupees(1000))).toBe('−10%')
    expect(changeLabel(rupees(5), 0)).toBe('new')
    expect(changeLabel(0, 0)).toBe('no change')
    expect(changeLabel(rupees(2500500), rupees(2500000))).toBe('+<0.1%')
    expect(changeLabel(rupees(2499500), rupees(2500000))).toBe('−<0.1%')
  })
})
