// @vitest-environment jsdom
/**
 * R2-D2, audit key sweep-B-inventory-11 (remainder). The Working Capital position
 * says what is missing in plain staff wording and names no table or view.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { rupees } from '../../../lib/money'
import type { WorkingCapitalSummary } from '../../../lib/queries/liquidity'
import WorkingCapitalReport from '../WorkingCapitalReport'

const state = vi.hoisted(() => ({ summary: null as WorkingCapitalSummary | null }))

vi.mock('../../../lib/supabase', () => ({ IS_MOCK: true, supabase: {} }))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u-1', name: 'Test User', role: 'Owner' } }),
}))
vi.mock('../../../lib/queries/liquidity', () => ({
  getWorkingCapitalSummary: vi.fn(async () => state.summary),
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

window.matchMedia = ((q: string) => ({
  matches: false,
  media: q,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia

const SUMMARY: WorkingCapitalSummary = {
  receivables: rupees(125000),
  overdueReceivables: rupees(40000),
  ageing: [
    { label: '1–30 days', amount: rupees(40000), invoices: 2 },
    { label: 'Current', amount: rupees(85000), invoices: 3 },
  ],
  depositsHeld: rupees(15000),
  approvedUnpaidExpenses: rupees(5000),
  daysSalesOutstanding: 12,
  cash: null,
  workingCapital: null,
  currentRatio: null,
}

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
  }
  container?.remove()
  container = null
  root = null
})

describe('Working Capital position copy', () => {
  it('says plainly that supplier invoices are not recorded, and names no table or view', async () => {
    state.summary = SUMMARY
    await act(async () => {
      root!.render(
        <MemoryRouter>
          <WorkingCapitalReport />
        </MemoryRouter>,
      )
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const position = container?.querySelector('section[aria-label="Position"]')
    const positionText = position?.textContent ?? ''

    expect(positionText).toContain('Supplier payables')
    expect(positionText).toContain('No supplier invoices are recorded yet')
    expect(positionText).not.toMatch(/table|view/i)
  })
})
