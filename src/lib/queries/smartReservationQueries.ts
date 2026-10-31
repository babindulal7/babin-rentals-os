import { supabase } from '../supabase'
import {
  readCandidates,
  readProductModes,
  parseTstzRange,
} from './availability'
import {
  evaluateBookingAvailability,
  type BookingAvailabilityEvaluation,
  type LineEvaluationInput,
  type EvaluatedHold,
  type UnitInventoryCandidate,
  type ProductInventoryDefinition,
} from '../availabilityEvaluation'
import type { RentalWindow } from '../availability'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface BookingEvaluationQueryOutcome {
  readonly bookingId: string
  readonly bookingNo: string
  readonly stage: string
  readonly window: RentalWindow | null
  readonly evaluation: BookingAvailabilityEvaluation | null
}

/**
 * Evaluates smart availability and conflicts for a booking given its ID or B- number.
 * Conforms to Section 5 of Smart Reservation & Conflict Resolution Specification.
 */
export async function queryBookingAvailability(
  bookingRef: string,
): Promise<BookingEvaluationQueryOutcome> {
  const column = UUID_RE.test(bookingRef) ? 'id' : 'booking_no'
  const { data: bData, error: bError } = await supabase
    .from('bookings')
    .select('id, booking_no, pickup_at, return_at, stage')
    .eq(column, bookingRef)
    .maybeSingle()

  if (bError || !bData) {
    return {
      bookingId: bookingRef,
      bookingNo: bookingRef,
      stage: 'Quote',
      window: null,
      evaluation: null,
    }
  }

  const bookingId = bData.id as string
  const bookingNo = bData.booking_no as string
  const stage = (bData.stage as string) ?? 'Quote'
  const pickupAt = bData.pickup_at as string | null
  const returnAt = bData.return_at as string | null

  if (!pickupAt || !returnAt) {
    return {
      bookingId,
      bookingNo,
      stage,
      window: null,
      evaluation: null,
    }
  }

  const bookingWindow: RentalWindow = {
    fromAd: pickupAt,
    toAd: returnAt,
  }

  // 1. Read live lines
  const { data: lData, error: lError } = await supabase
    .from('booking_lines')
    .select('id, product_id, description, qty')
    .eq('booking_id', bookingId)
    .is('voided_at', null)

  if (lError || !lData || lData.length === 0) {
    return {
      bookingId,
      bookingNo,
      stage,
      window: bookingWindow,
      evaluation: {
        bookingId,
        window: bookingWindow,
        isAllAvailable: true,
        hasDraftOverlaps: false,
        overlappingDraftBookingNos: [],
        lineResults: [],
      },
    }
  }

  const linesToEval: LineEvaluationInput[] = lData.map((row) => ({
    lineId: row.id,
    productId: row.product_id || row.id,
    productName: row.description || 'Equipment',
    requestedQty: row.qty ?? 1,
    window: bookingWindow,
  }))

  const productIds = [
    ...new Set(linesToEval.map((l) => l.productId).filter(Boolean)),
  ]

  // 2. Read product definitions and candidates
  const [productModes, rawCandidatesMap] = await Promise.all([
    readProductModes(productIds),
    readCandidates(productIds),
  ])

  const productsMap = new Map<string, ProductInventoryDefinition>()
  for (const pId of productIds) {
    const mode = productModes.get(pId)
    const line = linesToEval.find((l) => l.productId === pId)
    productsMap.set(pId, {
      productId: pId,
      name: line?.productName ?? 'Item',
      trackingMode: (mode?.trackingMode as 'Serialised' | 'Quantity' | 'Consumable') ?? 'Serialised',
      totalQuantity: mode?.totalQuantity ?? 1,
    })
  }

  const unitsByProductMap = new Map<string, UnitInventoryCandidate[]>()
  for (const [pId, candidates] of rawCandidatesMap) {
    const list: UnitInventoryCandidate[] = candidates.map((c) => ({
      unitId: c.unitId,
      assetTag: c.assetTag,
      serialNo: c.serialNo,
      productId: c.productId,
      state: c.state,
      condition: c.condition ?? undefined,
    }))
    unitsByProductMap.set(pId, list)
  }

  // 3. Read holds with hold_state and expires_at
  const { data: resData } = await supabase
    .from('inventory_reservations')
    .select('id, booking_id, asset_id, product_id, qty, period, hold_state, expires_at, bookings ( booking_no )')
    .is('released_at', null)
    .neq('booking_id', bookingId)

  const evaluatedHolds: EvaluatedHold[] = []
  if (Array.isArray(resData)) {
    for (const row of resData) {
      const w = parseTstzRange(row.period)
      if (!w) continue
      const bObj = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings
      evaluatedHolds.push({
        reservationId: row.id,
        bookingId: row.booking_id,
        bookingNo: bObj?.booking_no ?? 'Another Booking',
        holdState: (row.hold_state as EvaluatedHold['holdState']) ?? 'confirmed',
        expiresAt: row.expires_at ?? undefined,
        assetId: row.asset_id ?? undefined,
        productId: row.product_id ?? undefined,
        qty: row.qty ?? 1,
        window: w,
      })
    }
  }

  // 4. Read overlapping drafts (stage = 'Quote')
  const { data: draftBookingsData } = await supabase
    .from('bookings')
    .select('id, booking_no, pickup_at, return_at')
    .eq('stage', 'Quote')
    .neq('id', bookingId)
    .not('pickup_at', 'is', null)
    .not('return_at', 'is', null)

  if (Array.isArray(draftBookingsData) && draftBookingsData.length > 0) {
    for (const d of draftBookingsData) {
      if (!d.pickup_at || !d.return_at) continue
      evaluatedHolds.push({
        reservationId: `draft-${d.id}`,
        bookingId: d.id,
        bookingNo: d.booking_no,
        isDraft: true,
        holdState: 'none',
        qty: 1,
        window: { fromAd: d.pickup_at, toAd: d.return_at },
      })
    }
  }

  // 5. Evaluate availability via pure engine
  const evaluation = evaluateBookingAvailability({
    bookingId,
    window: bookingWindow,
    lines: linesToEval,
    products: productsMap,
    unitsByProduct: unitsByProductMap,
    holds: evaluatedHolds,
  })

  return {
    bookingId,
    bookingNo,
    stage,
    window: bookingWindow,
    evaluation,
  }
}
