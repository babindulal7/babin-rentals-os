// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { OperationsWorkspaceProvider } from '../../operations/OperationsWorkspaceContext'
import Today from '../Today'

// @ts-expect-error test act environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../../../lib/queries/useList', () => ({
  useList: () => ({
    rows: [],
    loading: false,
    error: null,
    isEmpty: true,
    isFiltered: false,
    total: 0,
    refetch: () => {},
    lastFetchedAt: new Date(),
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

describe('Today Workbar & Preset Alignment — Global Shell Phase 2', () => {
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

  it('renders preset dispatch period buttons with WAI-ARIA roving focus (tabIndex=0 for active, tabIndex=-1 for inactive)', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/today']}>
          <OperationsWorkspaceProvider>
            <Today />
          </OperationsWorkspaceProvider>
        </MemoryRouter>,
      )
    })

    const tablist = container.querySelector('.dispatch-toolbar__presets')
    expect(tablist).not.toBeNull()
    expect(tablist?.getAttribute('role')).toBe('tablist')
    expect(tablist?.getAttribute('aria-label')).toBe('Preset dispatch periods')

    const todayTab = container.querySelector('#dispatch-preset-tab-today')
    expect(todayTab).not.toBeNull()
    expect(todayTab?.getAttribute('role')).toBe('tab')
    expect(todayTab?.getAttribute('tabindex')).toBe('0')
    expect(todayTab?.getAttribute('aria-selected')).toBe('true')

    const tomorrowTab = container.querySelector('#dispatch-preset-tab-tomorrow')
    expect(tomorrowTab).not.toBeNull()
    expect(tomorrowTab?.getAttribute('role')).toBe('tab')
    expect(tomorrowTab?.getAttribute('tabindex')).toBe('-1')
    expect(tomorrowTab?.getAttribute('aria-selected')).toBe('false')

    const next7Tab = container.querySelector('#dispatch-preset-tab-next-7-days')
    expect(next7Tab).not.toBeNull()
    expect(next7Tab?.getAttribute('role')).toBe('tab')
    expect(next7Tab?.getAttribute('tabindex')).toBe('-1')
    expect(next7Tab?.getAttribute('aria-selected')).toBe('false')
  })

  it('supports roving keyboard navigation across preset dispatch periods via Arrow keys and Home/End', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/today']}>
          <OperationsWorkspaceProvider>
            <Today />
          </OperationsWorkspaceProvider>
        </MemoryRouter>,
      )
    })

    const tablist = container.querySelector('.dispatch-toolbar__presets') as HTMLElement
    expect(tablist).not.toBeNull()

    // 1. Press ArrowRight -> moves to Tomorrow
    await act(async () => {
      tablist.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
      )
    })

    const tomorrowTab = container.querySelector('#dispatch-preset-tab-tomorrow')
    expect(tomorrowTab?.getAttribute('tabindex')).toBe('0')
    expect(tomorrowTab?.getAttribute('aria-selected')).toBe('true')

    // 2. Press End -> jumps to Next 7 Days
    await act(async () => {
      tablist.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }),
      )
    })

    const next7Tab = container.querySelector('#dispatch-preset-tab-next-7-days')
    expect(next7Tab?.getAttribute('tabindex')).toBe('0')
    expect(next7Tab?.getAttribute('aria-selected')).toBe('true')

    // 3. Press Home -> jumps back to Today
    await act(async () => {
      tablist.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }),
      )
    })

    const todayTab = container.querySelector('#dispatch-preset-tab-today')
    expect(todayTab?.getAttribute('tabindex')).toBe('0')
    expect(todayTab?.getAttribute('aria-selected')).toBe('true')
  })

  it('enforces minHeight >= 44px on all preset dispatch buttons', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/today']}>
          <OperationsWorkspaceProvider>
            <Today />
          </OperationsWorkspaceProvider>
        </MemoryRouter>,
      )
    })

    const presetButtons = container.querySelectorAll<HTMLElement>('.dispatch-toolbar__presets button')
    expect(presetButtons.length).toBe(3)

    for (const btn of presetButtons) {
      const minH = btn.style.minHeight
      const clearsFloor =
        minH === 'var(--tap, 44px)' ||
        minH === 'var(--tap)' ||
        minH === '44px' ||
        parseInt(minH, 10) >= 44
      expect(clearsFloor).toBe(true)
    }
  })
})
