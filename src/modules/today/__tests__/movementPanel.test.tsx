// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DashboardMovementPanel from '../DashboardMovementPanel'
import dashboardCss from '../dashboard.css?raw'
import type { MovementRow } from '../../../lib/queries/today'

const { openOperations } = vi.hoisted(() => ({ openOperations: vi.fn() }))
vi.mock('../../operations/OperationsWorkspaceContext', () => ({
  useOperationsWorkspace: () => ({ openOperations }),
}))
vi.mock('../../../lib/queries/today', async (original) => ({
  ...await original<typeof import('../../../lib/queries/today')>(),
  businessDayAd: () => '2026-09-21',
}))
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
const row: MovementRow = {
  id: 'rental-1', bookingNo: 'B-901', clientId: 'client-1', client: 'AV Production',
  monogram: 'AV', avatarTone: 'neutral', kind: 'Return', at: 600, atDayAd: '2026-09-22',
  status: 'On Rent', flags: [], project: 'Conference', itemCount: 8,
  due: 'Due 22 Sept 2026 · 10:00 AM', duration: '21 Sept → 22 Sept',
  pickupLocation: null, returnLocation: null, deliveryType: 'Client Pickup',
}
async function mount(overrides: Partial<MovementRow> = {}, side: 'incoming' | 'outgoing' = 'incoming', paging: { onLoadMore?: () => void; hasMore?: boolean; total?: number } = {}) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root.render(<MemoryRouter><DashboardMovementPanel
    side={side} title="Movements" subtitle="Scheduled rentals" icon="truck" periodLabel="tomorrow"
    filterControl={null} onClearFilters={() => {}}
    {...(paging.onLoadMore ? { onLoadMore: paging.onLoadMore } : {})}
    {...(paging.hasMore !== undefined ? { hasMore: paging.hasMore } : {})}
    list={{ rows: [{ ...row, ...overrides }], total: paging.total ?? 1, loading: false, error: null, isEmpty: false, isFiltered: true, refetch: () => {}, lastFetchedAt: null }}
  /></MemoryRouter>))
}
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks() })

describe('movement board task clarity', () => {
  it('does not label a future return as due today or claim booked quantities are outstanding', async () => {
    await mount()
    expect(host.textContent).not.toContain('Return scheduled')
    expect(host.textContent).not.toContain('Due today')
    expect(host.textContent).toContain('Return & Inspect')
    expect(host.textContent).toContain('8 items booked')
    expect(host.textContent).not.toContain('outstanding')
  })
  it('shows the pickup date for multi-day filters and allows 1-click packing', async () => {
    await mount({ status: 'Booked' }, 'outgoing')
    expect(host.querySelector('.movement-card__time')?.textContent).toMatch(/22 Sept? 2026/)
    const action = host.querySelector<HTMLButtonElement>('.movement-card__cta-btn')!
    expect(action.textContent).toBe('Start Packing')
    expect(action.getAttribute('aria-label')).toContain('Start Packing')
    expect(host.textContent).not.toContain('unchecked')
    await act(async () => action.click())
    expect(openOperations).toHaveBeenCalledWith('B-901', 'Booked', 'Pack')
  })
  it('uses a native detail link separate from the operational action', async () => {
    await mount()
    expect(host.querySelector('article[role="link"]')).toBeNull()
    expect(host.querySelector('a')?.textContent).toContain('AV Production')
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/clients/client-1')
    expect(host.querySelector('a[href="/rentals/B-901"]')).not.toBeNull()
    await act(async () => host.querySelector<HTMLButtonElement>('.movement-card__cta-btn')!.click())
    expect(openOperations).toHaveBeenCalledWith('B-901', 'On Rent', 'Return')
  })
  it('keeps overdue status explicit and opens the gated handover workspace for packed rentals', async () => {
    await mount({ status: 'Packed', flags: ['Overdue'], statusNote: '1 day late' }, 'outgoing')
    await act(async () => host.querySelector<HTMLButtonElement>('.movement-card__cta-btn')!.click())
    expect(openOperations).toHaveBeenCalledWith('B-901', 'Packed', 'Handover')
  })
  it('exposes truthful page progress and a single load-more action when more rows exist', async () => {
    const onLoadMore = vi.fn()
    await mount({}, 'incoming', { onLoadMore, hasMore: true, total: 120 })
    expect(host.textContent).toContain('Showing 1 of 120')
    const loadMore = host.querySelector<HTMLButtonElement>('button[aria-label="Load more returns"]')
    expect(loadMore).not.toBeNull()
    await act(async () => loadMore!.click())
    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })
})

describe('meaningful rows (ruled 8 Oct 2026)', () => {
  const tags = () => [...host.querySelectorAll('.movement-card__tag')].map((t) => t.textContent?.trim())

  it('says whether a pickup is packed, and how it leaves', async () => {
    await mount({ status: 'Booked', deliveryType: 'Babin Delivery' }, 'outgoing')
    expect(tags()).toEqual(['Not packed yet', 'Delivery'])
    await act(async () => root.unmount()); host.remove()
    await mount({ status: 'Packed', deliveryType: 'Client Pickup' }, 'outgoing')
    expect(tags()).toEqual(['Packed', 'Client pickup'])
  })

  it('gives a return no due tag — its date cell says the day — and never calls tomorrow today', async () => {
    await mount({ atDayAd: '2026-09-22' })
    expect(tags()).toEqual([])
    expect(host.textContent).not.toContain('today')
  })
})

/*
 * RULING 2026-10-15 (RULINGS-2026-10-15.md #19–#23). The old card was ~204px
 * at 1280 and said a late return four ways: an "86d late" rail, a red inset
 * edge, a pink fill and "Overdue · 86 days late". Each test below fails on
 * that card.
 */
describe('one row, each fact once (ruled 15 Oct 2026)', () => {
  const card = () => host.querySelector<HTMLElement>('.movement-card')!
  /** What a sighted reader sees: screen-reader-only captions are left out. */
  const visibleText = (el: Element) => {
    const copy = el.cloneNode(true) as Element
    copy.querySelectorAll('.sr-only').forEach((n) => n.remove())
    return copy.textContent ?? ''
  }

  it('says a late return once, in words, beside the date it is counted from', async () => {
    await mount({ flags: ['Overdue'], statusNote: '86 days late', atDayAd: '2026-07-21', at: 360 })
    // Old card: "late" (rail) + "Overdue · 86 days late" — three words for one fact.
    expect(visibleText(card()).match(/late|overdue/gi)).toEqual(['late'])
    expect(card().querySelector('.movement-card__when')).toBeNull()
    const status = [...card().querySelectorAll('.movement-card__status')]
    expect(status.map((s) => s.textContent)).toEqual(['86 days late'])
    expect(status[0]!.closest('.movement-card__schedule--return')).not.toBeNull()
    expect(status[0]!.querySelector('svg')).toBeNull()
  })

  // main (16 Oct) flags late pickups too. Ported onto the one-statement card, a late pickup
  // is said the same single way: its note, or "Overdue pickup" when it has none.
  it('says a late pickup once, beside its date — the note, or "Overdue pickup" without one', async () => {
    await mount({ kind: 'Pickup', status: 'Booked', flags: ['Overdue'], statusNote: '2 days late', atDayAd: '2026-07-21', at: 360 }, 'outgoing')
    const status = [...card().querySelectorAll('.movement-card__status')]
    expect(status.map((s) => s.textContent?.trim())).toEqual(['2 days late'])
    expect(status[0]!.closest('.movement-card__schedule--pickup')).not.toBeNull()
    expect(visibleText(card()).match(/late|overdue/gi)).toEqual(['late'])

    await act(async () => root.unmount()); host.remove()
    await mount({ kind: 'Pickup', status: 'Booked', flags: ['Overdue'], atDayAd: '2026-07-21', at: 360 }, 'outgoing')
    expect([...card().querySelectorAll('.movement-card__status')].map((s) => s.textContent?.trim())).toEqual(['Overdue pickup'])
  })

  it('gives the late row no red edge and no tinted fill — at most one colour cue, on the words', () => {
    const overdueRules = [...dashboardCss.matchAll(/\.rental-dashboard \.movement-card--overdue\s*\{([^}]*)\}/g)]
    const last = overdueRules.at(-1)?.[1] ?? ''
    expect(last).toMatch(/box-shadow:\s*none/)
    expect(last).toMatch(/background:\s*transparent/)
    expect(dashboardCss).not.toMatch(/\.rental-dashboard \.movement-card--overdue:hover/)
    // The one cue: danger ink on the statement itself.
    expect(dashboardCss).toMatch(/\.movement-card__schedule > \.movement-card__status \{[^}]*color: var\(--danger-text\)/)
  })

  it('shows one date — this movement’s, BS over AD — and no visible Pickup/Return caption', async () => {
    await mount({ atDayAd: '2026-09-22', at: 600 })
    expect(card().querySelectorAll('.movement-card__schedule')).toHaveLength(1)
    const captions = [...card().querySelectorAll('span, strong')]
      .filter((el) => /^(pickup|return|booking)$/i.test(el.textContent?.trim() ?? '') && !el.closest('.sr-only'))
    expect(captions).toEqual([])
    const when = card().querySelector('.movement-card__time')!
    expect(when.firstElementChild?.textContent).toMatch(/Ashwin 2083/)
    expect(when.lastElementChild?.textContent).toMatch(/22 Sept? 2026/)
    expect(when.textContent).toContain('10:00 AM')
    // A return's pickup date lives on the booking hover card, not the row.
    expect(visibleText(card())).not.toMatch(/21 Sept?/)
  })

  it('keeps a row on today to its time alone — the day control already names the day', async () => {
    await mount({ status: 'Booked', atDayAd: '2026-09-21', at: 600 }, 'outgoing')
    expect(card().querySelector('.movement-card__time')?.textContent).toBe('10:00 AM')
    expect(visibleText(card())).not.toMatch(/2083|2026/)
  })

  it('keeps the floor verb one tap from the row (R-39 row 2)', async () => {
    await mount({ flags: ['Overdue'], statusNote: '86 days late', atDayAd: '2026-07-21' })
    const verb = card().querySelector<HTMLButtonElement>(':scope > .movement-card__cta-btn')!
    expect(verb.textContent).toBe('Return & Inspect')
    await act(async () => verb.click())
    expect(openOperations).toHaveBeenCalledWith('B-901', 'On Rent', 'Return')
  })
})

describe('return countdown (md brief 11)', () => {
  const countdown = () => host.querySelector<HTMLElement>('[data-testid="return-countdown"]')
  // Only Date is faked: the panel's own act/render path keeps real timers.
  afterEach(() => { vi.useRealTimers() })

  it('counts down to a return that is still out, under its Return time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-21T23:00:00.000Z'))
    // 22 Sep 10:00 in Kathmandu is 04:15Z — 5h 15m after the instant above.
    await mount({ returnDueAtAd: '2026-09-22T04:15:00.000Z' })
    expect(countdown()?.textContent).toBe('in 5h 15m')
    expect(countdown()?.closest('.movement-card__schedule--return')).not.toBeNull()
  })

  it('says nothing more on an overdue row — its date cell already says how late', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-23T04:15:00.000Z'))
    await mount({ flags: ['Overdue'], statusNote: '1 day late', returnDueAtAd: '2026-09-22T04:15:00.000Z' })
    expect(countdown()).toBeNull()
  })

  it('never counts down on an outgoing row or one already back', async () => {
    await mount({ status: 'Booked' }, 'outgoing')
    expect(countdown()).toBeNull()
    await act(async () => root.unmount()); host.remove()
    await mount({ status: 'Returned' })
    expect(countdown()).toBeNull()
  })
})
