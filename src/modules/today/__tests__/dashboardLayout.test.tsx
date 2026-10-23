// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../components/ui/Toast'
import type { ListFilters } from '../../../lib/queries/listQuery'
import type { ListResult } from '../../../lib/queries/useList'
import * as bookingQueries from '../../../lib/queries/bookings'

const queueResults = vi.hoisted(() => ({ counts: [0, 0] as (number | null)[], loading: false, error: null as ListResult<never>['error'], calls: 0, refetch: vi.fn(), filters: [] as ListFilters[], fetchers: [] as ((filters: ListFilters) => Promise<unknown>)[] }))
vi.mock('../../../lib/queries/useList', () => ({
  useList: (fetcher: (filters: ListFilters) => Promise<unknown>, filters: ListFilters) => {
    queueResults.filters.push(filters)
    queueResults.fetchers.push(fetcher)
    const total = queueResults.counts[queueResults.calls++ % 2] ?? null
    return {
    rows: [],
    loading: queueResults.loading,
    error: queueResults.error,
    isEmpty: total === 0,
    isFiltered: false,
    total,
    refetch: queueResults.refetch,
    }
  },
}))

vi.mock('../../../modules/operations/OperationsWorkspaceContext', () => ({
  useOperationsWorkspace: () => ({
    openOperations: vi.fn(),
    closeOperations: vi.fn(),
  }),
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { default: Today } = await import('../Today')
let container: HTMLDivElement
let root: Root

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<MemoryRouter initialEntries={['/dashboard']}><ToastProvider><Today /></ToastProvider></MemoryRouter>)
  })
}

const buttons = () => [...container.querySelectorAll('button')]
/*
 * Substring, not equality. The filter triggers used to be found by their exact
 * aria-label ("choose dispatch date filter"), but WCAG 2.5.3 "Label in Name"
 * requires the accessible name to CONTAIN the visible period, so the label is
 * now "Today — choose dispatch date filter" and moves as the period changes.
 * These tests care about WHICH control, not its exact wording; the label's
 * composition is asserted on its own below.
 */
const buttonByLabel = (label: string) =>
  buttons().find((button) => (button.getAttribute('aria-label') ?? '').includes(label))

beforeEach(() => {
  window.sessionStorage.clear()
  queueResults.counts = [0, 0]
  queueResults.loading = false
  queueResults.error = null
  queueResults.calls = 0
  queueResults.filters = []
  queueResults.fetchers = []
  queueResults.refetch.mockClear()
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('focused pickup and return dashboard', () => {
  it('asks both movement queries for exact totals while preserving their filters and pagination', async () => {
    const read = vi.spyOn(bookingQueries, 'listBookings').mockResolvedValue({ rows: [], total: 125 })
    await mount()
    const filters: ListFilters = { search: 'production', page: { index: 0, size: 50 } }
    await queueResults.fetchers[0]!(filters)
    await queueResults.fetchers[1]!(filters)
    expect(read).toHaveBeenCalledTimes(2)
    expect(read).toHaveBeenNthCalledWith(1, { ...filters, withCount: true })
    expect(read).toHaveBeenNthCalledWith(2, { ...filters, withCount: true })
  })
  it.each([
    ['master dispatch', ['pickup', 'return']],
    ['pickups', ['pickup']],
    ['returns', ['return']],
  ] as const)('calendar footer Today restores the operational preset for %s', async (control, affected) => {
    vi.setSystemTime(new Date('2026-10-21T05:59:59+05:45'))
    for (const panel of ['pickup', 'return']) {
      window.sessionStorage.setItem(`dashboard.${panel}DateFilter`, JSON.stringify({ kind: 'quick', period: 'Tomorrow' }))
    }
    await mount()
    await act(async () => buttonByLabel(`choose ${control} date`)!.click())
    const footerToday = [...document.querySelectorAll<HTMLButtonElement>('.dashboard-calendar button')]
      .find(button => button.textContent?.trim() === 'Today' && !button.hasAttribute('aria-pressed'))
    expect(footerToday).toBeDefined()
    await act(async () => footerToday!.click())

    for (const panel of ['pickup', 'return']) {
      expect(JSON.parse(window.sessionStorage.getItem(`dashboard.${panel}DateFilter`)!)).toEqual({
        kind: 'quick', period: affected.some(value => value === panel) ? 'Today' : 'Tomorrow',
      })
    }
    expect(document.querySelector('.dashboard-calendar')).toBeNull()
    if (affected.some(value => value === 'return')) expect(container.textContent).toContain('Today · Overdue included')
  })

  it.each([
    ['2026-10-21T05:59:59+05:45', '2026-10-21'],
    ['2026-10-21T06:00:00+05:45', '2026-10-22'],
  ])('quick Today retains carry-over and ends at the correct shift boundary at %s', async (now, endDay) => {
    vi.setSystemTime(new Date(now))
    await mount()
    const filters = queueResults.filters.find(f => f.dateRange?.column === 'pickup_at')!
    expect(filters.dateRange?.fromAd).toBeUndefined()
    expect(filters.dateRange?.toAd).toBe(`${endDay}T05:59:59.999+05:45`)
  })
  it('quick Tomorrow before 06:00 starts at the upcoming shift', async () => {
    vi.setSystemTime(new Date('2026-10-21T05:59:59+05:45'))
    window.sessionStorage.setItem('dashboard.pickupDateFilter', JSON.stringify({ kind: 'quick', period: 'Tomorrow' }))
    await mount()
    const filter = queueResults.filters.find(f => f.dateRange?.column === 'pickup_at')!
    expect(filter.dateRange?.fromAd).toBe('2026-10-21T06:00:00.000+05:45')
    expect(filter.dateRange?.toAd).toBe('2026-10-22T05:59:59.999+05:45')
  })
  it('an explicit picked day keeps that date before 06:00', async () => {
    vi.setSystemTime(new Date('2026-10-21T05:59:59+05:45'))
    window.sessionStorage.setItem('dashboard.pickupDateFilter', JSON.stringify({ kind: 'custom', from: '2026-10-25', to: '2026-10-25' }))
    await mount()
    const filter = queueResults.filters.find(f => f.dateRange?.column === 'pickup_at')!
    expect(filter.dateRange?.fromAd).toBe('2026-10-25T06:00:00.000+05:45')
  })
  it('places the date beside queues and refreshes both queues from More', async () => {
    await mount()
    expect(container.querySelector('[aria-label="Date filter for pickups"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Date filter for returns"]')).not.toBeNull()
    expect(buttonByLabel('More actions')).toBeDefined()
    await act(async () => buttonByLabel('More actions')!.click())
    const menu = document.querySelector('[role="menu"][aria-label="More actions"]')!
    expect(menu.textContent).toContain('Operations')
    const refresh = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((button) => button.textContent?.includes('Refresh movements'))!
    await act(async () => refresh.click())
    expect(queueResults.refetch).toHaveBeenCalledTimes(2)
    expect(document.querySelector('[role="menu"][aria-label="More actions"]')).toBeNull()
  })

  it('keeps the same queue layout when Today has returns and another date is empty', async () => {
    window.sessionStorage.setItem('dashboard.pickupDateFilter', JSON.stringify({ kind: 'quick', period: 'Tomorrow' }))
    window.sessionStorage.setItem('dashboard.returnDateFilter', JSON.stringify({ kind: 'quick', period: 'Tomorrow' }))
    await mount()
    const layout = container.querySelector('.rental-dashboard__panels')!
    const initialLayout = layout.className
    const panels = [...layout.querySelectorAll('.movement-panel')]
    const initialPanelStyles = panels.map((panel) => panel.className)

    await act(async () => buttonByLabel('choose pickups date filter')!.click())
    queueResults.counts = [0, 3]
    const today = [...document.querySelectorAll<HTMLButtonElement>('.dashboard-calendar button')].find((button) => button.textContent === 'Today')!
    await act(async () => today.click())

    expect(window.sessionStorage.getItem('dashboard.pickupDateFilter')).toContain('Today')
    expect(container.querySelector('.dispatch-summary--returns .dispatch-summary__count')?.textContent).toBe('3')
    expect(window.sessionStorage.getItem('dashboard.returnDateFilter')).toContain('Tomorrow')
    expect(layout.className).toBe(initialLayout)
    expect([...layout.querySelectorAll('.movement-panel')]).toEqual(panels)
    expect(panels.map((panel) => panel.className)).toEqual(initialPanelStyles)
  })

  it('renders only the two operational panels', async () => {
    await mount()
    expect(container.textContent).toContain('Pickups')
    expect(container.textContent).toContain('Returns')
    expect(container.textContent).not.toContain('Quick Actions')
    expect(container.textContent).not.toContain("Today's Timeline")
    expect(container.textContent).not.toContain('Cash due')
    expect(container.textContent).not.toContain('After the dispatch queues')
    expect(container.textContent).not.toContain('Currently Out on Set')
    expect(container.textContent).not.toContain('Prep & Packing Queue')
    expect(container.textContent).not.toContain('Maintenance & QC Hold')
    expect(container.querySelector('.dashboard-shift-handover')).toBeNull()
  })

  it('keeps each date control a single compact button: "Today", or the English date (15 Oct 2026)', async () => {
    await mount()
    const control = container.querySelector('[aria-label="Date filter for pickups"]')!
    expect(control.querySelectorAll('[aria-haspopup="dialog"]')).toHaveLength(1)
    expect(control.querySelector('button[aria-label="Previous day"]')).toBeNull()
    expect(control.querySelector('.dashboard-master-date-control__primary')?.textContent).toBe('Today')
    expect(control.querySelector('.dashboard-master-date-control__secondary')).toBeNull()
  })

  it('summarizes only the two movements from authoritative query totals (23 Oct wireframes)', async () => {
    queueResults.counts = [125, 62]
    await mount()
    expect(container.querySelectorAll('.dispatch-summary')).toHaveLength(2)
    expect(container.querySelector('.dispatch-summary--pickups .dispatch-summary__count')?.textContent).toBe('125')
    expect(container.querySelector('.dispatch-summary--returns .dispatch-summary__count')?.textContent).toBe('62')
    expect(container.querySelector('.kpi-tile')).toBeNull()
    expect(container.textContent).not.toContain('On rent now')
    expect(container.textContent).not.toContain('Packing due tomorrow')
  })

  it.each(['loading', 'error', 'unknown'] as const)('does not invent zero totals when counts are %s', async state => {
    queueResults.loading = state === 'loading'
    queueResults.error = state === 'error' ? 'Unavailable' : null
    queueResults.counts = state === 'unknown' ? [null, null] : [10, 20]
    await mount()
    expect([...container.querySelectorAll('.dispatch-summary__count')].map(node => node.textContent)).toEqual(['—', '—'])
    expect(container.querySelector('.dispatch-summaries')?.textContent).toContain(
      state === 'loading' ? 'Loading movements' : state === 'error' ? 'Movements unavailable' : 'Count unavailable',
    )
    if (state === 'error') expect(container.querySelector('[role="alert"]')?.textContent).toContain('Unavailable')
  })

  it('gives each panel its own accessible calendar control', async () => {
    await mount()
    expect(buttons().filter((b) => b.getAttribute('aria-label')?.includes('choose pickups date filter'))).toHaveLength(1)
    expect(buttons().filter((b) => b.getAttribute('aria-label')?.includes('choose returns date filter'))).toHaveLength(1)
    expect(buttonByLabel('choose dispatch date filter')).toBeUndefined()
  })

  /*
   * WCAG 2.5.3 "Label in Name". Axe failed this live on /dashboard: the trigger
   * painted "Today" / "Tomorrow" / "Sep 27" but announced only "Choose pickup
   * date filter", so a screen-reader user was told a control changed a filter
   * without ever being told which period was currently in effect. The rule is
   * that the accessible name CONTAINS the visible text — so this asserts the
   * name carries the period, not just that the period is on screen.
   */
  it.each([
    ['choose pickups date filter'],
    ['choose returns date filter'],
  ])('names the %s control after the period it shows', async (label) => {
    await mount()
    const button = buttonByLabel(label)
    const visible = button?.textContent?.trim() ?? ''
    expect(visible).not.toBe('')
    expect(button?.getAttribute('aria-label') ?? '').toContain(visible)
  })

  it('changes only the panel whose date filter was used', async () => {
    await mount()
    await act(async () => buttonByLabel('choose pickups date filter')?.click())
    // The open calendar is portaled to document.body, outside the mount container.
    const tomorrow = [...document.querySelectorAll<HTMLButtonElement>('.dashboard-calendar button')].find((button) => button.textContent === 'Tomorrow')
    await act(async () => tomorrow?.click())
    expect(window.sessionStorage.getItem('dashboard.pickupDateFilter')).toContain('Tomorrow')
    expect(window.sessionStorage.getItem('dashboard.returnDateFilter')).toContain('Today')

    await act(async () => buttonByLabel('choose returns date filter')?.click())
    const next7 = [...document.querySelectorAll<HTMLButtonElement>('.dashboard-calendar button')].find((button) => button.textContent === 'Next 7 Days')
    await act(async () => next7?.click())
    expect(window.sessionStorage.getItem('dashboard.returnDateFilter')).toContain('Next 7 Days')
    expect(window.sessionStorage.getItem('dashboard.pickupDateFilter')).toContain('Tomorrow')
  })

  it('selects a single day in one panel without touching the other, with no range toggle', async () => {
    await mount()
    await act(async () => buttonByLabel('choose returns date filter')?.click())
    const dialog = document.querySelector('.dashboard-calendar')!
    expect(dialog.textContent).not.toContain('Single day')
    expect(dialog.textContent).not.toContain('Date range')
    expect(dialog.textContent).toContain('BS')
    await act(async () => dialog.querySelectorAll<HTMLButtonElement>('[role="gridcell"]')[3]?.click())
    expect(document.querySelector('.dashboard-calendar')).toBeNull()
    expect(window.sessionStorage.getItem('dashboard.returnDateFilter')).toContain('custom')
    expect(window.sessionStorage.getItem('dashboard.pickupDateFilter')).toContain('Today')
  })

  it('does not contain a duplicate New Rental button in the page header', async () => {
    await mount()
    const header = container.querySelector('.page-header')
    expect(header?.textContent).not.toContain('New Rental')
  })

  it('clarifies that Returns Today includes overdue items', async () => {
    await mount()
    expect(container.textContent).toContain('Today · Overdue included')
  })

  it('restores focus after choosing a filter and after Escape', async () => {
    await mount()
    const pickup = buttonByLabel('choose pickups date filter')!
    await act(async () => pickup.click())
    expect(document.activeElement?.getAttribute('role')).toBe('dialog')
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>('.dashboard-calendar button')].find((button) => button.textContent === 'Tomorrow')!.click())
    expect(document.activeElement).toBe(pickup)
    await act(async () => pickup.click())
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(document.querySelector('.dashboard-calendar')).toBeNull()
    expect(document.activeElement).toBe(pickup)
  })

  it.each([
    { from: '2026-99-99', to: '2026-99-99' },
    { from: '2026-02-30', to: '2026-03-02' },
    { from: '2026-09-22', to: '2026-09-21' },
  ])('recovers from invalid stored date ranges: %j', async (range) => {
    window.sessionStorage.setItem('dashboard.pickupDateFilter', JSON.stringify({ kind: 'custom', ...range }))
    await mount()
    expect(buttonByLabel('choose pickups date filter')).toBeDefined()
    expect(window.sessionStorage.getItem('dashboard.pickupDateFilter')).toContain('Today')
  })
})
