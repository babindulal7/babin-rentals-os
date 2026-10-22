import { supabase } from './supabase'

export type ScanLookupResult =
  | {
      status: 'unit_matched'
      code: string
      label: string
      unitId: string
      serialNo: string | null
      assetTag: string | null
      productName: string
      unitStatus: string
    }
  | {
      status: 'product_matched'
      code: string
      label: string
      productId: string
      assetCode: string
      productName: string
    }
  | {
      status: 'booking_matched'
      code: string
      label: string
      bookingId: string
      bookingNo: string
      stage: string
    }
  | {
      status: 'unknown_code'
      code: string
      message: string
    }
  | {
      status: 'query_failed'
      code: string
      error: string
    }

const ZERO_UUID = '00000000-0000-0000-0000-000000000000'
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function sanitizePostgrestParam(value: string): string {
  // Strip characters that break PostgREST .or() filter structure
  return value.replace(/[\r\n,()"\\]/g, '')
}

async function lookupLocalStore(code: string): Promise<ScanLookupResult | null> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') return null
  try {
    const { localStore } = await import('./localStore')
    // 1. Check products in local Dexie store (by asset_tag, serial_no, or id)
    const localProd = await localStore.products
      .where('asset_tag')
      .equalsIgnoreCase(code)
      .or('serial_no')
      .equalsIgnoreCase(code)
      .or('id')
      .equals(code)
      .first()

    if (localProd) {
      return {
        status: 'product_matched',
        code,
        label: `${localProd.name}${localProd.asset_tag ? ` · ${localProd.asset_tag}` : ''}`,
        productId: localProd.id,
        assetCode: localProd.asset_tag ?? localProd.id,
        productName: localProd.name,
      }
    }

    // 2. Check bookings in local Dexie store (by booking_no or id)
    const localBooking = await localStore.bookings
      .where('booking_no')
      .equalsIgnoreCase(code)
      .or('id')
      .equals(code)
      .first()

    if (localBooking) {
      return {
        status: 'booking_matched',
        code,
        label: `Booking ${localBooking.booking_no} (${localBooking.stage})`,
        bookingId: localBooking.id,
        bookingNo: localBooking.booking_no,
        stage: localBooking.stage,
      }
    }

    return null
  } catch {
    return null
  }
}

/**
 * Resolves a scanned barcode, QR code, or serial number against the inventory
 * and bookings database with an honest, strict contract (AUD-002).
 */
export async function resolveScannedCode(rawCode: string): Promise<ScanLookupResult> {
  const code = (rawCode || '').trim()
  if (!code) {
    return {
      status: 'unknown_code',
      code,
      message: 'Empty barcode string provided.',
    }
  }

  const sanitizedCode = sanitizePostgrestParam(code)
  if (!sanitizedCode) {
    return {
      status: 'unknown_code',
      code,
      message: `Invalid or unparseable barcode "${code}".`,
    }
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const localMatch = await lookupLocalStore(code)
    if (localMatch) return localMatch
    return {
      status: 'unknown_code',
      code,
      message: `Unknown code "${code}" — offline, and no cached equipment or booking matches.`,
    }
  }

  const isUuid = UUID_REGEX.test(code)
  const uuidParam = isUuid ? code : ZERO_UUID

  try {
    // 1. Check serialized physical units in product_units_v
    const { data: unit, error: unitError } = await supabase
      .from('product_units_v')
      .select(`
        id,
        serial_no,
        asset_tag,
        barcode,
        qr_code,
        status,
        condition,
        product:products_v (
          id,
          name,
          brand,
          model,
          asset_code
        )
      `)
      .or(`barcode.eq.${sanitizedCode},serial_no.eq.${sanitizedCode},asset_tag.eq.${sanitizedCode},id.eq.${uuidParam}`)
      .maybeSingle()

    if (unitError && unitError.code !== 'PGRST116') {
      return {
        status: 'query_failed',
        code,
        error: unitError.message,
      }
    }

    if (unit) {
      const p = (unit as unknown as { product?: { brand?: string; model?: string; name?: string; asset_code?: string } }).product
      const brandStr = p?.brand ? `${p.brand} ` : ''
      const nameStr = p?.model || p?.name || 'Unit'
      const label = `${brandStr}${nameStr}`.trim()

      return {
        status: 'unit_matched',
        code,
        label,
        unitId: unit.id,
        serialNo: unit.serial_no ?? null,
        assetTag: unit.asset_tag ?? null,
        productName: p?.name || label,
        unitStatus: unit.status,
      }
    }

    // 2. Check catalog products in products_v (bulk or model-level barcode)
    const { data: prod, error: prodError } = await supabase
      .from('products_v')
      .select('id, name, brand, model, asset_code')
      .or(`asset_code.eq.${sanitizedCode},id.eq.${uuidParam}`)
      .maybeSingle()

    if (prodError && prodError.code !== 'PGRST116') {
      return {
        status: 'query_failed',
        code,
        error: prodError.message,
      }
    }

    if (prod) {
      const brandStr = prod.brand ? `${prod.brand} ` : ''
      const nameStr = prod.model || prod.name
      const label = `${brandStr}${nameStr}`.trim()

      return {
        status: 'product_matched',
        code,
        label,
        productId: prod.id,
        assetCode: prod.asset_code,
        productName: prod.name,
      }
    }

    // 3. Check bookings by booking_no or UUID
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, booking_no, stage')
      .or(`booking_no.eq.${sanitizedCode},id.eq.${uuidParam}`)
      .maybeSingle()

    if (bookingError && bookingError.code !== 'PGRST116') {
      return {
        status: 'query_failed',
        code,
        error: bookingError.message,
      }
    }

    if (booking) {
      return {
        status: 'booking_matched',
        code,
        label: `Booking ${booking.booking_no} (${booking.stage})`,
        bookingId: booking.id,
        bookingNo: booking.booking_no,
        stage: booking.stage,
      }
    }

    // 4. Honest: Not found
    return {
      status: 'unknown_code',
      code,
      message: `Unknown code "${code}" — no unit or booking matches.`,
    }
  } catch (err: unknown) {
    const localMatch = await lookupLocalStore(code)
    if (localMatch) return localMatch

    const errorMsg = err instanceof Error ? err.message : String(err)
    return {
      status: 'query_failed',
      code,
      error: errorMsg,
    }
  }
}
