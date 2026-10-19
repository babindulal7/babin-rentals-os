// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { SystemRole } from '../../../types/database'
import {
  aggregateIssuedRevenue,
  aggregateShiftedRevenue,
  reconcileInvoiceCredits,
  type IssuedInvoiceWithPayment,
  type RevenueTrend,
} from '../../../lib/intel/revenueTrend'
import { businessDayAd } from '../../../lib/bs'

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

const state = vi.hoisted(() => ({
  role: 'Owner' as SystemRole,
  trend: vi.fn(),
  previous: vi.fn(),
  earliest: vi.fn(),
  listInvoices: vi.fn(),
  supabaseFrom: vi.fn(),
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u-1', name: 'Test User', role: state.role, isSharedDevice: false } }),
}))
vi.mock('../../../lib/supabase', () => ({ supabase: { from: state.supabaseFrom } }))
vi.mock('../../../lib/queries/reportRevenueTrend', () => ({
  getIssuedRevenueTrend: state.trend,
  getPreviousIssuedRevenue: state.previous,
  getEarliestIssueDay: state.earliest,
}))
vi.mock('../../../lib/queries/finance', () => ({ listInvoices: state.listInvoices }))

import RevenueReport from '../RevenueReport'

const TODAY = businessDayAd()
const shift = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const START = shift(TODAY, -89)

const inv = (patch: Partial<IssuedInvoiceWithPayment>): IssuedInvoiceWithPayment => ({
  id: 'inv-1',
  issue_date: shift(TODAY, -40),
  status: 'Paid',
  taxable_amount: '1000.00',
  paid_amount: '1130.00',
  currency: 'NPR',
  voided_at: null,
  ...patch,
})

let invoices: IssuedInvoiceWithPayment[] = []

function inWindow(from: string, to: string) {
  return invoices.filter((r) => r.issue_date >= from && r.issue_date <= to)
}

let container: HTMLDivElement
let root: Root

async function render() {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <RevenueReport />
      </MemoryRouter>,
    )
  })
}

const text = () => container.textContent ?? ''
const chart = () => container.querySelector('[aria-roledescription="interactive chart"]')

async function choose(label: string, value: string) {
  const el = container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, value)
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

async function clickTab(name: string) {
  const tab = [...container.querySelectorAll<HTMLElement>('[role="tab"]')].find((b) => b.textContent === name)!
  await act(async () => tab.click())
}

beforeEach(() => {
  state.role = 'Owner'
  invoices = [inv({}), inv({ id: 'inv-2', issue_date: shift(TODAY, -10), taxable_amount: '500.00', paid_amount: '0' })]
  state.trend.mockReset().mockImplementation(async (from: string, to: string, today?: string) => {
    const rows = inWindow(from, to)
    return { ...aggregateIssuedRevenue(rows, from, to, today), creditReconciliation: reconcileInvoiceCredits(rows, []) }
  })
  state.previous.mockReset().mockImplementation(async (current: RevenueTrend) => {
    const span = Math.round((Date.parse(current.toAd) - Date.parse(current.fromAd)) / 86_400_000) + 1
    return aggregateShiftedRevenue(inWindow(shift(current.fromAd, -span), shift(current.fromAd, -1)), current)
  })
  state.earliest.mockReset().mockResolvedValue(shift(TODAY, -40))
  state.listInvoices.mockReset()
  state.supabaseFrom.mockReset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('RevenueReport — who may see it', () => {
  it.each<SystemRole>(['Warehouse', 'Technician', 'Driver', 'Client', 'Coordinator'])('%s: restricted, and nothing is fetched', async (role) => {
    state.role = role
    await render()
    expect(text()).toContain('Your role cannot view the company revenue report.')
    expect(state.trend).not.toHaveBeenCalled()
    expect(state.earliest).not.toHaveBeenCalled()
    expect(state.listInvoices).not.toHaveBeenCalled()
    expect(state.supabaseFrom).not.toHaveBeenCalled()
    expect(text()).not.toMatch(/Rs\s?\d/)
  })

  it.each<SystemRole>(['Owner', 'Admin', 'Manager', 'Accounts'])('%s: reads the invoices', async (role) => {
    state.role = role
    await render()
    expect(state.trend).toHaveBeenCalledTimes(1)
    expect(text()).toContain('Monthly issued invoice revenue')
  })
})

describe('RevenueReport — the window the toolbar names is the window drawn', () => {
  it('starts on "Last 90 days" and reads exactly those days', async () => {
    await render()
    expect(container.querySelector<HTMLSelectElement>('select[aria-label="Date range"]')!.value).toBe('last90')
    expect(state.trend).toHaveBeenCalledWith(START, TODAY, TODAY)
    expect(state.earliest).not.toHaveBeenCalled()
  })

  it('"All dates" runs from the first issued invoice to today, with no compare control', async () => {
    await render()
    expect(container.querySelector('select[aria-label="Comparison"]')).not.toBeNull()
    await choose('Date range', 'all')
    expect(state.earliest).toHaveBeenCalledTimes(1)
    // Nothing was issued earlier in that month, so the first month is complete, not "part month".
    expect(state.trend).toHaveBeenLastCalledWith(`${shift(TODAY, -40).slice(0, 8)}01`, TODAY, TODAY)
    expect(container.querySelector('select[aria-label="Comparison"]')).toBeNull()
  })

  it('"All dates" with nothing issued is an empty state, not a chart of zeros', async () => {
    state.earliest.mockResolvedValue(null)
    await render()
    await choose('Date range', 'all')
    expect(text()).toContain('No issued invoices in this period')
    expect(chart()).toBeNull()
  })

  it('"All dates" longer than 24 months names the limit and reads nothing', async () => {
    state.earliest.mockResolvedValue(shift(TODAY, -365 * 3))
    await render()
    state.trend.mockClear()
    await choose('Date range', 'all')
    expect(text()).toContain('Choose a period of 24 months or less')
    expect(text()).toMatch(/touches \d+ calendar months; the trend reads up to 24 at a time\./)
    expect(state.trend).not.toHaveBeenCalled()
  })
})

describe('RevenueReport — figures', () => {
  it('KPI, chart and credit reconciliation come from the same read', async () => {
    await render()
    expect(text()).toContain('Rs 1,500')
    expect(text()).toContain('Issued invoices')
    expect(chart()).not.toBeNull()
    expect(text()).toContain('Data: Actual')
    expect(text()).toMatch(/is month to date, through/)
    expect(text()).toContain('Credit-note reconciliation')
    // The value axis is labelled, so the line is readable without hovering.
    expect(container.querySelectorAll('svg text').length).toBeGreaterThan(2)
  })

  it('carries none of the previously hardcoded figures', async () => {
    await render()
    for (const fabricated of ['Cinema Cameras', 'Commercial / TVC', '42 invoices', 'Rs 35,000', 'Rs 14,85,000']) {
      expect(text()).not.toContain(fabricated)
    }
  })

  it('compares with the same number of days immediately before', async () => {
    invoices.push(inv({ id: 'old', issue_date: shift(START, -30), taxable_amount: '3000.00' }))
    await render()
    await choose('Comparison', 'previous')
    expect(state.previous).toHaveBeenCalledTimes(1)
    expect(text()).toContain('Compared with')
    expect(text()).toContain('Previous period')
    expect(text()).toContain('−50% vs previous period')
  })

  it('switches the chart measure without refetching', async () => {
    await render()
    await clickTab('Invoices')
    expect(chart()!.getAttribute('aria-label')).toMatch(/^Invoices issued by month/)
    expect(state.trend).toHaveBeenCalledTimes(1)
  })

  it('an unreadable source is an inline error with Retry — never a zero trend', async () => {
    state.trend.mockRejectedValueOnce(new Error('Revenue source unavailable: permission denied'))
    await render()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('permission denied')
    expect(text()).not.toContain('Rs 0')
    const retry = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Retry'))!
    await act(async () => retry.click())
    expect(state.trend).toHaveBeenCalledTimes(2)
    expect(text()).toContain('Rs 1,500')
  })

  it('a quiet period shows a genuine zero and no line', async () => {
    invoices = []
    await render()
    expect(text()).toContain('Rs 0')
    expect(text()).toContain('No issued invoices recorded for the selected period.')
    expect(chart()).toBeNull()
  })
})

describe('RevenueReport — invoice register', () => {
  const row = (patch: Record<string, unknown>) => ({
    id: 'i1', invoiceNo: 'INV-7', bookingId: 'b', bookingNo: '7', clientId: 'c', clientName: 'Aura Media', status: 'Sent',
    issueDateAd: '2026-10-01', dueDateAd: '2026-10-15', currency: 'NPR', subtotal: 100, discountAmount: 0, discountPercent: 0,
    taxableAmount: 100, vatRate: 0.13, vatAmount: 13, totalAmount: 113, paidAmount: 0, outstandingAmount: 113,
    isVoid: false, voidedAtAd: null, voidReason: null, creditNoteNo: null, notes: null, createdAtAd: '2026-10-01T00:00:00Z',
    ...patch,
  })

  it('lists issued invoices and voids with their count; live numbers open Finance on the invoice', async () => {
    state.listInvoices.mockResolvedValue({
      rows: [
        row({}),
        row({ id: 'i2', invoiceNo: 'INV-8', status: 'Void', isVoid: true, voidedAtAd: '2026-10-02T00:00:00Z', voidReason: 'Duplicate invoice raised' }),
      ],
      total: 240,
    })
    await render()
    await clickTab('Invoice register')
    expect(state.listInvoices).toHaveBeenCalledWith(
      expect.objectContaining({
        withCount: true,
        page: { index: 0, size: 100 },
        chips: { status: ['Sent', 'Partially Paid', 'Paid', 'Void'] },
        // A Draft voided before issue has no issue date: it is not an issued invoice.
        presence: { issue_date: true },
        // The same civil days the trend reads — a DATE column is not compared with +05:45 instants.
        dateRange: { column: 'issue_date', fromAd: START, toAd: TODAY },
      }),
    )
    const link = [...container.querySelectorAll('a')].find((a) => a.textContent === 'INV-7')!
    expect(link.getAttribute('href')).toBe('/finance?tab=invoices&search=INV-7')
    // Finance opens on live invoices, so a void's number is text, not a link to an empty list.
    expect([...container.querySelectorAll('a')].some((a) => a.textContent === 'INV-8')).toBe(false)
    expect(text()).toContain('INV-8')
    expect(text()).toContain('Invoices 1–2 of 240, newest first.')
    expect(text()).toContain('they are never counted as revenue')
    expect(text()).toContain('Drafts are not listed until they are issued.')
  })

  it('pages through a long register in place, keeping the table and focus while the next page loads', async () => {
    state.listInvoices.mockResolvedValue({ rows: [row({})], total: 240 })
    await render()
    await clickTab('Invoice register')
    const button = (name: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)!
    expect(button('Newer').getAttribute('aria-disabled')).toBe('true')
    let release: (v: unknown) => void = () => {}
    state.listInvoices.mockImplementationOnce(() => new Promise((r) => (release = r)))
    const older = button('Older')
    older.focus()
    await act(async () => older.click())
    // Still mounted while page 2 is read: no skeleton swap, nothing to lose focus to.
    expect(container.contains(older)).toBe(true)
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(state.listInvoices).toHaveBeenLastCalledWith(expect.objectContaining({ page: { index: 1, size: 100 } }))
    await act(async () => release({ rows: [row({ id: 'i9', invoiceNo: 'INV-9' })], total: 240 }))
    expect(text()).toContain('Invoices 101–101 of 240')
    expect(document.activeElement?.textContent).toMatch(/^Invoices 101–101 of 240/)
    expect(button('Newer').getAttribute('aria-disabled')).toBe('false')
  })

  it('a register read failure is an inline error with Retry', async () => {
    state.listInvoices.mockRejectedValueOnce(new Error('listInvoices failed: timeout'))
    await render()
    await clickTab('Invoice register')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('timeout')
  })
})
