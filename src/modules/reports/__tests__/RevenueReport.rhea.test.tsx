// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import RevenueReport from '../RevenueReport'
import type { IssuedRevenueReport } from '../../../lib/queries/reportRevenueTrend'
import type { Paisa } from '../../../lib/money'

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

const mockReport: IssuedRevenueReport = {
  fromAd: '2026-07-01',
  toAd: '2026-09-30',
  totalPaisa: 15400000 as Paisa, // Rs 1,54,000
  issuedCount: 12,
  months: [
    { periodStartUtc: '2026-07-01T00:00:00Z', label: '2026-07', amountPaisa: 4400000 as Paisa, invoiceCount: 4 },
    { periodStartUtc: '2026-08-01T00:00:00Z', label: '2026-08', amountPaisa: 5000000 as Paisa, invoiceCount: 4 },
    { periodStartUtc: '2026-09-01T00:00:00Z', label: '2026-09', amountPaisa: 6000000 as Paisa, invoiceCount: 4 },
  ],
  creditReconciliation: {
    creditNoteCount: 2,
    creditNoteAmountPaisa: 120000 as Paisa,
    voidedTaxablePaisa: 800000 as Paisa,
    voidedInvoiceCount: 1,
    paidVoidMismatchCount: 0,
    activeInvoiceCreditNoteCount: 0,
  },
}

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'owner@test.com', role: 'Owner', full_name: 'Babin Dulal' },
    role: 'Owner',
    isSuperAdmin: true,
  }),
}))

vi.mock('../../../lib/queries/reportRevenueTrend', () => ({
  getIssuedRevenueTrend: vi.fn(() => Promise.resolve(mockReport)),
}))

describe('RevenueReport Rhea Pilot Integration', () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    if (root && container) {
      act(() => {
        root!.unmount()
      })
      container.remove()
    }
    container = null
    root = null
  })

  it('renders within the scoped .br-preset-pilot container with data-ui-preset="rhea"', async () => {
    await act(async () => {
      root!.render(
        <MemoryRouter>
          <RevenueReport />
        </MemoryRouter>
      )
    })

    // Allow useLoad to settle
    await act(async () => {
      await Promise.resolve()
    })

    const pilotContainer = container?.querySelector('.br-preset-pilot')
    expect(pilotContainer).not.toBeNull()
    expect(pilotContainer?.getAttribute('data-ui-preset')).toBe('rhea')
  })

  it('renders the 4 RheaKpiCard metric cards inside .rhea-kpi-grid', async () => {
    await act(async () => {
      root!.render(
        <MemoryRouter>
          <RevenueReport />
        </MemoryRouter>
      )
    })
    await act(async () => {
      await Promise.resolve()
    })

    const kpiGrid = container?.querySelector('.rhea-kpi-grid')
    expect(kpiGrid).not.toBeNull()

    const kpiCards = container?.querySelectorAll('.rhea-kpi-card')
    expect(kpiCards?.length).toBe(4)

    // Metric 1: Taxable amount
    expect(container?.textContent).toContain('Taxable Revenue (Before VAT)')
    expect(container?.textContent).toContain('Rs 1,54,000')

    // Metric 2: Issued invoices
    expect(container?.textContent).toContain('Issued Invoices')
    expect(container?.textContent).toContain('12')

    // Metric 3: Voided invoice excluded
    expect(container?.textContent).toContain('Voided Invoice Excluded')
    expect(container?.textContent).toContain('Rs 8,000')

    // Metric 4: Credit-note corrections
    expect(container?.textContent).toContain('Credit-Note Corrections')
    expect(container?.textContent).toContain('Rs 1,200')
  })

  it('renders the RheaChartContainer and InteractiveRevenueTrend chart', async () => {
    await act(async () => {
      root!.render(
        <MemoryRouter>
          <RevenueReport />
        </MemoryRouter>
      )
    })
    await act(async () => {
      await Promise.resolve()
    })

    const chartSection = container?.querySelector('section[aria-label="Issued invoice revenue trend"]')
    expect(chartSection).not.toBeNull()

    const svg = chartSection?.querySelector('svg[role="group"]')
    expect(svg).not.toBeNull()

    // Title and accessible table present
    expect(chartSection?.textContent).toContain('Monthly issued invoice revenue')
    expect(chartSection?.textContent).toContain('View accessible month-by-month table')
  })

  it('renders the RheaCard for Credit-note reconciliation', async () => {
    await act(async () => {
      root!.render(
        <MemoryRouter>
          <RevenueReport />
        </MemoryRouter>
      )
    })
    await act(async () => {
      await Promise.resolve()
    })

    const reconCard = container?.querySelector('div[aria-label="Credit-note reconciliation for selected invoice dates"]')
    expect(reconCard).not.toBeNull()
    expect(reconCard?.textContent).toContain('Credit-note reconciliation')
    expect(reconCard?.textContent).toContain('No paid-void credit mismatches found')
  })
})
