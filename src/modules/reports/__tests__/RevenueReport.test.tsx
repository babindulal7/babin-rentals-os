// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import RevenueReport from '../RevenueReport'
import { rupees } from '../../../lib/money'
import type { IssuedRevenueReport } from '../../../lib/queries/reportRevenueTrend'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mockRole = 'Owner'

vi.mock('../../../lib/supabase', () => {
  const createQueryBuilder = (): any => {
    const builder: any = {
      eq: () => builder,
      neq: () => builder,
      is: () => builder,
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      range: () => builder,
      single: async () => ({ data: null, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
      catch: (reject: any) => Promise.resolve({ data: [], error: null }).catch(reject),
    }
    return builder
  }

  return {
    IS_MOCK: true,
    newClientUuid: () => '11111111-1111-4111-8111-111111111111',
    supabase: {
      from: () => ({
        select: () => createQueryBuilder(),
      }),
    },
  }
})

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Test User', role: mockRole },
    loading: false,
  }),
}))

const mockReportData: IssuedRevenueReport = {
  months: [
    { periodStartUtc: '2026-07-01T00:00:00.000Z', label: '2026-07', amountPaisa: rupees(200000), invoiceCount: 10 },
    { periodStartUtc: '2026-08-01T00:00:00.000Z', label: '2026-08', amountPaisa: rupees(300000), invoiceCount: 15 },
  ],
  totalPaisa: rupees(500000),
  issuedCount: 25,
  fromAd: '2026-07-01',
  toAd: '2026-08-31',
  creditReconciliation: {
    creditNoteCount: 2,
    creditNoteAmountPaisa: rupees(40000),
    voidedTaxablePaisa: rupees(25000),
    voidedInvoiceCount: 1,
    paidVoidMismatchCount: 0,
    activeInvoiceCreditNoteCount: 0,
  },
}

let mockTrendFn = vi.fn().mockResolvedValue(mockReportData)

vi.mock('../../../lib/queries/reportRevenueTrend', () => ({
  getIssuedRevenueTrend: (from: string, to: string) => mockTrendFn(from, to),
}))

function renderReport() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(
      <MemoryRouter>
        <RevenueReport />
      </MemoryRouter>
    )
  })
  return {
    host,
    unmount: () => {
      act(() => root.unmount())
      host.remove()
    },
  }
}

async function waitForCondition(fn: () => void | Promise<void>, timeoutMs = 2000) {
  const start = Date.now()
  while (true) {
    try {
      await fn()
      return
    } catch (e) {
      if (Date.now() - start > timeoutMs) throw e
      await act(async () => {
        await new Promise(r => setTimeout(r, 20))
      })
    }
  }
}

describe('RevenueReport — Vertical Slice with RBAC & Interactive KPIs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRole = 'Owner'
    mockTrendFn = vi.fn().mockResolvedValue(mockReportData)
  })

  it('restricts money-blind roles (Warehouse) and displays zero financial cards or figures', async () => {
    mockRole = 'Warehouse'
    const { host, unmount } = renderReport()

    expect(host.textContent).toContain('Access restricted')
    expect(host.textContent).toContain('Revenue intelligence is restricted to Owner, Admin, Manager and Accounts.')

    // Must never leak financial cards or query data
    expect(host.querySelector('.analytics-kpi-grid')).toBeNull()
    expect(host.textContent).not.toContain('Issued Taxable Revenue')
    expect(mockTrendFn).not.toHaveBeenCalled()

    unmount()
  })

  it('renders interactive KPI cards and trend chart for executive roles (Owner)', async () => {
    mockRole = 'Owner'
    const { host, unmount } = renderReport()

    // Wait for async fetch to populate report
    await waitForCondition(() => {
      expect(host.querySelector('.analytics-kpi-card')).not.toBeNull()
    })

    // Check all 4 KPI cards
    const labels = Array.from(host.querySelectorAll('.analytics-kpi-card__label')).map(el => el.textContent)
    expect(labels).toContain('Issued Taxable Revenue')
    expect(labels).toContain('Issued Invoices')
    expect(labels).toContain('Avg Taxable / Invoice')
    expect(labels).toContain('Voided Taxable (Excluded)')

    // Check figures
    expect(host.textContent).toContain('25') // issued invoices count
    expect(host.textContent).toContain('1 voided invoice(s) omitted')

    // Check interactive chart is present
    expect(host.querySelector('svg[aria-label*="Issued taxable revenue"]')).not.toBeNull()

    // Credit reconciliation present
    expect(host.textContent).toContain('Credit-note reconciliation')

    unmount()
  })

  it('displays graceful error state with retry when data fetch fails', async () => {
    mockTrendFn = vi.fn().mockRejectedValue(new Error('Postgres connection terminated'))
    const { host, unmount } = renderReport()

    await waitForCondition(() => {
      expect(host.textContent).toContain('Analytics unavailable')
      expect(host.textContent).toContain('Postgres connection terminated')
    })

    const retryBtn = host.querySelector('.analytics-state-card--error button')
    expect(retryBtn?.textContent).toContain('Retry')

    unmount()
  })
})
