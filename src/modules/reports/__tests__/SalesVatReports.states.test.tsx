// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import SalesVatReports from '../SalesVatReports'
import { rupees, type Paisa } from '../../../lib/money'
import type { SalesReportData, VatTaxReportData } from '../../../lib/queries/salesVatReports'

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

const mockState = {
  isMock: false,
  reportPromise: null as Promise<{ sales: SalesReportData; vat: VatTaxReportData }> | null,
}

vi.mock('../../../lib/supabase', () => ({
  get IS_MOCK() {
    return mockState.isMock
  },
  supabase: {},
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'USR-TEST', name: 'Tester', role: 'Owner', isSharedDevice: false },
  }),
}))

vi.mock('../../../lib/queries/salesVatReports', () => ({
  getSalesVatReport: () => {
    if (!mockState.reportPromise) {
      return Promise.reject(new Error('No mock promise supplied'))
    }
    return mockState.reportPromise
  },
}))

function makeMockReport(invoiceCount = 1): { sales: SalesReportData; vat: VatTaxReportData } {
  if (invoiceCount === 0) {
    return {
      sales: {
        metrics: {
          totalInvoiced: rupees(0),
          netSales: rupees(0),
          totalVat: rupees(0),
          totalDiscounts: rupees(0),
          totalCollected: rupees(0),
          totalOutstanding: rupees(0),
          invoiceCount: 0,
          collectionRate: 0,
        },
        statusBreakdown: [],
        monthlyTrend: [],
        topClients: [],
        invoices: [],
      },
      vat: {
        metrics: {
          totalGrossTurnover: rupees(0),
          taxableTurnover: rupees(0),
          totalOutputVat: rupees(0),
          exemptTurnover: rupees(0),
          effectiveVatRate: 0,
          invoicesCount: 0,
        },
        monthlySchedule: [],
        taxRegister: [],
      },
    }
  }

  return {
    sales: {
      metrics: {
        totalInvoiced: rupees(113000),
        netSales: rupees(100000),
        totalVat: rupees(13000),
        totalDiscounts: rupees(0),
        totalCollected: rupees(113000),
        totalOutstanding: rupees(0),
        invoiceCount: 1,
        collectionRate: 100,
      },
      statusBreakdown: [{ status: 'Paid', count: 1, amount: rupees(113000), percent: 100 }],
      monthlyTrend: [{ period: 'Baisakh 2083', invoiced: rupees(113000), collected: rupees(113000) }],
      topClients: [
        {
          clientId: 'CLI-001',
          clientName: 'Alpha Cinema',
          invoiceCount: 1,
          totalInvoiced: rupees(113000),
          totalPaid: rupees(113000),
          balance: rupees(0),
        },
      ],
      invoices: [
        {
          id: 'inv-1',
          invoiceNo: 'INV-2083-001',
          bookingNo: 'BK-1001',
          clientName: 'Alpha Cinema',
          clientPan: '300123456',
          issueDate: '2026-04-15',
          dueDate: '2026-04-30',
          subtotal: rupees(100000),
          taxableAmount: rupees(100000),
          taxAmount: rupees(13000),
          grandTotal: rupees(113000),
          paidAmount: rupees(113000),
          status: 'Paid',
        },
      ],
    },
    vat: {
      metrics: {
        totalGrossTurnover: rupees(113000),
        taxableTurnover: rupees(100000),
        totalOutputVat: rupees(13000),
        exemptTurnover: rupees(0) as Paisa,
        effectiveVatRate: 13,
        invoicesCount: 1,
      },
      monthlySchedule: [
        {
          month: 'AD 2026-04-15',
          bsMonth: 'Baisakh 2083',
          taxableSales: rupees(100000),
          vatAmount: rupees(13000),
          exemptSales: rupees(0),
          grossSales: rupees(113000),
        },
      ],
      taxRegister: [
        {
          id: 'inv-1',
          invoiceNo: 'INV-2083-001',
          bookingNo: 'BK-1001',
          clientName: 'Alpha Cinema',
          clientPan: '300123456',
          issueDate: '2026-04-15',
          dueDate: '2026-04-30',
          subtotal: rupees(100000),
          taxableAmount: rupees(100000),
          taxAmount: rupees(13000),
          grandTotal: rupees(113000),
          paidAmount: rupees(113000),
          status: 'Paid',
        },
      ],
    },
  }
}

describe('SalesVatReports component state handling', () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mockState.isMock = false
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

  function hasCsvButton(el: HTMLElement): boolean {
    const buttons = Array.from(el.querySelectorAll('button'))
    return buttons.some((b) => b.textContent?.includes('CSV'))
  }

  it('renders loading state while reading invoice records and suppresses CSV export', async () => {
    // Unresolved promise simulates ongoing network read
    mockState.reportPromise = new Promise(() => {})

    await act(async () => {
      root!.render(
        <MemoryRouter>
          <SalesVatReports />
        </MemoryRouter>,
      )
    })

    const loadingSection = container!.querySelector('[role="status"]')
    expect(loadingSection).not.toBeNull()
    expect(loadingSection?.textContent).toContain('Loading verified invoice records…')

    // CSV button must NOT be rendered during loading
    expect(hasCsvButton(container!)).toBe(false)
  })

  it('renders explicit error alert on DB rejection, provides retry, and disables CSV export', async () => {
    mockState.reportPromise = Promise.reject(new Error('PostgreSQL connection timeout'))

    await act(async () => {
      root!.render(
        <MemoryRouter>
          <SalesVatReports />
        </MemoryRouter>,
      )
    })

    const alert = container!.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    expect(alert?.textContent).toContain('Sales/VAT report unavailable')
    expect(alert?.textContent).toContain('PostgreSQL connection timeout')

    // Must show retry button
    const retryBtn = alert?.querySelector('button')
    expect(retryBtn).not.toBeNull()
    expect(retryBtn?.textContent).toBe('Retry')

    // Never show fictional or mock totals
    expect(container!.textContent).not.toContain('5,452,250')
    expect(hasCsvButton(container!)).toBe(false)
  })

  it('renders genuine empty state when 0 invoices exist, omitting CSV button', async () => {
    mockState.reportPromise = Promise.resolve(makeMockReport(0))

    await act(async () => {
      root!.render(
        <MemoryRouter>
          <SalesVatReports />
        </MemoryRouter>,
      )
    })

    const status = container!.querySelector('[role="status"]')
    expect(status).not.toBeNull()
    expect(status?.textContent).toContain('No invoices found for this period')
    expect(status?.textContent).toContain('There are no issued invoices recorded for the selected date range')

    // No figures or CSV button
    expect(hasCsvButton(container!)).toBe(false)
    expect(container!.textContent).not.toContain('5,452,250')
  })

  it('renders demo mode notice banner when IS_MOCK is true', async () => {
    mockState.isMock = true
    mockState.reportPromise = Promise.resolve(makeMockReport(1))

    await act(async () => {
      root!.render(
        <MemoryRouter>
          <SalesVatReports />
        </MemoryRouter>,
      )
    })

    const note = container!.querySelector('[role="note"]')
    expect(note).not.toBeNull()
    expect(note?.textContent).toContain('Demo Data Active')
    expect(note?.textContent).toContain('sample/demo data generated for offline demonstration')
  })

  it('renders verified invoice data, displays statutory disclaimers, and enables CSV export', async () => {
    mockState.reportPromise = Promise.resolve(makeMockReport(1))

    await act(async () => {
      root!.render(
        <MemoryRouter>
          <SalesVatReports />
        </MemoryRouter>,
      )
    })

    // No loading or error
    expect(container!.querySelector('[role="alert"]')).toBeNull()

    // Verified data metrics rendered
    expect(container!.textContent).toContain('INV-2083-001')
    expect(container!.textContent).toContain('Alpha Cinema')

    // Statutory review disclaimer rendered
    expect(container!.textContent).toContain('Internal review figures only. Not a statutory filing receipt.')

    // CSV export button enabled
    expect(hasCsvButton(container!)).toBe(true)
  })
})
