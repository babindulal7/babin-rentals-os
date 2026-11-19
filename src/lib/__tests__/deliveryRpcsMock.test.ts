import { describe, it, expect } from 'vitest'
import { mockDeliveryRpc, seedDeliveryMock } from '../__mocks__/deliveryRpcs'

/* The dev:mock stand-ins for the delivery RPCs (0189, 0244, 0246-0251). They exist so the screens can be driven
   in a browser; the rules themselves are proven on PGlite (`npm run test:*`). These tests pin the stand-ins. */

type Row = Record<string, unknown>
const ACTOR = 'user-1'

function env(role: string, extra: Record<string, Row[]> = {}) {
  const store: Record<string, Row[]> = { users: [{ id: ACTOR, primary_role: role }], ...extra }
  return { store, actorId: () => ACTOR }
}
async function call(name: string, args: Record<string, unknown>, e: ReturnType<typeof env>) {
  const r = mockDeliveryRpc(name, args, e)
  if (!r) throw new Error(`not handled: ${name}`)
  return r
}

describe('mockDeliveryRpc', () => {
  it('ignores RPCs it does not own, so the rest of the mock keeps answering them', () => {
    expect(mockDeliveryRpc('create_booking', {}, env('Owner'))).toBeNull()
  })

  it('seeds zones with UUID ids (the real actions require UUIDs), a quoted zone and two bands, once', () => {
    const e = env('Owner')
    seedDeliveryMock(e.store)
    seedDeliveryMock(e.store)
    expect(e.store['delivery_zones']).toHaveLength(3)
    for (const z of e.store['delivery_zones'] as Row[]) {
      expect(String(z['id'])).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    }
    expect(e.store['delivery_zone_quoted']).toHaveLength(1)
    expect(e.store['delivery_zone_distance_bands']).toHaveLength(2)
  })

  it('lists active zones and honours the active-only flag', async () => {
    const e = env('Owner')
    const all = (await call('list_delivery_zones', { p_limit: 50, p_offset: 0, p_active_only: true }, e)).data as Row[]
    expect(all).toHaveLength(3)
    ;((e.store['delivery_zones'] as Row[])[0] as Row)['is_active'] = false
    expect(((await call('list_delivery_zones', { p_limit: 50, p_offset: 0, p_active_only: true }, e)).data as Row[])).toHaveLength(2)
    expect(((await call('list_delivery_zones', { p_limit: 50, p_offset: 0, p_active_only: false }, e)).data as Row[])).toHaveLength(3)
  })

  it('refuses a bad distance band and a non-writer role, and stores a good band', async () => {
    const e = env('Manager')
    const zoneId = '00000000-0000-4000-8000-0000000000c3'
    const bad = await call('set_delivery_zone_distance_band', { p_zone_id: zoneId, p_min_km: 7, p_max_km: 3 }, e)
    expect(bad.error?.message).toContain('greater')
    const noLower = await call('set_delivery_zone_distance_band', { p_zone_id: zoneId, p_min_km: null, p_max_km: 9 }, e)
    expect(noLower.error?.message).toContain('lower bound')
    const good = await call('set_delivery_zone_distance_band', { p_zone_id: zoneId, p_min_km: 7, p_max_km: 12 }, e)
    expect(good.error).toBeNull()
    expect((e.store['delivery_zone_distance_bands'] as Row[]).find((b) => b['zone_id'] === zoneId)).toMatchObject({ min_km: 7, max_km: 12 })
    const refused = await call('set_delivery_zone_distance_band', { p_zone_id: zoneId, p_min_km: 1, p_max_km: 2 }, env('Warehouse'))
    expect(refused.error?.code).toBe('42501')
  })

  it('refuses a fixed fee on a quoted zone', async () => {
    const r = await call('set_delivery_zone_vehicle_fee', { p_zone_id: '00000000-0000-4000-8000-0000000000c3', p_vehicle_class: 'Motorbike', p_fee_paisa: 5000 }, env('Owner'))
    expect(r.error?.message).toContain('quoted per trip')
  })

  it('records an outsourced quote once per key and refuses missing vendor, note or amount', async () => {
    const booking = { id: 'b1', stage: 'Booked', cancelled_at: null }
    const e = env('Coordinator', { bookings: [booking] })
    const args = { p_client_uuid: 'k1', p_booking_id: 'b1', p_vendor: 'Test Cargo', p_quote_paisa: 250000, p_approval_note: 'ok' }
    expect((await call('record_outsourced_vehicle_quote', args, e)).error).toBeNull()
    expect((await call('record_outsourced_vehicle_quote', args, e)).error).toBeNull()
    expect(e.store['booking_outsourced_vehicle_quotes']).toHaveLength(1)
    expect((await call('record_outsourced_vehicle_quote', { ...args, p_client_uuid: 'k2', p_vendor: ' ' }, e)).error?.message).toContain('vendor')
    expect((await call('record_outsourced_vehicle_quote', { ...args, p_client_uuid: 'k3', p_quote_paisa: 0 }, e)).error?.message).toContain('more than 0')
    expect((await call('record_outsourced_vehicle_quote', { ...args, p_client_uuid: 'k4', p_approval_note: '' }, e)).error?.message).toContain('approval note')
  })

  it('adds a waiting line, appends to a Draft invoice, and refuses an issued one in words', async () => {
    const draft = env('Manager', { bookings: [{ id: 'b1', stage: 'Booked' }], invoices: [{ id: 'i1', booking_id: 'b1', status: 'Draft' }] })
    const added = await call('add_waiting_charge_line', { p_client_uuid: 'w1', p_booking_id: 'b1', p_minutes: 25, p_amount_paisa: 15000, p_note: null }, draft)
    expect((added.data as Row[])[0]).toMatchObject({ invoice_id: 'i1', appended_to_draft: true })
    const again = await call('add_waiting_charge_line', { p_client_uuid: 'w1', p_booking_id: 'b1', p_minutes: 25, p_amount_paisa: 15000, p_note: null }, draft)
    expect(again.error).toBeNull()
    expect(draft.store['booking_lines']).toHaveLength(1)

    const none = env('Manager', { bookings: [{ id: 'b2', stage: 'Booked' }] })
    const waiting = await call('add_waiting_charge_line', { p_client_uuid: 'w2', p_booking_id: 'b2', p_minutes: 5, p_amount_paisa: 1000, p_note: null }, none)
    expect((waiting.data as Row[])[0]).toMatchObject({ invoice_id: null, appended_to_draft: false })

    const issued = env('Manager', { bookings: [{ id: 'b3', stage: 'Booked' }], invoices: [{ id: 'i3', booking_id: 'b3', status: 'Sent', invoice_no: 'INV-9' }] })
    const refused = await call('add_waiting_charge_line', { p_client_uuid: 'w3', p_booking_id: 'b3', p_minutes: 5, p_amount_paisa: 1000, p_note: null }, issued)
    expect(refused.error?.message).toContain('already issued')
    expect(issued.store['booking_lines'] ?? []).toHaveLength(0)
  })

  it('refuses a waiting charge from a money-blind role and for bad minutes or amount', async () => {
    const e = env('Warehouse', { bookings: [{ id: 'b1', stage: 'Booked' }] })
    expect((await call('add_waiting_charge_line', { p_client_uuid: 'x', p_booking_id: 'b1', p_minutes: 5, p_amount_paisa: 100, p_note: null }, e)).error?.code).toBe('42501')
    const m = env('Manager', { bookings: [{ id: 'b1', stage: 'Booked' }] })
    expect((await call('add_waiting_charge_line', { p_client_uuid: 'y', p_booking_id: 'b1', p_minutes: 0, p_amount_paisa: 100, p_note: null }, m)).error?.message).toContain('minutes')
    expect((await call('add_waiting_charge_line', { p_client_uuid: 'z', p_booking_id: 'b1', p_minutes: 5, p_amount_paisa: 0, p_note: null }, m)).error?.message).toContain('more than 0')
  })
})
