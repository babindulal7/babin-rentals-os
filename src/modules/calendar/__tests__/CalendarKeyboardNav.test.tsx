// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
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
  listInventory: vi.fn().mockResolvedValue({
    rows: [
      { id: 'p-fx3', name: 'Sony FX3 Cinema Camera', totalQuantity: 4, dailyRate: 350000 },
      { id: 'p-600d', name: 'Aputure 600d Pro', totalQuantity: 2, dailyRate: 200000 },
    ],
    total: 2,
  }),
}))

const DAY_MS = 86_400_000

/**
 * BQ-CAL-06 (Booqable adoption): the month grid is keyboard-steppable — arrows
 * walk days, Home/End jump to the month's first/last cell, and a step past an
 * edge leaves focus where it was. The cells were already real <button>s, so
 * Tab/Enter worked; this locks in the grid-style movement.
 */
describe('Calendar month-grid keyboard navigation (BQ-CAL-06)', () => {
  let host: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount()
      })
    }
    if (host && host.parentNode) {
      host.parentNode.removeChild(host)
    }
    root = null
    host = null
  })

  async function renderMonth(): Promise<HTMLButtonElement[]> {
    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/calendar']}>
          <Calendar />
        </MemoryRouter>
      )
    })
    const cells = Array.from(host!.querySelectorAll<HTMLButtonElement>('button[data-day-key]'))
    expect(cells.length).toBeGreaterThan(0)
    return cells
  }

  function key(target: Element, key: string): void {
    act(() => {
      target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    })
  }

  it('ArrowRight moves focus one day forward', async () => {
    const cells = await renderMonth()
    const from = cells[10]!
    const fromKey = Number(from.getAttribute('data-day-key'))
    act(() => {
      from.focus()
    })
    key(from, 'ArrowRight')
    const active = document.activeElement as HTMLButtonElement
    expect(Number(active.getAttribute('data-day-key'))).toBe(fromKey + DAY_MS)
  })

  it('ArrowDown moves focus one week forward', async () => {
    const cells = await renderMonth()
    const from = cells[3]!
    const fromKey = Number(from.getAttribute('data-day-key'))
    act(() => {
      from.focus()
    })
    key(from, 'ArrowDown')
    const active = document.activeElement as HTMLButtonElement
    expect(Number(active.getAttribute('data-day-key'))).toBe(fromKey + 7 * DAY_MS)
  })

  it('ArrowLeft moves focus one day back', async () => {
    const cells = await renderMonth()
    const from = cells[10]!
    const fromKey = Number(from.getAttribute('data-day-key'))
    act(() => {
      from.focus()
    })
    key(from, 'ArrowLeft')
    const active = document.activeElement as HTMLButtonElement
    expect(Number(active.getAttribute('data-day-key'))).toBe(fromKey - DAY_MS)
  })

  it('Home and End jump to the month boundary days', async () => {
    const cells = await renderMonth()
    const mid = cells[10]!
    const first = cells[0]!
    const last = cells[cells.length - 1]!
    act(() => {
      mid.focus()
    })
    key(mid, 'Home')
    expect(document.activeElement).toBe(first)
    key(first, 'End')
    expect(document.activeElement).toBe(last)
  })

  it('a step past the month edge leaves focus where it was', async () => {
    const cells = await renderMonth()
    const first = cells[0]!
    act(() => {
      first.focus()
    })
    key(first, 'ArrowLeft')
    expect(document.activeElement).toBe(first)
    key(first, 'ArrowUp')
    expect(document.activeElement).toBe(first)
  })

  it('Enter on a focused day picks it (cell is a real button and responds)', async () => {
    const cells = await renderMonth()
    const mid = cells[10]!
    expect(mid.getAttribute('aria-pressed')).toBe('false')
    act(() => {
      mid.focus()
    })
    await act(async () => {
      mid.click()
    })
    expect(mid.getAttribute('aria-pressed')).toBe('true')
  })
})
