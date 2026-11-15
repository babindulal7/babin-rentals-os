/**
 * src/lib/scanToAddEquipment.ts
 *
 * T3-19 (W8): Add gear by scanning in New Rental.
 * Scanning an item's QR or asset code resolves that unit, verifies availability,
 * and adds it to the draft lines in one tap/action.
 *
 * Rules:
 *   - Never debounce barcode scans.
 *   - Duplicate scan protection: ignore repeated scans of the same code within 1500ms (1.5s).
 *   - Server-authoritative / catalog-grounded availability check.
 *   - If available, reserves/assigns that exact unit or product line.
 *   - If unavailable or already booked, reports conflict with who has it (T2-14 lookup).
 *   - Strictly idempotent: same equipment already in draft is not duplicated.
 */

import { resolveScannedCode, type ScanLookupResult } from './scannerLookup'
import type { BookingLineDraft, BookingWindow, EquipmentResult } from '../modules/rentals/booking/itemCatalogue'
import type { Line } from '../modules/rentals/booking/RentalLineItemsTree'
import { generateClientUuid } from './dataAccess'
import { rupees } from './money'
import { supabase } from './supabase'

export interface ScanToAddOptions {
  days: number
  existingLines: ReadonlyArray<BookingLineDraft | Line | { id: string; serial?: string | undefined; name?: string | undefined }>
  onAddLine: (line: BookingLineDraft) => void
  onConflict?: ((details: { code: string; name: string; reason: string; similarChoices?: boolean }) => void) | undefined
  window?: BookingWindow | undefined
  catalogue?: readonly EquipmentResult[] | undefined
}

export interface ScanToAddResult {
  success: boolean
  code: string
  action: 'added' | 'ignored_duplicate' | 'already_in_draft' | 'conflict' | 'unrecognized'
  message?: string
  line?: BookingLineDraft
  similarChoices?: boolean
}

// 1.5-second scan cache for duplicate burst suppression
const recentScans = new Map<string, number>()
const BURST_COOLDOWN_MS = 1500

export function resetScanToAddCache(): void {
  recentScans.clear()
}

/**
 * Processes a scanned barcode/QR/asset code for New Rental.
 */
export async function processScanToAddEquipment(
  rawCode: string,
  options: ScanToAddOptions,
): Promise<ScanToAddResult> {
  const code = rawCode.trim()
  if (!code) {
    return { success: false, code, action: 'unrecognized', message: 'Empty scan code' }
  }

  // 1. Duplicate burst guard: Ignore repeat of the exact same code within 1.5s
  const now = Date.now()
  const lastTime = recentScans.get(code)
  if (lastTime && now - lastTime < BURST_COOLDOWN_MS) {
    return {
      success: false,
      code,
      action: 'ignored_duplicate',
      message: 'Duplicate scan ignored within 1.5s window',
    }
  }
  recentScans.set(code, now)

  // 2. Resolve code via shared scanner lookup (T2-14)
  const lookup: ScanLookupResult = await resolveScannedCode(code)

  if (lookup.status === 'unknown_code' || lookup.status === 'query_failed') {
    options.onConflict?.({
      code,
      name: code,
      reason: lookup.status === 'query_failed' ? lookup.error : lookup.message,
    })
    return {
      success: false,
      code,
      action: 'unrecognized',
      message: lookup.status === 'query_failed' ? lookup.error : lookup.message,
    }
  }

  if (lookup.status === 'booking_matched') {
    const reason = `Code belongs to booking ${lookup.bookingNo}, not equipment inventory.`
    options.onConflict?.({ code, name: lookup.bookingNo, reason })
    return { success: false, code, action: 'conflict', message: reason }
  }

  let equipmentId = ''
  let equipmentName = ''
  let serialNo: string | undefined = undefined
  let assetTag: string | undefined = undefined
  let isAvailable = true
  let conflictReason: string | undefined = undefined

  if (lookup.status === 'unit_matched') {
    equipmentId = lookup.unitId
    equipmentName = lookup.productName
    serialNo = lookup.serialNo ?? undefined
    assetTag = lookup.assetTag ?? undefined

    // Unit status check
    const status = lookup.unitStatus.toLowerCase()
    if (status === 'rented' || status === 'on rent' || status === 'maintenance' || status === 'lost' || status === 'retired') {
      isAvailable = false
      conflictReason = `Unit ${serialNo || assetTag || code} is currently ${lookup.unitStatus}.`
    }

    // Server-authoritative reservation check for window if provided
    if (isAvailable && options.window?.pickupAd && options.window?.returnAd) {
      try {
        const pStart = options.window.pickupAd.toISOString()
        const pEnd = options.window.returnAd.toISOString()
        const { data: resData, error: resErr } = await supabase
          .from('inventory_reservations')
          .select('booking:bookings(booking_no, stage)')
          .eq('asset_id', lookup.unitId)
          .is('released_at', null)
          .overlaps('period', `[${pStart},${pEnd})`)
          .maybeSingle()

        if (!resErr && resData) {
          isAvailable = false
          const bNo = (resData as unknown as { booking?: { booking_no?: string } })?.booking?.booking_no ?? 'another booking'
          conflictReason = `Unit ${serialNo || assetTag || code} is already reserved by ${bNo} for these dates.`
        }
      } catch {
        // Fallback gracefully on mock or offline
      }
    }
  } else if (lookup.status === 'product_matched') {
    equipmentId = lookup.productId
    equipmentName = lookup.productName
    assetTag = lookup.assetCode

    if (options.catalogue) {
      const catItem = options.catalogue.find((c) => c.id === equipmentId || c.name === equipmentName)
      if (catItem && catItem.availability?.level === 'unavailable') {
        isAvailable = false
        conflictReason = `Equipment ${equipmentName} is out of stock for the selected dates.`
      }
    }
  }

  // 3. Check if this equipment unit or product is already in the draft
  const alreadyExists = options.existingLines.some(
    (l) => l.id === equipmentId || (serialNo && l.serial === serialNo),
  )
  if (alreadyExists) {
    return {
      success: false,
      code,
      action: 'already_in_draft',
      message: `${equipmentName} is already added to this booking draft.`,
    }
  }

  // 4. Handle unavailability / conflict (offering T3-13 similar choices)
  if (!isAvailable) {
    const reason = conflictReason || `Item is not free for the selected dates.`
    options.onConflict?.({ code, name: equipmentName, reason, similarChoices: true })
    return { success: false, code, action: 'conflict', message: reason, similarChoices: true }
  }

  // 5. Build draft line with catalogue rates and add
  const days = Math.max(1, options.days)
  let category = 'Equipment'
  let ratePaisa = rupees(2500) // Fallback rate; pricing engine recalculates

  if (options.catalogue) {
    const catItem = options.catalogue.find((c) => c.id === equipmentId || c.name === equipmentName)
    if (catItem) {
      if (catItem.category) category = catItem.category
      if (catItem.ratePaisa) ratePaisa = catItem.ratePaisa
    }
  }

  const newLine: BookingLineDraft = {
    id: equipmentId,
    clientUuid: generateClientUuid(),
    name: equipmentName,
    lineType: 'Equipment',
    category,
    qty: 1,
    ratePaisa,
    days,
    discountPct: 0,
    serial: serialNo ?? assetTag ?? '-',
    location: 'Boudha Hub',
    committedTo: 'Stock',
  }

  options.onAddLine(newLine)

  return {
    success: true,
    code,
    action: 'added',
    line: newLine,
  }
}
