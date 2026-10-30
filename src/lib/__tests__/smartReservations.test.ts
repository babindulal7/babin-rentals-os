import { describe, expect, it } from 'vitest'
import {
  evaluateBookingAvailability,
  calculatePeakOccupancy,
  isHoldOccupying,
  type EvaluatedHold,
  type LineEvaluationInput,
  type ProductInventoryDefinition,
  type UnitInventoryCandidate,
} from '../availabilityEvaluation'

describe('Smart Reservation & Conflict Resolution Engine', () => {
  // Common test products
  const fx3Product: ProductInventoryDefinition = {
    productId: 'prod-fx3',
    name: 'Sony FX3 Cinema Camera',
    trackingMode: 'Serialised',
    totalQuantity: 1,
    compatibleProductIds: ['prod-a7s3', 'prod-fx6'],
  }

  const a7s3Product: ProductInventoryDefinition = {
    productId: 'prod-a7s3',
    name: 'Sony A7S III Mirrorless Camera',
    trackingMode: 'Serialised',
    totalQuantity: 1,
  }

  const cableProduct: ProductInventoryDefinition = {
    productId: 'prod-cable-hdmi',
    name: 'High-Speed HDMI Cable',
    trackingMode: 'Quantity',
    totalQuantity: 5,
  }

  const productsMap = new Map<string, ProductInventoryDefinition>([
    [fx3Product.productId, fx3Product],
    [a7s3Product.productId, a7s3Product],
    [cableProduct.productId, cableProduct],
  ])

  // Single physical unit of FX3
  const fx3Unit: UnitInventoryCandidate = {
    unitId: 'unit-fx3-01',
    assetTag: 'CAM-001',
    serialNo: 'SN-FX3-999',
    productId: 'prod-fx3',
    state: 'In Stock',
  }

  const unitsByProductMap = new Map<string, UnitInventoryCandidate[]>([
    [fx3Product.productId, [fx3Unit]],
  ])

  // 1 Nov 2026 06:00 NPT to 6 Nov 2026 06:00 NPT (5 rental days)
  // 06:00 NPT (+05:45) = 00:15 UTC
  const windowA_5Days = {
    fromAd: '2026-11-01T00:15:00.000Z',
    toAd: '2026-11-06T00:15:00.000Z',
  }

  // 3 Nov 2026 06:00 NPT to 4 Nov 2026 06:00 NPT (1 rental day)
  const windowB_1Day = {
    fromAd: '2026-11-03T00:15:00.000Z',
    toAd: '2026-11-04T00:15:00.000Z',
  }

  it('Test 1: 5-day A draft + 1-day B confirmed inside it -> B succeeds; A remains draft and cannot confirm', () => {
    // Draft A exists
    const draftA: EvaluatedHold = {
      reservationId: 'res-a',
      bookingId: 'booking-a',
      bookingNo: 'B-101',
      isDraft: true,
      holdState: 'none',
      assetId: fx3Unit.unitId,
      productId: fx3Product.productId,
      qty: 1,
      window: windowA_5Days,
    }

    // Clerk checks B: B sees draft A as nonblocking draft overlap, but B is fully available
    const evalB = evaluateBookingAvailability({
      bookingId: 'booking-b',
      window: windowB_1Day,
      lines: [
        {
          lineId: 'line-b1',
          productId: fx3Product.productId,
          productName: fx3Product.name,
          requestedQty: 1,
          window: windowB_1Day,
        },
      ],
      products: productsMap,
      unitsByProduct: unitsByProductMap,
      holds: [draftA],
    })

    expect(evalB.isAllAvailable).toBe(true)
    expect(evalB.hasDraftOverlaps).toBe(true)
    expect(evalB.overlappingDraftBookingNos).toContain('B-101')
    expect(evalB.lineResults[0]?.status).toBe('available')

    // Now B is CONFIRMED
    const confirmedB: EvaluatedHold = {
      reservationId: 'res-b',
      bookingId: 'booking-b',
      bookingNo: 'B-102',
      isDraft: false,
      holdState: 'confirmed',
      assetId: fx3Unit.unitId,
      productId: fx3Product.productId,
      qty: 1,
      window: windowB_1Day,
    }

    // Now Booking A attempts confirmation
    const evalA = evaluateBookingAvailability({
      bookingId: 'booking-a',
      window: windowA_5Days,
      lines: [
        {
          lineId: 'line-a1',
          productId: fx3Product.productId,
          productName: fx3Product.name,
          requestedQty: 1,
          window: windowA_5Days,
          assignedUnitIds: [fx3Unit.unitId],
        },
      ],
      products: productsMap,
      unitsByProduct: unitsByProductMap,
      holds: [confirmedB],
    })

    // A must fail confirmation with structured conflict details
    expect(evalA.isAllAvailable).toBe(false)
    const lineA = evalA.lineResults[0]!
    expect(lineA.status).toBe('conflict')
    expect(lineA.conflictingBookingNo).toBe('B-102')
    expect(lineA.unavailablePeriod?.fromAd).toBe(windowB_1Day.fromAd)
    expect(lineA.unavailablePeriod?.toAd).toBe(windowB_1Day.toAd)
    expect(lineA.suggestedSolutions.compatibleSubstitutes?.some((s) => s.productId === 'prod-a7s3')).toBe(true)
  })

  it('Test 2: A confirmed first -> B confirmation blocked if only one usable unit', () => {
    const confirmedA: EvaluatedHold = {
      reservationId: 'res-a',
      bookingId: 'booking-a',
      bookingNo: 'B-101',
      isDraft: false,
      holdState: 'confirmed',
      assetId: fx3Unit.unitId,
      productId: fx3Product.productId,
      qty: 1,
      window: windowA_5Days,
    }

    const evalB = evaluateBookingAvailability({
      bookingId: 'booking-b',
      window: windowB_1Day,
      lines: [
        {
          lineId: 'line-b1',
          productId: fx3Product.productId,
          productName: fx3Product.name,
          requestedQty: 1,
          window: windowB_1Day,
        },
      ],
      products: productsMap,
      unitsByProduct: unitsByProductMap,
      holds: [confirmedA],
    })

    expect(evalB.isAllAvailable).toBe(false)
    expect(evalB.lineResults[0]?.status).toBe('conflict')
    expect(evalB.lineResults[0]?.conflictingBookingNo).toBe('B-101')
  })

  it('Test 3: A draft and B draft overlap -> both save; no inventory held', () => {
    const draftA: EvaluatedHold = {
      reservationId: 'res-a',
      bookingId: 'booking-a',
      bookingNo: 'B-101',
      isDraft: true,
      holdState: 'none',
      assetId: fx3Unit.unitId,
      productId: fx3Product.productId,
      qty: 1,
      window: windowA_5Days,
    }

    const draftB: EvaluatedHold = {
      reservationId: 'res-b',
      bookingId: 'booking-b',
      bookingNo: 'B-102',
      isDraft: true,
      holdState: 'none',
      assetId: fx3Unit.unitId,
      productId: fx3Product.productId,
      qty: 1,
      window: windowB_1Day,
    }

    // Checking A against B: A is available because draft B holds no stock
    const evalA = evaluateBookingAvailability({
      bookingId: 'booking-a',
      window: windowA_5Days,
      lines: [
        {
          lineId: 'line-a1',
          productId: fx3Product.productId,
          productName: fx3Product.name,
          requestedQty: 1,
          window: windowA_5Days,
        },
      ],
      products: productsMap,
      unitsByProduct: unitsByProductMap,
      holds: [draftB],
    })

    expect(evalA.isAllAvailable).toBe(true)
    expect(evalA.hasDraftOverlaps).toBe(true)
  })

  it('Test 4: A active hold first -> B confirmation blocked until hold released/expired; B draft still saves', () => {
    const futureExpiry = new Date(Date.now() + 4 * 3600 * 1000).toISOString()
    const activeHoldA: EvaluatedHold = {
      reservationId: 'res-hold-a',
      bookingId: 'booking-a',
      bookingNo: 'B-101',
      isDraft: false,
      holdState: 'active_hold',
      expiresAt: futureExpiry,
      assetId: fx3Unit.unitId,
      productId: fx3Product.productId,
      qty: 1,
      window: windowA_5Days,
    }

    const evalB = evaluateBookingAvailability({
      bookingId: 'booking-b',
      window: windowB_1Day,
      lines: [
        {
          lineId: 'line-b1',
          productId: fx3Product.productId,
          productName: fx3Product.name,
          requestedQty: 1,
          window: windowB_1Day,
        },
      ],
      products: productsMap,
      unitsByProduct: unitsByProductMap,
      holds: [activeHoldA],
    })

    expect(evalB.isAllAvailable).toBe(false)
    expect(evalB.lineResults[0]?.status).toBe('hold_conflict')
    expect(evalB.lineResults[0]?.conflictingBookingNo).toBe('B-101')
  })

  it('Test 5: Hold expires -> confirmation reclaims it atomically', () => {
    const pastExpiry = new Date(Date.now() - 60 * 1000).toISOString()
    const expiredHoldA: EvaluatedHold = {
      reservationId: 'res-hold-a',
      bookingId: 'booking-a',
      bookingNo: 'B-101',
      isDraft: false,
      holdState: 'active_hold',
      expiresAt: pastExpiry,
      assetId: fx3Unit.unitId,
      productId: fx3Product.productId,
      qty: 1,
      window: windowA_5Days,
    }

    const evalB = evaluateBookingAvailability({
      bookingId: 'booking-b',
      window: windowB_1Day,
      lines: [
        {
          lineId: 'line-b1',
          productId: fx3Product.productId,
          productName: fx3Product.name,
          requestedQty: 1,
          window: windowB_1Day,
        },
      ],
      products: productsMap,
      unitsByProduct: unitsByProductMap,
      holds: [expiredHoldA],
      nowIso: new Date().toISOString(),
    })

    // The expired hold is ignored/reclaimed, so B is available
    expect(evalB.isAllAvailable).toBe(true)
    expect(evalB.lineResults[0]?.status).toBe('available')
  })

  it('Test 6: Stock quantity 2 -> two simultaneous confirmed bookings permitted on distinct units, third blocked', () => {
    const fx3Unit2: UnitInventoryCandidate = {
      unitId: 'unit-fx3-02',
      assetTag: 'CAM-002',
      serialNo: 'SN-FX3-888',
      productId: 'prod-fx3',
      state: 'In Stock',
    }
    const unitsTwo = new Map<string, UnitInventoryCandidate[]>([
      [fx3Product.productId, [fx3Unit, fx3Unit2]],
    ])

    const confirmed1: EvaluatedHold = {
      reservationId: 'res-1',
      bookingId: 'booking-1',
      bookingNo: 'B-001',
      holdState: 'confirmed',
      assetId: fx3Unit.unitId,
      productId: fx3Product.productId,
      qty: 1,
      window: windowB_1Day,
    }

    // Second booking on same dates: unit 2 is free!
    const eval2 = evaluateBookingAvailability({
      bookingId: 'booking-2',
      window: windowB_1Day,
      lines: [
        {
          lineId: 'line-2',
          productId: fx3Product.productId,
          productName: fx3Product.name,
          requestedQty: 1,
          window: windowB_1Day,
        },
      ],
      products: productsMap,
      unitsByProduct: unitsTwo,
      holds: [confirmed1],
    })
    expect(eval2.isAllAvailable).toBe(true)

    // Third booking when both units are held: blocked!
    const confirmed2: EvaluatedHold = {
      reservationId: 'res-2',
      bookingId: 'booking-2',
      bookingNo: 'B-002',
      holdState: 'confirmed',
      assetId: fx3Unit2.unitId,
      productId: fx3Product.productId,
      qty: 1,
      window: windowB_1Day,
    }

    const eval3 = evaluateBookingAvailability({
      bookingId: 'booking-3',
      window: windowB_1Day,
      lines: [
        {
          lineId: 'line-3',
          productId: fx3Product.productId,
          productName: fx3Product.name,
          requestedQty: 1,
          window: windowB_1Day,
        },
      ],
      products: productsMap,
      unitsByProduct: unitsTwo,
      holds: [confirmed1, confirmed2],
    })
    expect(eval3.isAllAvailable).toBe(false)
    expect(eval3.lineResults[0]?.status).toBe('conflict')
  })

  it('Test 7: Two non-overlapping bookings in same requested 5-day period -> capacity check uses peak concurrent use, not naive total', () => {
    // Total cables = 5
    // Booking 1 holds 3 cables from 1 Nov to 3 Nov
    // Booking 2 holds 3 cables from 3 Nov to 5 Nov (non-overlapping with Booking 1 under half-open bounds)
    // Naive sum = 6 > 5. Peak concurrency = 3 <= 5.
    const hold1: EvaluatedHold = {
      reservationId: 'res-cable-1',
      bookingId: 'b1',
      bookingNo: 'B-C1',
      holdState: 'confirmed',
      productId: cableProduct.productId,
      qty: 3,
      window: {
        fromAd: '2026-11-01T00:15:00.000Z',
        toAd: '2026-11-03T00:15:00.000Z',
      },
    }

    const hold2: EvaluatedHold = {
      reservationId: 'res-cable-2',
      bookingId: 'b2',
      bookingNo: 'B-C2',
      holdState: 'confirmed',
      productId: cableProduct.productId,
      qty: 3,
      window: {
        fromAd: '2026-11-03T00:15:00.000Z',
        toAd: '2026-11-05T00:15:00.000Z',
      },
    }

    const peak = calculatePeakOccupancy(windowA_5Days, [hold1, hold2], 'half-open')
    expect(peak).toBe(3) // Not 6!

    // We can still book 2 cables for the entire 5 days!
    const evalCables = evaluateBookingAvailability({
      bookingId: 'b3',
      window: windowA_5Days,
      lines: [
        {
          lineId: 'line-cables',
          productId: cableProduct.productId,
          productName: cableProduct.name,
          requestedQty: 2,
          window: windowA_5Days,
        },
      ],
      products: productsMap,
      unitsByProduct: new Map(),
      holds: [hold1, hold2],
      bounds: 'half-open',
    })
    expect(evalCables.isAllAvailable).toBe(true)
    expect(evalCables.lineResults[0]?.availableQty).toBe(2)
  })

  it('Test 9: End at 06:00 / next start at 06:00 -> no overlap under [start, end) half-open bounds', () => {
    const morningReturn: EvaluatedHold = {
      reservationId: 'res-morning',
      bookingId: 'b-morning',
      bookingNo: 'B-MORN',
      holdState: 'confirmed',
      assetId: fx3Unit.unitId,
      productId: fx3Product.productId,
      qty: 1,
      window: {
        fromAd: '2026-11-01T00:15:00.000Z',
        toAd: '2026-11-03T00:15:00.000Z', // 06:00 NPT
      },
    }

    // Rental starting precisely when the previous one ends
    const nextBookingWindow = {
      fromAd: '2026-11-03T00:15:00.000Z', // 06:00 NPT
      toAd: '2026-11-05T00:15:00.000Z',
    }

    const evalNext = evaluateBookingAvailability({
      bookingId: 'b-next',
      window: nextBookingWindow,
      lines: [
        {
          lineId: 'line-next',
          productId: fx3Product.productId,
          productName: fx3Product.name,
          requestedQty: 1,
          window: nextBookingWindow,
        },
      ],
      products: productsMap,
      unitsByProduct: unitsByProductMap,
      holds: [morningReturn],
      bounds: 'half-open',
    })

    expect(evalNext.isAllAvailable).toBe(true)
    expect(evalNext.lineResults[0]?.status).toBe('available')
  })

  it('Test 11: Bundle requires multiple components -> missing one component blocks bundle confirmation', () => {
    const lensProduct: ProductInventoryDefinition = {
      productId: 'prod-lens-2470',
      name: 'Sony 24-70mm f/2.8 GM',
      trackingMode: 'Serialised',
      totalQuantity: 0, // Depleted!
    }
    const bundleProduct: ProductInventoryDefinition = {
      productId: 'prod-bundle-cinema',
      name: 'FX3 Indie Cinema Bundle',
      trackingMode: 'Quantity',
      totalQuantity: 10,
    }

    const bundleMap = new Map<string, ProductInventoryDefinition>([
      [fx3Product.productId, fx3Product],
      [lensProduct.productId, lensProduct],
      [bundleProduct.productId, bundleProduct],
    ])

    const evalBundle = evaluateBookingAvailability({
      bookingId: 'b-bundle',
      window: windowB_1Day,
      lines: [
        {
          lineId: 'line-bundle',
          productId: bundleProduct.productId,
          productName: bundleProduct.name,
          requestedQty: 1,
          window: windowB_1Day,
          isBundle: true,
          bundleComponents: [
            { productId: fx3Product.productId, productName: fx3Product.name, requiredPerBundle: 1, isMandatory: true },
            { productId: lensProduct.productId, productName: lensProduct.name, requiredPerBundle: 1, isMandatory: true },
          ],
        },
      ],
      products: bundleMap,
      unitsByProduct: unitsByProductMap, // Lens has 0 units
      holds: [],
    })

    expect(evalBundle.isAllAvailable).toBe(false)
    expect(evalBundle.lineResults[0]?.status).toBe('conflict')
    expect(evalBundle.lineResults[0]?.conflictingReason).toContain('Missing required bundle components')
  })

  it('Test 12: Unavailable due to maintenance/repair/missing -> cannot reserve that unit', () => {
    const maintenanceUnit: UnitInventoryCandidate = {
      unitId: 'unit-fx3-broken',
      assetTag: 'CAM-MAINT',
      serialNo: 'SN-BROKEN',
      productId: 'prod-fx3',
      state: 'Maintenance',
    }

    const evalMaintenance = evaluateBookingAvailability({
      bookingId: 'b-maint',
      window: windowB_1Day,
      lines: [
        {
          lineId: 'line-1',
          productId: fx3Product.productId,
          productName: fx3Product.name,
          requestedQty: 1,
          window: windowB_1Day,
        },
      ],
      products: productsMap,
      unitsByProduct: new Map([[fx3Product.productId, [maintenanceUnit]]]),
      holds: [],
    })

    expect(evalMaintenance.isAllAvailable).toBe(false)
    expect(evalMaintenance.lineResults[0]?.status).toBe('unavailable_maintenance')
  })

  it('Test 15: Sub-rent suggestion without supplier commitment -> not counted as firm stock', () => {
    const uncommittedSubRental: UnitInventoryCandidate = {
      unitId: 'unit-sub-01',
      assetTag: 'EXT-SUB',
      serialNo: null,
      productId: 'prod-fx3',
      state: 'In Stock',
      isSubRental: true,
      subRentalCommitted: false,
    }

    const evalSub = evaluateBookingAvailability({
      bookingId: 'b-sub',
      window: windowB_1Day,
      lines: [
        {
          lineId: 'line-1',
          productId: fx3Product.productId,
          productName: fx3Product.name,
          requestedQty: 1,
          window: windowB_1Day,
        },
      ],
      products: productsMap,
      unitsByProduct: new Map([[fx3Product.productId, [uncommittedSubRental]]]),
      holds: [],
    })

    expect(evalSub.isAllAvailable).toBe(false)
    expect(evalSub.lineResults[0]?.status).toBe('unverified_external_stock')
  })
})
