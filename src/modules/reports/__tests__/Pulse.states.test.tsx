// @vitest-environment jsdom
/**
 * Pulse's five states, driven from the real read (`getPulseLiveSummary`)
 * rather than from props — the earlier attempt (d7ca3bc) took `loading` and
 * `error` as props nothing in the app ever passed, so the states existed only
 * in its own test.
 *
 * The read is replaced with a controllable promise; everything else in
 * `lib/queries/pulse` (the period ledger) is the real module.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { SystemRole } from '../../../types/database'
import type { PulseLiveSummary } from '../../../lib/queries/pulse'
import { OFFLINE_REASON } from '../../../lib/queries/useLoad'
import { rupees } from '../../../lib/money'

const state = vi.hoisted(() => ({
  role: 'Owner' as SystemRole,
  mock: true,
  read: (() => Promise.resolve(null)) as () => Promise<unknown>,
}))

vi.mock('../../../lib/supabase', () => ({
  get IS_MOCK() {
    return state.mock
  },
  supabase: {},
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u-1', name: 'Test User', role: state.role } }),
}))

vi.mock('../../../lib/queries/pulse', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/queries/pulse')>()
  return { ...actual, getPulseLiveSummary: vi.fn(() => state.read()) }
})

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

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { default: Pulse } = await import('../Pulse')
const { getPulseLiveSummary } = await import('../../../lib/queries/pulse')

const SUMMARY: PulseLiveSummary = {
  bookingCount: 12,
  activeBookings: 3,
  invoicedTotal: rupees(1000),
  collectedTotal: rupees(500),
  inventoryUnitsCount: 40,
}

let container: HTMLDivElement
let root: Root

async function render() {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <Pulse />
      </MemoryRouter>,
    )
  })
}

const text = () => container.textContent ?? ''
const retryButton = () => Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Retry')

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  state.role = 'Owner'
  state.mock = true
  state.read = () => Promise.resolve(SUMMARY)
  vi.mocked(getPulseLiveSummary).mockClear()
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('Pulse — five states', () => {
  it('Loading: draws the KPI skeleton, not figures, while the read is in flight', async () => {
    state.read = () => new Promise(() => {})
    await render()
    expect(text()).toContain('Loading the business pulse…')
    expect(container.querySelector('[aria-label="Business pulse"]')).toBeNull()
  })

  it('Error: a failing query draws the inline banner with Retry, and Retry re-reads', async () => {
    state.read = () => Promise.reject(new Error('getPulseLiveSummary failed on bookings: 500 Internal Server Error'))
    await render()
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
    expect(text()).toContain('Could not load the business pulse')
    expect(text()).toContain('500 Internal Server Error')
    expect(container.querySelector('[aria-label="Business pulse"]')).toBeNull()

    state.read = () => Promise.resolve(SUMMARY)
    await act(async () => retryButton()?.click())
    expect(getPulseLiveSummary).toHaveBeenCalledTimes(2)
    expect(text()).not.toContain('Could not load the business pulse')
    expect(container.querySelector('[aria-label="Business pulse"]')).not.toBeNull()
  })

  it('Offline: a failure while offline says so, instead of the raw fetch error', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false })
    state.read = () => Promise.reject(new TypeError('Failed to fetch'))
    await render()
    expect(text()).toContain(OFFLINE_REASON)
    expect(text()).not.toContain('Failed to fetch')
    expect(retryButton()).toBeDefined()
  })

  it('Empty (nothing yet): no bookings and no units is the first-run state, with its one action', async () => {
    state.read = () => Promise.resolve({ ...SUMMARY, bookingCount: 0, activeBookings: 0, inventoryUnitsCount: 0 })
    await render()
    expect(text()).toContain('Nothing recorded yet')
    expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent === 'New rental')).toBe(true)
    expect(container.querySelector('[aria-label="Business pulse"]')).toBeNull()
  })

  it('Restricted: a Client session is refused, and the read is never sent', async () => {
    state.role = 'Client'
    await render()
    expect(text()).toContain('Access restricted')
    expect(text()).toContain('Requires Staff')
    expect(getPulseLiveSummary).not.toHaveBeenCalled()
  })

  it('Restricted (money): a money-blind role gets no rupee figure anywhere on the page', async () => {
    state.role = 'Warehouse'
    await render()
    expect(container.querySelector('[aria-label="Business pulse"]')).not.toBeNull()
    expect(text()).toContain('Equipment utilization')
    expect(text()).not.toContain('Rs ')
    expect(text()).not.toMatch(/\bRevenue\b.*\bRs\b/)
  })

  it('Ready: a money role sees the four cards once the read lands', async () => {
    await render()
    const cards = container.querySelector('[aria-label="Business pulse"]')
    expect(cards?.querySelectorAll('article')).toHaveLength(4)
    expect(text()).toContain('Rs ')
  })

  it('Live build: the same ladder guards the untracked cards', async () => {
    state.mock = false
    state.read = () => Promise.reject(new Error('JWT expired'))
    await render()
    expect(text()).toContain('Could not load the business pulse')
    expect(text()).not.toContain('Not tracked yet.')

    state.read = () => Promise.resolve(SUMMARY)
    await act(async () => retryButton()?.click())
    expect(text()).toContain('Not tracked yet.')
  })
})
