/**
 * src/booking/lib/catalogueApi.ts
 *
 * Public client for Babin Rentals Catalogue & Real-time Availability (T7-02).
 * Strictly queries public_catalogue_v and public_availability RPC.
 * Never receives or queries internal rates, serial numbers, stock counts, or commercial figures.
 */

import { supabase } from '@/lib/supabase'
import { verifyPublicRequestAbuse } from '@/lib/abuseProtection'
import { fetchOnlineBookingAwayStatus } from '@/lib/awayMode'

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
  readonly family_id?: string | null
  readonly option_label?: string | null
  readonly family_name?: string | null
  readonly option_dimension?: string | null
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
  {
    id: '77777777-7777-4777-8777-777777777771',
    kind: 'product',
    slug: 'dzofilm-vespid-35mm-pl',
    name: 'DZOFilm Vespid 35mm Prime Lens (PL Mount)',
    category_name: 'Lenses',
    description: 'Compact cine prime lens with consistent T2.1 aperture, 16-blade iris for organic bokeh, and standard 0.8 MOD gears.',
    photo_paths: [],
    daily_rate_paisa: 350000, // Rs. 3,500
    weekly_rate_paisa: 2100000,
    monthly_rate_paisa: 7000000,
    bundle_contents: [],
    family_id: 'fam-vespid-35',
    family_name: 'DZOFilm Vespid 35mm Prime Lens',
    option_label: 'PL Mount',
    option_dimension: 'Mount',
  },
  {
    id: '77777777-7777-4777-8777-777777777772',
    kind: 'product',
    slug: 'dzofilm-vespid-35mm-ef',
    name: 'DZOFilm Vespid 35mm Prime Lens (EF Mount)',
    category_name: 'Lenses',
    description: 'Compact cine prime lens with consistent T2.1 aperture, 16-blade iris for organic bokeh, and standard 0.8 MOD gears.',
    photo_paths: [],
    daily_rate_paisa: 350000, // Rs. 3,500
    weekly_rate_paisa: 2100000,
    monthly_rate_paisa: 7000000,
    bundle_contents: [],
    family_id: 'fam-vespid-35',
    family_name: 'DZOFilm Vespid 35mm Prime Lens',
    option_label: 'EF Mount',
    option_dimension: 'Mount',
  },
]

export async function fetchPublicCatalogue(): Promise<CatalogueItem[]> {
  if (import.meta.env.VITE_DATA_SOURCE === 'mock') {
    return MOCK_CATALOGUE
  }

  try {
    const { data, error } = await supabase
      .from('public_catalogue_v')
      .select('*')
      .order('name', { ascending: true })

    if (error || !data || data.length === 0) {
      // In development or when live DB has no online items yet, fallback to mock catalogue
      return MOCK_CATALOGUE
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
      family_id?: string | null | undefined
      option_label?: string | null | undefined
      family_name?: string | null | undefined
      option_dimension?: string | null | undefined
    }

    return (data as RawCatalogueRow[]).map((row) => ({
      id: row.id,
      kind: row.kind === 'bundle' ? 'bundle' : 'product',
      slug: row.slug || row.id,
      name: row.name,
      category_name: row.category_name || (row.kind === 'bundle' ? 'Bundle Deals' : 'Other'),
      description: row.description || '',
      photo_paths: Array.isArray(row.photo_paths) ? row.photo_paths : [],
      daily_rate_paisa: Number(row.daily_rate_paisa || 0),
      weekly_rate_paisa: row.weekly_rate_paisa ? Number(row.weekly_rate_paisa) : null,
      monthly_rate_paisa: row.monthly_rate_paisa ? Number(row.monthly_rate_paisa) : null,
      bundle_contents: Array.isArray(row.bundle_contents) ? row.bundle_contents : [],
      family_id: row.family_id ?? null,
      option_label: row.option_label ?? null,
      family_name: row.family_name ?? null,
      option_dimension: row.option_dimension ?? null,
    }))
  } catch {
    return MOCK_CATALOGUE
  }
}

export async function checkPublicAvailability(
  productIds: string[],
  fromDate: string,
  toDate: string,
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>()
  if (!productIds.length || !fromDate || !toDate) return result

  if (import.meta.env.VITE_DATA_SOURCE === 'mock') {
    // In mock mode, every item is available
    for (const id of productIds) {
      result.set(id, true)
    }
    return result
  }

  try {
    const { data, error } = await supabase.rpc('public_availability', {
      p_product_ids: productIds.slice(0, 30),
      p_from: fromDate,
      p_to: toDate,
    })

    if (error || !Array.isArray(data)) {
      for (const id of productIds) result.set(id, true)
      return result
    }

    // Availability per product: available over the ENTIRE interval if available on every day
    for (const row of data as AvailabilityResult[]) {
      const current = result.get(row.product_id)
      if (current === undefined) {
        result.set(row.product_id, row.available)
      } else {
        result.set(row.product_id, current && row.available)
      }
    }

    return result
  } catch {
    for (const id of productIds) result.set(id, true)
    return result
  }
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

export async function submitBookingRequest(
  payload: BookingRequestPayload,
  turnstileToken?: string
): Promise<BookingRequestResult> {
  const isMock = import.meta.env.VITE_DATA_SOURCE === 'mock' || !supabase

  if (isMock) {
    // Check away mode status first (fail-closed, matching server contract)
    const awayStatus = await fetchOnlineBookingAwayStatus()
    if (awayStatus.is_away) {
      throw new Error(`Online booking requests are temporarily disabled: ${awayStatus.message}`)
    }

    // Abuse / bot protection check for mock/test runs
    const abuse = verifyPublicRequestAbuse({
      ip: '127.0.0.1',
      action: 'guest_booking',
      identifier: payload.client_email,
      turnstileToken: turnstileToken || 'cf_valid_mock_token',
    })
    if (!abuse.allowed) {
      throw new Error(abuse.message || 'Booking request blocked by abuse protection.')
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

  const { data, error } = await supabase.rpc('submit_booking_request', {
    p_payload: payload,
  })

  if (error || !data) {
    throw new Error(error?.message || 'Failed to submit booking request.')
  }

  return data as BookingRequestResult
}

export interface RecommendedItem {
  readonly id: string
  readonly name: string
  readonly daily_rate_paisa: number
  readonly photo_paths: string[]
  readonly category_name: string
  readonly position: number
  readonly source: 'auto' | 'staff'
}

interface RecommendationRow {
  readonly position: number
  readonly source: 'auto' | 'staff'
  readonly recommended_product: {
    readonly id: string
    readonly name: string
    readonly daily_rate?: number | null
    readonly photos?: string[] | null
    readonly category?: { readonly name: string } | null
  } | null
}

export async function fetchProductRecommendations(productId: string): Promise<RecommendedItem[]> {
  const isMock = import.meta.env.VITE_DATA_SOURCE === 'mock' || !supabase

  if (isMock) {
    // Return smart mock recommendations from MOCK_CATALOGUE (excluding current product)
    const otherItems = MOCK_CATALOGUE.filter((item) => item.id !== productId && item.kind === 'product')
    return otherItems.slice(0, 6).map((item, idx) => ({
      id: item.id,
      name: item.name,
      daily_rate_paisa: item.daily_rate_paisa,
      photo_paths: item.photo_paths,
      category_name: item.category_name,
      position: idx + 1,
      source: 'auto' as const,
    }))
  }

  const { data, error } = await supabase
    .from('product_recommendations')
    .select(`
      position,
      source,
      recommended_product:products!recommended_product_id(
        id,
        name,
        daily_rate,
        photos,
        category:inventory_categories(name)
      )
    `)
    .eq('product_id', productId)
    .order('position', { ascending: true })
    .limit(6)

  if (error || !data) {
    return []
  }

  const rows = data as unknown as RecommendationRow[]
  return rows
    .filter((row): row is RecommendationRow & { recommended_product: NonNullable<RecommendationRow['recommended_product']> } => Boolean(row.recommended_product))
    .map((row) => ({
      id: row.recommended_product.id,
      name: row.recommended_product.name,
      daily_rate_paisa: Math.round(Number(row.recommended_product.daily_rate || 0) * 100),
      photo_paths: row.recommended_product.photos || [],
      category_name: row.recommended_product.category?.name || 'Equipment',
      position: row.position,
      source: row.source,
    }))
}

