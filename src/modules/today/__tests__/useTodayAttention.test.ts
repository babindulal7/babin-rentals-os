import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useTodayAttention } from '../useTodayAttention'
import * as bookingsQuery from '../../../lib/queries/bookings'
import { DomainEvents, EVENT_TYPES } from '../../../events/eventBus'
import type { BookingListRow } from '../../../lib/queries/bookings'

vi.mock('../../../lib/network', () => ({
  useNetwork: vi.fn(() => true),
}))

function createRow(overrides: Partial<BookingListRow>): BookingListRow {
  return {
    id: 'bk-1',
    bookingNo: 'BK-1001',
    clientId: 'cl-1',
    clientName: 'Sunrise Films',
    project: 'Music Video',
    projectType: 'Commercial',
    projectTypeOther: null,
    stage: 'On Rent',
    pickupAtAd: '2026-10-17T09:00:00.000Z',
    returnAtAd: '2026-10-18T09:00:00.000Z',
    actualReturnAtAd: null,
    deliveryType: 'Customer Pickup',
    pickupLocation: null,
    returnLocation: null,
    quoteExpiresAtAd: null,
    createdAtAd: '2026-10-15T09:00:00.000Z',
    itemCount: 2,
    depositRequired: null,
    depositHeld: null,
    totalAmount: null,
    ...overrides,
  }
}

describe('useTodayAttention', () => {
  let listBookingsSpy: any

  beforeEach(() => {
    vi.clearAllMocks()
    listBookingsSpy = vi.spyOn(bookingsQuery, 'listBookings')
  })

  afterEach(() => {
    listBookingsSpy.mockRestore()
  })

  it('fetches overdue and late pickup items and maps tasks cleanly', async () => {
    const overdueRow = createRow({ id: 'ret-1', bookingNo: 'BK-201', stage: 'On Rent' })
    const lateRow = createRow({ id: 'late-1', bookingNo: 'BK-101', stage: 'Booked' })

    listBookingsSpy.mockImplementation((opts: any) => {
      if (opts?.chips?.stage?.includes('On Rent')) {
        return Promise.resolve({ rows: [overdueRow], total: 1 })
      }
      return Promise.resolve({ rows: [lateRow], total: 1 })
    })

    const { result } = renderHook(() => useTodayAttention())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.tasks).toHaveLength(2)
    expect(result.current.totalCount).toBe(2)
    expect(result.current.truncated).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.tasks[0]?.bookingNo).toBe('BK-201')
    expect(result.current.tasks[1]?.bookingNo).toBe('BK-101')
  })

  it('detects truncated results when server total exceeds returned rows', async () => {
    const overdueRow = createRow({ id: 'ret-1', bookingNo: 'BK-201', stage: 'On Rent' })

    listBookingsSpy.mockImplementation((opts: any) => {
      if (opts?.chips?.stage?.includes('On Rent')) {
        return Promise.resolve({ rows: [overdueRow], total: 5 }) // total 5, only 1 in rows
      }
      return Promise.resolve({ rows: [], total: 0 })
    })

    const { result } = renderHook(() => useTodayAttention())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.truncated).toBe(true)
    expect(result.current.totalCount).toBe(5)
    expect(result.current.tasks).toHaveLength(1)
  })

  it('sets error state and clears tasks if any query fails (never renders false all-clear)', async () => {
    listBookingsSpy.mockRejectedValue(new Error('Postgres connection failed'))

    const { result } = renderHook(() => useTodayAttention())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toBe('Postgres connection failed')
    expect(result.current.tasks).toHaveLength(0)
    expect(result.current.totalCount).toBe(0)
  })

  it('re-fetches when a domain lifecycle event is emitted', async () => {
    listBookingsSpy.mockResolvedValue({ rows: [], total: 0 })

    const { result } = renderHook(() => useTodayAttention())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(listBookingsSpy).toHaveBeenCalledTimes(2) // 1 overdue + 1 latePickup

    // Emit domain event
    await act(async () => {
      await DomainEvents.emit(EVENT_TYPES.RENTAL_PACKED, { bookingId: 'bk-1' })
    })

    await waitFor(() => {
      expect(listBookingsSpy).toHaveBeenCalledTimes(4) // 2 more calls
    })
  })
})
