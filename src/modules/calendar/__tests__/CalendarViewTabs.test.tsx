// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { WorkspaceProvider } from '../../../lib/workspaceContext'
import Calendar from '../Calendar'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

vi.mock('../../../lib/device', async (orig) => ({
  ...(await orig<typeof import('../../../lib/device')>()),
  useViewport: () => 'desktop' as const,
}))

vi.mock('../../../lib/moneyVisibility', () => ({
  useCanViewMoney: () => true,
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'usr-1', email: 'admin@babinrentals.com', role: 'admin' },
    role: 'admin',
    capabilities: [],
  }),
}))

vi.mock('../../../lib/queries/calendar', () => ({
  CALENDAR_BAR_KINDS: ['Reserved', 'On Rent'],
  calendarWindow: vi.fn().mockReturnValue({ dateRange: { column: 'pickup_at', fromAd: '2026-07-01', toAd: '2026-07-31' } }),
  fetchCalendarBars: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
  buildResourceTimeline: vi.fn().mockReturnValue([]),
  VIEWS: ['Month', 'Week', 'Timeline', 'Availability'],
  VIEWS_BY_WIDTH: {
    desktop: ['Month', 'Week', 'Timeline', 'Availability'],
    tablet: ['Month', 'Week'],
    phone: ['Month'],
  },
  DEFAULT_VIEW: 'Month',
  ROW_TYPES: ['All', 'Equipment', 'Crew', 'Vehicles'],
  ROWS: [],
  BAR_STYLE: {
    'Reserved': { bg: 'rgba(49,130,206,0.1)', fg: '#2b6cb0', line: '#3182ce', dash: false },
    'On Rent': { bg: 'rgba(72,187,120,0.1)', fg: '#22543d', line: '#38a169', dash: false },
  },
  BAR_KINDS: ['Reserved', 'On Rent'],
  SAVED_VIEWS: [],
  SAVED_VIEWS_NOT_AVAILABLE: 'Saved views not available',
  HOLIDAYS_NOT_TRACKED: 'Holidays not tracked',
  TODAY_SUMMARY: [],
  UPCOMING: [],
  UPCOMING_PERIOD: 'Next 7 days',
  railBookingCounts: vi.fn().mockResolvedValue({}),
  railInvoiceCounts: vi.fn().mockResolvedValue({}),
  QUICK_ACTIONS: [],
  EVENT_MARKERS: [],
  SHORTCUTS: [],
  EVENT_DETAIL: {},
  EVENT_ACTIONS: [],
  ZOOM_STEPS: [7, 14, 30],
  DEFAULT_ZOOM: 7,
  LAYERS: [],
  layerOf: vi.fn().mockReturnValue(null),
  adDay: (n: number) => new Date(Date.UTC(2026, 6, 22 + n)),
  dayDiff: () => 0,
  businessDayAd: () => '2026-07-22',
}))

vi.mock('../../../lib/queries/inventory', () => ({
  listInventory: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  getInventoryCategories: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../../lib/queries/useList', () => ({
  useList: vi.fn().mockReturnValue({ rows: [], total: 0, loading: false, error: null }),
}))

describe('Calendar View Tabs & Workbar Alignment — Phase 2', () => {
  let root: Root
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it('renders view tabs with WAI-ARIA roving focus (tabIndex=0 for active, tabIndex=-1 for inactive)', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <WorkspaceProvider>
            <Calendar />
          </WorkspaceProvider>
        </MemoryRouter>
      )
    })

    const viewTablist = container.querySelector('.calendar-view-tabs')
    expect(viewTablist).not.toBeNull()
    expect(viewTablist?.getAttribute('role')).toBe('tablist')

    const tabs = Array.from(viewTablist!.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    expect(tabs.length).toBe(4) // Month, Week, Timeline, Availability

    // Initial default view is Month
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true')
    expect(tabs[0]?.getAttribute('tabindex')).toBe('0')
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('false')
    expect(tabs[1]?.getAttribute('tabindex')).toBe('-1')
    expect(tabs[2]?.getAttribute('tabindex')).toBe('-1')
    expect(tabs[3]?.getAttribute('tabindex')).toBe('-1')
  })

  it('supports roving keyboard navigation across view tabs via Arrow keys and Home/End', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <WorkspaceProvider>
            <Calendar />
          </WorkspaceProvider>
        </MemoryRouter>
      )
    })

    const viewTablist = container.querySelector('.calendar-view-tabs')
    const tabs = Array.from(viewTablist!.querySelectorAll<HTMLButtonElement>('[role="tab"]'))

    // Press ArrowRight on first tab (Month) -> switches to Week
    await act(async () => {
      tabs[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    const updatedTabs1 = Array.from(viewTablist!.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    expect(updatedTabs1[1]?.getAttribute('aria-selected')).toBe('true')
    expect(updatedTabs1[1]?.getAttribute('tabindex')).toBe('0')
    expect(updatedTabs1[0]?.getAttribute('tabindex')).toBe('-1')

    // Press End -> switches to Availability (last tab)
    await act(async () => {
      updatedTabs1[1]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    })
    const updatedTabs2 = Array.from(viewTablist!.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    expect(updatedTabs2[3]?.getAttribute('aria-selected')).toBe('true')
    expect(updatedTabs2[3]?.getAttribute('tabindex')).toBe('0')

    // Press Home -> switches back to Month (first tab)
    await act(async () => {
      updatedTabs2[3]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    })
    const updatedTabs3 = Array.from(viewTablist!.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    expect(updatedTabs3[0]?.getAttribute('aria-selected')).toBe('true')
    expect(updatedTabs3[0]?.getAttribute('tabindex')).toBe('0')
  })

  it('enforces minHeight >= 44px on all view tabs', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <WorkspaceProvider>
            <Calendar />
          </WorkspaceProvider>
        </MemoryRouter>
      )
    })

    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('.calendar-tab-btn'))
    for (const tab of tabs) {
      const minH = tab.style.minHeight || window.getComputedStyle(tab).minHeight
      expect(minH === 'var(--tap)' || minH === '44px').toBe(true)
    }
  })
})
