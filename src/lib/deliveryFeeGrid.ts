/**
 * Delivery fee grid: zone × vehicle class (R-9.18, R-9.20).
 *
 * RULING 2026-11-09 (owner: Babin). Mirrors migration 0244 (`delivery_zone_vehicle_fees`,
 * `delivery_zones.quoted_per_trip`). A stored NULL means "not set" and is never a
 * free delivery; a quoted zone is never auto-priced.
 */

export const DELIVERY_VEHICLE_CLASSES = ['Motorbike', 'Car / pickup', 'Van / larger vehicle'] as const

export type DeliveryVehicleClass = (typeof DELIVERY_VEHICLE_CLASSES)[number]

export type DeliveryFeeState =
  | { status: 'set'; feePaisa: number }
  | { status: 'not-set' }
  | { status: 'quoted-per-trip' }

export type DeliveryFeeCell = {
  quotedPerTrip: boolean
  feePaisa: number | null
}

/**
 * Resolve one grid cell for display or dispatch.
 * - Quoted zone → always `quoted-per-trip`, even if an amount were stored.
 * - NULL, or a non-finite / negative value → `not-set`. Never 0 for "not set".
 * - Otherwise → `set` with the amount in paisa.
 */
export function resolveDeliveryFee(cell: DeliveryFeeCell): DeliveryFeeState {
  if (cell.quotedPerTrip) return { status: 'quoted-per-trip' }
  const fee = cell.feePaisa
  if (fee === null || !Number.isFinite(fee) || fee < 0) return { status: 'not-set' }
  return { status: 'set', feePaisa: Math.round(fee) }
}

/**
 * Parse one typed amount in rupees into paisa for the set RPC.
 * Blank means "not set" (NULL), never zero. Whole or fractional rupees are accepted
 * up to two decimals. Anything else is refused with a reason, shown inline.
 */
export function parseFeeInput(
  text: string,
): { ok: true; feePaisa: number | null } | { ok: false; error: string } {
  const trimmed = text.trim()
  if (trimmed === '') return { ok: true, feePaisa: null }
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return { ok: false, error: 'Enter an amount in rupees, for example 1500 or 1500.50. Leave blank for not set.' }
  }
  return { ok: true, feePaisa: Math.round(Number(trimmed) * 100) }
}

/** The label a screen shows for a grid state. Stated in words, never by colour alone. */
export function deliveryFeeLabel(state: DeliveryFeeState): string {
  switch (state.status) {
    case 'set':
      return `Rs ${(state.feePaisa / 100).toLocaleString('en-IN')}`
    case 'not-set':
      return 'Delivery fee not set'
    case 'quoted-per-trip':
      return 'Quoted per trip'
  }
}
