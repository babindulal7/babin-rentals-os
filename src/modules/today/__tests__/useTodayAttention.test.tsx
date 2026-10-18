// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTodayAttention, type TodayAttentionState } from '../useTodayAttention'
import { DomainEvents, EVENT_TYPES } from '../../../events/eventBus'
import type { BookingListRow } from '../../../lib/queries/bookings'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const mockBookingsState = vi.hoisted(() => ({
  overdueRows: [] as BookingListRow[],
  overdueTotal: 0,
  lateRows: [] as BookingListRow[],
  lateTotal: 0,
  shouldFail: false,
}))

vi.mock('../../../lib/queries/bookings', () => ({
  listBookings: vi.fn(async (opts: { dateRange?: { column?: string }; withCount?: boolean }) => {
    if (mockBookingsState.shouldFail) {
      throw new Error('Database connection failed')
    }
    const isOverdue = opts?.dateRange?.column === 'return_at'
    if (isOverdue) {
      return {
        rows: mockBookingsState.overdueRows,
        total: mockBookingsState.overdueTotal,
      }
    }
    return {
      rows: mockBookingsState.lateRows,
      total: mockBookingsState.lateTotal,
    }
  }),
  overdue: vi.fn(() => ({ dateRange: { column: 'return_at' } })),
  latePickups: vi.fn(() => ({ dateRange: { column: 'pickup_at' } })),
}))

vi.mock('../../../data/today', () => ({
  businessNowAd: () => '2026-10-18T10:00:00.000Z',
}))

let networkOnline = true
vi.mock('../../../lib/network', () => ({
  useNetwork: () => networkOnline,
}))

let container: HTMLDivElement
let root: Root
let latestState: TodayAttentionState | null = null

function Harness() {
  const state = useTodayAttention()
  latestState = state
  return (
    <div data-testid="harness">
      <span data-testid="loading">{state.loading ? 'loading' : 'ready'}</span>
      <span data-testid="total">{state.totalCount}</span>
      <span data-testid="error">{state.error ?? 'none'}</span>
    </div>
  )
}

async function mountHarness() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<Harness />)
  })
}

function makeRow(
  id: string,
  bookingNo: string,
  stage: string,
  clientName: string,
  pickupAtAd: string,
  returnAtAd: string,
): BookingListRow {
  return {
    id,
    bookingNo,
    stage: stage as any,
    clientName,
    pickupAtAd,
    returnAtAd,
    actualReturnAtAd: null,
    deliveryType: 'Store Pickup',
    projectName: 'Commercial',
    isCancelled: false,
    isClosed: false,
    itemCount: 1,
    createdAtAd: '2026-10-01T00:00:00Z',
    depositRequired: null,
    quoteExpiresAtAd: null,
  } as unknown as BookingListRow
}

describe('useTodayAttention hook', () => {
  beforeEach(() => {
    networkOnline = true
    mockBookingsState.overdueRows = []
    mockBookingsState.overdueTotal = 0
    mockBookingsState.lateRows = []
    mockBookingsState.lateTotal = 0
    mockBookingsState.shouldFail = false
    latestState = null
  })

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

  it('initializes and successfully fetches attention items', async () => {
    mockBookingsState.overdueRows = [
      makeRow('b-1', 'BK-001', 'On Rent', 'Acme', '2026-10-15T09:00:00Z', '2026-10-17T18:00:00Z'),
    ]
    mockBookingsState.overdueTotal = 1

    mockBookingsState.lateRows = [
      makeRow('b-2', 'BK-002', 'Booked', 'Beta', '2026-10-18T08:00:00Z', '2026-10-20T18:00:00Z'),
    ]
    mockBookingsState.lateTotal = 1

    await mountHarness()

    expect(latestState).not.toBeNull()
    expect(latestState?.loading).toBe(false)
    expect(latestState?.error).toBeNull()
    expect(latestState?.totalCount).toBe(2)
    expect(latestState?.tasks).toHaveLength(2)

    // Critical overdue return must be first
    expect(latestState?.tasks[0]?.kind).toBe('overdue_return')
    expect(latestState?.tasks[0]?.bookingNo).toBe('BK-001')
    expect(latestState?.tasks[1]?.kind).toBe('late_pickup_booked')
    expect(latestState?.tasks[1]?.bookingNo).toBe('BK-002')
  })

  it('handles query failure gracefully and exposes error state', async () => {
    mockBookingsState.shouldFail = true

    await mountHarness()

    expect(latestState?.loading).toBe(false)
    expect(latestState?.error).toBe('Database connection failed')
    expect(latestState?.tasks).toHaveLength(0)
    expect(latestState?.totalCount).toBe(0)
  })

  it('re-fetches when relevant domain lifecycle events fire', async () => {
    await mountHarness()
    expect(latestState?.totalCount).toBe(0)

    // Now update mock and emit event
    mockBookingsState.overdueRows = [
      makeRow('b-10', 'BK-010', 'On Rent', 'Cinema Co', '2026-10-15T09:00:00Z', '2026-10-17T18:00:00Z'),
    ]
    mockBookingsState.overdueTotal = 1

    await act(async () => {
      DomainEvents.emit(EVENT_TYPES.RENTAL_PACKED, { bookingId: 'b-10' })
    })

    expect(latestState?.totalCount).toBe(1)
    expect(latestState?.tasks[0]?.bookingNo).toBe('BK-010')
  })

  it('detects truncation when total exceeds returned rows count', async () => {
    mockBookingsState.overdueRows = [
      makeRow('b-1', 'BK-001', 'On Rent', 'Acme', '2026-10-15T09:00:00Z', '2026-10-17T18:00:00Z'),
    ]
    mockBookingsState.overdueTotal = 10 // Total 10, rows 1 => truncated

    await mountHarness()

    expect(latestState?.truncated).toBe(true)
    expect(latestState?.totalCount).toBe(10)
  })
})
