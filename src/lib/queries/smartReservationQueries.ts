import { supabase } from '../supabase'
import {
  readCandidates,
  readHolds,
  readProductModes,
  readQuantityHolds,
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
    start: pickupAt,
    end: returnAt,
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
  const [productModes, candidatesMap] = await Promise.all([
    readProductModes(productIds),
    readCandidates(productIds),
  ])

  const productDefs: ProductInventoryDefinition[] = productIds.map((pId) => {
    const mode = productModes.get(pId)
    const line = linesToEval.find((l) => l.productId === pId)
    return {
      productId: pId,
      name: line?.productName ?? 'Item',
      trackingMode: (mode?.trackingMode as 'Serialised' | 'Quantity' | 'Consumable') ?? 'Serialised',
      totalQuantity: mode?.totalQuantity ?? 1,
    }
  })

  const unitCandidates: UnitInventoryCandidate[] = []
  for (const [, candidates] of candidatesMap) {
    for (const c of candidates) {
      unitCandidates.push({
        unitId: c.unitId,
        assetTag: c.assetTag,
        serialNo: c.serialNo,
        productId: c.productId,
        state: c.state,
        condition: c.condition,
      })
    }
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
        expiresAt: row.expires_at,
        assetId: row.asset_id,
        productId: row.product_id,
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

  const draftBookings: Array<{
    bookingId: string
    bookingNo: string
    window: RentalWindow
    lineProductIds: readonly string[]
  }> = []

  if (Array.isArray(draftBookingsData) && draftBookingsData.length > 0) {
    const draftIds = draftBookingsData.map((d) => d.id)
    const { data: draftLinesData } = await supabase
      .from('booking_lines')
      .select('booking_id, product_id')
      .in('booking_id', draftIds)
      .is('voided_at', null)

    const productsByDraftId = new Map<string, string[]>()
    if (Array.isArray(draftLinesData)) {
      for (const dl of draftLinesData) {
        if (!dl.product_id) continue
        const list = productsByDraftId.get(dl.booking_id) ?? []
        list.push(dl.product_id)
        productsByDraftId.set(dl.booking_id, list)
      }
    }

    for (const d of draftBookingsData) {
      if (!d.pickup_at || !d.return_at) continue
      draftBookings.push({
        bookingId: d.id,
        bookingNo: d.booking_no,
        window: { start: d.pickup_at, end: d.return_at },
        lineProductIds: productsByDraftId.get(d.id) ?? [],
      })
    }
  }

  // 5. Evaluate availability pure engine
  const evaluation = evaluateBookingAvailability({
    bookingWindow,
    lines: linesToEval,
    holds: evaluatedHolds,
    unitCandidates,
    productDefs,
    options: {
      currentBookingId: bookingId,
      draftBookings,
    },
  })

  return {
    bookingId,
    bookingNo,
    stage,
    window: bookingWindow,
    evaluation,
  }
}
