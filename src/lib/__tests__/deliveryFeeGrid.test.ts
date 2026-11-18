import { describe, it, expect } from 'vitest'
import {
  DELIVERY_VEHICLE_CLASSES,
  deliveryFeeLabel,
  parseFeeInput,
  resolveDeliveryFee,
  zoneFeeStatusLabel,
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

describe('parseFeeInput (O-29 entry)', () => {
  it('treats a blank entry as not set (NULL), never zero', () => {
    expect(parseFeeInput('')).toEqual({ ok: true, feePaisa: null })
    expect(parseFeeInput('   ')).toEqual({ ok: true, feePaisa: null })
  })

  it('converts whole and two-decimal rupees to paisa', () => {
    expect(parseFeeInput('1500')).toEqual({ ok: true, feePaisa: 150000 })
    expect(parseFeeInput('1500.50')).toEqual({ ok: true, feePaisa: 150050 })
    expect(parseFeeInput('0')).toEqual({ ok: true, feePaisa: 0 })
  })

  it('refuses negatives, letters, currency symbols and more than two decimals, with a reason', () => {
    for (const bad of ['-1', 'abc', 'Rs 500', '1.234']) {
      const result = parseFeeInput(bad)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('Enter an amount in rupees')
    }
  })
})

describe('zoneFeeStatusLabel (O-28, migration 0246)', () => {
  it('returns null for a money-blind caller, so no fee text is rendered at all', () => {
    expect(zoneFeeStatusLabel(null, null)).toBeNull()
    expect(zoneFeeStatusLabel(null, 300000)).toBeNull()
  })

  it('says why a fee is missing, in words', () => {
    expect(zoneFeeStatusLabel('zone-not-chosen', null)).toBe('Zone not chosen')
    expect(zoneFeeStatusLabel('vehicle-not-chosen', null)).toBe('Vehicle class not chosen')
    expect(zoneFeeStatusLabel('fee-not-set', null)).toBe('Delivery fee not set')
    expect(zoneFeeStatusLabel('quoted-per-trip', null)).toBe('Quoted per trip')
  })

  it('shows the amount in rupees when the grid holds one', () => {
    expect(zoneFeeStatusLabel('set', 300000)).toBe('Rs 3,000')
  })

  it('fails closed to not set when status is set but no amount came back', () => {
    expect(zoneFeeStatusLabel('set', null)).toBe('Delivery fee not set')
  })
})
