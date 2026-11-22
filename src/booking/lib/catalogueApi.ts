/**
 * src/booking/lib/catalogueApi.ts
 *
 * Public client for Babin Rentals Catalogue & Real-time Availability (T7-02).
 * Strictly queries public_catalogue_v and public_availability RPC.
 * Never receives or queries internal rates, serial numbers, stock counts, or commercial figures.
 */

import { supabase } from '@/lib/supabase'
import { fetchOnlineBookingAwayStatus } from '@/lib/awayMode'
import { rentalDaysInclusive, resolveCompleteAvailability, type PublicDayAvailability } from './publicAvailabilitySafety'
import type { FamilyOptionRow } from './familyOptions'

export interface BundleComponent {
  readonly name: string
  readonly qty: number
}

export interface CatalogueItem {
  readonly id: string
  readonly kind: 'product' | 'bundle'
  readonly slug: string
  readonly name: string
  readonly category_name: string
  readonly description: string
  readonly photo_paths: string[]
  readonly daily_rate_paisa: number
  readonly weekly_rate_paisa: number | null
  readonly monthly_rate_paisa: number | null
  readonly bundle_contents: BundleComponent[]
}

export interface AvailabilityResult {
  readonly product_id: string
  readonly day: string
  readonly available: boolean
}

/* Rich fallback catalogue for VITE_DATA_SOURCE=mock and unit test runs */
const MOCK_CATALOGUE: CatalogueItem[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    kind: 'product',
    slug: 'sony-fx3-cinema-line-camera',
    name: 'Sony FX3 Cinema Line Camera',
    category_name: 'Cameras',
    description: 'Full-frame cinema camera with 4K 120p, S-Cinetone, 15+ stops dynamic range, dual CFexpress Type A slots, and cage handle.',
    photo_paths: ['/icons/192.png'],
    daily_rate_paisa: 450000, // Rs. 4,500
    weekly_rate_paisa: 2700000,
    monthly_rate_paisa: 9000000,
    bundle_contents: [],
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    kind: 'product',
    slug: 'sony-fe-24-70mm-f2-8-gm-ii',
    name: 'Sony FE 24-70mm f/2.8 GM II Lens',
    category_name: 'Lenses',
    description: 'Ultra-lightweight fast standard zoom lens with extreme aspherical optics, XD linear motors, and aperture de-click switch.',
    photo_paths: [],
    daily_rate_paisa: 200000, // Rs. 2,000
    weekly_rate_paisa: 1200000,
    monthly_rate_paisa: 4000000,
    bundle_contents: [],
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    kind: 'product',
    slug: 'aputure-ls-600d-pro-daylight-led',
    name: 'Aputure LS 600d Pro Daylight LED',
    category_name: 'Lighting',
    description: '600W daylight-balanced COB LED light with Bowens mount, weather-resistant build, Sidus Link wireless control.',
    photo_paths: [],
    daily_rate_paisa: 350000, // Rs. 3,500
    weekly_rate_paisa: 2100000,
    monthly_rate_paisa: 7000000,
    bundle_contents: [],
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    kind: 'product',
    slug: 'dji-rs-3-pro-gimbal-stabilizer',
    name: 'DJI RS 3 Pro Gimbal Stabilizer',
    category_name: 'Grip',
    description: 'Automated axis locks, extended carbon fiber axis arms, 4.5kg tested payload, LiDAR focusing compatibility.',
    photo_paths: [],
    daily_rate_paisa: 250000, // Rs. 2,500
    weekly_rate_paisa: 1500000,
    monthly_rate_paisa: 5000000,
    bundle_contents: [],
  },
  {
    id: '55555555-5555-4555-8555-555555555555',
    kind: 'product',
    slug: 'sennheiser-mkh-416-shotgun-mic',
    name: 'Sennheiser MKH 416 Shotgun Microphone',
    category_name: 'Audio',
    description: 'Industry standard super-cardioid/lobar interference tube condenser microphone, rugged RF condenser design.',
    photo_paths: [],
    daily_rate_paisa: 150000, // Rs. 1,500
    weekly_rate_paisa: 900000,
    monthly_rate_paisa: 3000000,
    bundle_contents: [],
  },
  {
    id: '66666666-6666-4666-8666-666666666666',
    kind: 'bundle',
    slug: 'indie-cinematographer-package',
    name: 'Indie Cinematographer Package',
    category_name: 'Bundle Deals',
    description: 'Complete turn-key documentary shooting kit: Sony FX3 body, 24-70mm GM II lens, DJI RS 3 Pro gimbal, and wireless audio.',
    photo_paths: [],
    daily_rate_paisa: 850000, // Rs. 8,500 (discounted)
    weekly_rate_paisa: 5100000,
    monthly_rate_paisa: null,
    bundle_contents: [
      { name: 'Sony FX3 Cinema Line Camera', qty: 1 },
      { name: 'Sony FE 24-70mm f/2.8 GM II Lens', qty: 1 },
      { name: 'DJI RS 3 Pro Gimbal Stabilizer', qty: 1 },
      { name: 'Sennheiser MKH 416 Shotgun Microphone', qty: 1 },
    ],
  },
  // T7-13 mock family for the local preview: one cable family whose options differ only by length.
  {
    id: '77777777-7777-4777-8777-777777777777',
    kind: 'product',
    slug: 'bnc-sdi-cable-5m',
    name: 'BNC SDI Cable 5m',
    category_name: 'Cables',
    description: 'Broadcast-grade BNC SDI cable, 5 metres.',
    photo_paths: [],
    daily_rate_paisa: 50000, // Rs. 500
    weekly_rate_paisa: null,
    monthly_rate_paisa: null,
    bundle_contents: [],
  },
  {
    id: '88888888-8888-4888-8888-888888888888',
    kind: 'product',
    slug: 'bnc-sdi-cable-10m',
    name: 'BNC SDI Cable 10m',
    category_name: 'Cables',
    description: 'Broadcast-grade BNC SDI cable, 10 metres.',
    photo_paths: [],
    daily_rate_paisa: 70000, // Rs. 700
    weekly_rate_paisa: null,
    monthly_rate_paisa: null,
    bundle_contents: [],
  },
]

/** T7-13 mock family rows, used only with VITE_DATA_SOURCE=mock for the local preview. */
const MOCK_FAMILY_ROWS: FamilyOptionRow[] = [
  { familyId: 'mock-family-bnc-sdi', familyName: 'BNC SDI Cable', productId: '77777777-7777-4777-8777-777777777777', optionLabel: '5m', sortOrder: 1 },
  { familyId: 'mock-family-bnc-sdi', familyName: 'BNC SDI Cable', productId: '88888888-8888-4888-8888-888888888888', optionLabel: '10m', sortOrder: 2 },
]

export async function fetchPublicCatalogue(): Promise<CatalogueItem[]> {
  // Fixture data is permitted ONLY in explicit local mock/test environments.
  if (import.meta.env.VITE_DATA_SOURCE === 'mock' || import.meta.env.MODE === 'test') {
    return MOCK_CATALOGUE
  }

  let data: unknown
  try {
    const response = await supabase
      .from('public_catalogue_v')
      .select('*')
      .order('name', { ascending: true })
    if (response.error || !Array.isArray(response.data)) {
      throw new Error('Catalogue response unavailable')
    }
    data = response.data
  } catch {
    throw new Error('Catalogue temporarily unavailable. Please retry.')
  }

  interface RawCatalogueRow {
    id: string
    kind?: string | undefined
    slug?: string | undefined
    name: string
    category_name?: string | undefined
    description?: string | undefined
    photo_paths?: string[] | undefined
    daily_rate_paisa?: number | undefined
    weekly_rate_paisa?: number | null | undefined
    monthly_rate_paisa?: number | null | undefined
    bundle_contents?: BundleComponent[] | undefined
  }

  // A legitimate empty published catalogue stays empty, not a fabricated set.
  return (data as RawCatalogueRow[]).map((row) => {
    const dailyRate = Number(row.daily_rate_paisa)
    if (!row.id || !row.name || !Number.isSafeInteger(dailyRate) || dailyRate <= 0) {
      throw new Error('Published catalogue information is incomplete. Please retry.')
    }
    return {
      id: row.id,
      kind: row.kind === 'bundle' ? 'bundle' : 'product',
      slug: row.slug || row.id,
      name: row.name,
      category_name: row.category_name || (row.kind === 'bundle' ? 'Bundle Deals' : 'Other'),
      description: row.description || '',
      photo_paths: Array.isArray(row.photo_paths) ? row.photo_paths : [],
      daily_rate_paisa: dailyRate,
      weekly_rate_paisa: row.weekly_rate_paisa == null ? null : Number(row.weekly_rate_paisa),
      monthly_rate_paisa: row.monthly_rate_paisa == null ? null : Number(row.monthly_rate_paisa),
      bundle_contents: Array.isArray(row.bundle_contents) ? row.bundle_contents : [],
    }
  })
}

export async function checkPublicAvailability(
  productIds: string[],
  fromDate: string,
  toDate: string,
): Promise<Map<string, boolean>> {
  if (!productIds.length) return new Map()

  // Reject malformed and out-of-range dates before calling the anonymous RPC.
  const dates = rentalDaysInclusive(fromDate, toDate)
  const uniqueIds = Array.from(new Set(productIds))

  if (import.meta.env.VITE_DATA_SOURCE === 'mock' || import.meta.env.MODE === 'test') {
    // Explicit local fixtures only, never the hosted/public client.
    return new Map(uniqueIds.map((id) => [id, true]))
  }

  // The SQL RPC accepts a maximum of 30 IDs per request; check every item,
  // including large catalogues, instead of silently ignoring IDs 31 onward.
  const result = new Map<string, boolean>()
  for (let i = 0; i < uniqueIds.length; i += 30) {
    const batch = uniqueIds.slice(i, i + 30)
    let rows: PublicDayAvailability[]
    try {
      const response = await supabase.rpc('public_availability', {
        p_product_ids: batch,
        p_from: fromDate,
        p_to: toDate,
      })
      if (response.error || !Array.isArray(response.data)) {
        throw new Error('Availability RPC unavailable')
      }
      rows = response.data as PublicDayAvailability[]
    } catch {
      throw new Error('Unable to verify equipment availability. Please retry.')
    }

    // Only a complete product/day matrix can produce an Available badge.
    const batchResult = resolveCompleteAvailability(batch, dates, rows)
    for (const [id, free] of batchResult) result.set(id, free)
  }
  return result
}

export function getPublicPhotoUrl(path: string | undefined): string | null {
  if (!path) return null
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('/')) {
    return path
  }
  try {
    const res = supabase?.storage?.from?.('catalogue')?.getPublicUrl?.(path)
    if (res?.data?.publicUrl && typeof res.data.publicUrl === 'string') {
      return res.data.publicUrl
    }
    return `/storage/catalogue/${path}`
  } catch {
    return `/storage/catalogue/${path}`
  }
}

export interface BookingRequestLinePayload {
  readonly product_id?: string | undefined
  readonly bundle_id?: string | undefined
  readonly quantity: number
}

export interface BookingRequestPayload {
  readonly client_name: string
  readonly client_email: string
  readonly client_phone: string
  readonly project_name?: string | undefined
  readonly shoot_location?: string | undefined
  readonly start_date: string
  readonly end_date: string
  readonly fulfillment_type: 'pickup' | 'delivery'
  readonly delivery_zone_id?: string | undefined
  readonly delivery_address?: string | undefined
  readonly lines: BookingRequestLinePayload[]
}

export interface BookingRequestResult {
  readonly request_id: string
  readonly request_number: string
  readonly total_paisa: number
  readonly vat_paisa: number
  readonly advance_due_paisa: number
  readonly status: string
}

export async function submitBookingRequest(payload: BookingRequestPayload): Promise<BookingRequestResult> {
  const isMock = import.meta.env.VITE_DATA_SOURCE === 'mock' || import.meta.env.MODE === 'test' || !supabase

  if (isMock) {
    // Check away mode status first (fail-closed, matching server contract)
    const awayStatus = await fetchOnlineBookingAwayStatus()
    if (awayStatus.is_away) {
      throw new Error(`Online booking requests are temporarily disabled: ${awayStatus.message}`)
    }

    // Generate simulated response for local/offline mock
    const fakeId = 'req-' + Math.random().toString(36).substring(2, 9)
    const fakeNum = 'REQ-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.floor(1000 + Math.random() * 9000)
    return {
      request_id: fakeId,
      request_number: fakeNum,
      total_paisa: 1500000,
      vat_paisa: 195000,
      advance_due_paisa: 847500,
      status: 'pending',
    }
  }

  // A request can sit in a cart while stock changes or the browser goes offline.
  // Recheck every selected item immediately before the server-side submission.
  const ids = payload.lines.map((line) => line.product_id ?? line.bundle_id)
  if (!payload.lines.length || ids.some((id) => !id) ||
      payload.lines.some((line) => !Number.isInteger(line.quantity) || line.quantity < 1)) {
    throw new Error('Booking request contains an invalid item or quantity.')
  }
  const verified = await checkPublicAvailability(ids as string[], payload.start_date, payload.end_date)
  if (ids.some((id) => verified.get(id as string) !== true)) {
    throw new Error('Some equipment is no longer available for the selected dates. Please review your request.')
  }

  const { data, error } = await supabase.rpc('submit_booking_request', {
    p_payload: payload,
  })

  if (error || !data) {
    throw new Error(error?.message || 'Failed to submit booking request.')
  }

  return data as BookingRequestResult
}

/**
 * T7-13 · Options of product families, for the option picker. Reads public_product_family_options_v,
 * which only lists options that are publicly sold. Fails soft: if the read fails the products still
 * show, each as a standalone item, and the failure is logged.
 */
export async function fetchFamilyOptions(): Promise<FamilyOptionRow[]> {
  if (import.meta.env.VITE_DATA_SOURCE === 'mock') {
    return MOCK_FAMILY_ROWS
  }
  if (import.meta.env.MODE === 'test') {
    return []
  }

  try {
    const { data, error } = await supabase
      .from('public_product_family_options_v')
      .select('family_id, family_name, product_id, option_label, sort_order')

    if (error) {
      console.error('[catalogue] family options unavailable; showing products as standalone', error)
      return []
    }

    return (data ?? []).map((row) => ({
      familyId: row.family_id,
      familyName: row.family_name,
      productId: row.product_id,
      optionLabel: row.option_label,
      sortOrder: row.sort_order,
    }))
  } catch (error) {
    console.error('[catalogue] family options request failed', error)
    return []
  }
}
