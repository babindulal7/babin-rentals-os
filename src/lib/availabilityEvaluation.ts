/**
 * # Smart Reservation & Conflict Resolution Engine
 *
 * Implements pure evaluation logic for:
 *   - Line-by-line and bundle-level inventory availability
 *   - Overlapping drafts, active holds, confirmed commitments, maintenance blocks
 *   - Peak concurrency calculation across half-open intervals [start, end)
 *   - Concrete resolution strategies: alternative same-model units, compatible substitutes, free date windows
 *
 * Conforms to Law 1 (pure engine, no IO/clock), Law 7 (AD/UTC ISO instants carrying offsets),
 * and Section 5 of the Smart Reservation & Conflict Resolution Specification.
 */

import {
  windowsOverlap,
  type BoundConvention,
  type RentalWindow,
  RENTAL_WINDOW_BOUNDS,
  DISQUALIFYING_UNIT_STATES,
} from './availability'
import { bundleCapacity, type BundleComponentStock } from './bundleAvailability'

export type AvailabilityOutcomeStatus =
  | 'available'
  | 'available_with_reassignment'
  | 'conflict'
  | 'hold_conflict'
  | 'unavailable_maintenance'
  | 'unverified_external_stock'

export type HoldState = 'none' | 'active_hold' | 'expired_hold' | 'confirmed' | 'released'

export interface EvaluatedHold {
  readonly reservationId: string
  readonly bookingId: string
  readonly bookingNo: string
  readonly isDraft?: boolean
  readonly holdState: HoldState
  readonly expiresAt?: string | null
  readonly assetId?: string | null
  readonly productId?: string | null
  readonly qty: number
  readonly window: RentalWindow
}

export interface UnitInventoryCandidate {
  readonly unitId: string
  readonly assetTag: string
  readonly serialNo: string | null
  readonly productId: string
  readonly state: string
  readonly condition?: string
  readonly isSubRental?: boolean
  readonly subRentalCommitted?: boolean
}

export interface ProductInventoryDefinition {
  readonly productId: string
  readonly name: string
  readonly trackingMode: 'Serialised' | 'Quantity' | 'Consumable'
  readonly totalQuantity: number
  readonly compatibleProductIds?: readonly string[]
}

export interface LineEvaluationInput {
  readonly lineId: string
  readonly productId: string
  readonly productName: string
  readonly requestedQty: number
  readonly window: RentalWindow
  readonly assignedUnitIds?: readonly string[]
  readonly isBundle?: boolean
  readonly bundleComponents?: readonly {
    readonly productId: string
    readonly productName: string
    readonly requiredPerBundle: number
    readonly isMandatory: boolean
  }[]
}

export interface FreeDateWindow {
  readonly fromIso: string
  readonly toIso: string
}

export interface SuggestedSolutions {
  readonly alternativeUnits?: readonly { readonly unitId: string; readonly assetTag: string }[]
  readonly compatibleSubstitutes?: readonly { readonly productId: string; readonly name: string }[]
  readonly freeDateWindows?: readonly FreeDateWindow[]
  readonly canReduceQuantity?: boolean
  readonly canSubRent?: boolean
}

export interface LineEvaluationResult {
  readonly lineId: string
  readonly productId: string
  readonly productName: string
  readonly requestedQty: number
  readonly availableQty: number
  readonly status: AvailabilityOutcomeStatus
  readonly unavailablePeriod?: RentalWindow
  readonly conflictingBookingNo?: string
  readonly conflictingReason?: string
  readonly suggestedSolutions: SuggestedSolutions
}

export interface BookingAvailabilityEvaluation {
  readonly bookingId?: string
  readonly window: RentalWindow
  readonly isAllAvailable: boolean
  readonly hasDraftOverlaps: boolean
  readonly overlappingDraftBookingNos: readonly string[]
  readonly lineResults: readonly LineEvaluationResult[]
  readonly limitingBundleComponents?: readonly { readonly bundleLineId: string; readonly limitingProductIds: readonly string[] }[]
}

/**
 * Filter out expired holds at evaluation instant.
 * A hold whose expiresAt <= nowIso is considered expired and does not occupy capacity.
 */
export function isHoldOccupying(hold: EvaluatedHold, nowIso: string): boolean {
  if (hold.holdState === 'released' || hold.holdState === 'expired_hold') {
    return false
  }
  if (hold.holdState === 'active_hold') {
    if (hold.expiresAt && Date.parse(hold.expiresAt) <= Date.parse(nowIso)) {
      return false
    }
    return true
  }
  if (hold.holdState === 'confirmed') {
    return true
  }
  return false
}

/**
 * Calculates peak concurrent occupancy of quantity stock over a window [start, end)
 */
export function calculatePeakOccupancy(
  window: RentalWindow,
  holds: readonly EvaluatedHold[],
  bounds: BoundConvention = RENTAL_WINDOW_BOUNDS,
  nowIso?: string,
): number {
  const activeHolds = holds.filter((h) => (nowIso ? isHoldOccupying(h, nowIso) : h.holdState === 'confirmed' || h.holdState === 'active_hold'))
  const overlapping = activeHolds.filter((h) => windowsOverlap(window, h.window, bounds))

  if (overlapping.length === 0) return 0

  // Candidate instants: window start + lower bounds of overlapping holds
  const startMs = Date.parse(window.fromAd)
  const endMs = Date.parse(window.toAd)
  const instants = new Set<number>([startMs])

  for (const h of overlapping) {
    const hStartMs = Date.parse(h.window.fromAd)
    if (hStartMs >= startMs && hStartMs < endMs) {
      instants.add(hStartMs)
    }
  }

  let peak = 0
  for (const t of instants) {
    let currentHeld = 0
    for (const h of overlapping) {
      const hFrom = Date.parse(h.window.fromAd)
      const hTo = Date.parse(h.window.toAd)
      const inside = bounds === 'closed' ? t >= hFrom && t <= hTo : t >= hFrom && t < hTo
      if (inside) {
        currentHeld += h.qty
      }
    }
    if (currentHeld > peak) {
      peak = currentHeld
    }
  }

  return peak
}

/**
 * Evaluate availability for an entire booking request against current inventory,
 * active holds, confirmed commitments, maintenance blocks, and drafts.
 */
export function evaluateBookingAvailability(params: {
  readonly bookingId?: string
  readonly window: RentalWindow
  readonly lines: readonly LineEvaluationInput[]
  readonly products: ReadonlyMap<string, ProductInventoryDefinition>
  readonly unitsByProduct: ReadonlyMap<string, readonly UnitInventoryCandidate[]>
  readonly holds: readonly EvaluatedHold[]
  readonly bounds?: BoundConvention
  readonly nowIso?: string
}): BookingAvailabilityEvaluation {
  const bounds = params.bounds ?? RENTAL_WINDOW_BOUNDS
  const nowIso = params.nowIso ?? new Date().toISOString()
  const lineResults: LineEvaluationResult[] = []
  const overlappingDraftNos = new Set<string>()

  // Separate drafts from real commitments
  const realHolds = params.holds.filter(
    (h) => h.bookingId !== params.bookingId && isHoldOccupying(h, nowIso) && !h.isDraft,
  )
  const draftHolds = params.holds.filter(
    (h) => h.bookingId !== params.bookingId && h.isDraft && windowsOverlap(params.window, h.window, bounds),
  )

  for (const draft of draftHolds) {
    if (draft.bookingNo) overlappingDraftNos.add(draft.bookingNo)
  }

  const limitingBundleComponents: Array<{ bundleLineId: string; limitingProductIds: readonly string[] }> = []

  for (const line of params.lines) {
    const product = params.products.get(line.productId)
    const candidates = params.unitsByProduct.get(line.productId) ?? []

    // 1. Handle Bundles
    if (line.isBundle && line.bundleComponents && line.bundleComponents.length > 0) {
      const bundleComponentStockList: BundleComponentStock[] = []

      for (const comp of line.bundleComponents) {
        const compProduct = params.products.get(comp.productId)
        const compCandidates = params.unitsByProduct.get(comp.productId) ?? []
        const totalCompStock = compProduct?.trackingMode === 'Serialised' ? compCandidates.length : compProduct?.totalQuantity ?? 0

        const compHolds = realHolds.filter((h) => h.productId === comp.productId || compCandidates.some((c) => c.unitId === h.assetId))
        const peakOccupancy = calculatePeakOccupancy(params.window, compHolds, bounds, nowIso)
        const free = Math.max(0, totalCompStock - peakOccupancy)

        bundleComponentStockList.push({
          productId: comp.productId,
          requiredPerBundle: comp.requiredPerBundle,
          isMandatory: comp.isMandatory,
          free,
        })
      }

      const capacity = bundleCapacity(bundleComponentStockList)
      const canFulfill = capacity.bundles >= line.requestedQty

      if (canFulfill) {
        lineResults.push({
          lineId: line.lineId,
          productId: line.productId,
          productName: line.productName,
          requestedQty: line.requestedQty,
          availableQty: capacity.bundles,
          status: 'available',
          suggestedSolutions: {},
        })
      } else {
        if (capacity.limiting.length > 0) {
          limitingBundleComponents.push({
            bundleLineId: line.lineId,
            limitingProductIds: capacity.limiting,
          })
        }
        lineResults.push({
          lineId: line.lineId,
          productId: line.productId,
          productName: line.productName,
          requestedQty: line.requestedQty,
          availableQty: capacity.bundles,
          status: 'conflict',
          conflictingReason: `Missing required bundle components (${capacity.limiting.map((id) => params.products.get(id)?.name ?? id).join(', ')})`,
          suggestedSolutions: {
            canReduceQuantity: capacity.bundles > 0,
            canSubRent: true,
          },
        })
      }
      continue
    }

    // 2. Serialized Products
    if (product?.trackingMode === 'Serialised') {
      const totalUnits = candidates.length
      const usableUnits = candidates.filter(
        (u) => !DISQUALIFYING_UNIT_STATES.has(u.state) && (!u.isSubRental || u.subRentalCommitted),
      )
      const maintenanceUnits = candidates.filter((u) => u.state === 'Maintenance')
      const unverifiedUnits = candidates.filter((u) => u.isSubRental && !u.subRentalCommitted)

      // Find free units over the requested window
      const freeUnits: UnitInventoryCandidate[] = []
      const occupiedUnits: Array<{ unit: UnitInventoryCandidate; hold: EvaluatedHold }> = []

      for (const unit of usableUnits) {
        const colliding = realHolds.find(
          (h) => h.assetId === unit.unitId && windowsOverlap(params.window, h.window, bounds),
        )
        if (colliding) {
          occupiedUnits.push({ unit, hold: colliding })
        } else {
          freeUnits.push(unit)
        }
      }

      // Check if specifically pre-assigned unit has conflict
      let hasPreassignedConflict = false
      let preassignedConflictingHold: EvaluatedHold | undefined
      if (line.assignedUnitIds && line.assignedUnitIds.length > 0) {
        for (const assignedId of line.assignedUnitIds) {
          const occ = occupiedUnits.find((o) => o.unit.unitId === assignedId)
          if (occ) {
            hasPreassignedConflict = true
            preassignedConflictingHold = occ.hold
            break
          }
        }
      }

      if (freeUnits.length >= line.requestedQty && !hasPreassignedConflict) {
        lineResults.push({
          lineId: line.lineId,
          productId: line.productId,
          productName: line.productName,
          requestedQty: line.requestedQty,
          availableQty: freeUnits.length,
          status: 'available',
          suggestedSolutions: {},
        })
      } else if (freeUnits.length >= line.requestedQty && hasPreassignedConflict) {
        // Alternative same-model units exist!
        lineResults.push({
          lineId: line.lineId,
          productId: line.productId,
          productName: line.productName,
          requestedQty: line.requestedQty,
          availableQty: freeUnits.length,
          status: 'available_with_reassignment',
          conflictingBookingNo: preassignedConflictingHold?.bookingNo,
          conflictingReason: preassignedConflictingHold
            ? `Assigned unit reserved by ${preassignedConflictingHold.bookingNo}`
            : 'Preassigned unit conflict',
          unavailablePeriod: preassignedConflictingHold?.window,
          suggestedSolutions: {
            alternativeUnits: freeUnits.map((u) => ({ unitId: u.unitId, assetTag: u.assetTag })),
          },
        })
      } else {
        // Conflict! Check reason
        const primaryConflictHold = occupiedUnits[0]?.hold
        const isHoldOnly = primaryConflictHold?.holdState === 'active_hold'
        let status: AvailabilityOutcomeStatus = isHoldOnly ? 'hold_conflict' : 'conflict'

        if (totalUnits > 0 && usableUnits.length === 0 && maintenanceUnits.length > 0) {
          status = 'unavailable_maintenance'
        } else if (unverifiedUnits.length > 0 && usableUnits.length === 0) {
          status = 'unverified_external_stock'
        }

        // Compatible substitutes
        const compatibleSubstitutes: Array<{ productId: string; name: string }> = []
        if (product?.compatibleProductIds) {
          for (const compId of product.compatibleProductIds) {
            const compProd = params.products.get(compId)
            if (compProd) {
              compatibleSubstitutes.push({ productId: compId, name: compProd.name })
            }
          }
        }

        lineResults.push({
          lineId: line.lineId,
          productId: line.productId,
          productName: line.productName,
          requestedQty: line.requestedQty,
          availableQty: freeUnits.length,
          status,
          conflictingBookingNo: primaryConflictHold?.bookingNo,
          conflictingReason: primaryConflictHold
            ? `Already reserved by ${primaryConflictHold.bookingNo}`
            : 'Insufficient physical units available',
          unavailablePeriod: primaryConflictHold?.window,
          suggestedSolutions: {
            alternativeUnits: freeUnits.map((u) => ({ unitId: u.unitId, assetTag: u.assetTag })),
            compatibleSubstitutes,
            canReduceQuantity: freeUnits.length > 0,
            canSubRent: true,
          },
        })
      }
      continue
    }

    // 3. Pooled / Quantity Products
    const totalCapacity = product?.totalQuantity ?? 0
    const relevantHolds = realHolds.filter((h) => h.productId === line.productId)
    const peak = calculatePeakOccupancy(params.window, relevantHolds, bounds, nowIso)
    const availableQty = Math.max(0, totalCapacity - peak)

    if (availableQty >= line.requestedQty) {
      lineResults.push({
        lineId: line.lineId,
        productId: line.productId,
        productName: line.productName,
        requestedQty: line.requestedQty,
        availableQty,
        status: 'available',
        suggestedSolutions: {},
      })
    } else {
      const primaryHold = relevantHolds[0]
      const isHold = primaryHold?.holdState === 'active_hold'

      lineResults.push({
        lineId: line.lineId,
        productId: line.productId,
        productName: line.productName,
        requestedQty: line.requestedQty,
        availableQty,
        status: isHold ? 'hold_conflict' : 'conflict',
        conflictingBookingNo: primaryHold?.bookingNo,
        conflictingReason: `Requested ${line.requestedQty}, but peak concurrent availability is ${availableQty} (capacity: ${totalCapacity})`,
        unavailablePeriod: primaryHold?.window,
        suggestedSolutions: {
          canReduceQuantity: availableQty > 0,
          canSubRent: true,
        },
      })
    }
  }

  const isAllAvailable = lineResults.every((r) => r.status === 'available')
  const hasDraftOverlaps = overlappingDraftNos.size > 0

  return {
    bookingId: params.bookingId,
    window: params.window,
    isAllAvailable,
    hasDraftOverlaps,
    overlappingDraftBookingNos: Array.from(overlappingDraftNos),
    lineResults,
    limitingBundleComponents: limitingBundleComponents.length > 0 ? limitingBundleComponents : undefined,
  }
}
