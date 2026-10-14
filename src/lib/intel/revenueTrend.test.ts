import { describe, expect, it } from 'vitest'
import { aggregateIssuedRevenue, type IssuedInvoiceSource } from './revenueTrend'
import { rupees } from '../money'

const row = (partial: Partial<IssuedInvoiceSource> = {}): IssuedInvoiceSource => ({
  id: 'invoice-1',
  issue_date: '2026-07-10',
  status: 'Sent',
  taxable_amount: '1000.50',
  currency: 'NPR',
  voided_at: null,
  ...partial,
})

describe('issued invoice revenue source', () => {
  it('builds exact paisa month buckets from issued invoices', () => {
    const report = aggregateIssuedRevenue([
      row(),
      row({ id:'invoice-2', issue_date:'2026-08-15', status:'Paid', taxable_amount:'200.25' }),
    ], '2026-07-01', '2026-09-30')
    expect(report.months.map(m=>m.amountPaisa)).toEqual([rupees(1000.5),rupees(200.25),rupees(0)])
    expect(report.totalPaisa).toBe(rupees(1200.75))
    expect(report.issuedCount).toBe(2)
  })
  it('does not include drafts or voids as sales', () => {
    const report=aggregateIssuedRevenue([
      row({status:'Draft'}),
      row({id:'2', status:'Void'}),
      row({id:'3',voided_at:'2026-07-12T00:00:00Z'}),
    ],'2026-07-01','2026-07-31')
    expect(report.totalPaisa).toBe(0)
    expect(report.issuedCount).toBe(0)
  })
  it('refuses duplicates, unsupported currency and invalid money',()=>{
    expect(()=>aggregateIssuedRevenue([row(),row()], '2026-07-01','2026-07-31')).toThrow(/Duplicate/)
    expect(()=>aggregateIssuedRevenue([row({currency:'USD'})], '2026-07-01','2026-07-31')).toThrow(/currency/)
    expect(()=>aggregateIssuedRevenue([row({taxable_amount:'NaN'})], '2026-07-01','2026-07-31')).toThrow(/Unusable/)
  })
  it('refuses dates outside range, reversed and excessive month windows',()=>{
    expect(()=>aggregateIssuedRevenue([row()], '2026-08-01','2026-08-31')).toThrow(/outside/)
    expect(()=>aggregateIssuedRevenue([], '2026-08-01','2026-07-31')).toThrow(/after/)
    expect(()=>aggregateIssuedRevenue([], '2024-01-01','2026-03-31')).toThrow(/24 months/)
  })
  it('distinguishes a true empty completed query from invalid or missing input',()=>{
    const report=aggregateIssuedRevenue([], '2026-07-01','2026-08-31')
    expect(report.months).toHaveLength(2)
    expect(report.issuedCount).toBe(0)
    expect(()=>aggregateIssuedRevenue([], '2026-02-30','2026-03-31')).toThrow(/Invalid/)
  })
})
