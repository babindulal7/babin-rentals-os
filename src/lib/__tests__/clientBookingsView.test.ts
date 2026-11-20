import { describe, it, expect } from 'vitest'
import {
  buildClientTimeline,
  canClientPayBalance,
  formatClientBookingView,
} from '../clientBookingsView'

describe('T7-08 Client Portal: My Bookings Timeline & View', () => {
  it('builds canonical 6-step timeline marking completed and current stages', () => {
    const timeline = buildClientTimeline('With Client')
    expect(timeline.length).toBe(6)

    // Submitted, Confirmed, Packed should be completed
    expect(timeline[0]?.isCompleted).toBe(true)
    expect(timeline[1]?.isCompleted).toBe(true)
    expect(timeline[2]?.isCompleted).toBe(true)

    // With Client should be current
    expect(timeline[3]?.isCurrent).toBe(true)
    expect(timeline[3]?.isCompleted).toBe(false)

    // Returned, Closed should be pending
    expect(timeline[4]?.isCompleted).toBe(false)
    expect(timeline[5]?.isCompleted).toBe(false)
  })

  it('calculates balance due and allows paying balance when confirmed and balance > 0', () => {
    expect(canClientPayBalance('Submitted', 50000)).toBe(false) // Not confirmed yet
    expect(canClientPayBalance('Confirmed', 50000)).toBe(true)
    expect(canClientPayBalance('With Client', 50000)).toBe(true)
    expect(canClientPayBalance('Confirmed', 0)).toBe(false) // Zero balance
    expect(canClientPayBalance('Closed', 50000)).toBe(false) // Closed
  })

  it('strictly isolates client bookings (returns null if clientId does not match)', () => {
    const booking = {
      bookingId: 'BK-101',
      bookingNumber: 'BK-00101',
      clientId: 'client-alice',
      stage: 'Confirmed' as const,
      pickupDateUtc: '2026-11-20T00:00:00Z',
      returnDateUtc: '2026-11-22T00:00:00Z',
      totalPaisa: 1000000,
      paidPaisa: 200000,
      lines: [{ lineId: 'l1', productName: 'FX3', quantity: 1 }],
      documents: [],
    }

    // Alice accesses her own booking
    const aliceView = formatClientBookingView(booking, 'client-alice')
    expect(aliceView).not.toBeNull()
    expect(aliceView?.balanceDuePaisa).toBe(800000)
    expect(aliceView?.canPayBalanceOnline).toBe(true)

    // Bob attempts to access Alice's booking
    const bobView = formatClientBookingView(booking, 'client-bob')
    expect(bobView).toBeNull()
  })
})
