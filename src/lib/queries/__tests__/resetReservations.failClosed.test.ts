import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  data: [] as Array<{ asset_id: string; period: string | null; bookings: { id: string; booking_no: string; pickup_at: string } | null }>,
  error: null as null | { message: string },
  count: 0,
}))

vi.mock('../../supabase', () => ({
  supabase: {
    from: () => {
      const query = {
        select: () => query,
        is: () => query,
        in: () => query,
        neq: () => query,
        then: (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) =>
          Promise.resolve({ data: state.data, error: state.error, count: state.count }).then(resolve, reject),
      }
      return query
    },
  },
}))

import { getNextReservationsForUnits } from '../reset'

beforeEach(() => {
  state.data = []
  state.error = null
  state.count = 0
})

describe('getNextReservationsForUnits — no false empty results (T2-07)', () => {
  it('keeps empty asset-list fast path', async () => {
    expect(await getNextReservationsForUnits([])).toEqual({})
  })

  it('fails visibly on a Supabase error rather than implying no urgent pickups', async () => {
    state.error = { message: 'network unavailable' }
    await expect(getNextReservationsForUnits(['asset-1']))
      .rejects.toThrow('Upcoming reservation check failed: network unavailable')
  })

  it('fails visibly when the server returns no data', async () => {
    state.data = null as unknown as typeof state.data
    await expect(getNextReservationsForUnits(['asset-1']))
      .rejects.toThrow('returned no data')
  })

  it('rejects a truncated response so a later priority booking cannot be hidden', async () => {
    state.count = 1001
    state.data = [{ asset_id: 'asset-1', period: null, bookings: null }]
    await expect(getNextReservationsForUnits(['asset-1']))
      .rejects.toThrow('incomplete (1 of 1001 rows)')
  })

  it('selects the next live pickup, not a stale unreleased reservation', async () => {
    const old = new Date(Date.now() - 86400000).toISOString()
    const soon = new Date(Date.now() + 2 * 3600000).toISOString()
    const later = new Date(Date.now() + 5 * 3600000).toISOString()
    state.data = [
      { asset_id: 'asset-1', period: null, bookings: { id: 'old', booking_no: 'B-OLD', pickup_at: old } },
      { asset_id: 'asset-1', period: null, bookings: { id: 'later', booking_no: 'B-LATER', pickup_at: later } },
      { asset_id: 'asset-1', period: null, bookings: { id: 'soon', booking_no: 'B-SOON', pickup_at: soon } },
    ]
    state.count = 3
    expect(await getNextReservationsForUnits(['asset-1']))
      .toEqual({ 'asset-1': { pickupAt: soon, bookingNo: 'B-SOON' } })
  })
})
