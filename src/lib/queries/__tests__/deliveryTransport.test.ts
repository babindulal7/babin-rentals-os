import { beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[] | null,
  error: null as Error | null,
}))

vi.mock('../../supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table !== 'delivery_transport_v') throw new Error(`Unexpected table ${table}`)
      const query = {
        select: () => query,
        order: () => Promise.resolve({
          data: mock.rows,
          error: mock.error,
        }),
      }
      return query
    },
  },
}))

import {
  fetchDeliveryTransportList,
  deliveryTransportReadRefusal,
} from '../deliveryTransport'

const sampleRow = {
  id: '00000000-0000-0000-0000-000000000101',
  booking_id: '00000000-0000-0000-0000-000000000201',
  booking_no: '990001',
  booking_stage: 'On Rent',
  branch_id: '00000000-0000-0000-0000-000000000301',
  client_name: 'Babin Films',
  client_phone: '+977-9800000000',
  destination: 'Kathmandu Ward 3',
  delivery_type: 'Babin Delivery',
  driver_id: '00000000-0000-0000-0000-000000000401',
  driver_name: 'Test Driver',
  vehicle: 'Delivery Van',
  number_plate: 'BA 2 CHA 1234',
  delivery_status: 'In Transit',
  scheduled_at: '2026-10-19T06:00:00Z',
  dispatched_at: '2026-10-19T07:00:00Z',
  delivered_at: null,
  recipient_name: null,
  delivery_revision: 2,
  delivery_updated_at: '2026-10-19T07:00:00Z',
  delivery_note: 'Handle with care',
  delivery_charge_paisa: 350000,
}

beforeEach(() => {
  mock.rows = []
  mock.error = null
})

describe('fetchDeliveryTransportList', () => {
  it.each(['Client', 'Manager', 'Accounts', 'Technician', null] as const)(
    'refuses unauthorized role %s without reading data',
    async (role) => {
      expect(deliveryTransportReadRefusal(role)).toBeTruthy()
      await expect(fetchDeliveryTransportList(role)).rejects.toThrow('not available')
    },
  )

  it.each(['Owner', 'Admin', 'Coordinator', 'Warehouse', 'Driver'] as const)(
    'permits authorized role %s',
    (role) => {
      expect(deliveryTransportReadRefusal(role)).toBeNull()
    },
  )

  it('returns empty list when view has no records', async () => {
    mock.rows = []
    const result = await fetchDeliveryTransportList('Owner')
    expect(result).toEqual([])
  })

  it('masks financial charges and delivery notes for money-blind roles (Warehouse)', async () => {
    mock.rows = [sampleRow]
    const result = await fetchDeliveryTransportList('Warehouse')

    expect(result).toHaveLength(1)
    expect(result[0]!.deliveryChargePaisa).toBeNull()
    expect(result[0]!.deliveryNote).toBeNull()
    expect(result[0]!.bookingNo).toBe('990001')
    expect(result[0]!.deliveryStatus).toBe('In Transit')
  })

  it('preserves integer paisa charges and notes for money-viewing roles (Owner)', async () => {
    mock.rows = [sampleRow]
    const result = await fetchDeliveryTransportList('Owner')

    expect(result).toHaveLength(1)
    expect(result[0]!.deliveryChargePaisa).toBe(350000)
    expect(result[0]!.deliveryNote).toBe('Handle with care')
    expect(result[0]!.driverName).toBe('Test Driver')
  })

  it('fails closed on database error', async () => {
    mock.error = new Error('network down')
    await expect(fetchDeliveryTransportList('Owner')).rejects.toThrow('Unable to load delivery transport records')
  })
})
