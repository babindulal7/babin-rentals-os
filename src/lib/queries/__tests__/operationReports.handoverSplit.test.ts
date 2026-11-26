import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fakeSupabase, type TableAnswer } from './fakeSupabase'

/*
 * The Operations report's handover figures and its late-pickup flag:
 *   - Total Dispatches counts completed handover sessions; the Handover
 *     Fulfillment Method split counts non-cancelled bookings by delivery type.
 *     Which basis the split should use is an open decision (a TODO in
 *     operationReports.ts), so the split is pinned as it stands;
 *   - a packing job whose pickup is at or before now is a late pickup, the
 *     `latePickups` rule in queries/bookings.ts.
 */

const state = vi.hoisted(() => ({
  client: null as unknown as { from: (table: string) => unknown },
}))
vi.mock('../../supabase', () => ({
  IS_MOCK: false,
  supabase: { from: (table: string) => state.client.from(table) },
}))

const { getOperationsReport } = await import('../operationReports')

function useTables(tables: Record<string, TableAnswer>) {
  state.client = fakeSupabase(tables).client
}

// 24 Nov 2026, 05:11 in Kathmandu.
const NOW = new Date('2026-11-23T23:26:00Z')

const booking = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  booking_no: `BK-${id}`,
  stage: 'On Rent',
  pickup_at: '2026-11-20T09:00:00Z',
  return_at: '2026-11-27T09:00:00Z',
  actual_return_at: null,
  delivery_type: 'Client Pickup',
  project: null,
  cancelled_at: null,
  booking_lines: [],
  ...extra,
})

const handover = (id: string, bookingId: string, extra: Record<string, unknown> = {}) => ({
  id,
  booking_id: bookingId,
  operation: 'Handover',
  state: 'Completed',
  started_at: null,
  completed_at: '2026-11-20T09:05:00Z',
  cancelled_at: null,
  warehouse_staff_id: null,
  receiver_name: null,
  pickup_person_name: null,
  returning_person_name: null,
  government_id_verified: true,
  ...extra,
})

describe('Total Dispatches counts completed handovers; the method split counts bookings', () => {
  beforeEach(() => useTables({}))

  it('keeps the booking split and counts no dispatches when no handover is completed', async () => {
    useTables({
      bookings: [booking('b1'), booking('b2', { delivery_type: 'Babin Delivery', stage: 'Booked' })],
    })
    const report = await getOperationsReport(undefined, NOW)
    expect(report.metrics.totalPickups).toBe(0)
    expect(report.deliveryMethods).toEqual([
      { method: 'Client Pickup', count: 1, percent: 50 },
      { method: 'Babin Delivery', count: 1, percent: 50 },
    ])
  })

  it('counts only completed handovers for Total Dispatches, and splits every non-cancelled booking', async () => {
    useTables({
      bookings: [booking('b1'), booking('b2', { delivery_type: 'Babin Delivery', stage: 'Booked' })],
      operation_sessions: [
        handover('s1', 'b1'),
        handover('s2', 'b1'),
        handover('s3', 'b2', { state: 'In Progress', completed_at: null }),
        handover('s4', 'b2', { operation: 'Return' }),
      ],
    })
    const report = await getOperationsReport(undefined, NOW)
    expect(report.metrics.totalPickups).toBe(2)
    expect(report.deliveryMethods).toEqual([
      { method: 'Client Pickup', count: 1, percent: 50 },
      { method: 'Babin Delivery', count: 1, percent: 50 },
    ])
  })
})

describe('the packing queue flags a late pickup', () => {
  it('flags a Booked or Packed booking whose pickup is at or before now, to the minute', async () => {
    useTables({
      bookings: [
        booking('late', { stage: 'Booked', pickup_at: '2026-07-16T00:15:00Z' }),
        booking('same-minute', { stage: 'Packed', pickup_at: '2026-11-23T23:26:00Z' }),
        booking('upcoming', { stage: 'Booked', pickup_at: '2026-11-24T10:00:00Z' }),
        booking('rented', { stage: 'On Rent', pickup_at: '2026-07-16T00:15:00Z' }),
      ],
    })
    const report = await getOperationsReport(undefined, NOW)
    const flags = Object.fromEntries(report.packingJobs.map((job) => [job.bookingNo, job.latePickup]))
    expect(flags).toEqual({ 'BK-late': true, 'BK-same-minute': true, 'BK-upcoming': false })
  })
})
