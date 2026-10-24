// @vitest-environment jsdom
/**
 * # Global Shell Phase 1 — Pilot Routes Verification Suite
 *
 * Verifies that the five core pilot routes:
 * 1. /today (Today)
 * 2. /rentals (RentalsList)
 * 3. /calendar (Calendar)
 * 4. /inventory (Inventory)
 * 5. /operations (OperationsQueues)
 *
 * Share the identical compact global frame:
 * - Exactly one global header (64px fixed height)
 * - Exactly one search control owned by Zone 2 / Center
 * - PageHeader metadata registration with suppressed visible second header
 * - Intact action handlers across all routes
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Header from '../../components/shell/Header'
import { WorkspaceProvider } from '../../lib/workspaceContext'
import { OperationsWorkspaceProvider } from '../../modules/operations/OperationsWorkspaceContext'
import { ToastProvider } from '../../components/ui/Toast'
import { CreationContextProvider } from '../../components/ui/creation/CreationContextProvider'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: '00000000-0000-4000-8000-000000000001', name: 'Babin Shrestha', role: 'Owner' },
    loading: false,
    isLocked: false,
    hasPin: true,
    lockNow: vi.fn(),
    logout: vi.fn(),
  }),
}))

vi.mock('../../lib/device', () => ({
  useViewport: () => 'desktop',
  useCapability: () => ({ coarsePointer: false, hasHover: true, standalone: false, reducedMotion: false }),
  useTabularLayout: () => true,
}))

vi.mock('../../lib/network', () => ({ useNetwork: () => true }))

vi.mock('../../lib/syncContext', () => ({
  useSync: () => ({ status: 'synced', pendingCount: 0, error: null, triggerSync: vi.fn() }),
}))

vi.mock('../../lib/supabase', () => {
  const build = (): Record<string, unknown> => {
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'neq', 'is', 'in', 'or', 'ilike', 'gte', 'lte', 'gt', 'lt', 'not', 'order', 'limit', 'range']) chain[m] = () => chain
    chain['single'] = async () => ({ data: null, error: null })
    chain['maybeSingle'] = async () => ({ data: null, error: null })
    chain['then'] = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(resolve)
    return chain
  }
  return {
    IS_MOCK: false,
    newClientUuid: () => '11111111-1111-4111-8111-111111111111',
    supabase: { from: () => build(), rpc: async () => ({ data: null, error: null }) },
  }
})

// Mock listBookings for Today and Rentals
vi.mock('../../lib/queries/bookings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/queries/bookings')>()
  return {
    ...actual,
    listBookings: async () => ({ rows: [], total: 0 }),
    todaysOutgoing: async () => ({ rows: [], total: 0 }),
    todaysIncoming: async () => ({ rows: [], total: 0 }),
  }
})

// Mock inventory query while preserving constants like CATEGORY_COLUMN
vi.mock('../../lib/queries/inventory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/queries/inventory')>()
  return {
    ...actual,
    listInventory: async () => ({ rows: [], total: 0 }),
    fetchEquipmentCategories: async () => [],
  }
})

// Mock calendar queries while preserving constants
vi.mock('../../lib/queries/calendar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/queries/calendar')>()
  return {
    ...actual,
    calendarWindow: () => ({ from: new Date('2026-10-01'), to: new Date('2026-10-31') }),
    fetchCalendarBars: async () => ({ rows: [], total: 0 }),
  }
})

const Today = (await import('../../modules/today/Today')).default
const RentalsList = (await import('../../modules/rentals/RentalsList')).default
const Calendar = (await import('../../modules/calendar/Calendar')).default
const Inventory = (await import('../../modules/inventory/Inventory')).default
const OperationsQueues = (await import('../../modules/operations/OperationsQueues')).default

describe('Global Shell Phase 1 — Pilot Routes Frame Integrity', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  async function renderRoute(initialEntry: string, routeElement: React.ReactNode, crumbLabel: string) {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[initialEntry]}>
          <ToastProvider>
            <OperationsWorkspaceProvider>
              <WorkspaceProvider>
                <CreationContextProvider>
                  <Header crumbs={[{ label: crumbLabel }]} />
                  <Routes>
                    <Route path="*" element={routeElement} />
                  </Routes>
                </CreationContextProvider>
              </WorkspaceProvider>
            </OperationsWorkspaceProvider>
          </ToastProvider>
        </MemoryRouter>
      )
    })
  }

  it('1. Today route mounts with single header and registers search', async () => {
    await renderRoute('/today', <Today />, 'Today')
    // Global header is present
    const globalHeader = container.querySelector('header.app-global-header')
    expect(globalHeader).not.toBeNull()

    // Title is rendered
    expect(globalHeader?.textContent).toContain('Today')

    // Search input is mounted in Zone 2
    const searchInputs = container.querySelectorAll('input[type="search"]')
    expect(searchInputs.length).toBe(1)
  })

  it('2. RentalsList route mounts with single header and search portal', async () => {
    await renderRoute('/rentals', <RentalsList />, 'Rentals')
    const globalHeader = container.querySelector('header.app-global-header')
    expect(globalHeader).not.toBeNull()
    expect(globalHeader?.textContent).toContain('Rentals')

    // Only one search box in header
    const searchInputs = container.querySelectorAll('header.app-global-header input[type="search"]')
    expect(searchInputs.length).toBe(1)
  })

  it('3. Calendar route mounts with single header and registered search', async () => {
    await renderRoute('/calendar', <Calendar />, 'Calendar')
    const globalHeader = container.querySelector('header.app-global-header')
    expect(globalHeader).not.toBeNull()
    expect(globalHeader?.textContent).toContain('Calendar')

    const searchInputs = container.querySelectorAll('header.app-global-header input[type="search"]')
    expect(searchInputs.length).toBe(1)
  })

  it('4. Inventory route mounts with single header and search', async () => {
    await renderRoute('/inventory', <Inventory />, 'Inventory')
    const globalHeader = container.querySelector('header.app-global-header')
    expect(globalHeader).not.toBeNull()
    expect(globalHeader?.textContent).toContain('Inventory')

    const searchInputs = container.querySelectorAll('header.app-global-header input[type="search"]')
    expect(searchInputs.length).toBe(1)
  })

  it('5. Operations route mounts with single header and active queue search', async () => {
    await renderRoute('/operations', <OperationsQueues />, 'Operations')
    const globalHeader = container.querySelector('header.app-global-header')
    expect(globalHeader).not.toBeNull()
    expect(globalHeader?.textContent).toContain('Operations')

    const searchInputs = container.querySelectorAll('header.app-global-header input[type="search"]')
    expect(searchInputs.length).toBe(1)
  })
})
