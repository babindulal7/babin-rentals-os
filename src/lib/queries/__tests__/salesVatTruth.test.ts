import { beforeEach, describe, expect, it, vi } from 'vitest'
import { rupees } from '../../money'

const db = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[] | null,
  error: null as { message: string } | null,
  source: '',
  filters: [] as string[],
  count: 0,
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
        neq: () => query,
        is: () => query,
        range: (start: number, end: number) => ({
          then: (accept: (result: { data: typeof db.rows; error: typeof db.error; count: typeof db.count }) => unknown) =>
            Promise.resolve({ data: db.rows?.slice(start, end + 1) ?? null, error: db.error, count: db.count }).then(accept),
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

describe('WF-01 live financial report truth', () => {
  beforeEach(() => {
    db.rows = []
    db.error = null
    db.source = ''
    db.filters = []
    db.count = 0
  })

  it('preserves a genuinely empty period without sample invoices or tax rows', async () => {
    const report = await getSalesVatReport()
    expect(db.source).toBe('invoices')
    expect(report.sales.metrics.totalInvoiced).toBe(rupees(0))
    expect(report.sales.metrics.invoiceCount).toBe(0)
    expect(report.sales.invoices).toEqual([])
    expect(report.sales.monthlyTrend).toEqual([])
    expect(report.vat.monthlySchedule).toEqual([])
    expect(report.vat.taxRegister).toEqual([])
  })

  it('refuses an unavailable read rather than reporting zero financial activity', async () => {
    db.error = { message: 'database disconnected' }
    await expect(getSalesVatReport()).rejects.toThrow('Invoices read failed')
  })

  it('rejects a null response instead of silently reporting a zero or a demo total', async () => {
    db.rows = null
    await expect(getSalesVatReport()).rejects.toThrow('Invoices read returned no confirmed dataset')
  })
})