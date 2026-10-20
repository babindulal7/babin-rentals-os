import { describe, it, expect } from 'vitest'
import {
  calculatePaymentDue,
  calculateRevenueToday,
  calculateActiveRentals,
  countOverdue,
  calculatePickupsToday,
  calculateReturnsToday,
} from '../kpiEngine'
import { rupees } from '../money'
import { statusToken } from '../workflow'
import type { RentalRow } from '../../data/rentals'

describe('KPI Engine (src/lib/kpiEngine.ts)', () => {
  // `RentalRow` is the seed shape documented in `data/rentals.ts`; the fixture
  // carries every required field so it cannot drift from what the engine reads.
  const dummyRow = (overrides: Partial<RentalRow> = {}): RentalRow => {
    const base: RentalRow = {
      bookingNo: 'BK-001',
      bookedOn: 'Booked 1 Shrawan',
      client: 'Test Client',
      avatar: ['TC'],
      avatarTone: 'primary',
      project: 'Test Project',
      location: 'Kathmandu',
      crew: 'Crew 4',
      kit: 'FX3 Documentary Package',
      items: 2,
      pickup: { ad: new Date('2026-08-01T04:15:00.000Z'), time: '10:00', who: 'Ramesh' },
      ret: { ad: new Date('2026-08-03T12:15:00.000Z'), time: '18:00', who: 'Hari' },
      status: 'Booked',
      flags: [],
      statusKey: statusToken('Booked'),
      progress: 0,
      progressTone: 'primary',
      amount: rupees(10000),
      due: rupees(5000),
    }
    const merged = { ...base, ...overrides }
    // The seed derives `statusKey` from `status`; keep that invariant here too.
    return { ...merged, statusKey: statusToken(merged.status) }
  }

  it('sums payment due directly in integer Paisa for active bookings', () => {
    const rows = [
      dummyRow({ bookingNo: 'BK-1', due: rupees(5000) }),
      dummyRow({ bookingNo: 'BK-2', due: rupees(3500) }),
      dummyRow({ bookingNo: 'BK-3', due: rupees(2000), flags: ['Cancelled'] }),
    ]
    expect(calculatePaymentDue(rows)).toBe(rupees(8500))
  })

  it('calculates revenue today using Kathmandu civil date', () => {
    // 2026-07-31T19:00:00.000Z is 2026-08-01 00:45 NPT in Kathmandu
    const pickupKathmanduAug1 = new Date('2026-07-31T19:00:00.000Z')
    const todayKathmanduAug1 = new Date('2026-08-01T04:00:00.000Z')

    const rows = [
      dummyRow({
        bookingNo: 'BK-1',
        pickup: { ad: pickupKathmanduAug1, time: '01:00', who: 'Ramesh' },
        amount: rupees(15000),
      }),
      dummyRow({
        bookingNo: 'BK-2',
        pickup: { ad: new Date('2026-08-02T02:00:00.000Z'), time: '10:00', who: 'Ramesh' },
        amount: rupees(25000),
      }),
    ]
    expect(calculateRevenueToday(rows, todayKathmanduAug1)).toBe(rupees(15000))
  })

  it('calculates active rentals and overdue count', () => {
    const rows = [
      dummyRow({ status: 'Booked' }),
      dummyRow({ status: 'On Rent', flags: ['Overdue'] }),
      dummyRow({ status: 'Closed' }),
      dummyRow({ status: 'Booked', flags: ['Cancelled'] }),
    ]
    expect(calculateActiveRentals(rows)).toBe(2)
    expect(countOverdue(rows)).toBe(1)
  })

  it('calculates pickups and returns today accurately', () => {
    const today = new Date('2026-08-01T04:00:00.000Z')
    const rows = [
      dummyRow({
        pickup: { ad: new Date('2026-08-01T02:00:00.000Z'), time: '10:00', who: 'Ramesh' },
        ret: { ad: new Date('2026-08-01T12:00:00.000Z'), time: '18:00', who: 'Hari' },
        progress: 1,
        status: 'On Rent',
        flags: ['Overdue'],
      }),
    ]
    expect(calculatePickupsToday(rows, today)).toEqual({ total: 1, done: 1 })
    expect(calculateReturnsToday(rows, today)).toEqual({ total: 1, overdue: 1 })
  })
})
