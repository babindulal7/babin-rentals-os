import { supabase } from '../supabase'
import {
  readCandidates,
  readProductModes,
  readCompleteAvailability,
  parseTstzRange,
} from './availability'
import {
  evaluateBookingAvailability,
  type BookingAvailabilityEvaluation,
  type EvaluatedHold,
  type UnitInventoryCandidate,
  type ProductInventoryDefinition,
} from '../availabilityEvaluation'
import type { RentalWindow } from '../availability'
import { assertCompleteRentalWindow, requireVerifiedProductMode, assertLiveReservation } from './availabilityIntegrity'
import { buildBookingStockDemand, type BundleRequirement, type SavedStockLine } from './bundleStockDemand'

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

  if (bError) throw new Error(`Booking availability could not be checked: ${bError.message}`)
  if (!bData) throw new Error('Booking not found; availability could not be checked.')

  const bookingId = bData.id as string
  const bookingNo = bData.booking_no as string
  const stage = (bData.stage as string) ?? 'Quote'
  const pickupAt = bData.pickup_at as string | null
  const returnAt = bData.return_at as string | null

  const bookingWindow: RentalWindow = assertCompleteRentalWindow(bookingNo, pickupAt, returnAt)

  // 1. Read live lines
  const lData = await readCompleteAvailability<SavedStockLine>((from, to) => supabase
    .from('booking_lines')
    .select('id, line_type, product_id, bundle_id, parent_line_id, description, qty')
    .eq('booking_id', bookingId)
    .is('voided_at', null)
    .order('id', { ascending: true })
    .range(from, to), 'booking lines for smart availability')

  if (lData.length === 0) {
    throw new Error(`${bookingNo} has no live lines; availability cannot be certified.`)
  }
  // Bundle parents carry the rate, not physical stock. Verify each saved
  // mandatory component against the catalogue, then check the stored child
  // lines as physical demand (including repeated models across bundles).
  const bundleIds = [...new Set(lData.filter(line => line.line_type === 'Bundle')
    .map(line => line.bundle_id).filter((id): id is string => !!id))]
  const bundleRequirements = bundleIds.length === 0 ? [] : await readCompleteAvailability<BundleRequirement>(
    (from, to) => supabase
      .from('bundle_items')
      .select('id, bundle_id, product_id, quantity, is_mandatory')
      .in('bundle_id', bundleIds)
      .order('id', { ascending: true })
      .range(from, to),
    'bundle component requirements',
  )
  const linesToEval = buildBookingStockDemand(bookingNo, lData, bundleRequirements, bookingWindow)

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
    const mode = requireVerifiedProductMode(pId, productModes.get(pId))
    const line = linesToEval.find((l) => l.productId === pId)
    productsMap.set(pId, {
      productId: pId,
      name: line?.productName ?? 'Item',
      trackingMode: mode.trackingMode,
      totalQuantity: mode.totalQuantity,
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
  const resData = await readCompleteAvailability<{
    id: string
    booking_id: string
    asset_id: string | null
    product_id: string | null
    qty: number
    period: string
    hold_state: EvaluatedHold['holdState']
    expires_at: string | null
    bookings: { booking_no: string } | { booking_no: string }[] | null
  }>((from, to) => supabase
    .from('inventory_reservations')
    .select('id, booking_id, asset_id, product_id, qty, period, hold_state, expires_at, bookings ( booking_no )')
    .is('released_at', null)
    .neq('booking_id', bookingId)
    .order('id', { ascending: true })
    .range(from, to), 'reservation holds for smart availability')

  const evaluatedHolds: EvaluatedHold[] = []
  for (const row of resData) {
    assertLiveReservation(row)
    const w = parseTstzRange(row.period)
    if (!w) throw new Error('A reservation has an unreadable period; availability could not be checked.')
    const bObj = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings
    evaluatedHolds.push({
      reservationId: row.id,
      bookingId: row.booking_id,
      bookingNo: bObj?.booking_no ?? 'Another Booking',
      holdState: row.hold_state,
      expiresAt: row.expires_at ?? undefined,
      assetId: row.asset_id ?? undefined,
      productId: row.product_id ?? undefined,
      qty: row.qty,
      window: w,
    })
  }

  // 4. Read overlapping drafts (stage = 'Quote')
  const draftBookingsData = await readCompleteAvailability<{
    id: string
    booking_no: string
    pickup_at: string | null
    return_at: string | null
  }>((from, to) => supabase
    .from('bookings')
    .select('id, booking_no, pickup_at, return_at')
    .eq('stage', 'Quote')
    .neq('id', bookingId)
    .lt('pickup_at', returnAt)
    .gt('return_at', pickupAt)
    .order('id', { ascending: true })
    .range(from, to), 'overlapping draft bookings')

  if (draftBookingsData.length > 0) {
    for (const d of draftBookingsData) {
      const draftWindow = assertCompleteRentalWindow(d.booking_no, d.pickup_at, d.return_at)
      evaluatedHolds.push({
        reservationId: `draft-${d.id}`,
        bookingId: d.id,
        bookingNo: d.booking_no,
        isDraft: true,
        holdState: 'none',
        qty: 1,
        window: draftWindow,
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
