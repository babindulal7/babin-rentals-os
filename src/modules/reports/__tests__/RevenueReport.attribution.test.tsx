// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RevenueReport from '../RevenueReport'
import { getIssuedRevenueTrend, type IssuedRevenueReport } from '../../../lib/queries/reportRevenueTrend'
import { rupees } from '../../../lib/money'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true
vi.mock('../../../lib/auth', () => ({ useAuth: () => ({ user: { id: 'actor', name: 'Reviewer', role: 'Owner' } }) }))
vi.mock('../../../lib/device', () => ({ useViewport: () => 'desktop' }))
vi.mock('../../../lib/exportAudit', () => ({ recordExport: vi.fn(async () => {}) }))
vi.mock('../../../lib/queries/reportRevenueTrend', () => ({ getIssuedRevenueTrend: vi.fn() }))

let root: Root
let host: HTMLDivElement

function answer(fromAd: string, toAd: string): IssuedRevenueReport {
  const amount = rupees(100_000)
  return {
    fromAd,
    toAd,
    issuedCount: 2,
    totalPaisa: amount,
    months: [{ periodStartUtc: `${fromAd.slice(0, 7)}-01T00:00:00Z`, label: 'Current month', amountPaisa: amount, invoiceCount: 2 }],
    creditReconciliation: {
      voidedInvoiceCount: 0,
      voidedTaxablePaisa: rupees(0),
      creditNoteCount: 0,
      creditNoteAmountPaisa: rupees(0),
      paidVoidMismatchCount: 0,
      activeInvoiceCreditNoteCount: 0,
    },
  }
}

async function flush() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
  }
}

beforeEach(() => {
  vi.mocked(getIssuedRevenueTrend).mockReset().mockImplementation(async (from, to) => answer(from, to))
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.restoreAllMocks()
})

describe('Revenue report disclosure', () => {
  it('says that category and project revenue figures are not shown until their attribution is verified', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <RevenueReport />
        </MemoryRouter>,
      )
    })
    await flush()

    expect(host.textContent).toContain('Category and project revenue figures are not shown until their attribution is verified.')
    expect(host.textContent).not.toContain('hardcoded')
    expect(host.textContent).not.toContain('Previously')
  })
})
