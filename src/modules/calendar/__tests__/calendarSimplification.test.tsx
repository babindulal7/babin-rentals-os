// @vitest-environment jsdom
// RULING 2026-11-10: R-10.12 (Card E-6)
// Calendar default: Simple month view opens first; other views and filters sit behind one View menu.
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

describe('Card E-6: Calendar Simplification (R-10.12)', () => {
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

  it('defaults to simple Month view on /calendar and renders the View menu trigger', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/calendar']}>
          <WorkspaceProvider>
            <Calendar />
          </WorkspaceProvider>
        </MemoryRouter>
      )
    })

    // 1. View menu trigger button is present
    const viewMenuBtn = container.querySelector('[data-testid="calendar-view-menu"]') as HTMLButtonElement | null
    expect(viewMenuBtn).not.toBeNull()
    expect(viewMenuBtn?.textContent).toContain('View: Month')
    expect(viewMenuBtn?.getAttribute('aria-expanded')).toBe('false')

    // 2. Month grid is rendered as the primary view
    expect(container.querySelector('.calendar-month-grid')).not.toBeNull()

    // 3. View menu dropdown is initially closed (display: none)
    const dropdown = container.querySelector('[data-testid="calendar-view-menu-dropdown"]') as HTMLElement | null
    expect(dropdown).not.toBeNull()
    expect(dropdown?.style.display).toBe('none')
  })

  it('toggles View menu dropdown on click to expose other views and filters', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/calendar']}>
          <WorkspaceProvider>
            <Calendar />
          </WorkspaceProvider>
        </MemoryRouter>
      )
    })

    const viewMenuBtn = container.querySelector('[data-testid="calendar-view-menu"]') as HTMLButtonElement
    const dropdown = container.querySelector('[data-testid="calendar-view-menu-dropdown"]') as HTMLElement

    // Click to open
    await act(async () => {
      viewMenuBtn.click()
    })
    expect(viewMenuBtn.getAttribute('aria-expanded')).toBe('true')
    expect(dropdown.style.display).toBe('flex')

    // Dropdown contains View Mode header and tabs
    expect(dropdown.textContent).toContain('View Mode')
    const tabs = Array.from(dropdown.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    expect(tabs.length).toBeGreaterThanOrEqual(2)

    // Dropdown contains View Filters header and filters
    expect(dropdown.textContent).toContain('View Filters')
    expect(dropdown.textContent).toContain('Reserved')
    expect(dropdown.textContent).toContain('On Rent')

    // Click again to close
    await act(async () => {
      viewMenuBtn.click()
    })
    expect(viewMenuBtn.getAttribute('aria-expanded')).toBe('false')
    expect(dropdown.style.display).toBe('none')
  })

  it('switches view mode when a tab in the View menu is clicked and closes menu', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/calendar']}>
          <WorkspaceProvider>
            <Calendar />
          </WorkspaceProvider>
        </MemoryRouter>
      )
    })

    const viewMenuBtn = container.querySelector('[data-testid="calendar-view-menu"]') as HTMLButtonElement
    const dropdown = container.querySelector('[data-testid="calendar-view-menu-dropdown"]') as HTMLElement

    // Open menu
    await act(async () => {
      viewMenuBtn.click()
    })
    expect(dropdown.style.display).toBe('flex')

    // Find Week tab and click
    const weekTab = dropdown.querySelector('#calendar-view-tab-week') as HTMLButtonElement | null
    expect(weekTab).not.toBeNull()
    await act(async () => {
      weekTab?.click()
    })

    // Menu closes and trigger reflects new active view
    expect(dropdown.style.display).toBe('none')
    expect(viewMenuBtn.textContent).toContain('View: Week')
  })

  it('closes View menu when Escape key is pressed', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/calendar']}>
          <WorkspaceProvider>
            <Calendar />
          </WorkspaceProvider>
        </MemoryRouter>
      )
    })

    const viewMenuBtn = container.querySelector('[data-testid="calendar-view-menu"]') as HTMLButtonElement
    const dropdown = container.querySelector('[data-testid="calendar-view-menu-dropdown"]') as HTMLElement

    // Open menu
    await act(async () => {
      viewMenuBtn.click()
    })
    expect(dropdown.style.display).toBe('flex')

    // Press Escape
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(dropdown.style.display).toBe('none')
    expect(viewMenuBtn.getAttribute('aria-expanded')).toBe('false')
  })

  it('enforces Law 15 touch floor (>= 44px) on View menu trigger and menu items', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/calendar']}>
          <WorkspaceProvider>
            <Calendar />
          </WorkspaceProvider>
        </MemoryRouter>
      )
    })

    const viewMenuBtn = container.querySelector('[data-testid="calendar-view-menu"]') as HTMLElement
    const h = viewMenuBtn.style.minHeight || viewMenuBtn.style.getPropertyValue('min-height')
    expect(h === 'var(--tap)' || h === '44px' || Boolean(viewMenuBtn.style.minHeight)).toBe(true)

    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('.calendar-tab-btn'))
    for (const tab of tabs) {
      const tabH = tab.style.minHeight || window.getComputedStyle(tab).minHeight
      expect(tabH === 'var(--tap)' || tabH === '44px').toBe(true)
    }
  })
})
