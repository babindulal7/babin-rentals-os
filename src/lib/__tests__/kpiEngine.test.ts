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
import type { RentalRow } from '../../data/rentals'

describe('KPI Engine (src/lib/kpiEngine.ts)', () => {
  const dummyRow = (overrides: Partial<RentalRow> = {}): RentalRow => ({
    id: 'BK-001',
    code: 'BK-001',
    client: 'Test Client',
    project: 'Test Project',
    status: 'Booked',
    flags: [],
    progress: 0,
    items: 2,
    amount: rupees(10000),
    due: rupees(5000),
    paid: rupees(5000),
    pickup: { bs: '1 Shrawan', ad: new Date('2026-08-01T02:00:00.000Z'), time: '10:00' },
    ret: { bs: '3 Shrawan', ad: new Date('2026-08-03T02:00:00.000Z'), time: '18:00' },
    crew: false,
    ...overrides,
  })

  it('sums payment due directly in integer Paisa for active bookings', () => {
    const rows = [
      dummyRow({ id: 'BK-1', due: rupees(5000) }),
      dummyRow({ id: 'BK-2', due: rupees(3500) }),
      dummyRow({ id: 'BK-3', due: rupees(2000), flags: ['Cancelled'] }),
    ]
    expect(calculatePaymentDue(rows)).toBe(rupees(8500))
  })

  it('calculates revenue today using Kathmandu civil date', () => {
    // 2026-07-31T19:00:00.000Z is 2026-08-01 00:45 NPT in Kathmandu
    const pickupKathmanduAug1 = new Date('2026-07-31T19:00:00.000Z')
    const todayKathmanduAug1 = new Date('2026-08-01T04:00:00.000Z')

    const rows = [
      dummyRow({
        id: 'BK-1',
        pickup: { bs: '1 Shrawan', ad: pickupKathmanduAug1, time: '01:00' },
        amount: rupees(15000),
      }),
      dummyRow({
        id: 'BK-2',
        pickup: { bs: '2 Shrawan', ad: new Date('2026-08-02T02:00:00.000Z'), time: '10:00' },
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
        pickup: { bs: '1 Shrawan', ad: new Date('2026-08-01T02:00:00.000Z'), time: '10:00' },
        ret: { bs: '1 Shrawan', ad: new Date('2026-08-01T12:00:00.000Z'), time: '18:00' },
        progress: 1,
        status: 'On Rent',
        flags: ['Overdue'],
      }),
    ]
    expect(calculatePickupsToday(rows, today)).toEqual({ total: 1, done: 1 })
    expect(calculateReturnsToday(rows, today)).toEqual({ total: 1, overdue: 1 })
  })
})
