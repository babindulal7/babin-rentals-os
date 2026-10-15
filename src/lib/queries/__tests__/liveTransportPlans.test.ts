import { beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({
  transports: [] as Record<string, unknown>[] | null,
  bookings: [] as Record<string, unknown>[] | null,
  fail: '' as string,
  transportSelect: '' as string,
}))

vi.mock('../../supabase', () => ({
  supabase: {
    from(table: string) {
      const query = {
        select(columns: string) {
          if (table === 'booking_transport_v') mock.transportSelect = columns
          return query
        },
        order: () => query,
        range: (start: number, end: number) => ({
          then: (fn: (r: unknown) => unknown) => Promise.resolve({
            data: mock.transports?.slice(start, end + 1) ?? null,
            error: mock.fail === table ? new Error('denied') : null,
          }).then(fn),
        }),
        in: (_column: string, values: string[]) => ({
          then: (fn: (r: unknown) => unknown) => Promise.resolve({
            data: mock.bookings?.filter((b) => values.includes(String(b['id']))) ?? null,
            error: mock.fail === table ? new Error('denied') : null,
          }).then(fn),
        }),
      }
      return query
    },
  },
}))

import { getLiveTransportPlans, liveTransportReadRefusal } from '../liveTransportPlans'

const plan = {
  id: 't-1', booking_id: 'b-1', vehicle: 'Van', number_plate: 'BA 12',
  driver_contact: '9800000000', special_instructions: 'Fragile', delivery_charge: 1000,
}
const booking = {
  id: 'b-1', booking_no: 'B-123', pickup_at: '2026-10-15T04:00:00Z',
  pickup_location: 'Kathmandu', delivery_type: 'Babin Delivery', cancelled_at: null,
  clients: { name: 'Test client', phone: '9811111111', address_line: 'Boudha' },
}

beforeEach(() => {
  mock.transports = []
  mock.bookings = []
  mock.fail = ''
  mock.transportSelect = ''
})

describe('verified live transport read-only plans', () => {
  it.each(['Driver', 'Client', 'Manager', 'Accounts', 'Technician', null] as const)(
    'refuses unauthorized role %s without reading data', async role => {
      expect(liveTransportReadRefusal(role)).toBeTruthy()
      await expect(getLiveTransportPlans(role)).rejects.toThrow('not available')
    },
  )

  it('returns an honest empty list without example dispatches', async () => {
    expect(await getLiveTransportPlans('Owner')).toEqual([])
  })

  it('shows only verified active booking details and masks money for Warehouse', async () => {
    mock.transports = [plan]
    mock.bookings = [booking]
    const r = await getLiveTransportPlans('Warehouse')
    expect(mock.transportSelect).not.toContain('delivery_charge')
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ bookingNo: 'B-123', clientName: 'Test client', quotedDeliveryFeeNpr: null })
    expect(r[0]).not.toHaveProperty('status')
    expect(r[0]).not.toHaveProperty('deliveredAt')
  })

  it('shows quoted charge to Owner, never calls it collected revenue', async () => {
    mock.transports = [plan]
    mock.bookings = [booking]
    const r = await getLiveTransportPlans('Owner')
    expect(mock.transportSelect).toContain('delivery_charge')
    expect(r[0]?.quotedDeliveryFeeNpr).toBe(1000)
  })

  it('fails closed when a transport row joins an invisible booking', async () => {
    mock.transports = [plan]
    await expect(getLiveTransportPlans('Owner')).rejects.toThrow('cannot verify')
  })

  it('does not show cancelled booking transport records', async () => {
    mock.transports = [plan]
    mock.bookings = [{ ...booking, cancelled_at: '2026-10-15T00:00:00Z' }]
    expect(await getLiveTransportPlans('Owner')).toEqual([])
  })

  it('fails closed on view query errors without substituting fixtures', async () => {
    mock.fail = 'booking_transport_v'
    await expect(getLiveTransportPlans('Owner')).rejects.toThrow('Unable to load transport plans')
  })
})
