// @vitest-environment jsdom
import { act } from 'react'
import { Blob as NodeBlob } from 'node:buffer'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RevenueReport from '../RevenueReport'
import { getIssuedRevenueTrend, type IssuedRevenueReport } from '../../../lib/queries/reportRevenueTrend'
import { rupees } from '../../../lib/money'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true
const state = vi.hoisted(() => ({ count: 0, voidOnly: false, failPrevious: false, role: 'Owner' }))
vi.mock('../../../lib/auth', () => ({ useAuth: () => ({ user: { id: 'actor', name: 'Reviewer', role: state.role } }) }))
vi.mock('../../../lib/device', () => ({ useViewport: () => 'desktop' }))
vi.mock('../../../lib/exportAudit', () => ({ recordExport: vi.fn(async () => {}) }))
vi.mock('../../../lib/queries/reportRevenueTrend', () => ({ getIssuedRevenueTrend: vi.fn() }))

let root: Root
let host: HTMLDivElement
let exported: NodeBlob | null
function answer(fromAd: string, toAd: string, previous: boolean): IssuedRevenueReport {
  const amount = rupees(previous ? 50_000 : 100_000)
  return {
    fromAd, toAd, issuedCount: state.voidOnly ? 0 : 2, totalPaisa: state.voidOnly ? rupees(0) : amount,
    months: state.voidOnly ? [] : [{ periodStartUtc: `${fromAd.slice(0, 7)}-01T00:00:00Z`, label: previous ? 'Previous month' : 'Current month', amountPaisa: amount, invoiceCount: 2 }],
    creditReconciliation: { voidedInvoiceCount: state.voidOnly ? 1 : 0, voidedTaxablePaisa: state.voidOnly ? rupees(2500) : rupees(0), creditNoteCount: 0, creditNoteAmountPaisa: rupees(0), paidVoidMismatchCount: state.voidOnly ? 1 : 0, activeInvoiceCreditNoteCount: 0 },
  }
}
async function render() {
  await act(async () => { root.render(<MemoryRouter><RevenueReport /></MemoryRouter>); await Promise.resolve() })
}
async function compare() {
  const control = host.querySelector('select[aria-label="Comparison"]') as HTMLSelectElement
  await act(async () => { control.value = 'previous'; control.dispatchEvent(new Event('change', { bubbles: true })); await Promise.resolve() })
}
beforeEach(() => {
  state.count = 0; state.voidOnly = false; state.failPrevious = false; state.role = 'Owner'
  vi.mocked(getIssuedRevenueTrend).mockReset().mockImplementation(async (from, to) => {
    state.count++
    if (state.failPrevious && state.count > 1) throw new Error('Previous source unavailable')
    return answer(from, to, state.count > 1)
  })
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  exported = null
  const OriginalURL = URL
  vi.stubGlobal('Blob', NodeBlob)
  vi.stubGlobal('URL', class extends OriginalURL {
    static createObjectURL(blob: unknown) { exported = blob as NodeBlob; return 'blob:report' }
    static revokeObjectURL() {}
  })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Revenue financial and comparison regressions', () => {
  it('labels its actual bounded default window instead of claiming All dates', async () => {
    await render()
    const range = host.querySelector<HTMLSelectElement>('select[aria-label="Date range"]')!
    expect(range.selectedOptions[0]?.textContent).toBe('Last 90 days')
    expect([...range.options].some(option => option.textContent === 'All dates')).toBe(false)
    const [from, to] = vi.mocked(getIssuedRevenueTrend).mock.calls[0]!
    expect(new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()).toBe(89 * 86_400_000)
  })
  it('keeps reconciliation and its warning visible in a void-only period', async () => {
    state.voidOnly = true
    await render()
    expect(host.textContent).toContain('Credit-note reconciliation')
    expect(host.textContent).toContain('Manual ledger review needed')
    expect(host.textContent).toContain('Rs 2,500')
    expect(host.textContent).not.toContain('No invoices issued in the last 90 days')
  })

  it('queries the actual previous window, labels the change and includes its exact values in CSV', async () => {
    await render()
    await compare()
    expect(getIssuedRevenueTrend).toHaveBeenCalledTimes(2)
    const calls = vi.mocked(getIssuedRevenueTrend).mock.calls
    const first = calls[0]!, second = calls[1]!
    expect(new Date(`${first[0]}T00:00:00Z`).getTime() - new Date(`${second[1]}T00:00:00Z`).getTime()).toBe(86_400_000)
    expect(new Date(`${first[1]}T00:00:00Z`).getTime() - new Date(`${first[0]}T00:00:00Z`).getTime()).toBe(new Date(`${second[1]}T00:00:00Z`).getTime() - new Date(`${second[0]}T00:00:00Z`).getTime())
    expect(host.textContent).toContain('+Rs 50,000')
    expect(host.textContent).toContain(`${second[0]} to ${second[1]}`)
    expect(host.querySelector('[aria-label="Monthly invoice revenue details"]')?.textContent).toContain('Previous month')
    const csv = [...host.querySelectorAll('button')].find(button => button.textContent?.trim() === 'CSV')!
    await act(async () => csv.click())
    expect(exported).not.toBeNull()
    const text = await (exported as unknown as NodeBlob).text()
    expect(text).toContain('Previous date window')
    expect(text).toContain('Previous period monthly detail')
    expect(text).toContain('Previous month,Rs 50,000'.replace('Rs 50,000', '"Rs 50,000"'))
  })

  it('keeps current results but suppresses comparison deltas and export when the prior read fails', async () => {
    state.failPrevious = true
    await render(); await compare()
    expect(host.textContent).toContain('Previous period unavailable: Previous source unavailable')
    expect(host.textContent).toContain('Rs 1,00,000')
    expect(host.textContent).not.toContain('+Rs 50,000')
    expect([...host.querySelectorAll('button')].some(button => button.textContent?.trim() === 'CSV')).toBe(false)
  })
})
