import { describe, it, expect, vi } from 'vitest'
import { getSalesVatReport } from '../salesVatReports'
import { supabase } from '../../supabase'

// Unit fixtures use a concrete client object; the app's lazy mock-client Proxy
// intentionally has no own method descriptors for vi.spyOn to replace.
vi.mock('../../supabase', () => ({ IS_MOCK: false, supabase: {
  from: vi.fn(() => {
    const query: Record<string, unknown> = {}
    for (const method of ['select','order','is','eq','gte','lte','in','range','limit','not']) query[method] = () => query
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({data: [], error: null}).then(resolve)
    return query
  }),
} }))

describe('salesVatReports query module (WF-01)', () => {
  it('returns valid sales and vat reports in mock mode or fallback', async () => {
    const { sales, vat } = await getSalesVatReport()
    expect(sales).toBeDefined()
    expect(vat).toBeDefined()
    expect(sales.metrics.invoiceCount).toBeGreaterThanOrEqual(0)
    expect(vat.metrics.invoicesCount).toBeGreaterThanOrEqual(0)
  })

  it('WF-01: queries real schema columns and computes exact Paisa without 100x error', async () => {
    const mockInvoices = [
      {
        id: 'inv-001',
        invoice_no: 'INV-2026-0001',
        booking_id: 'b-001',
        client_id: 'c-001',
        branch_id: 'br-001',
        issue_date: '2026-10-18',
        due_date: '2026-10-25',
        subtotal: 10000.0,
        discount_amount: 0.0,
        taxable_amount: 10000.0,
        vat_amount: 1300.0,
        total_amount: 11300.0,
        paid_amount: 11300.0,
        status: 'Paid',
        voided_at: null,
        created_at: '2026-10-18T10:00:00Z',
        clients: { name: 'Apex Media', pan_vat: '302918273' },
        bookings: { booking_no: 'BK-2026-0001' },
      },
    ]

    let selectedColumns = ''
    let isVoidedChecked = false

    const fromSpy = vi.spyOn(supabase, 'from').mockReturnValue({
      select: vi.fn().mockImplementation((cols: string) => {
        selectedColumns = cols
        return {
          is: vi.fn().mockImplementation((col: string, val: any) => {
            if (col === 'voided_at' && val === null) isVoidedChecked = true
            return {
              order: vi.fn().mockReturnValue({
                gte: vi.fn().mockReturnThis(),
                lte: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                then: (resolve: any) => resolve({ data: mockInvoices, error: null }),
              }),
            }
          }),
        }
      }),
    } as any)

    try {
      const { sales, vat } = await getSalesVatReport()
      // Schema assertions (WF-01)
      expect(selectedColumns).toContain('total_amount')
      expect(selectedColumns).toContain('vat_amount')
      expect(selectedColumns).toContain('pan_vat')
      expect(selectedColumns).not.toContain('tax_amount')
      expect(selectedColumns).not.toContain('grand_total')
      expect(selectedColumns).not.toContain('pan_number')
      expect(isVoidedChecked).toBe(true)

      // Exact Paisa amounts (11,300 Rs -> 1,130,000 Paisa; 1,300 Rs -> 130,000 Paisa)
      expect(sales.metrics.totalInvoiced as number).toBe(1130000)
      expect(sales.metrics.netSales as number).toBe(1000000)
      expect(sales.metrics.totalVat as number).toBe(130000)
      expect(sales.metrics.totalCollected as number).toBe(1130000)
      expect(sales.metrics.totalOutstanding as number).toBe(0)

      expect(vat.metrics.totalGrossTurnover as number).toBe(1130000)
      expect(vat.metrics.taxableTurnover as number).toBe(1000000)
      expect(vat.metrics.totalOutputVat as number).toBe(130000)

      expect(sales.invoices[0]?.clientPan).toBe('302918273')
    } finally {
      fromSpy.mockRestore()
    }
  })
})
