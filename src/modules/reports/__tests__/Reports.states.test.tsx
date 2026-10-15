// @vitest-environment jsdom
/**
 * Phase 6 states for the data-backed secondary views converted to `useLoad`:
 * Cases Report, Inventory Reports, Expense Reports and the admin Activity Log.
 * Each read is replaced by a controllable promise; a failing query must draw
 * the inline banner with Retry, and a restricted role must not send the read.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { SystemRole } from '../../../types/database'

const state = vi.hoisted(() => ({
  role: 'Owner' as SystemRole,
  cases: (() => Promise.resolve({ rows: [], total: 0 })) as () => Promise<unknown>,
  inventory: (() => Promise.resolve(null)) as () => Promise<unknown>,
  expenses: (() => Promise.resolve(null)) as () => Promise<unknown>,
  activity: (() => Promise.resolve({ rows: [], total: 0 })) as () => Promise<unknown>,
}))

vi.mock('../../../lib/supabase', () => ({ IS_MOCK: true, supabase: {} }))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u-1', name: 'Test User', role: state.role } }),
}))
vi.mock('../../../lib/queries/cases', async (orig) => ({
  ...(await orig<typeof import('../../../lib/queries/cases')>()),
  listCases: vi.fn(() => state.cases()),
}))
vi.mock('../../../lib/queries/inventoryReports', async (orig) => ({
  ...(await orig<typeof import('../../../lib/queries/inventoryReports')>()),
  getInventoryReportSummary: vi.fn(() => state.inventory()),
}))
vi.mock('../../../lib/queries/expenseReports', async (orig) => ({
  ...(await orig<typeof import('../../../lib/queries/expenseReports')>()),
  getExpenseReportsSummary: vi.fn(() => state.expenses()),
}))
vi.mock('../../../lib/queries/activity', async (orig) => ({
  ...(await orig<typeof import('../../../lib/queries/activity')>()),
  listActivityEvents: vi.fn(() => state.activity()),
}))
vi.mock('../ShortageSection', () => ({ default: () => null }))

window.matchMedia = ((q: string) => ({
  matches: false, media: q, onchange: null,
  addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { default: CasesReport } = await import('../CasesReport')
const { default: InventoryReports } = await import('../InventoryReports')
const { default: ExpenseReports } = await import('../ExpenseReports')
const { default: ActivityLog } = await import('../../admin/ActivityLog')
const { getExpenseReportsSummary } = await import('../../../lib/queries/expenseReports')
const { summariseStatusCounts, INVENTORY_STATES } = await import('../../../lib/queries/inventoryReports')

let container: HTMLDivElement
let root: Root
async function render(el: React.ReactElement) {
  await act(async () => root.render(<MemoryRouter>{el}</MemoryRouter>))
}
const text = () => container.textContent ?? ''
const retry = () => [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Retry')

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  state.role = 'Owner'
  vi.mocked(getExpenseReportsSummary).mockClear()
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const fail = () => Promise.reject(new Error('500 Internal Server Error'))

describe('Cases Report', () => {
  it('loading, then a failing query draws banner + Retry, and Retry recovers to nothing-yet', async () => {
    state.cases = () => new Promise(() => {})
    await render(<CasesReport />)
    expect(text()).toContain('Loading cases…')

    act(() => root.unmount())
    root = createRoot(container)
    state.cases = fail
    await render(<CasesReport />)
    expect(text()).toContain('Could not load cases')
    expect(text()).toContain('500 Internal Server Error')

    state.cases = () => Promise.resolve({ rows: [], total: 0 })
    await act(async () => retry()?.click())
    expect(text()).toContain('No incident cases yet')
  })
})

describe('Inventory Reports', () => {
  it('a failing count read draws banner + Retry, never "0 units"', async () => {
    state.inventory = fail
    await render(<InventoryReports />)
    expect(text()).toContain('Could not load unit counts')
    expect(retry()).toBeDefined()
    expect(container.querySelector('[aria-label="Units by status"]')).toBeNull()
  })

  it('zero units is the nothing-yet state', async () => {
    state.inventory = () => Promise.resolve(summariseStatusCounts(INVENTORY_STATES.map((status) => ({ status, count: 0 }))))
    await render(<InventoryReports />)
    expect(text()).toContain('No units recorded yet')
  })
})

describe('Expense Reports', () => {
  it('a failing query draws banner + Retry instead of "No expenses recorded"', async () => {
    state.expenses = fail
    await render(<ExpenseReports />)
    expect(text()).toContain('Could not load expenses')
    expect(text()).not.toContain('No expenses recorded')
    expect(retry()).toBeDefined()
  })

  it('a money-blind role is refused and the read is never sent', async () => {
    state.role = 'Warehouse'
    await render(<ExpenseReports />)
    expect(text()).toContain('Access restricted')
    expect(getExpenseReportsSummary).not.toHaveBeenCalled()
    expect(text()).not.toContain('Rs ')
  })
})

describe('Activity Log', () => {
  it('a failing query draws banner + Retry, not the filtered empty', async () => {
    state.activity = fail
    await render(<ActivityLog />)
    expect(text()).toContain('Could not load activity')
    expect(text()).not.toContain('No activity matches this filter')
  })

  it('an empty log is nothing-yet, not "matches this filter"', async () => {
    state.activity = () => Promise.resolve({ rows: [], total: 0 })
    await render(<ActivityLog />)
    expect(text()).toContain('No activity recorded yet')
    expect(text()).not.toContain('No activity matches this filter')
  })
})
