/**
 * Fail-closed validation for the smart reservation availability preview.
 *
 * The browser's advisory preview must not manufacture equipment capacity when
 * a returned row is missing or malformed. The reservation/confirmation RPCs
 * remain the database authorities; these checks only prevent false UI claims.
 */
export type VerifiedTrackingMode = 'Serialised' | 'Quantity' | 'Consumable'

export function assertCompleteRentalWindow(
  bookingNo: string,
  pickupAt: string | null,
  returnAt: string | null,
): void {
  const start = Date.parse(pickupAt ?? '')
  const end = Date.parse(returnAt ?? '')
  if (!pickupAt || !returnAt || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error(`${bookingNo} has an invalid or incomplete rental window; availability could not be checked.`)
  }
}

export function assertAvailabilityLine(
  bookingNo: string,
  row: { id: string; product_id: string | null; qty: number; description: string | null },
): void {
  if (typeof row.product_id !== 'string' || !row.product_id.trim()) {
    throw new Error(`${bookingNo} contains a line without a linked equipment product; stock availability cannot be certified.`)
  }
  if (!Number.isSafeInteger(row.qty) || row.qty < 1) {
    throw new Error(`${bookingNo} contains an invalid line quantity; stock availability cannot be certified.`)
  }
}

export function requireVerifiedProductMode(
  productId: string,
  mode: { trackingMode: string; totalQuantity: number } | undefined,
): { trackingMode: VerifiedTrackingMode; totalQuantity: number } {
  if (!mode) {
    throw new Error(`Equipment product ${productId} could not be read; stock availability cannot be certified.`)
  }
  if (!['Serialised', 'Quantity', 'Consumable'].includes(mode.trackingMode)) {
    throw new Error(`Equipment product ${productId} has an unknown tracking mode; stock availability cannot be certified.`)
  }
  if (!Number.isSafeInteger(mode.totalQuantity) || mode.totalQuantity < 0) {
    throw new Error(`Equipment product ${productId} has an invalid stock capacity; availability cannot be certified.`)
  }
  return {
    trackingMode: mode.trackingMode as VerifiedTrackingMode,
    totalQuantity: mode.totalQuantity,
  }
}

export function assertLiveReservation(
  row: {
    hold_state: string | null
    qty: number
    asset_id: string | null
    product_id: string | null
  },
): void {
  // Rows filtered by released_at IS NULL must carry a real commitment or a
  // temporary hold. Unknown state values must never be treated as unoccupied.
  if (row.hold_state !== 'confirmed' && row.hold_state !== 'active_hold') {
    throw new Error('A live reservation has an unknown state; availability could not be checked.')
  }
  if (!Number.isSafeInteger(row.qty) || row.qty < 1) {
    throw new Error('A live reservation has an invalid quantity; availability could not be checked.')
  }
  if (!row.asset_id && !row.product_id) {
    throw new Error('A live reservation has no equipment reference; availability could not be checked.')
  }
}
