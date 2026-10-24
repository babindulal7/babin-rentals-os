// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import RevenueReport from '../RevenueReport'
import type { IssuedRevenueReport } from '../../../lib/queries/reportRevenueTrend'
import type { Paisa } from '../../../lib/money'

const mockUser = {
  role: 'Owner',
}

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: mockUser }),
}))

const MOCK_REVENUE_REPORT: IssuedRevenueReport = {
  totalPaisa: 52500000 as Paisa, // Rs 5,25,000
  issuedCount: 13,
  creditReconciliation: {
    voidedInvoiceCount: 2,
    voidedTaxablePaisa: 4500000 as Paisa, // Rs 45,000
    creditNoteCount: 1,
    creditNoteAmountPaisa: 1200000 as Paisa, // Rs 12,000
    paidVoidMismatchCount: 0,
    activeInvoiceCreditNoteCount: 0,
  },
  months: [
    {
      periodStartUtc: '2026-08-01T00:00:00Z',
      label: 'Aug 2026',
      amountPaisa: 15000000 as Paisa,
      invoiceCount: 4,
    },
    {
      periodStartUtc: '2026-09-01T00:00:00Z',
      label: 'Sep 2026',
      amountPaisa: 28000000 as Paisa,
      invoiceCount: 7,
    },
    {
      periodStartUtc: '2026-10-01T00:00:00Z',
      label: 'Oct 2026',
      amountPaisa: 9500000 as Paisa,
      invoiceCount: 2,
    },
  ],
}

vi.mock('../../../lib/queries/reportRevenueTrend', () => ({
  getIssuedRevenueTrend: vi.fn(async () => MOCK_REVENUE_REPORT),
}))

// Mock Recharts ResponsiveContainer to avoid jsdom 0-size measurement issues
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts')
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div className="recharts-responsive-container" style={{ width: 800, height: 280 }}>
        {children}
      </div>
    ),
  }
})

describe('RevenueReport — shadcn/ui composition & Recharts AreaChart', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    mockUser.role = 'Owner'
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  it('renders KPI strip with Taxable revenue, Issued invoices, and Average invoice', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <RevenueReport />
        </MemoryRouter>,
      )
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })

    const text = container.textContent ?? ''
    expect(text).toContain('Revenue Reports')
    expect(text).toContain('Taxable revenue')
    expect(text).toContain('Rs 5,25,000')
    expect(text).toContain('Issued invoices')
    expect(text).toContain('13')
    expect(text).toContain('Average invoice')
    expect(text).toContain('Rs 40,384.62') // 52500000 / 13 = 4038461.538 paisa rounded -> 4038462 paisa = Rs 40,384.62
    expect(text).toContain('Excluded voids')
    expect(text).toContain('Rs 45,000')
  })

  it('renders ReportChartCard with exact basis, source metadata and credit reconciliation', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <RevenueReport />
        </MemoryRouter>,
      )
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })

    const text = container.textContent ?? ''
    expect(text).toContain('Monthly issued invoice revenue')
    expect(text).toContain('Finance · issued invoices')
    expect(text).toContain('Actual taxable invoice amounts before VAT')
    expect(text).toContain('Credit-note reconciliation')
    expect(text).toContain('No paid-void credit mismatches found')
  })

  it('provides accessible data table toggleable with 44px hit area', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <RevenueReport />
        </MemoryRouter>,
      )
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })

    const tableToggleBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('View as table'),
    )
    expect(tableToggleBtn).toBeDefined()

    // 44px hit area check
    const minHeight = tableToggleBtn?.style.minHeight
    expect(minHeight === 'var(--tap, 44px)' || minHeight === '44px').toBe(true)

    // Toggle table
    await act(async () => {
      tableToggleBtn?.click()
    })

    const table = container.querySelector('table')
    expect(table).not.toBeNull()
    const tableText = table?.textContent ?? ''
    expect(tableText).toContain('Aug 2026')
    expect(tableText).toContain('Rs 1,50,000')
    expect(tableText).toContain('Sep 2026')
    expect(tableText).toContain('Rs 2,80,000')
  })

  it('enforces money-blind role restriction (Warehouse sees no financial data)', async () => {
    mockUser.role = 'Warehouse'

    await act(async () => {
      root.render(
        <MemoryRouter>
          <RevenueReport />
        </MemoryRouter>,
      )
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })

    const text = container.textContent ?? ''
    expect(text).toContain('Financial reports are restricted')
    expect(text).not.toContain('Rs 5,25,000')
    expect(text).not.toContain('Monthly issued invoice revenue')
  })
})
