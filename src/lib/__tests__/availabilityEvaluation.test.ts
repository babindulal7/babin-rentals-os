import { describe, it, expect } from 'vitest'
import {
  isHoldOccupying,
  calculatePeakOccupancy,
  evaluateBookingAvailability,
  type EvaluatedHold,
  type ProductInventoryDefinition,
  type UnitInventoryCandidate,
} from '../availabilityEvaluation'

const WINDOW = {
  fromAd: '2026-11-10T06:00:00.000Z',
  toAd: '2026-11-12T06:00:00.000Z',
}

describe('availabilityEvaluation', () => {
  it('treats released, expired_hold, and past-expiry active_hold as non-occupying', () => {
    const nowIso = '2026-11-10T05:00:00.000Z'
    const base: Omit<EvaluatedHold, 'holdState'> = {
      reservationId: 'r-1',
      bookingId: 'b-1',
      bookingNo: 'BK-001',
      qty: 1,
      window: WINDOW,
    }

    expect(isHoldOccupying({ ...base, holdState: 'released' }, nowIso)).toBe(false)
    expect(isHoldOccupying({ ...base, holdState: 'expired_hold' }, nowIso)).toBe(false)
    expect(isHoldOccupying({ ...base, holdState: 'confirmed' }, nowIso)).toBe(true)
    expect(isHoldOccupying({ ...base, holdState: 'active_hold', expiresAt: '2026-11-10T04:00:00.000Z' }, nowIso)).toBe(false)
    expect(isHoldOccupying({ ...base, holdState: 'active_hold', expiresAt: '2026-11-10T07:00:00.000Z' }, nowIso)).toBe(true)
  })

  it('computes peak concurrent occupancy across overlapping intervals', () => {
    const holds: EvaluatedHold[] = [
      {
        reservationId: 'r-1',
        bookingId: 'b-1',
        bookingNo: 'BK-001',
        holdState: 'confirmed',
        productId: 'p-qty',
        qty: 2,
        window: { fromAd: '2026-11-10T06:00:00.000Z', toAd: '2026-11-11T06:00:00.000Z' },
      },
      {
        reservationId: 'r-2',
        bookingId: 'b-2',
        bookingNo: 'BK-002',
        holdState: 'confirmed',
        productId: 'p-qty',
        qty: 3,
        window: { fromAd: '2026-11-10T12:00:00.000Z', toAd: '2026-11-12T06:00:00.000Z' },
      },
    ]

    expect(calculatePeakOccupancy(WINDOW, holds)).toBe(5)
  })

  it('detects serialised conflict and reports conflicting booking', () => {
    const products = new Map<string, ProductInventoryDefinition>([
      ['p-cam', { productId: 'p-cam', name: 'Sony FX6', trackingMode: 'Serialised', totalQuantity: 2 }],
    ])
    const unitsByProduct = new Map<string, readonly UnitInventoryCandidate[]>([
      [
        'p-cam',
        [
          { unitId: 'u-1', assetTag: 'EQ0001-01', serialNo: 'S1', productId: 'p-cam', state: 'In Stock' },
          { unitId: 'u-2', assetTag: 'EQ0001-02', serialNo: 'S2', productId: 'p-cam', state: 'In Stock' },
        ],
      ],
    ])
    const holds: EvaluatedHold[] = [
      {
        reservationId: 'r-1',
        bookingId: 'b-1',
        bookingNo: 'BK-001',
        holdState: 'confirmed',
        assetId: 'u-1',
        qty: 1,
        window: WINDOW,
      },
      {
        reservationId: 'r-2',
        bookingId: 'b-2',
        bookingNo: 'BK-002',
        holdState: 'confirmed',
        assetId: 'u-2',
        qty: 1,
        window: WINDOW,
      },
    ]

    const result = evaluateBookingAvailability({
      window: WINDOW,
      lines: [{ lineId: 'l-1', productId: 'p-cam', productName: 'Sony FX6', requestedQty: 1, window: WINDOW }],
      products,
      unitsByProduct,
      holds,
    })

    expect(result.isAllAvailable).toBe(false)
    expect(result.lineResults[0]?.status).toBe('conflict')
    expect(result.lineResults[0]?.conflictingBookingNo).toBe('BK-001')
  })

  it('evaluates quantity product availability against peak occupancy', () => {
    const products = new Map<string, ProductInventoryDefinition>([
      ['p-cab', { productId: 'p-cab', name: 'SDI Cable', trackingMode: 'Quantity', totalQuantity: 5 }],
    ])
    const holds: EvaluatedHold[] = [
      {
        reservationId: 'r-1',
        bookingId: 'b-1',
        bookingNo: 'BK-001',
        holdState: 'confirmed',
        productId: 'p-cab',
        qty: 3,
        window: WINDOW,
      },
    ]

    const ok = evaluateBookingAvailability({
      window: WINDOW,
      lines: [{ lineId: 'l-1', productId: 'p-cab', productName: 'SDI Cable', requestedQty: 2, window: WINDOW }],
      products,
      unitsByProduct: new Map(),
      holds,
    })
    expect(ok.isAllAvailable).toBe(true)
    expect(ok.lineResults[0]?.availableQty).toBe(2)

    const over = evaluateBookingAvailability({
      window: WINDOW,
      lines: [{ lineId: 'l-1', productId: 'p-cab', productName: 'SDI Cable', requestedQty: 3, window: WINDOW }],
      products,
      unitsByProduct: new Map(),
      holds,
    })
    expect(over.isAllAvailable).toBe(false)
    expect(over.lineResults[0]?.status).toBe('conflict')
  })
})
