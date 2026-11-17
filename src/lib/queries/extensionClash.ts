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
  status: 'clean' | 'clash'
}

/**
 * Parses a PostgreSQL tsrange string e.g. "[2026-09-14 10:00:00+00,2026-09-16 10:00:00+00)"
 * into [start, end] Date objects.
 * Throws if the range format is malformed (fail-closed).
 */
export function parseTsRange(periodStr: string): [Date, Date] {
  if (!periodStr || typeof periodStr !== 'string') {
    throw new Error(`Invalid reservation period: empty or non-string format (${periodStr})`)
  }
  const cleaned = periodStr.replace(/^[[()]/, '').replace(/[\])]$/, '')
  const commaIdx = cleaned.indexOf(',')
  if (commaIdx === -1) {
    throw new Error(`Malformed reservation range bounds: missing comma separator (${periodStr})`)
  }
  const start = new Date(cleaned.slice(0, commaIdx).trim())
  const end = new Date(cleaned.slice(commaIdx + 1).trim())
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error(`Malformed reservation range dates: (${periodStr})`)
  }
  return [start, end]
}

/**
 * Checks whether extending a booking's return window creates any reservation
 * conflicts with upcoming bookings on the same physical units or exceeds stock capacity.
 *
 * Implements the availability check required by T3-17 before an extension is confirmed,
 * preventing double-booking and GiST exclusion constraint violations.
 *
 * P0 Safety (Issue #171): Strictly fails closed on query errors, offline state,
 * zero holds on active bookings, or malformed data.
 */
export async function checkExtensionClash(
  bookingId: string,
  oldReturnAt: string,
  newReturnAt: string,
): Promise<ExtensionClashResult> {
  // 1. Strict input validation — fail closed on invalid inputs
  if (!bookingId || typeof bookingId !== 'string' || !bookingId.trim()) {
    throw new Error('Valid booking ID is required to verify extension availability.')
  }
  if (!oldReturnAt || !newReturnAt) {
    throw new Error('Valid current return and new return timestamps are required.')
  }

  const oldDate = new Date(oldReturnAt)
  const newDate = new Date(newReturnAt)
  if (Number.isNaN(oldDate.getTime()) || Number.isNaN(newDate.getTime())) {
    throw new Error('Invalid date format for extension period.')
  }
  if (newDate <= oldDate) {
    throw new Error('Target return date must be strictly after the current return date.')
  }

  // 2. Fetch active unit reservations for the current booking
  const { data: currentHolds, error: holdsError } = await supabase
    .from('inventory_reservations')
    .select('id, asset_id, product_id, line_id')
    .eq('booking_id', bookingId)
    .is('released_at', null)

  if (holdsError) {
    throw new Error(`Failed to query booking reservations: ${holdsError.message}`)
  }
  if (!currentHolds) {
    throw new Error('Reservation records could not be retrieved from the database.')
  }

  // If there are no current holds, verify if the booking actually has equipment lines
  if (currentHolds.length === 0) {
    const { data: bookingLines, error: linesError } = await supabase
      .from('booking_lines')
      .select('id, product_id, quantity')
      .eq('booking_id', bookingId)
      .is('voided_at', null)

    if (linesError) {
      throw new Error(`Failed to verify booking lines: ${linesError.message}`)
    }

    if (bookingLines && bookingLines.length > 0) {
      // Confirmed booking has lines but zero active reservations — fail closed!
      throw new Error('Booking has active equipment lines but no active reservations found. Extension blocked until reservation status is reconciled.')
    }

    // Genuinely empty booking (no equipment lines)
    return { hasClash: false, clashes: [], status: 'clean' }
  }

  const directClashes: ExtensionClashDetail[] = []
  const clashingBookingIds = new Set<string>()

  // 3. Serialized units check
  const assetIds = Array.from(new Set(currentHolds.map((h) => h.asset_id).filter(Boolean))) as string[]

  if (assetIds.length > 0) {
    const { data: overlappingHolds, error: overlapError } = await supabase
      .from('inventory_reservations')
      .select('id, asset_id, booking_id, period')
      .in('asset_id', assetIds)
      .neq('booking_id', bookingId)
      .is('released_at', null)

    if (overlapError) {
      throw new Error(`Failed to query overlapping reservations: ${overlapError.message}`)
    }
    if (!overlappingHolds) {
      throw new Error('Overlapping reservation records could not be retrieved from the database.')
    }

    for (const hold of overlappingHolds) {
      if (!hold.period) {
        throw new Error(`Reservation record ${hold.id} is missing a valid period.`)
      }
      const [start, end] = parseTsRange(hold.period)
      // Half-open interval overlap [oldDate, newDate) with [start, end)
      if (oldDate < end && newDate > start) {
        clashingBookingIds.add(hold.booking_id)
        directClashes.push({
          lineDescription: 'Unit hold conflict',
          assetTag: hold.asset_id,
          conflictingBookingNo: hold.booking_id,
          detail: `Reserved from ${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`,
        })
      }
    }
  }

  // 4. Quantity-tracked products check (items without asset_id)
  const quantityHolds = currentHolds.filter((h) => !h.asset_id && h.product_id)
  const productIds = Array.from(new Set(quantityHolds.map((h) => h.product_id).filter(Boolean))) as string[]

  if (productIds.length > 0) {
    for (const productId of productIds) {
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('id, name, total_quantity')
        .eq('id', productId)
        .single()

      if (productError || !product) {
        throw new Error(`Failed to check stock capacity for product ${productId}: ${productError?.message ?? 'Not found'}`)
      }

      const totalCap = Number(product.total_quantity) || 0

      // Get all active holds for this product during the target extension
      const { data: otherHolds, error: otherError } = await supabase
        .from('inventory_reservations')
        .select('id, booking_id, period')
        .eq('product_id', productId)
        .is('asset_id', null)
        .neq('booking_id', bookingId)
        .is('released_at', null)

      if (otherError || !otherHolds) {
        throw new Error(`Failed to query product reservations for ${product.name}: ${otherError?.message ?? 'Unknown error'}`)
      }

      let conflictingQty = 0
      for (const hold of otherHolds) {
        if (!hold.period) continue
        const [start, end] = parseTsRange(hold.period)
        if (oldDate < end && newDate > start) {
          conflictingQty += 1
          clashingBookingIds.add(hold.booking_id)
        }
      }

      const ourQty = quantityHolds.filter((h) => h.product_id === productId).length
      if (conflictingQty + ourQty > totalCap) {
        directClashes.push({
          lineDescription: `${product.name} capacity exceeded`,
          detail: `Product stock capacity is ${totalCap}. Overlapping bookings require ${conflictingQty + ourQty} units during the extension period.`,
        })
      }
    }
  }

  if (directClashes.length === 0) {
    return { hasClash: false, clashes: [], status: 'clean' }
  }

  // 5. Resolve booking numbers for helpful clash description
  if (clashingBookingIds.size > 0) {
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
      if (clash.conflictingBookingNo) {
        const bNo = bookingNoMap.get(clash.conflictingBookingNo) ?? clash.conflictingBookingNo.slice(0, 8)
        clash.conflictingBookingNo = bNo
        clash.detail = `Reserved by booking #${bNo} during extended period. Sub-rent or alternative item required (T3-13).`
      }
    }
  }

  return {
    hasClash: true,
    clashes: directClashes,
    status: 'clash',
  }
}
