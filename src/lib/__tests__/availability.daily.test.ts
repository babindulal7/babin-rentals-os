import { describe, it, expect } from 'vitest'
import {
  computeDailyAvailability,
  findNextFreeDate,
  type UnitCandidate,
  type UnitHold,
  type QuantityHold,
} from '../availability'

describe('Daily Availability & Next Free Date Engine (T3-22, W91)', () => {
  const candidates: UnitCandidate[] = [
    { unitId: 'u1', assetTag: 'FX3-01', serialNo: 'SN1', productId: 'p1', state: 'In Stock', retiredAt: null },
    { unitId: 'u2', assetTag: 'FX3-02', serialNo: 'SN2', productId: 'p1', state: 'In Stock', retiredAt: null },
    { unitId: 'u3', assetTag: 'FX3-03', serialNo: 'SN3', productId: 'p1', state: 'In Stock', retiredAt: null },
    { unitId: 'u4', assetTag: 'FX3-04', serialNo: 'SN4', productId: 'p1', state: 'Retired', retiredAt: '2026-01-01T00:00:00Z' },
  ]

  it('computes daily availability for unit-tracked stock excluding retired units', () => {
    const map = computeDailyAvailability({
      mode: 'unit',
      candidates,
      unitHolds: [],
      startDateIso: '2026-11-10',
      daysCount: 5,
    })

    expect(Object.keys(map).length).toBe(5)
    // 3 active units (u1, u2, u3), u4 is retired
    expect(map['2026-11-10']).toBe(3)
    expect(map['2026-11-11']).toBe(3)
    expect(map['2026-11-12']).toBe(3)
    expect(map['2026-11-13']).toBe(3)
    expect(map['2026-11-14']).toBe(3)
  })

  it('reduces available units on dates covered by unit holds', () => {
    const unitHolds: UnitHold[] = [
      {
        unitId: 'u1',
        bookingId: 'b1',
        bookingNo: '880',
        window: {
          fromAd: '2026-11-10T00:15:00Z',
          toAd: '2026-11-12T00:15:00Z',
        },
      },
      {
        unitId: 'u2',
        bookingId: 'b2',
        bookingNo: '881',
        window: {
          fromAd: '2026-11-11T00:15:00Z',
          toAd: '2026-11-13T00:15:00Z',
        },
      },
    ]

    const map = computeDailyAvailability({
      mode: 'unit',
      candidates,
      unitHolds,
      startDateIso: '2026-11-10',
      daysCount: 5,
    })

    // On 10 Nov: u1 held (2 free)
    expect(map['2026-11-10']).toBe(2)
    // On 11 Nov: u1 and u2 held (1 free)
    expect(map['2026-11-11']).toBe(1)
    // On 12 Nov: u1 free (half-open end), u2 held (2 free)
    expect(map['2026-11-12']).toBe(2)
    // On 13 Nov: both free (3 free)
    expect(map['2026-11-13']).toBe(3)
  })

  it('computes daily availability for quantity-tracked stock against peak holds', () => {
    const quantityHolds: QuantityHold[] = [
      {
        bookingId: 'b1',
        bookingNo: '880',
        qty: 3,
        window: {
          fromAd: '2026-11-10T00:15:00Z',
          toAd: '2026-11-12T00:15:00Z',
        },
      },
    ]

    const map = computeDailyAvailability({
      mode: 'quantity',
      totalQuantity: 10,
      quantityHolds,
      startDateIso: '2026-11-10',
      daysCount: 3,
    })

    expect(map['2026-11-10']).toBe(7)
    expect(map['2026-11-11']).toBe(7)
    expect(map['2026-11-12']).toBe(10) // Released after window ends
  })

  it('finds next free date immediately when units are available today', () => {
    const map = {
      '2026-11-10': 2,
      '2026-11-11': 2,
    }

    const res = findNextFreeDate(map, '2026-11-10', 1)
    expect(res.isAvailableNow).toBe(true)
    expect(res.date).toBe('2026-11-10')
    expect(res.relativeDays).toBe(0)
  })

  it('finds future next free date when stock is zero today', () => {
    const map = {
      '2026-11-10': 0,
      '2026-11-11': 0,
      '2026-11-12': 1,
      '2026-11-13': 3,
    }

    const res = findNextFreeDate(map, '2026-11-10', 1)
    expect(res.isAvailableNow).toBe(false)
    expect(res.date).toBe('2026-11-12')
    expect(res.relativeDays).toBe(2)
  })

  it('returns null date when requested quantity is never reached', () => {
    const map = {
      '2026-11-10': 0,
      '2026-11-11': 1,
    }

    const res = findNextFreeDate(map, '2026-11-10', 5)
    expect(res.date).toBeNull()
    expect(res.isAvailableNow).toBe(false)
    expect(res.relativeDays).toBeNull()
  })
})
