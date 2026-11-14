import { describe, expect, it } from 'vitest'
import { aggregateIssuedRevenue, coverageNotes, type IssuedInvoiceSource } from '../revenueTrend'

const row = (patch: Partial<IssuedInvoiceSource> = {}): IssuedInvoiceSource => ({
  id: 'inv-1',
  issue_date: '2026-09-12',
  status: 'Sent',
  taxable_amount: '1200.50',
  currency: 'NPR',
  voided_at: null,
  ...patch,
})

describe('aggregateIssuedRevenue', () => {
  it('fills empty months and reconciles invoice totals in paisa', () => {
    const result = aggregateIssuedRevenue([
      row(),
      row({ id: 'inv-2', issue_date: '2026-11-01', taxable_amount: '2.01', status: 'Paid' }),
    ], '2026-09-01', '2026-11-30')
    expect(result.months.map(m => m.amountPaisa)).toEqual([120050, 0, 201])
    expect(result.totalPaisa).toBe(120251)
    expect(result.issuedCount).toBe(2)
  })
  it('excludes draft and voided invoices', () => {
    const result = aggregateIssuedRevenue([
      row({ status: 'Draft' }),
      row({ id: 'inv-2', voided_at: '2026-09-20T10:00:00Z' }),
    ], '2026-09-01', '2026-09-30')
    expect(result.totalPaisa).toBe(0)
    expect(result.issuedCount).toBe(0)
  })
  it('rejects duplicate invoices rather than double counting', () => {
    expect(() => aggregateIssuedRevenue([row(), row()], '2026-09-01', '2026-09-30')).toThrow(/Duplicate/)
  })
  it('rejects out-of-window records, mixed currency and malformed dates', () => {
    expect(() => aggregateIssuedRevenue([row({ issue_date: '2026-10-01' })], '2026-09-01', '2026-09-30')).toThrow(/outside/)
    expect(() => aggregateIssuedRevenue([row({ currency: 'USD' })], '2026-09-01', '2026-09-30')).toThrow(/currency/)
    expect(() => aggregateIssuedRevenue([], '2026-02-30', '2026-03-01')).toThrow(/Invalid/)
  })
  it('rejects reporting periods longer than 24 months', () => {
    expect(() => aggregateIssuedRevenue([], '2024-01-01', '2026-01-01')).toThrow(/24 months/)
  })

  it('labels partial months and month-to-date correctly (Ruling R17-3)', () => {
    const trend = aggregateIssuedRevenue([], '2026-07-17', '2026-10-14', '2026-10-14')
    expect(trend.months.map(m => m.longLabel)).toEqual([
      '17–31 July 2026 (part month)',
      'August 2026',
      'September 2026',
      '1–14 October 2026 (month to date)',
    ])
    expect(coverageNotes(trend)).toEqual([
      'Oct 2026 is month to date, through 14 Oct 2026.',
      'Jul 2026 covers 17–31 July 2026 only.',
    ])
  })

  it('the month holding today is month to date even on its last day', () => {
    const trend = aggregateIssuedRevenue([], '2026-08-01', '2026-10-31', '2026-10-31')
    const last = trend.months[trend.months.length - 1]!
    expect(last.coverage).toBe('in-progress')
    expect(last.longLabel).toBe('1–31 October 2026 (month to date)')
  })

  it('a bucket holding today but starting after the 1st is called part month, to date', () => {
    const trend = aggregateIssuedRevenue([], '2026-10-12', '2026-10-18', '2026-10-18')
    expect(trend.months[0]!.longLabel).toBe('12–18 October 2026 (part month, to date)')
    expect(coverageNotes(trend)).toEqual(['Oct 2026 covers 12–18 October 2026 only, to date.'])

    const singleDay = aggregateIssuedRevenue([], '2026-07-31', '2026-07-31')
    expect(singleDay.months[0]!.longLabel).toBe('31 July 2026 (part month)')
    expect(coverageNotes(singleDay)).toEqual(['Jul 2026 covers 31 July 2026 only.'])
  })

  it('does not call future-inclusive reporting windows month to date', () => {
    const futureWindow = aggregateIssuedRevenue([], '2026-11-01', '2026-11-30', '2026-11-14')
    expect(futureWindow.months[0]!.coverage).toBe('future-inclusive')
    expect(futureWindow.months[0]!.longLabel).toBe('1–30 November 2026 (includes future dates)')
    expect(coverageNotes(futureWindow)).toEqual([
      'Selected reporting window includes future dates; issued-invoice totals are not a forecast.',
    ])

    const partMonth = aggregateIssuedRevenue([], '2026-11-12', '2026-11-20', '2026-11-14')
    expect(partMonth.months[0]!.longLabel).toBe('12–20 November 2026 (includes future dates)')
    expect(partMonth.months[0]!.longLabel).not.toContain('to date')

    const throughToday = aggregateIssuedRevenue([], '2026-11-01', '2026-11-14', '2026-11-14')
    expect(throughToday.months[0]!.longLabel).toBe('1–14 November 2026 (month to date)')
  })

  it('correctly formats across year boundaries', () => {
    const trend = aggregateIssuedRevenue([], '2025-12-15', '2026-01-20', '2026-01-20')
    expect(trend.months.map(m => m.longLabel)).toEqual([
      '15–31 December 2025 (part month)',
      '1–20 January 2026 (month to date)',
    ])
  })
})
