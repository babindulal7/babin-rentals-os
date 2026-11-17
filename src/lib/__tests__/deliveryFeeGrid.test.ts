import { describe, it, expect } from 'vitest'
import {
  DELIVERY_VEHICLE_CLASSES,
  deliveryFeeLabel,
  resolveDeliveryFee,
} from '../deliveryFeeGrid'

/* RULING 2026-11-09 (R-9.18, R-9.20). Mirrors migration 0244. */
describe('delivery fee grid', () => {
  it('has exactly the three vehicle classes Babin ruled', () => {
    expect([...DELIVERY_VEHICLE_CLASSES]).toEqual(['Motorbike', 'Car / pickup', 'Van / larger vehicle'])
  })

  it('treats NULL as not set, never as a free delivery (0 is a real amount, NULL is not)', () => {
    expect(resolveDeliveryFee({ quotedPerTrip: false, feePaisa: null })).toEqual({ status: 'not-set' })
    expect(resolveDeliveryFee({ quotedPerTrip: false, feePaisa: 0 })).toEqual({ status: 'set', feePaisa: 0 })
  })

  it('returns the amount in paisa when a value is set', () => {
    expect(resolveDeliveryFee({ quotedPerTrip: false, feePaisa: 300000 })).toEqual({ status: 'set', feePaisa: 300000 })
  })

  it('never auto-prices a quoted zone, even if an amount were stored (R-9.20)', () => {
    expect(resolveDeliveryFee({ quotedPerTrip: true, feePaisa: 90000 })).toEqual({ status: 'quoted-per-trip' })
    expect(resolveDeliveryFee({ quotedPerTrip: true, feePaisa: null })).toEqual({ status: 'quoted-per-trip' })
  })

  it('treats a non-finite or negative stored value as not set', () => {
    expect(resolveDeliveryFee({ quotedPerTrip: false, feePaisa: -1 })).toEqual({ status: 'not-set' })
    expect(resolveDeliveryFee({ quotedPerTrip: false, feePaisa: Number.NaN })).toEqual({ status: 'not-set' })
  })

  it('rounds a fractional paisa value to whole paisa', () => {
    expect(resolveDeliveryFee({ quotedPerTrip: false, feePaisa: 12345.6 })).toEqual({ status: 'set', feePaisa: 12346 })
  })

  it('labels each state in words, never by colour alone', () => {
    expect(deliveryFeeLabel({ status: 'not-set' })).toBe('Delivery fee not set')
    expect(deliveryFeeLabel({ status: 'quoted-per-trip' })).toBe('Quoted per trip')
    expect(deliveryFeeLabel({ status: 'set', feePaisa: 300000 })).toBe('Rs 3,000')
  })
})
