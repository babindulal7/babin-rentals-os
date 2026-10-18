// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NeedsAttention } from '../NeedsAttention'
import type { AttentionTask } from '../attentionModel'
import type { TodayAttentionState } from '../useTodayAttention'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

let container: HTMLDivElement
let root: Root

function makeTask(overrides: Partial<AttentionTask>): AttentionTask {
  return {
    key: `task:${overrides.bookingId || '1'}`,
    bookingId: '1',
    bookingNo: 'BK-101',
    stage: 'On Rent',
    kind: 'overdue_return',
    severity: 'critical',
    dueAtAd: '2026-10-18T09:00:00.000Z',
    job: 'Return',
    label: 'Overdue Return',
    detail: 'Due 2h overdue',
    clientName: 'Everest Films',
    deliveryType: 'Client Pickup',
    ...overrides,
  }
}

function makeState(overrides: Partial<TodayAttentionState>): TodayAttentionState {
  return {
    tasks: [],
    totalCount: 0,
    loading: false,
    error: null,
    lastFetchedAt: new Date(),
    truncated: false,
    isOffline: false,
    refresh: vi.fn(),
    ...overrides,
  }
}

async function renderComponent(props: Parameters<typeof NeedsAttention>[0]) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<NeedsAttention {...props} />)
  })
}

describe('NeedsAttention component', () => {
  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount()
      })
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container)
    }
  })

  it('renders verified empty state when there are zero tasks', async () => {
    const onOpen = vi.fn()
    await renderComponent({
      onOpenTask: onOpen,
      state: makeState({ tasks: [], totalCount: 0 }),
    })

    const empty = container.querySelector('[data-testid="needs-attention-empty"]')
    expect(empty).not.toBeNull()
    expect(empty?.textContent).toContain('No urgent exceptions right now')
  })

  it('renders loading skeleton when loading with no tasks', async () => {
    const onOpen = vi.fn()
    await renderComponent({
      onOpenTask: onOpen,
      state: makeState({ loading: true, tasks: [] }),
    })

    const skeleton = container.querySelector('.needs-attention-skeleton')
    expect(skeleton).not.toBeNull()
  })

  it('renders error state and invokes refresh on retry', async () => {
    const onOpen = vi.fn()
    const refreshMock = vi.fn()
    await renderComponent({
      onOpenTask: onOpen,
      state: makeState({ error: 'Network timeout', refresh: refreshMock }),
    })

    const error = container.querySelector('.needs-attention-error')
    expect(error?.textContent).toContain('Network timeout')

    const retryBtn = container.querySelector('.needs-attention-retry-btn') as HTMLButtonElement
    expect(retryBtn).not.toBeNull()

    await act(async () => {
      retryBtn.click()
    })

    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('renders critical and high cards with appropriate CTAs and triggers onOpenTask', async () => {
    const onOpen = vi.fn()
    const task1 = makeTask({
      bookingId: 'b-1',
      bookingNo: 'BK-001',
      kind: 'overdue_return',
      severity: 'critical',
      job: 'Return',
      detail: 'Due 3h overdue',
    })
    const task2 = makeTask({
      bookingId: 'b-2',
      bookingNo: 'BK-002',
      kind: 'late_pickup_booked',
      severity: 'high',
      job: 'Pack',
      stage: 'Booked',
      detail: 'Scheduled 1h overdue',
    })

    await renderComponent({
      onOpenTask: onOpen,
      state: makeState({
        tasks: [task1, task2],
        totalCount: 2,
      }),
    })

    const card1 = container.querySelector('[data-testid="needs-attention-card-BK-001"]')
    expect(card1).not.toBeNull()
    expect(card1?.classList.contains('needs-attention-card--critical')).toBe(true)

    const btn1 = card1?.querySelector('button') as HTMLButtonElement
    expect(btn1?.textContent?.trim()).toBe('Return')

    await act(async () => {
      btn1.click()
    })
    expect(onOpen).toHaveBeenCalledWith(task1)

    const card2 = container.querySelector('[data-testid="needs-attention-card-BK-002"]')
    expect(card2).not.toBeNull()
    expect(card2?.classList.contains('needs-attention-card--high')).toBe(true)

    const btn2 = card2?.querySelector('button') as HTMLButtonElement
    expect(btn2?.textContent?.trim()).toBe('Pack')

    await act(async () => {
      btn2.click()
    })
    expect(onOpen).toHaveBeenCalledWith(task2)
  })

  it('renders overflow footer when totalCount exceeds displayed tasks count', async () => {
    const onOpen = vi.fn()
    const onViewAll = vi.fn()
    const tasks = [
      makeTask({ bookingId: 'b-1', bookingNo: 'BK-001', kind: 'overdue_return' }),
      makeTask({ bookingId: 'b-2', bookingNo: 'BK-002', kind: 'overdue_return' }),
      makeTask({ bookingId: 'b-3', bookingNo: 'BK-003', kind: 'overdue_return' }),
      makeTask({ bookingId: 'b-4', bookingNo: 'BK-004', kind: 'overdue_return' }),
    ]

    await renderComponent({
      onOpenTask: onOpen,
      onViewAll,
      state: makeState({
        tasks,
        totalCount: 15,
      }),
    })

    const cards = container.querySelectorAll('.needs-attention-card')
    expect(cards).toHaveLength(3) // Top 3 only

    const footer = container.querySelector('.needs-attention-footer')
    expect(footer?.textContent).toContain('Showing top 3 of 15 exceptions.')

    const viewAllBtn = footer?.querySelector('button') as HTMLButtonElement
    expect(viewAllBtn).not.toBeNull()

    await act(async () => {
      viewAllBtn.click()
    })

    // All tasks were returns -> expects 'overdue_end'
    expect(onViewAll).toHaveBeenCalledWith('overdue_end')
  })

  it('displays offline indicator when isOffline is true', async () => {
    const onOpen = vi.fn()
    await renderComponent({
      onOpenTask: onOpen,
      state: makeState({
        tasks: [],
        totalCount: 0,
        isOffline: true,
      }),
    })

    const offlineTag = container.querySelector('.needs-attention-offline-tag')
    expect(offlineTag).not.toBeNull()
    expect(offlineTag?.textContent).toContain('Offline · Cached')
  })
})
