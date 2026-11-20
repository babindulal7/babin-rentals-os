import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../lib/supabase', () => ({
  IS_MOCK: true,
  supabase: {},
}))

import { toDayRouteStop } from '../getDayRoute'

/* O-28 (migration 0246): the route read maps snake_case rows, and carries the grid fee status. */
const baseRow = {
  id: 'job-1',
  booking_id: 'bk-1',
  booking_no: 'BR-1001',
  leg: 'Outbound' as const,
  scheduled_at: '2026-11-18T10:00:00+05:45',
  status: 'Scheduled',
  route_position: 1,
  client_name: 'Client A',
  client_phone: '+977 98',
  address: 'Thamel',
  neighborhood: 'Central',
  map_pin_lat: null,
  map_pin_lng: null,
  driver_name: null,
  driver_phone: null,
  vehicle: 'Van 2',
  zone_name: 'Inside Ring Road',
  zone_fee_paisa: 150000,
  zone_fee_status: 'set',
}

describe('toDayRouteStop (O-28)', () => {
  it('maps snake_case keys to the screen shape', () => {
    const stop = toDayRouteStop(baseRow)
    expect(stop.bookingId).toBe('bk-1')
    expect(stop.zoneName).toBe('Inside Ring Road')
    expect(stop.zoneFeeStatus).toBe('set')
  })

  it('keeps a grid amount in integer paisa, never as text', () => {
    expect(toDayRouteStop({ ...baseRow, zone_fee_paisa: '150000' }).zoneFeePaisa).toBe(150000)
  })

  it('keeps a null fee null, so a missing amount never becomes zero', () => {
    const stop = toDayRouteStop({ ...baseRow, zone_fee_paisa: null, zone_fee_status: 'fee-not-set' })
    expect(stop.zoneFeePaisa).toBeNull()
    expect(stop.zoneFeeStatus).toBe('fee-not-set')
  })

  it('returns a null status for a money-blind caller', () => {
    const stop = toDayRouteStop({ ...baseRow, zone_fee_paisa: null, zone_fee_status: null })
    expect(stop.zoneFeeStatus).toBeNull()
  })

  it('treats an unknown status from the server as null rather than trusting it', () => {
    expect(toDayRouteStop({ ...baseRow, zone_fee_status: 'free-delivery' }).zoneFeeStatus).toBeNull()
  })
})
