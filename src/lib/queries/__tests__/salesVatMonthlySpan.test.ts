import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[] | null,
  error: null as { message: string } | null,
}))

vi.mock('../../supabase', () => ({
  IS_MOCK: false,
  supabase: {
    from() {
      const query = {
        select: () => query,
        order: () => query,
        gte: () => query,
        lte: () => query,
        eq: () => query,
        neq: () => query,
        is: () => query,
        range: (start: number, end: number) => ({
          then: (accept: (result: { data: Record<string, unknown>[] | null; error: { message: string } | null }) => unknown) =>
            Promise.resolve({ data: db.rows?.slice(start, end + 1) ?? null, error: db.error }).then(accept),
        }),
      }
      return query
    },
  },
}))

import { getSalesVatReport } from '../salesVatReports'

// Rupees, as the invoices table stores them; the query converts each amount to paisa.
const invoice = (id: string, issueDate: string, totalRupees: number, vatRupees: number) => ({
  id,
  invoice_no: `INV-${id}`,
  client_id: 'client-1',
  status: 'Issued',
  issue_date: issueDate,
  due_date: issueDate,
  subtotal: totalRupees - vatRupees,
  discount_amount: 0,
  taxable_amount: totalRupees - vatRupees,
  vat_rate: 13,
  vat_amount: vatRupees,
  total_amount: totalRupees,
  paid_amount: 0,
  outstanding_amount: totalRupees,
  voided_at: null,
  vat_treatment: 'standard',
  clients: { name: 'Bagmati Films Pvt. Ltd.', pan_vat: null },
  bookings: { booking_no: `BK-${id}` },
})

describe('VAT schedule: AD span of each BS filing month', () => {
  beforeEach(() => {
    db.error = null
    db.rows = [
      // 25 Jul 2026 is in Shrawan 2083, which runs 17 Jul to 16 Aug 2026.
      invoice('a', '2026-07-25', 113_000, 13_000),
      // 20 Aug 2026 is in Bhadra 2083, which runs 17 Aug to 16 Sep 2026.
      invoice('b', '2026-08-20', 56_500, 6_500),
    ]
  })

  it('gives each BS month the AD months it runs across, computed from the BS table', async () => {
    const { vat } = await getSalesVatReport()
    expect(vat.monthlySchedule.map((row) => [row.bsMonth, row.monthAd])).toEqual([
      ['Shrawan 2083', 'July 2026 – August 2026'],
      ['Bhadra 2083', 'August 2026 – September 2026'],
    ])
  })

  it('keeps the period figures on the same row and drops the invoice-derived month field', async () => {
    const { vat } = await getSalesVatReport()
    expect(vat.monthlySchedule[0]).toMatchObject({
      monthAd: 'July 2026 – August 2026',
      bsMonth: 'Shrawan 2083',
      grossSales: 11_300_000,
      vatAmount: 1_300_000,
    })
    expect(vat.monthlySchedule[0]).not.toHaveProperty('month')
  })
})
