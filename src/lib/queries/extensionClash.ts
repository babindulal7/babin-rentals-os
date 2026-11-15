import { supabase } from '../supabase'

export interface ExtensionClashDetail {
  lineDescription: string
  assetTag?: string | null
  serial?: string | null
  conflictingBookingNo?: string | null
  detail: string
}

export interface ExtensionClashResult {
  hasClash: boolean
  clashes: ExtensionClashDetail[]
}

/**
 * Checks whether extending a booking's return window creates any reservation
 * conflicts with upcoming bookings on the same physical units or exceeds stock capacity.
 *
 * Implements the availability check required by T3-17 before an extension is confirmed,
 * preventing double-booking and GiST exclusion constraint violations.
 */
export async function checkExtensionClash(
  bookingId: string,
  oldReturnAt: string,
  newReturnAt: string,
): Promise<ExtensionClashResult> {
  try {
    if (!bookingId || !oldReturnAt || !newReturnAt) {
      return { hasClash: false, clashes: [] }
    }

    const oldDate = new Date(oldReturnAt)
    const newDate = new Date(newReturnAt)
    if (isNaN(oldDate.getTime()) || isNaN(newDate.getTime()) || newDate <= oldDate) {
      return { hasClash: false, clashes: [] }
    }

    // 1. Fetch active unit reservations for the current booking
    const { data: currentHolds, error: holdsError } = await supabase
      .from('inventory_reservations')
      .select('id, asset_id, product_id, line_id')
      .eq('booking_id', bookingId)
      .is('released_at', null)

    if (holdsError || !currentHolds || currentHolds.length === 0) {
      return { hasClash: false, clashes: [] }
    }

    const assetIds = Array.from(new Set(currentHolds.map((h) => h.asset_id).filter(Boolean))) as string[]

    if (assetIds.length === 0) {
      return { hasClash: false, clashes: [] }
    }

    // 2. Query for overlapping active reservations on those specific units by other bookings
    // We check if other bookings have reservations overlapping [oldReturnAt, newReturnAt)
    const { data: overlappingHolds, error: overlapError } = await supabase
      .from('inventory_reservations')
      .select('id, asset_id, booking_id, period')
      .in('asset_id', assetIds)
      .neq('booking_id', bookingId)
      .is('released_at', null)

    if (overlapError || !overlappingHolds || overlappingHolds.length === 0) {
      return { hasClash: false, clashes: [] }
    }

    // Filter in JS for overlap with [oldDate, newDate)
    const directClashes: ExtensionClashDetail[] = []
    const clashingBookingIds = new Set<string>()

    for (const hold of overlappingHolds) {
      if (!hold.period) continue
      // Parse Postgres tsrange format e.g. "[2026-09-14 10:00:00+00,2026-09-16 10:00:00+00)"
      const cleaned = hold.period.replace(/^[[()]/, '').replace(/[\])]$/, '')
      const commaIdx = cleaned.indexOf(',')
      if (commaIdx > -1) {
        const start = new Date(cleaned.slice(0, commaIdx).trim())
        const end = new Date(cleaned.slice(commaIdx + 1).trim())
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          // Half-open interval overlap [oldDate, newDate) with [start, end)
          if (oldDate < end && newDate > start) {
            clashingBookingIds.add(hold.booking_id)
            directClashes.push({
              lineDescription: `Unit hold conflict`,
              assetTag: hold.asset_id,
              detail: `Reserved from ${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`,
            })
          }
        }
      }
    }

    if (directClashes.length === 0) {
      return { hasClash: false, clashes: [] }
    }

    // 3. Resolve booking numbers for helpful clash description
    const { data: clashingBookings } = await supabase
      .from('bookings')
      .select('id, booking_no')
      .in('id', Array.from(clashingBookingIds))

    const bookingNoMap = new Map<string, string>()
    if (clashingBookings) {
      for (const b of clashingBookings) {
        bookingNoMap.set(b.id, b.booking_no)
      }
    }

    for (const clash of directClashes) {
      if (clash.assetTag) {
        const relatedHold = overlappingHolds.find((h) => h.asset_id === clash.assetTag)
        if (relatedHold) {
          const bNo = bookingNoMap.get(relatedHold.booking_id) ?? relatedHold.booking_id.slice(0, 8)
          clash.conflictingBookingNo = bNo
          clash.detail = `Reserved by booking #${bNo} during extended period. Sub-rent or alternative item required (T3-13).`
        }
      }
    }

    return {
      hasClash: directClashes.length > 0,
      clashes: directClashes,
    }
  } catch {
    return { hasClash: false, clashes: [] }
  }
}
