import { beforeEach, describe, expect, it, vi } from 'vitest'
import { rupees } from '../../money'

const db = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[] | null,
  error: null as { message: string } | null,
  source: '',
  filters: [] as string[],
}))

vi.mock('../../supabase', () => ({
  IS_MOCK: false,
  supabase: {
    from(table: string) {
      db.source = table
      const query = {
        select: () => query,
        order: () => query,
        gte: (field: string) => { db.filters.push('from:' + field); return query },
        lte: (field: string) => { db.filters.push('to:' + field); return query },
        eq: (field: string) => { db.filters.push('branch:' + field); return query },
        range: (start: number, end: number) => ({
          then: (accept: (result: { data: typeof db.rows; error: typeof db.error }) => unknown) =>
            Promise.resolve({ data: db.rows?.slice(start, end + 1) ?? null, error: db.error }).then(accept),
        }),
      }
      return query
    },
  },
}))

import { getSalesVatReport } from '../salesVatReports'

function invoice(id: string, date: string, subtotal: number, vat: number, paid: number, rate = 0.13, status = 'Sent') {
  return {
    id, invoice_no: 'INV-' + id, booking_id: 'bk-' + id, client_id: 'cl-' + id,
    branch_id: 'br-1', issue_date: date, due_date: '2026-10-30',
    subtotal, discount_amount: 0, taxable_amount: subtotal, vat_rate: rate,
    vat_amount: vat, total_amount: subtotal + vat,
    paid_amount: paid, outstanding_amount: subtotal + vat - paid,
    status, currency: 'NPR', voided_at: null,
    clients: { name: 'Test client ' + id, pan_vat: '123456789' },
    bookings: { booking_no: 'BK-' + id },
  }
}

describe('live Sales and Nepal VAT register — no invented business numbers', () => {
  beforeEach(() => {
    db.rows = []
    db.error = null
    db.source = ''
    db.filters = []
  })

  it('returns an honest empty register for a successful zero-row database response', async () => {
    const report = await getSalesVatReport()
    expect(db.source).toBe('invoices')
    expect(report.sales.metrics.totalInvoiced).toBe(rupees(0))
    expect(report.sales.metrics.invoiceCount).toBe(0)
    expect(report.sales.invoices).toEqual([])
    expect(report.sales.monthlyTrend).toEqual([])
    expect(report.vat.monthlySchedule).toEqual([])
    expect(report.vat.taxRegister).toEqual([])
  })

  it('rejects database errors instead of returning fictitious mock money', async () => {
    db.error = { message: 'database disconnected' }
    await expect(getSalesVatReport()).rejects.toThrow('Unable to read the Sales/VAT invoice ledger')
  })

  it('rejects a null response instead of silently reporting a zero or a demo total', async () => {
    db.rows = null
    await expect(getSalesVatReport()).rejects.toThrow('The Sales/VAT invoice ledger returned no result')
  })

  it('groups real invoices by BS month across an AD month boundary', async () => {
    db.rows = [
      invoice('1', '2026-09-25', 1000, 130, 500),
      invoice('2', '2026-10-05', 2000, 260, 2260),
    ]
    const report = await getSalesVatReport({ from: '2026-09-20', to: '2026-10-10', branchId: 'br-1' })
    expect(db.filters).toEqual(['from:issue_date', 'to:issue_date', 'branch:branch_id'])
    expect(report.sales.metrics.invoiceCount).toBe(2)
    expect(report.sales.metrics.totalInvoiced).toBe(rupees(3390))
    expect(report.vat.metrics.totalOutputVat).toBe(rupees(390))
    expect(report.sales.monthlyTrend).toHaveLength(1)
    expect(report.sales.monthlyTrend[0]?.invoiced).toBe(rupees(3390))
    expect(report.sales.monthlyTrend[0]?.collected).toBe(rupees(2760))
    expect(report.vat.monthlySchedule).toHaveLength(1)
    expect(report.vat.monthlySchedule[0]?.grossSales).toBe(rupees(3390))
    expect(report.vat.monthlySchedule[0]?.vatAmount).toBe(rupees(390))
    expect(report.vat.monthlySchedule[0]?.bsMonth).toMatch(/2083/)
    expect(report.vat.metrics.taxableTurnover).toBe(rupees(3000))
    expect(report.vat.metrics.exemptTurnover).toBe(rupees(0))
  })

  it('includes invoices from later PostgREST result pages, not just the first 500', async () => {
    db.rows = Array.from({ length: 501 }, (_, n) => invoice(String(n), '2026-10-05', 1000, 130, 0))
    const report = await getSalesVatReport()
    expect(report.sales.metrics.invoiceCount).toBe(501)
    expect(report.sales.metrics.totalInvoiced).toBe(rupees(501 * 1130))
    expect(report.vat.taxRegister).toHaveLength(501)
    expect(report.sales.invoices).toHaveLength(501)
  })

  it('excludes unissued drafts and voided invoices from statutory sales', async () => {
    const voided = invoice('void', '2026-10-04', 300, 39, 0)
    db.rows = [
      invoice('draft', '2026-10-03', 9000, 1170, 0, 0.13, 'Draft'),
      { ...voided, voided_at: '2026-10-10T12:00:00Z', status: 'Void' },
      invoice('paid', '2026-10-04', 1000, 130, 1130, 0.13, 'Paid'),
    ]
    const report = await getSalesVatReport()
    expect(report.sales.metrics.invoiceCount).toBe(1)
    expect(report.sales.metrics.totalInvoiced).toBe(rupees(1130))
    expect(report.vat.taxRegister).toHaveLength(1)
  })

  it('separates 0% non-VAT invoices from actual taxable sales', async () => {
    db.rows = [
      invoice('vat', '2026-10-05', 2000, 260, 0),
      invoice('zero', '2026-10-05', 1000, 0, 1000, 0),
    ]
    const report = await getSalesVatReport()
    expect(report.vat.metrics.taxableTurnover).toBe(rupees(2000))
    expect(report.vat.metrics.exemptTurnover).toBe(rupees(1000))
    expect(report.vat.metrics.totalOutputVat).toBe(rupees(260))
    expect(report.vat.monthlySchedule[0]?.exemptSales).toBe(rupees(1000))
  })
})
