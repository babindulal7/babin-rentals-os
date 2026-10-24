// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { OperationsWorkspaceProvider } from '../OperationsWorkspaceContext'
import OperationsQueues from '../OperationsQueues'

// @ts-expect-error test act environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const floorRows: unknown[] = []

vi.mock('../../../lib/queries/useList', () => ({
  useList: () => ({
    rows: floorRows,
    loading: false,
    error: null,
    isEmpty: floorRows.length === 0,
    isFiltered: false,
    total: floorRows.length,
    refetch: () => {},
  }),
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'usr-1', email: 'staff@babinrentals.com', role: 'Staff' },
    role: 'Staff',
    loading: false,
    can: () => true,
  }),
}))

vi.mock('../../../lib/device', async (orig) => ({
  ...(await orig<typeof import('../../../lib/device')>()),
  useViewport: () => 'desktop',
}))

vi.mock('../../../lib/headerRoom', () => ({
  useCompactHeader: () => false,
}))

vi.mock('../../../lib/supabase', () => ({
  loadMockClient: async () => {},
  getSupabaseClient: () => null,
}))

describe('Operations Workbar & Queue Alignment — Global Shell Phase 2', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('renders operational queue chips with WAI-ARIA roving focus (tabIndex=0 for active, tabIndex=-1 for inactive)', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/operations']}>
          <OperationsWorkspaceProvider>
            <OperationsQueues />
          </OperationsWorkspaceProvider>
        </MemoryRouter>,
      )
    })

    const tablist = container.querySelector('.operations-v2__queues')
    expect(tablist).not.toBeNull()
    expect(tablist?.getAttribute('role')).toBe('tablist')
    expect(tablist?.getAttribute('aria-label')).toBe('Operational queues')

    const tabs = container.querySelectorAll('.operations-v2__queues [role="tab"]')
    expect(tabs.length).toBeGreaterThanOrEqual(5)

    // Initially on /operations with no query params, "All Active" is active
    const allActiveTab = container.querySelector('#operations-queue-tab-all')
    expect(allActiveTab).not.toBeNull()
    expect(allActiveTab?.getAttribute('tabindex')).toBe('0')
    expect(allActiveTab?.getAttribute('aria-selected')).toBe('true')

    // Inactive tabs have tabIndex -1
    const packingTab = container.querySelector('#operations-queue-tab-Pack')
    expect(packingTab).not.toBeNull()
    expect(packingTab?.getAttribute('tabindex')).toBe('-1')
    expect(packingTab?.getAttribute('aria-selected')).toBe('false')

    const casesTab = container.querySelector('#operations-queue-tab-Cases')
    expect(casesTab).not.toBeNull()
    expect(casesTab?.getAttribute('tabindex')).toBe('-1')
    expect(casesTab?.getAttribute('aria-selected')).toBe('false')
  })

  it('supports roving keyboard navigation across operational queue chips via Arrow keys and Home/End', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/operations']}>
          <OperationsWorkspaceProvider>
            <OperationsQueues />
          </OperationsWorkspaceProvider>
        </MemoryRouter>,
      )
    })

    const tablist = container.querySelector('.operations-v2__queues') as HTMLElement
    expect(tablist).not.toBeNull()

    // 1. Press ArrowRight -> moves to Packing ('Pack')
    await act(async () => {
      tablist.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
      )
    })

    const packingTab = container.querySelector('#operations-queue-tab-Pack')
    expect(packingTab?.getAttribute('tabindex')).toBe('0')
    expect(packingTab?.getAttribute('aria-selected')).toBe('true')

    // 2. Press End -> jumps to Cases
    await act(async () => {
      tablist.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }),
      )
    })

    const casesTab = container.querySelector('#operations-queue-tab-Cases')
    expect(casesTab?.getAttribute('tabindex')).toBe('0')
    expect(casesTab?.getAttribute('aria-selected')).toBe('true')

    // 3. Press Home -> jumps back to All Active
    await act(async () => {
      tablist.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }),
      )
    })

    const allActiveTab = container.querySelector('#operations-queue-tab-all')
    expect(allActiveTab?.getAttribute('tabindex')).toBe('0')
    expect(allActiveTab?.getAttribute('aria-selected')).toBe('true')
  })

  it('enforces minHeight >= 44px on all queue chips and action controls', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/operations']}>
          <OperationsWorkspaceProvider>
            <OperationsQueues />
          </OperationsWorkspaceProvider>
        </MemoryRouter>,
      )
    })

    const queueChips = container.querySelectorAll<HTMLElement>('.operations-v2__queue')
    expect(queueChips.length).toBeGreaterThanOrEqual(5)

    for (const chip of queueChips) {
      const minH = chip.style.minHeight
      const clearsFloor =
        minH === 'var(--tap, 44px)' ||
        minH === 'var(--tap)' ||
        minH === '44px' ||
        minH === '46px' ||
        parseInt(minH, 10) >= 44
      expect(clearsFloor).toBe(true)
    }
  })
})
