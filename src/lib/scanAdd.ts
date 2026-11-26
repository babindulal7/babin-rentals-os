import type { ItemCardData } from './queries/inventory'

/**
 * T3-19 (W8) — decide what a scanned code does inside New Rental.
 *
 * The page never decides this itself (Law 1): it hands over the catalogue it is
 * showing, the lines already on the booking and a lookup function, and gets back
 * one outcome with a sentence that is safe to show inline. No money is read or
 * returned here — Warehouse/Technician/Driver may scan too (Law 6).
 */

/** Same code inside this window is one scan, not two (T2-14 rule; ⭐ 1.5 s). */
export const SCAN_REPEAT_WINDOW_MS = 1500

export interface ScanAddEquipment {
  readonly id: string
  readonly name: string
  /** True when the catalogue verdict for the booking dates is "unavailable". */
  readonly unavailable: boolean
}

export type ScanBlockReason =
  | 'catalogue_not_loaded'
  | 'unknown_code'
  | 'not_rentable'
  | 'already_on_booking'
  | 'unavailable'
  | 'lookup_failed'

export type ScanAddOutcome =
  | {
      readonly status: 'added'
      readonly id: string
      readonly message: string
      /** The scanned physical unit, reserved exactly at creation; null for a product-level code. */
      readonly unitId: string | null
      /** `more_units`: the product is already a line — add one to its quantity and the unit to it. */
      readonly mode: 'new_line' | 'more_units'
    }
  | { readonly status: 'blocked'; readonly reason: ScanBlockReason; readonly message: string }

export interface ResolveScanAddInput {
  readonly code: string
  readonly days: number
  readonly existingLineIds: readonly string[]
  /** Units already reserved by scan on any line of this booking. */
  readonly existingUnitIds?: readonly string[]
  /**
   * Is this scanned unit free for the booking dates? Returns the refusal sentence, or
   * null when it is free (or the answer is unavailable — Create checks again).
   */
  readonly checkUnit?: (unitId: string, productId: string, label: string) => Promise<string | null>
  /** `null` while the live catalogue has not loaded. */
  readonly equipment: readonly ScanAddEquipment[] | null
  readonly lookup: (code: string) => Promise<ItemCardData | null>
}

const blocked = (reason: ScanBlockReason, message: string): ScanAddOutcome => ({ status: 'blocked', reason, message })

const normalise = (code: string): string => code.trim().toLowerCase()

/**
 * Returns a guard: call it with each scanned code; `true` means "ignore, this
 * is the same code again inside the window". Different codes are never held
 * back — scanners are never debounced across distinct items.
 */
export function createScanRepeatGuard(
  now: () => number = Date.now,
  windowMs: number = SCAN_REPEAT_WINDOW_MS,
): (code: string) => boolean {
  let lastCode: string | null = null
  let lastAt = 0
  return (code: string): boolean => {
    const key = normalise(code)
    const t = now()
    if (lastCode === key && t - lastAt < windowMs) return true
    lastCode = key
    lastAt = t
    return false
  }
}

/** "ARRI Alexa Mini AX-1" when a physical unit was scanned, else just the name. */
function unitLabel(name: string, card: ItemCardData): string {
  const tag = card.unitId ? (card.assetTag ?? card.serialNo ?? '') : ''
  return tag ? `${name} ${tag}` : name
}

function holderMessage(name: string, card: ItemCardData | null): string {
  const custody = card?.custody
  if (custody) {
    const when = custody.isOverdue ? 'overdue' : 'on rent'
    return `${name} is with ${custody.clientName} on ${custody.bookingNo} (${when}). It is not free for these dates.`
  }
  const next = card?.nextBooking
  if (next) {
    return `${name} is not free for these dates — it is booked for ${next.clientName} on ${next.bookingNo}.`
  }
  return `${name} is not free for these dates.`
}

export async function resolveScanAdd(input: ResolveScanAddInput): Promise<ScanAddOutcome> {
  const code = input.code.trim()
  if (!code) return blocked('unknown_code', 'Scan or type a code first.')
  if (!input.equipment) {
    return blocked('catalogue_not_loaded', 'The live catalogue has not loaded yet, so nothing can be added by scan.')
  }

  let card: ItemCardData | null
  try {
    card = await input.lookup(code)
  } catch {
    return blocked('lookup_failed', `Could not look up "${code}". Check the connection and scan again.`)
  }
  if (!card) {
    return blocked('unknown_code', `No item matches "${code}". Check the label and scan again.`)
  }

  const match = input.equipment.find((item) => item.id === card.productId)
  if (!match) {
    return blocked('not_rentable', `${card.name} is not in the rentable catalogue, so it cannot be added.`)
  }
  const unitId = card.unitId
  if (unitId && (input.existingUnitIds ?? []).includes(unitId)) {
    return blocked('already_on_booking', `${unitLabel(match.name, card)} is already on this booking.`)
  }
  const productOnBooking = input.existingLineIds.includes(match.id)
  /* A second DIFFERENT unit of a product already on the booking is one more of that product;
     a product-level code (no unit) for a product already there is still a duplicate. */
  if (productOnBooking && !unitId) {
    return blocked('already_on_booking', `${match.name} is already on this booking.`)
  }
  if (match.unavailable) {
    return blocked('unavailable', holderMessage(match.name, card))
  }
  if (unitId && input.checkUnit) {
    const refusal = await input.checkUnit(unitId, match.id, match.name)
    if (refusal) return blocked('unavailable', refusal)
  }
  return {
    status: 'added',
    id: match.id,
    unitId: unitId ?? null,
    mode: productOnBooking ? 'more_units' : 'new_line',
    message: `${unitLabel(match.name, card)} added to this booking.`,
  }
}
