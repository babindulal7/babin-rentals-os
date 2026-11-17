import { describe, expect, it } from 'vitest'
import {
  assertAvailabilityLine,
  assertCompleteRentalWindow,
  assertLiveReservation,
  requireVerifiedProductMode,
} from '../availabilityIntegrity'

describe('availability integrity — never invent stock or a valid period', () => {
  it('accepts a real 06:00-to-06:00 Nepal rental window', () => {
    expect(() => assertCompleteRentalWindow(
      'B-01', '2026-11-03T00:15:00.000Z', '2026-11-04T00:15:00.000Z',
    )).not.toThrow()
  })

  it('rejects missing, invalid, reversed and zero-length rental windows', () => {
    const start = '2026-11-03T00:15:00.000Z'
    const end = '2026-11-04T00:15:00.000Z'
    for (const [from, to] of [
      [null, end],
      [start, null],
      ['not-a-date', end],
      [start, 'not-a-date'],
      [end, start],
      [start, start],
    ] as const) {
      expect(() => assertCompleteRentalWindow('B-01', from, to)).toThrow(/invalid or incomplete rental window/)
    }
  })

  it('requires each evaluated line to identify a real equipment product', () => {
    expect(() => assertAvailabilityLine('B-01', {
      id: 'line-1', product_id: null, description: 'Unresolved bundle', qty: 1,
    })).toThrow(/without a linked equipment product/)
  })

  it('rejects missing or invalid line quantities instead of defaulting to one', () => {
    for (const qty of [0, -1, 1.5, NaN, Infinity]) {
      expect(() => assertAvailabilityLine('B-01', {
        id: 'line-1', product_id: 'product-1', description: 'FX3', qty,
      })).toThrow(/invalid line quantity/)
    }
  })

  it('accepts valid positive equipment quantities', () => {
    expect(() => assertAvailabilityLine('B-01', {
      id: 'line-1', product_id: 'product-1', description: 'FX3', qty: 1,
    })).not.toThrow()
  })

  it('never assumes one item in stock when the product read is missing', () => {
    expect(() => requireVerifiedProductMode('product-1', undefined)).toThrow(/could not be read/)
  })

  it('rejects unrecognized modes and missing or corrupt stock ceilings', () => {
    for (const mode of ['Unknown', 'serialised', '']) {
      expect(() => requireVerifiedProductMode('p', { trackingMode: mode, totalQuantity: 1 }))
        .toThrow(/unknown tracking mode/)
    }
    for (const totalQuantity of [-1, NaN, Infinity, 1.5]) {
      expect(() => requireVerifiedProductMode('p', { trackingMode: 'Quantity', totalQuantity }))
        .toThrow(/invalid stock capacity/)
    }
  })

  it('preserves zero stock as zero instead of replacing it with a default', () => {
    expect(requireVerifiedProductMode('p', { trackingMode: 'Quantity', totalQuantity: 0 }))
      .toEqual({ trackingMode: 'Quantity', totalQuantity: 0 })
  })

  it('rejects a live reservation with an unknown state or no stock identity', () => {
    expect(() => assertLiveReservation({
      hold_state: 'none', qty: 1, asset_id: null, product_id: 'p',
    })).toThrow(/unknown state/)
    expect(() => assertLiveReservation({
      hold_state: null, qty: 1, asset_id: 'a', product_id: null,
    })).toThrow(/unknown state/)
    expect(() => assertLiveReservation({
      hold_state: 'confirmed', qty: 1, asset_id: null, product_id: null,
    })).toThrow(/no equipment reference/)
  })

  it('rejects malformed live reservation quantity', () => {
    expect(() => assertLiveReservation({
      hold_state: 'active_hold', qty: 0, asset_id: 'a', product_id: null,
    })).toThrow(/invalid quantity/)
  })

  it('recognizes real active holds and confirmed reservations', () => {
    for (const hold_state of ['active_hold', 'confirmed']) {
      expect(() => assertLiveReservation({
        hold_state, qty: 1, asset_id: 'unit-1', product_id: 'product-1',
      })).not.toThrow()
    }
  })
})
