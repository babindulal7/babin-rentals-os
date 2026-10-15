// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { SystemRole } from '../../../types/database'
import { aggregateRevenue, buildRevenueTrendReport, type InvoiceRevenueSource } from '../../../lib/intel/revenueTrend'
import type { RevenueTrendResult } from '../../../lib/queries/reportRevenueTrend'

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
  load: vi.fn(),
  listInvoices: vi.fn(),
  supabaseFrom: vi.fn(),
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u-1', name: 'Test User', role: state.role, isSharedDevice: false } }),
}))

vi.mock('../../../lib/supabase', () => ({ supabase: { from: state.supabaseFrom } }))

vi.mock('../../../lib/queries/reportRevenueTrend', () => ({ loadRevenueTrend: state.load }))

vi.mock('../../../lib/queries/finance', () => ({ listInvoices: state.listInvoices }))

import RevenueReport from '../RevenueReport'

const TODAY = '2026-10-14'

const inv = (patch: Partial<InvoiceRevenueSource>): InvoiceRevenueSource => ({
  id: 'inv-1',
  invoice_no: 'INV-1',
  issue_date: '2026-09-12',
  status: 'Paid',
  currency: 'NPR',
  taxable_amount: 100000,
  vat_amount: 13000,
  total_amount: 113000,
  voided_at: null,
  ...patch,
})

function reportResult(unnettedCreditNotes = 0): RevenueTrendResult {
  const current = aggregateRevenue(
    [inv({}), inv({ id: 'inv-2', invoice_no: 'INV-2', issue_date: '2026-10-02', taxable_amount: 50000, vat_amount: 6500, total_amount: 56500 })],
    { fromDay: '2026-08-15', toDay: TODAY },
    'month',
    TODAY,
  )
  return {
    kind: 'report',
    report: buildRevenueTrendReport({ current, previous: null, unnettedCreditNotes, calculatedAt: new Date('2026-10-14T06:00:00Z') }),
    clampedToToday: false,
  }
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

beforeEach(() => {
  state.role = 'Owner'
  state.load.mockReset()
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
    expect(text()).toContain('Your role cannot view revenue reports.')
    expect(state.load).not.toHaveBeenCalled()
    expect(state.listInvoices).not.toHaveBeenCalled()
    expect(state.supabaseFrom).not.toHaveBeenCalled()
    expect(text()).not.toMatch(/Rs\s?\d/)
  })

  it.each<SystemRole>(['Owner', 'Admin', 'Manager', 'Accounts'])('%s: reads the invoices', async (role) => {
    state.role = role
    state.load.mockResolvedValue(reportResult())
    await render()
    expect(state.load).toHaveBeenCalledTimes(1)
    expect(text()).toContain('Billed revenue by month')
  })
})

describe('RevenueReport — figures', () => {
  it('shows only figures from the invoices: KPIs, chart and table reconcile', async () => {
    state.load.mockResolvedValue(reportResult())
    await render()
    expect(state.load).toHaveBeenCalledWith(expect.objectContaining({ fromDay: null, toDay: null, compare: false }))
    // KPI strip
    expect(text()).toContain('Rs 1,50,000') // billed revenue before VAT
    expect(text()).toContain('Rs 19,500') // VAT
    expect(text()).toContain('Rs 1,69,500') // VAT included
    // table total row equals the KPI
    const total = [...container.querySelectorAll('tfoot td')].map((c) => c.textContent)
    expect(total.slice(0, 4)).toEqual(['Rs 1,50,000', 'Rs 19,500', 'Rs 1,69,500', '2'])
    // chart is present and labelled with its status in words
    expect(container.querySelector('[aria-roledescription="interactive chart"]')).not.toBeNull()
    expect(text()).toContain('Data: Actual')
    expect(text()).toContain('Oct 2026 is month to date, through 14 Oct 2026.')
  })

  it('carries none of the previously hardcoded figures', async () => {
    state.load.mockResolvedValue(reportResult())
    await render()
    for (const fabricated of ['Cinema Cameras', 'Commercial / TVC', '42 invoices', 'Rs 35,000', 'Rs 14,85,000', 'W1']) {
      expect(text()).not.toContain(fabricated)
    }
    expect(text()).toContain('Revenue by equipment category and by project type is not shown')
  })

  it('labels partial data and says why', async () => {
    state.load.mockResolvedValue(reportResult(1))
    await render()
    expect(text()).toContain('Data: Partial data')
    expect(text()).toContain('1 credit note is recorded against invoices that are still live.')
  })

  it('an unreadable source is an inline error with Retry — never a zero trend', async () => {
    state.load.mockRejectedValueOnce(new Error('Invoices could not be read: permission denied'))
    await render()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('permission denied')
    expect(text()).not.toContain('Rs 0')
    state.load.mockResolvedValue(reportResult())
    const retry = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Retry'))!
    await act(async () => retry.click())
    expect(state.load).toHaveBeenCalledTimes(2)
    expect(text()).toContain('Rs 1,50,000')
  })

  it('no issued invoice ever: an empty state, not a chart of zeros', async () => {
    state.load.mockResolvedValue({ kind: 'no-history', until: null })
    await render()
    expect(text()).toContain('No issued invoices yet')
    expect(container.querySelector('[aria-roledescription="interactive chart"]')).toBeNull()
  })

  it('a period ending before the first invoice says so, not "no invoices yet"', async () => {
    state.load.mockResolvedValue({ kind: 'no-history', until: '2026-01-31' })
    await render()
    expect(text()).toContain('No invoices issued by 31 Jan 2026')
    expect(text()).not.toContain('No issued invoices yet')
  })

  it('an over-long period names the real limit', async () => {
    state.load.mockResolvedValue({ kind: 'too-long', months: 62 })
    await render()
    expect(text()).toContain('Choose a period of five years or less')
    expect(text()).toContain('touches 62 calendar months; the trend reads up to 61 (five years) at a time.')
  })

  it('a complete query over a quiet period shows a genuine zero and no line', async () => {
    const current = aggregateRevenue([], { fromDay: '2026-09-01', toDay: '2026-09-30' }, 'day', TODAY)
    state.load.mockResolvedValue({
      kind: 'report',
      report: buildRevenueTrendReport({ current, previous: null, unnettedCreditNotes: 0, calculatedAt: new Date() }),
      clampedToToday: false,
    })
    await render()
    expect(text()).toContain('Rs 0')
    expect(text()).toContain('No invoices were issued in this period')
    expect(container.querySelector('[aria-roledescription="interactive chart"]')).toBeNull()
  })

  it('offers no comparison control for "All dates", which has no period before it', async () => {
    state.load.mockResolvedValue(reportResult())
    await render()
    expect(text()).not.toMatch(/Compare/i)
  })

  it('switches the chart measure without refetching', async () => {
    state.load.mockResolvedValue(reportResult())
    await render()
    const tab = [...container.querySelectorAll('[role="tab"]')].find((b) => b.textContent === 'Invoices')!
    await act(async () => (tab as HTMLElement).click())
    expect(container.querySelector('[aria-roledescription="interactive chart"]')!.getAttribute('aria-label')).toMatch(/^Invoices issued by month/)
    expect(state.load).toHaveBeenCalledTimes(1)
  })
})

describe('RevenueReport — invoice register', () => {
  it('lists invoices with their count, and states that voids are never revenue', async () => {
    state.load.mockResolvedValue(reportResult())
    state.listInvoices.mockResolvedValue({
      rows: [
        {
          id: 'i1', invoiceNo: 'INV-7', bookingId: 'b', bookingNo: '7', clientId: 'c', clientName: 'Aura Media', status: 'Void',
          issueDateAd: '2026-10-01', dueDateAd: '2026-10-15', currency: 'NPR', subtotal: 100, discountAmount: 0, discountPercent: 0,
          taxableAmount: 100, vatRate: 0.13, vatAmount: 13, totalAmount: 113, paidAmount: 0, outstandingAmount: 113,
          isVoid: true, voidedAtAd: '2026-10-02T00:00:00Z', voidReason: 'Duplicate invoice raised', creditNoteNo: null, notes: null, createdAtAd: '2026-10-01T00:00:00Z',
        },
      ],
      total: 240,
    })
    await render()
    const tab = [...container.querySelectorAll('[role="tab"]')].find((b) => b.textContent === 'Invoice register')!
    await act(async () => (tab as HTMLElement).click())
    expect(state.listInvoices).toHaveBeenCalledWith(
      expect.objectContaining({ withCount: true, chips: { status: ['Sent', 'Partially Paid', 'Paid', 'Overdue', 'Void'] } }),
    )
    // The deep link Finance actually reads (tab + search), not a parameter nothing reads.
    const link = [...container.querySelectorAll('a')].find((a) => a.textContent === 'INV-7')!
    expect(link.getAttribute('href')).toBe('/finance?tab=invoices&search=INV-7')
    expect(text()).toContain('Drafts are not listed until they are issued.')
    expect(text()).toContain('Showing the 1 most recent of 240 invoices.')
    expect(text()).toContain('they are never counted as revenue')
    expect(text()).toContain('INV-7')
  })

  it('a register read failure is an inline error with Retry', async () => {
    state.load.mockResolvedValue(reportResult())
    state.listInvoices.mockRejectedValueOnce(new Error('listInvoices failed: timeout'))
    await render()
    const tab = [...container.querySelectorAll('[role="tab"]')].find((b) => b.textContent === 'Invoice register')!
    await act(async () => (tab as HTMLElement).click())
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('timeout')
  })
})
