import { beforeEach, describe, expect, it, vi } from 'vitest'

const source = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  calls: [] as number[],
  cap: 500,
  deniedOffset: -1,
}))
vi.mock('../../supabase', () => ({
  supabase: {
    from: () => {
      const builder = {
        select: () => builder,
        neq: () => builder,
        is: () => builder,
        order: () => builder,
        gte: () => builder,
        lte: () => builder,
        eq: () => builder,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({
          data: source.rows.slice(0, source.cap), error: null,
        }).then(resolve),
        range: async (start: number, end: number) => {
          source.calls.push(start)
          return start === source.deniedOffset
            ? { data: null, error: { message: 'page denied' } }
            : { data: source.rows.slice(start, Math.min(end + 1, start + source.cap)), error: null }
        },
      }
      return builder
    },
  },
}))

import { getSalesVatReport } from '../salesVatReports'

const invoice = (i: number, patch: Record<string, unknown> = {}) => ({
  id: `invoice-${i}`, invoice_no: `INV-${i}`, client_id: 'client-1',
  status: 'Sent', issue_date: '2026-10-01', due_date: '2026-10-15',
  subtotal: '100.10', discount_amount: '10.01', taxable_amount: '90.09',
  vat_amount: '11.71', total_amount: '101.80', paid_amount: '0.00',
  outstanding_amount: '101.80', voided_at: null, clients: { name: 'Recorded client' },
  ...patch,
})

beforeEach(() => {
  source.rows = []
  source.calls = []
  source.cap = 500
  source.deniedOffset = -1
})

describe('Sales/VAT complete financial register', () => {
  it('includes every invoice in both registers beyond ten rows', async () => {
    source.rows = Array.from({ length: 11 }, (_, i) => invoice(i))
    const { sales, vat } = await getSalesVatReport()
    expect(sales.metrics.invoiceCount).toBe(11)
    expect(sales.invoices).toHaveLength(11)
    expect(vat.taxRegister).toHaveLength(11)
    expect(sales.invoices.at(-1)?.invoiceNo).toBe('INV-10')
  })

  it('reads beyond the API page boundary', async () => {
    source.rows = Array.from({ length: 501 }, (_, i) => invoice(i))
    const report = await getSalesVatReport()
    expect(report.sales.metrics.invoiceCount).toBe(501)
    expect(report.vat.taxRegister).toHaveLength(501)
    expect(source.calls).toEqual([0, 500, 501])
  })

  it('continues when the server caps pages below the requested size', async () => {
    source.cap = 3
    source.rows = Array.from({ length: 7 }, (_, i) => invoice(i))
    expect((await getSalesVatReport()).sales.invoices).toHaveLength(7)
    expect(source.calls).toEqual([0, 3, 6, 7])
  })

  it('refuses a partial financial report if a later page fails', async () => {
    source.cap = 3
    source.rows = Array.from({ length: 7 }, (_, i) => invoice(i))
    source.deniedOffset = 3
    await expect(getSalesVatReport()).rejects.toThrow('page denied')
  })

  it('reports net sales after the recorded discount, retaining gross subtotal in the register', async () => {
    source.rows = [invoice(1)]
    const { sales } = await getSalesVatReport()
    expect(sales.metrics.netSales).toBe(9009)
    expect(sales.metrics.totalDiscounts).toBe(1001)
    expect(sales.invoices[0]?.subtotal).toBe(10010)
    expect(sales.metrics.netSales + sales.metrics.totalVat).toBe(sales.metrics.totalInvoiced)
  })

  it.each(['invalid', '90071992547409.92'])('refuses invalid or unsafe money: %s', async (value) => {
    source.rows = [invoice(1, { total_amount: value })]
    await expect(getSalesVatReport()).rejects.toThrow(/invoice amount/i)
  })

  it('refuses a report whose aggregate exceeds safe integer paisa', async () => {
    source.rows = Array.from({ length: 100 }, (_, i) => invoice(i, { total_amount: '999999999999.99' }))
    await expect(getSalesVatReport()).rejects.toThrow(/safe paisa/i)
  })
})
