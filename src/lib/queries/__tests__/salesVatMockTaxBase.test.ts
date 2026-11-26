// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

// Same seeded mock corpus the dev:mock build serves (see reportQueries.mockStore.test.ts).
vi.hoisted(() => {
  vi.stubEnv('VITE_MOCK_SEEDED', 'true')
})

vi.mock('../../supabase', async () => {
  const { mockSupabase } = await import('../../__mocks__/client')
  return { IS_MOCK: true, supabase: mockSupabase }
})

describe('VAT register on the mock invoices — discounted taxable base', () => {
  it('sums the taxable amounts to the Taxable Turnover tile and carries 13% VAT on each row', async () => {
    const { getSalesVatReport } = await import('../salesVatReports')
    const { vat } = await getSalesVatReport()
    expect(vat.taxRegister.length).toBeGreaterThan(0)

    const taxableColumn = vat.taxRegister.reduce((sum, row) => sum + (row.taxableAmount ?? 0), 0)
    expect(taxableColumn).toBe(vat.metrics.taxableTurnover)

    for (const row of vat.taxRegister) {
      const taxable = row.taxableAmount ?? 0
      // VAT is a whole rupee, so it can differ from 13% of the base by at most one rupee.
      expect(Math.abs(row.taxAmount - taxable * 0.13)).toBeLessThanOrEqual(100)
      expect(taxable + row.taxAmount).toBe(row.grandTotal)
    }
  }, 30_000)

  it('reconciles each invoice on the Invoiced Sales register: subtotal less discount is the taxable base', async () => {
    const { getSalesVatReport } = await import('../salesVatReports')
    const { sales } = await getSalesVatReport()
    expect(sales.invoices.length).toBeGreaterThan(0)

    for (const inv of sales.invoices) {
      expect(inv.subtotal - (inv.discountAmount ?? 0)).toBe(inv.taxableAmount)
      expect((inv.taxableAmount ?? 0) + inv.taxAmount).toBe(inv.grandTotal)
    }
  }, 30_000)
})
