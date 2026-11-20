// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RevenueReport from '../RevenueReport'
import { getEarliestIssueDay, getIssuedRevenueTrend, type IssuedRevenueReport } from '../../../lib/queries/reportRevenueTrend'
import { rupees } from '../../../lib/money'
import { businessDayAd } from '../../../lib/bs'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const state = vi.hoisted(() => ({ earliest: '2026-07-18' as string | null }))

vi.mock('../../../lib/auth', () => ({ useAuth: () => ({ user: { id: 'actor', name: 'Reviewer', role: 'Owner' } }) }))
vi.mock('../../../lib/device', () => ({ useViewport: () => 'desktop' }))
vi.mock('../../../lib/queries/reportRevenueTrend', () => ({
  getIssuedRevenueTrend: vi.fn(),
  getEarliestIssueDay: vi.fn(),
}))

let host: HTMLDivElement
let root: Root

function answer(fromAd: string, toAd: string): IssuedRevenueReport {
  if (state.earliest === null) {
    return {
      fromAd,
      toAd,
      issuedCount: 0,
      totalPaisa: rupees(0),
      months: [],
      creditReconciliation: { voidedInvoiceCount: 0, voidedTaxablePaisa: rupees(0), creditNoteCount: 0, creditNoteAmountPaisa: rupees(0), paidVoidMismatchCount: 0, activeInvoiceCreditNoteCount: 0 },
    } as unknown as IssuedRevenueReport
  }
  return {
    fromAd,
    toAd,
    issuedCount: 1,
    totalPaisa: rupees(100_000),
    months: [{ periodStartUtc: `${fromAd.slice(0, 7)}-01T00:00:00Z`, label: 'Only month', amountPaisa: rupees(100_000), invoiceCount: 1, startDay: fromAd, endDay: toAd, coverage: 'full', longLabel: 'July 2026' }],
    creditReconciliation: { voidedInvoiceCount: 0, voidedTaxablePaisa: rupees(0), creditNoteCount: 0, creditNoteAmountPaisa: rupees(0), paidVoidMismatchCount: 0, activeInvoiceCreditNoteCount: 0 },
  } as unknown as IssuedRevenueReport
}

async function render() {
  await act(async () => {
    root.render(<MemoryRouter><RevenueReport /></MemoryRouter>)
    await Promise.resolve()
  })
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}

async function pickRange(value: string) {
  const control = host.querySelector<HTMLSelectElement>('select[aria-label="Date range"]')!
  await act(async () => {
    control.value = value
    control.dispatchEvent(new Event('change', { bubbles: true }))
    await Promise.resolve()
  })
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}

const text = () => host.textContent ?? ''

beforeEach(() => {
  state.earliest = '2026-07-18'
  vi.mocked(getEarliestIssueDay).mockReset().mockImplementation(async () => state.earliest)
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

describe('Revenue report — All dates (R19-1)', () => {
  it('runs from the 1st of the first issued invoice\'s month to today, and labels that window', async () => {
    await render()
    await pickRange('all')
    expect(getEarliestIssueDay).toHaveBeenCalled()
    const [from, to] = vi.mocked(getIssuedRevenueTrend).mock.lastCall!
    expect(from).toBe('2026-07-01')
    expect(to).toBe(businessDayAd())
    expect(text()).toContain(`2026-07-01 to ${businessDayAd()}`)
    const range = host.querySelector<HTMLSelectElement>('select[aria-label="Date range"]')!
    expect(range.selectedOptions[0]?.textContent).toBe('All dates')
  })

  it('offers no comparison control under All dates', async () => {
    await render()
    await pickRange('all')
    expect(host.querySelector('select[aria-label="Comparison"]')).toBeNull()
  })

  it('refuses an all-dates window over 24 months, and reads nothing', async () => {
    state.earliest = '2023-01-10'
    await render()
    await pickRange('all')
    expect(text()).toMatch(/All dates covers \d+ calendar months; the trend reads up to 24 at a time/)
    const reads = vi.mocked(getIssuedRevenueTrend).mock.calls.filter(([from]) => from === '2023-01-01')
    expect(reads).toHaveLength(0)
  })

  it('Clear filters goes back to the 90-day window, not to All dates', async () => {
    // A bounded window with nothing in it is a filtered empty state, which is the only place Clear filters appears.
    state.earliest = null
    await render()
    await pickRange('last7')
    const clear = [...host.querySelectorAll('button')].find((b) => /clear filters/i.test(b.textContent ?? ''))
    expect(clear).toBeDefined()
    await act(async () => clear!.click())
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    const range = host.querySelector<HTMLSelectElement>('select[aria-label="Date range"]')!
    expect(range.selectedOptions[0]?.textContent).toBe('Last 90 days')
  })

  it('with no issued invoices says so under All dates, not "the last 90 days"', async () => {
    state.earliest = null
    await render()
    await pickRange('all')
    expect(text()).toContain('No invoices issued yet')
    expect(text()).not.toContain('No invoices issued in the last 90 days')
  })
})
