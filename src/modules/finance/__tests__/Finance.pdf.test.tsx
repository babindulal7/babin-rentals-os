// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

const state = vi.hoisted(() => ({
  vatRate: 0.075,
  vatAmount: 67.5,
  total: 967.5,
  linesError: false,
  noLines: false,
  exportPdf: vi.fn().mockResolvedValue({}),
}))
vi.mock('../../../lib/pdf/exportPdf', () => ({ exportInvoicePdf: state.exportPdf }))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'USR-1', name: 'Operator', role: 'Owner', isSharedDevice: false } }),
}))
vi.mock('../../../lib/supabase', () => ({
  newClientUuid: () => '00000000-0000-4000-8000-000000000000',
  supabase: { from: (table: string) => {
    const builder: Record<string, unknown> = {}
    for (const method of ['select', 'or', 'in', 'gte', 'lte', 'is', 'not', 'order', 'range', 'eq', 'neq', 'limit']) builder[method] = () => builder
    builder.then = (resolve: (result: unknown) => unknown) => {
      const rows = table === 'invoices' ? [{
        id: '11111111-1111-4111-8111-111111111111', invoice_no: 'INV-1',
        booking_id: '22222222-2222-4222-8222-222222222222', client_id: '33333333-3333-4333-8333-333333333333',
        status: 'Sent', issue_date: '2026-10-20', due_date: '2026-10-27', currency: 'NPR',
        subtotal: 1000, discount_amount: 100, discount_percent: 10, taxable_amount: 900,
        vat_rate: state.vatRate, vat_amount: state.vatAmount, total_amount: state.total,
        paid_amount: 200, outstanding_amount: state.total - 200,
        voided_at: null, void_reason: null, credit_note_no: null, notes: 'Recorded invoice note',
        created_at: '2026-10-20T00:00:00Z', clients: { name: 'Film Client' }, bookings: { booking_no: 'BK-1' },
      }] : table === 'invoice_lines' && !state.noLines ? [{
        id: 'line-1', description: 'Sony FX3', quantity: 1, days: 2, unit_rate: 500,
        discount_percent: 10, line_total: 900, sort_order: 1, line_kind: 'Equipment Rental',
      }] : []
      resolve({ data: rows, count: rows.length, error: table === 'invoice_lines' && state.linesError ? { message: 'Invoice lines unavailable' } : null })
    }
    return builder
  } },
}))

window.matchMedia = ((media: string) => ({ matches: false, media, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
const { default: Finance } = await import('../Finance')
let root: Root | undefined
let container: HTMLDivElement

beforeEach(() => {
  Object.assign(state, { vatRate: 0.075, vatAmount: 67.5, total: 967.5, linesError: false, noLines: false })
  state.exportPdf.mockClear()
})
afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  container?.remove()
  root = undefined
})
async function exportInvoice() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root?.render(<MemoryRouter initialEntries={['/finance?tab=invoices']}><Finance /></MemoryRouter>))
  const button = container.querySelector<HTMLButtonElement>('button[aria-label="Export PDF for INV-1"]')
  expect(button).toBeTruthy()
  await act(async () => button?.click())
}

describe('Finance invoice PDF uses the persisted financial breakdown', () => {
  it.each([0.075, 0])('exports recorded amounts, discount and VAT rate %s without recalculating', async (rate) => {
    state.vatRate = rate
    state.vatAmount = rate === 0 ? 0 : 67.5
    state.total = 900 + state.vatAmount
    await exportInvoice()
    expect(state.exportPdf).toHaveBeenCalledTimes(1)
    expect(state.exportPdf).toHaveBeenCalledWith(expect.objectContaining({
      subtotalPaisa: 100000, discountPaisa: 10000, discountPercent: 10,
      taxablePaisa: 90000, vatPercent: rate * 100, vatPaisa: state.vatAmount * 100,
      totalPaisa: state.total * 100, paidPaisa: 20000, outstandingPaisa: (state.total - 200) * 100,
      notes: 'Recorded invoice note',
      lines: [{ description: 'Sony FX3', quantity: 1, rentalDays: 2, ratePaisa: 50000, totalPaisa: 90000 }],
    }), expect.objectContaining({ invoiceId: '11111111-1111-4111-8111-111111111111', download: true }))
  })

  it.each(['error', 'empty'])('refuses a fabricated replacement line when the line read is %s', async (mode) => {
    state.linesError = mode === 'error'
    state.noLines = mode === 'empty'
    await exportInvoice()
    expect(state.exportPdf).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Invoice PDF was not exported')
  })
})
