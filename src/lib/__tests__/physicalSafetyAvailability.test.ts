import { describe, expect, it } from 'vitest'
import {
  evaluateBookingAvailability,
  type UnitInventoryCandidate,
  type ProductInventoryDefinition,
} from '../availabilityEvaluation'

const window = {
  fromAd: '2026-11-03T00:15:00.000Z',
  toAd: '2026-11-04T00:15:00.000Z',
}
const product: ProductInventoryDefinition = {
  productId: 'camera', name: 'Sony FX3', trackingMode: 'Serialised', totalQuantity: 1,
}
const availableUnit: UnitInventoryCandidate = {
  unitId: 'fx3-1', assetTag: 'CAM-001', serialNo: 'A123',
  productId: product.productId, state: 'In Stock', condition: 'Good',
  safetyHold: null, retiredAt: null,
}
function evaluate(unit: UnitInventoryCandidate) {
  return evaluateBookingAvailability({
    bookingId: 'customer-c',
    window,
    lines: [{
      lineId: 'line-1', productId: product.productId,
      productName: product.name, requestedQty: 1, window,
    }],
    products: new Map([[product.productId, product]]),
    unitsByProduct: new Map([[product.productId, [unit]]]),
    holds: [],
    nowIso: '2026-11-02T00:15:00.000Z',
    bounds: 'half-open',
  })
}

describe('physical safety facts travel into smart availability', () => {
  it('permits an In Stock, healthy, non-retired unit', () => {
    const result = evaluate(availableUnit)
    expect(result.isAllAvailable).toBe(true)
    expect(result.lineResults[0]?.status).toBe('available')
  })

  it('refuses an unclosed damage finding even if status is still In Stock', () => {
    const result = evaluate({ ...availableUnit, safetyHold: 'Damage finding requires physical clearance' })
    expect(result.isAllAvailable).toBe(false)
    expect(result.lineResults[0]?.availableQty).toBe(0)
    expect(result.lineResults[0]?.status).toBe('unavailable_maintenance')
  })

  it('refuses an open QC failure even if status is still In Stock', () => {
    const result = evaluate({ ...availableUnit, safetyHold: 'QC failed' })
    expect(result.isAllAvailable).toBe(false)
    expect(result.lineResults[0]?.availableQty).toBe(0)
  })

  it('refuses retired equipment whose status was not updated', () => {
    const result = evaluate({ ...availableUnit, retiredAt: '2026-10-01T00:00:00.000Z' })
    expect(result.isAllAvailable).toBe(false)
    expect(result.lineResults[0]?.availableQty).toBe(0)
  })

  it.each(['Damaged', 'Lost'])('refuses a %s physical condition even if unit status says In Stock', (condition) => {
    const result = evaluate({ ...availableUnit, condition })
    expect(result.isAllAvailable).toBe(false)
    expect(result.lineResults[0]?.status).toBe('unavailable_maintenance')
  })
})
