import { describe, expect, it } from 'vitest'
import { deriveAttentionTasks } from '../attentionModel'
import type { BookingListRow } from '../../../lib/queries/bookings'

function mockRow(overrides: Partial<BookingListRow>): BookingListRow {
  return {
    id: 'row-1',
    bookingNo: 'BK-1001',
    clientId: 'cl-1',
    clientName: 'Acme Media',
    project: 'Commercial Shoot',
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
    itemCount: 4,
    depositRequired: null,
    depositHeld: null,
    totalAmount: null,
    ...overrides,
  }
}

describe('attentionModel: deriveAttentionTasks', () => {
  const now = '2026-10-18T12:00:00.000Z'

  it('derives overdue return task from On Rent row with past returnAtAd', () => {
    const overdue = [
      mockRow({
        id: 'bk-1',
        bookingNo: 'BK-101',
        stage: 'On Rent',
        returnAtAd: '2026-10-18T09:00:00.000Z',
      }),
    ]
    const tasks = deriveAttentionTasks(overdue, [], now)
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toEqual({
      key: 'overdue_return:bk-1',
      bookingId: 'bk-1',
      bookingNo: 'BK-101',
      stage: 'On Rent',
      kind: 'overdue_return',
      severity: 'critical',
      dueAtAd: '2026-10-18T09:00:00.000Z',
      job: 'Return',
      label: 'Overdue Return',
      detail: 'Due 3h overdue',
      clientName: 'Acme Media',
      deliveryType: 'Customer Pickup',
    })
  })

  it('derives late pickup with Pack job when stage is Booked', () => {
    const latePickups = [
      mockRow({
        id: 'bk-2',
        bookingNo: 'BK-102',
        stage: 'Booked',
        pickupAtAd: '2026-10-18T08:00:00.000Z',
      }),
    ]
    const tasks = deriveAttentionTasks([], latePickups, now)
    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.kind).toBe('late_pickup_booked')
    expect(tasks[0]?.severity).toBe('high')
    expect(tasks[0]?.job).toBe('Pack')
    expect(tasks[0]?.stage).toBe('Booked')
    expect(tasks[0]?.label).toContain('Needs Packing')
  })

  it('derives late pickup with Handover job when stage is Packed', () => {
    const latePickups = [
      mockRow({
        id: 'bk-3',
        bookingNo: 'BK-103',
        stage: 'Packed',
        pickupAtAd: '2026-10-18T08:30:00.000Z',
      }),
    ]
    const tasks = deriveAttentionTasks([], latePickups, now)
    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.kind).toBe('late_pickup_packed')
    expect(tasks[0]?.severity).toBe('high')
    expect(tasks[0]?.job).toBe('Handover')
    expect(tasks[0]?.stage).toBe('Packed')
    expect(tasks[0]?.label).toContain('Awaiting Handover')
  })

  it('filters out rows with wrong stages or actualReturnAtAd already recorded', () => {
    const overdue = [
      mockRow({
        id: 'bk-4',
        bookingNo: 'BK-104',
        stage: 'Returned',
        actualReturnAtAd: '2026-10-18T10:00:00.000Z',
      }),
      mockRow({
        id: 'bk-5',
        bookingNo: 'BK-105',
        stage: 'Closed',
      }),
    ]
    const latePickups = [
      mockRow({
        id: 'bk-6',
        bookingNo: 'BK-106',
        stage: 'On Rent',
      }),
      mockRow({
        id: 'bk-7',
        bookingNo: 'BK-107',
        stage: 'Returned',
      }),
    ]
    const tasks = deriveAttentionTasks(overdue, latePickups, now)
    expect(tasks).toHaveLength(0)
  })

  it('sorts Critical (overdue return) before High (late pickup), then oldest first', () => {
    const overdue = [
      mockRow({
        id: 'ret-newer',
        bookingNo: 'BK-202',
        stage: 'On Rent',
        returnAtAd: '2026-10-18T10:00:00.000Z',
      }),
      mockRow({
        id: 'ret-older',
        bookingNo: 'BK-201',
        stage: 'On Rent',
        returnAtAd: '2026-10-17T12:00:00.000Z',
      }),
    ]
    const latePickups = [
      mockRow({
        id: 'pick-1',
        bookingNo: 'BK-101',
        stage: 'Booked',
        pickupAtAd: '2026-10-16T08:00:00.000Z', // older than ret-newer, but high severity
      }),
    ]
    const tasks = deriveAttentionTasks(overdue, latePickups, now)
    expect(tasks.map((t) => t.bookingNo)).toEqual(['BK-201', 'BK-202', 'BK-101'])
    expect(tasks[0]?.severity).toBe('critical')
    expect(tasks[1]?.severity).toBe('critical')
    expect(tasks[2]?.severity).toBe('high')
  })

  it('deduplicates identical task keys stably', () => {
    const overdue = [
      mockRow({ id: 'dup-1', bookingNo: 'BK-301', stage: 'On Rent' }),
      mockRow({ id: 'dup-1', bookingNo: 'BK-301', stage: 'On Rent' }),
    ]
    const tasks = deriveAttentionTasks(overdue, [], now)
    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.key).toBe('overdue_return:dup-1')
  })
})
