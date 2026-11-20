// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
})

const state = vi.hoisted(() => ({ listInvoices: vi.fn() }))

vi.mock('../../../lib/queries/finance', () => ({ listInvoices: state.listInvoices }))

import { RevenueInvoiceRegister } from '../RevenueInvoiceRegister'

const row = (patch: Record<string, unknown>) => ({
  id: 'i1',
  invoiceNo: 'INV-7',
  bookingId: 'b',
  bookingNo: '7',
  clientId: 'c',
  clientName: 'Aura Media',
  status: 'Sent',
  issueDateAd: '2026-10-01',
  dueDateAd: '2026-10-15',
  currency: 'NPR',
  subtotal: 100,
  discountAmount: 0,
  discountPercent: 0,
  taxableAmount: 100,
  vatRate: 0.13,
  vatAmount: 13,
  totalAmount: 113,
  paidAmount: 0,
  outstandingAmount: 113,
  isVoid: false,
  voidedAtAd: null,
  voidReason: null,
  creditNoteNo: null,
  notes: null,
  createdAtAd: '2026-10-01T00:00:00Z',
  ...patch,
})

let container: HTMLDivElement
let root: Root

async function render() {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <RevenueInvoiceRegister fromAd="2026-07-01" toAd="2026-10-14" />
      </MemoryRouter>,
    )
  })
}

const text = () => container.textContent ?? ''
const button = (name: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)!

beforeEach(() => {
  state.listInvoices.mockReset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('RevenueInvoiceRegister', () => {
  it('asks for issued invoices and voids only, within the civil-day window, with an issue date', async () => {
    state.listInvoices.mockResolvedValue({ rows: [row({})], total: 1 })
    await render()
    expect(state.listInvoices).toHaveBeenCalledWith(
      expect.objectContaining({
        page: { index: 0, size: 100 },
        dateRange: { column: 'issue_date', fromAd: '2026-07-01', toAd: '2026-10-14' },
        chips: { status: ['Sent', 'Partially Paid', 'Paid', 'Void'] },
        presence: { issue_date: true },
        withCount: true,
      }),
    )
    expect(state.listInvoices.mock.calls[0]![0].chips.status).not.toContain('Draft')
  })

  it('links a live number to its Finance invoice, and shows a void number as plain text', async () => {
    state.listInvoices.mockResolvedValue({
      rows: [
        row({}),
        row({ id: 'i2', invoiceNo: 'INV-8', status: 'Void', isVoid: true, voidedAtAd: '2026-10-02T00:00:00Z', voidReason: 'Duplicate invoice raised' }),
      ],
      total: 2,
    })
    await render()
    const link = [...container.querySelectorAll('a')].find((a) => a.textContent === 'INV-7')!
    expect(link.getAttribute('href')).toBe('/finance?tab=invoices&search=INV-7')
    expect([...container.querySelectorAll('a')].some((a) => a.textContent === 'INV-8')).toBe(false)
    expect(text()).toContain('INV-8')
    expect(text()).toContain('2 invoices, newest first.')
    expect(text()).toContain('they are never counted as revenue')
    expect(text()).toContain('Drafts are not listed until they are issued.')
  })

  it('pages in place: the rows stay on screen while the next page loads, and focus moves to the new range when it lands', async () => {
    state.listInvoices.mockResolvedValueOnce({ rows: [row({})], total: 240 })
    await render()
    expect(text()).toContain('Invoices 1–1 of 240, newest first.')
    expect(button('Newer').getAttribute('aria-disabled')).toBe('true')

    let release: (v: unknown) => void = () => {}
    state.listInvoices.mockImplementationOnce(() => new Promise((r) => (release = r)))
    const older = button('Older')
    older.focus()
    await act(async () => older.click())

    // While page 2 is read, the rows stay on screen (no skeleton swap), marked busy.
    expect(container.querySelector('table')).not.toBeNull()
    expect(text()).toContain('INV-7')
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(state.listInvoices).toHaveBeenLastCalledWith(expect.objectContaining({ page: { index: 1, size: 100 } }))

    await act(async () => release({ rows: [row({ id: 'i9', invoiceNo: 'INV-9' })], total: 240 }))
    expect(text()).toContain('Invoices 101–101 of 240, newest first.')
    expect(document.activeElement?.textContent).toMatch(/^Invoices 101–101 of 240/)
    expect(button('Newer').getAttribute('aria-disabled')).toBe('false')
  })

  it('a failed read is an inline error with Retry, never an empty register', async () => {
    state.listInvoices.mockRejectedValueOnce(new Error('listInvoices failed: timeout'))
    await render()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('timeout')
    expect(text()).not.toContain('No invoices in this period')
    state.listInvoices.mockResolvedValue({ rows: [row({})], total: 1 })
    await act(async () => button('Retry').click())
    expect(text()).toContain('INV-7')
  })

  it('a window with no issued invoices says so, without a table', async () => {
    state.listInvoices.mockResolvedValue({ rows: [], total: 0 })
    await render()
    expect(text()).toContain('No invoices in this period')
    expect(container.querySelector('table')).toBeNull()
  })
})
