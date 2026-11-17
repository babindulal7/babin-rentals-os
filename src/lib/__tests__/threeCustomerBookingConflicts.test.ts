import { describe, expect, it } from 'vitest'
import {
  evaluateBookingAvailability,
  type EvaluatedHold,
  type ProductInventoryDefinition,
  type UnitInventoryCandidate,
} from '../availabilityEvaluation'

// 06:00 Nepal local time is 00:15 UTC. One five-day Quote encompasses
// two one-day customer requests; advisory Quote overlaps do not reserve stock.
const FIVE_DAYS = {
  fromAd: '2026-11-01T00:15:00.000Z',
  toAd: '2026-11-06T00:15:00.000Z',
}
const ONE_DAY = {
  fromAd: '2026-11-03T00:15:00.000Z',
  toAd: '2026-11-04T00:15:00.000Z',
}
const AFTER_ONE_DAY = {
  fromAd: ONE_DAY.toAd,
  toAd: '2026-11-05T00:15:00.000Z',
}
const NOW = '2026-11-02T00:00:00.000Z'

const camera: ProductInventoryDefinition = {
  productId: 'camera', name: 'FX3', trackingMode: 'Serialised', totalQuantity: 1,
}
const unit: UnitInventoryCandidate = {
  unitId: 'fx3-1', productId: camera.productId,
  assetTag: 'CAM-001', serialNo: 'FX3-001', state: 'In Stock',
}
const draftA: EvaluatedHold = {
  reservationId: 'draft-a', bookingId: 'customer-a',
  bookingNo: 'B-A', isDraft: true, holdState: 'none',
  assetId: unit.unitId, productId: camera.productId,
  qty: 1, window: FIVE_DAYS,
}
const committedB: EvaluatedHold = {
  reservationId: 'reservation-b', bookingId: 'customer-b',
  bookingNo: 'B-B', holdState: 'confirmed',
  assetId: unit.unitId, productId: camera.productId,
  qty: 1, window: ONE_DAY,
}

function evaluateCamera(
  holds: readonly EvaluatedHold[],
  window = ONE_DAY,
  nowIso = NOW,
) {
  return evaluateBookingAvailability({
    bookingId: 'customer-c',
    window,
    lines: [{
      lineId: 'camera-line', productId: camera.productId,
      productName: camera.name, requestedQty: 1, window,
    }],
    products: new Map([[camera.productId, camera]]),
    unitsByProduct: new Map([[camera.productId, [unit]]]),
    holds,
    bounds: 'half-open',
    nowIso,
  })
}

describe('three-customer availability: five-day Draft A, one-day B and C', () => {
  it('Draft A remains a warning, but confirmed B prevents C from using the same unit', () => {
    const result = evaluateCamera([draftA, committedB])

    expect(result.hasDraftOverlaps).toBe(true)
    expect(result.overlappingDraftBookingNos).toEqual(['B-A'])
    expect(result.isAllAvailable).toBe(false)
    expect(result.lineResults[0]?.status).toBe('conflict')
    expect(result.lineResults[0]?.conflictingBookingNo).toBe('B-B')
    expect(result.lineResults[0]?.unavailablePeriod).toEqual(ONE_DAY)
  })

  it('after B releases the unit, C can proceed even though A remains a five-day Draft', () => {
    const releasedB: EvaluatedHold = { ...committedB, holdState: 'released' }
    const result = evaluateCamera([draftA, releasedB])

    expect(result.isAllAvailable).toBe(true)
    expect(result.lineResults[0]?.status).toBe('available')
    expect(result.hasDraftOverlaps).toBe(true)
    expect(result.overlappingDraftBookingNos).toEqual(['B-A'])
  })

  it('a real temporary hold blocks C until its exact expiration instant; Draft A alone does not', () => {
    const holdB: EvaluatedHold = {
      ...committedB,
      holdState: 'active_hold',
      expiresAt: '2026-11-02T04:00:00.000Z',
    }

    const beforeExpiry = evaluateCamera([draftA, holdB], ONE_DAY, '2026-11-02T03:59:59.999Z')
    expect(beforeExpiry.isAllAvailable).toBe(false)
    expect(beforeExpiry.lineResults[0]?.status).toBe('hold_conflict')
    expect(beforeExpiry.lineResults[0]?.conflictingBookingNo).toBe('B-B')

    const atExpiry = evaluateCamera([draftA, holdB], ONE_DAY, '2026-11-02T04:00:00.000Z')
    expect(atExpiry.isAllAvailable).toBe(true)
    expect(atExpiry.lineResults[0]?.status).toBe('available')
    expect(atExpiry.overlappingDraftBookingNos).toEqual(['B-A'])
  })

  it('C can book at 06:00 immediately after B ends; there is no false boundary conflict', () => {
    const result = evaluateCamera([draftA, committedB], AFTER_ONE_DAY)

    expect(result.isAllAvailable).toBe(true)
    expect(result.lineResults[0]?.status).toBe('available')
    expect(result.hasDraftOverlaps).toBe(true)
  })

  it('quantity stock counts B but not the draft: C can request one remaining unit, not two', () => {
    const cable: ProductInventoryDefinition = {
      productId: 'cable', name: 'HDMI cable', trackingMode: 'Quantity', totalQuantity: 3,
    }
    const reservedB: EvaluatedHold = {
      reservationId: 'cables-b', bookingId: 'customer-b',
      bookingNo: 'B-B', productId: cable.productId,
      holdState: 'confirmed', qty: 2, window: ONE_DAY,
    }
    function check(requestedQty: number) {
      return evaluateBookingAvailability({
        bookingId: 'customer-c',
        window: ONE_DAY,
        lines: [{
          lineId: 'cable-line', productId: cable.productId,
          productName: cable.name, requestedQty, window: ONE_DAY,
        }],
        products: new Map([[cable.productId, cable]]),
        unitsByProduct: new Map(),
        holds: [draftA, reservedB],
        bounds: 'half-open',
        nowIso: NOW,
      })
    }

    const one = check(1)
    expect(one.hasDraftOverlaps).toBe(true)
    expect(one.isAllAvailable).toBe(true)
    expect(one.lineResults[0]?.availableQty).toBe(1)

    const two = check(2)
    expect(two.isAllAvailable).toBe(false)
    expect(two.lineResults[0]?.status).toBe('conflict')
    expect(two.lineResults[0]?.availableQty).toBe(1)
  })
})
