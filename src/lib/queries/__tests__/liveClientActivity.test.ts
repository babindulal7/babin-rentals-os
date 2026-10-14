import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  clients: [] as Record<string, unknown>[] | null,
  bookings: [] as Record<string, unknown>[] | null,
  failTable: '',
}))

vi.mock('../../supabase', () => ({
  supabase: {
    from(table: string) {
      const query = {
        select: () => query,
        order: () => query,
        range: (from: number, to: number) => ({
          then: (accept: (r: { data: Record<string, unknown>[] | null; error: Error | null }) => unknown) => {
            const records = table === 'clients_v' ? state.clients : state.bookings
            const error = table === state.failTable ? new Error('permission denied') : null
            return Promise.resolve({ data: records?.slice(from, to + 1) ?? null, error }).then(accept)
          },
        }),
      }
      return query
    },
  },
}))

import { getLiveClientActivityReport } from '../liveClientActivity'

describe('live client activity is never made up', () => {
  beforeEach(() => {
    state.clients = []
    state.bookings = []
    state.failTable = ''
  })

  it('shows an honest zero for an empty accessible database', async () => {
    const r = await getLiveClientActivityReport()
    expect(r.totalVisibleClients).toBe(0)
    expect(r.clientsWithRentals).toBe(0)
    expect(r.repeatClients).toBe(0)
    expect(r.repeatClientRate).toBe(0)
    expect(r.rows).toEqual([])
  })

  it('counts repeat clients only from confirmed and fulfilled rentals', async () => {
    state.clients = [
      { id: 'a', client_code: 'C-1', name: 'Client A', status: 'Active' },
      { id: 'b', client_code: 'C-2', name: 'Client B', status: 'Active' },
      { id: 'c', client_code: 'C-3', name: 'Client C', status: 'Inactive' },
    ]
    state.bookings = [
      { client_id: 'a', stage: 'Booked', created_at: '2026-09-01T00:00:00Z' },
      { client_id: 'a', stage: 'Closed', created_at: '2026-10-01T00:00:00Z' },
      { client_id: 'a', stage: 'Booked', created_at: '2026-10-05T00:00:00Z', cancelled_at: '2026-10-06T00:00:00Z' },
      { client_id: 'b', stage: 'Packed', created_at: '2026-09-20T00:00:00Z' },
      { client_id: 'b', stage: 'Quote', created_at: '2026-10-07T00:00:00Z' },
      { client_id: 'outside-rls-directory', stage: 'Closed', created_at: '2026-10-09T00:00:00Z' },
    ]
    const r = await getLiveClientActivityReport()
    expect(r.totalVisibleClients).toBe(3)
    expect(r.clientsWithRentals).toBe(2)
    expect(r.repeatClients).toBe(1)
    expect(r.repeatClientRate).toBe(50)
    expect(r.totalRentalBookings).toBe(3)
    expect(r.rows[0]).toMatchObject({ clientCode: 'C-1', bookingCount: 2, lastBookingCreatedAd: '2026-10-01' })
    expect(r.rows.find((x) => x.clientCode === 'C-3')?.bookingCount).toBe(0)
  })

  it('rejects RLS/query errors without displaying imaginary counts', async () => {
    state.failTable = 'bookings'
    await expect(getLiveClientActivityReport()).rejects.toThrow('Unable to read client booking history')
  })
})
