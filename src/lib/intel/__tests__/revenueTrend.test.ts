import { describe, expect, it } from 'vitest'
import { aggregateIssuedRevenue, type IssuedInvoiceSource } from '../revenueTrend'

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
})
