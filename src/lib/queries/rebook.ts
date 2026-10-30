/**
 * src/lib/queries/rebook.ts — the source read behind Re-book (T3-01, D9).
 *
 * Assembles the `RebookSource` the pure engine (`src/lib/rebook.ts`) turns
 * into a prefill. Five reads, each an established, role-safe surface:
 *
 *  1. `bookings` by booking_no — the same lookup shape `invoicePreview` uses.
 *  2. `booking_lines` — NON-MONEY columns only. The rate/discount columns are
 *     revoked from every session (0077) and re-book must not want them: the
 *     engine prices at TODAY's rate card, so the source's historical rates
 *     are not read at all, which is also why this read is safe for the same
 *     desk roles that read the floor booking.
 *  3. `products` — today's `daily_rate`, `is_active`, and the category name,
 *     the same facts the New Rental catalogue filters and prices on.
 *  4. `bundles_v` — today's bundle rate and active flag, the same view the
 *     bundle catalogue reads.
 *  5. `booking_crew_lines_v` / `booking_transport_v` / `booking_discounts` —
 *     the masked crew/transport views plus the discount rows, mirroring the
 *     invoice preview's reads. Money-masked columns come back null for
 *     money-blind roles; re-book is booking-desk only below, so the desk
 *     session sees what it already sees on the booking's own surfaces.
 *
 * Gated to booking-desk roles (`canWriteBookingDesk`) — the same population
 * that may open New Rental at all. Money-blind roles get a typed refusal
 * before any query runs, so no read is even attempted for them (Law 6).
 */

import { canWriteBookingDesk } from '../rbac'
import type { SystemRole } from '../../types/database'
import { rupees, type Paisa } from '../money'
import { supabase } from '../supabase'
import type {
  RebookBundleToday,
  RebookLineType,
  RebookProductToday,
  RebookSource,
  RebookSourceCrewLine,
  RebookSourceLine,
  RebookSourceTransport,
} from '../rebook'

export type RebookSourceResult =
  | {
      kind: 'ok'
      source: RebookSource
      products: Map<string, RebookProductToday>
      bundles: Map<string, RebookBundleToday>
    }
  | { kind: 'refused'; reason: string }

/** The successful read, handed whole to the caller on confirm so it can build the prefill without re-fetching. */
export type RebookFacts = Extract<RebookSourceResult, { kind: 'ok' }>

interface RawBookingRow {
  id: string
  booking_no: string
  client_id: string | null
  delivery_type: string | null
  cancelled_at: string | null
  clients: { name: string | null } | null
}

/** The six-member `booking_line_type` (0001:296). Anything else is read defensively as a manual line. */
const LINE_TYPES: ReadonlySet<string> = new Set([
  'Equipment',
  'Bundle',
  'Accessory',
  'Service',
  'Sub-rental',
  'Manual item',
])

interface RawLineRow {
  id: string
  line_type: string
  product_id: string | null
  bundle_id: string | null
  description: string | null
  qty: number
  is_included: boolean
  parent_line_id: string | null
  sort_order: number
  voided_at: string | null
  products: { name: string | null } | null
  bundles: { name: string | null } | null
}

interface RawProductRow {
  id: string
  name: string
  is_active: boolean
  daily_rate: number | string | null
  categories: { name: string | null } | null
}

interface RawBundleRow {
  id: string
  name: string
  is_active: boolean
  daily_rate: number | string | null
}

interface RawCrewRow {
  crew_member_id: string | null
  name: string | null
  crew_role: string | null
  phone: string | null
  day_rate: number | string | null
  days: number | string | null
  overtime: number | string | null
  accommodation: number | string | null
  meals: number | string | null
  voided_at: string | null
}

interface RawTransportRow {
  vehicle: string | null
  number_plate: string | null
  driver_contact: string | null
  delivery_charge: number | string | null
  fuel_charge: number | string | null
  special_instructions: string | null
}

/** numeric RUPEES (PostgREST may hand back strings) → paisa; null/absent → 0, the honest value for "nothing read". */
const paisa = (v: number | string | null | undefined): Paisa => rupees(Number(v ?? 0)) as Paisa

export async function fetchRebookSource(
  bookingNo: string,
  role: SystemRole | null,
): Promise<RebookSourceResult> {
  const ref = bookingNo.trim()
  if (ref === '') return { kind: 'refused', reason: 'Name the booking to re-book.' }

  if (!role || !canWriteBookingDesk(role)) {
    return { kind: 'refused', reason: 'Re-booking is a booking-desk action; your role cannot create bookings.' }
  }

  /* ── 1. The booking itself ──────────────────────────────────────────────── */
  const { data: bookingData, error: bookingError } = await supabase
    .from('bookings')
    .select('id, booking_no, client_id, delivery_type, cancelled_at, clients ( name )')
    .eq('booking_no', ref)
    .maybeSingle()

  if (bookingError) throw new Error(`Could not look up booking ${ref}: ${bookingError.message}`)
  const booking = bookingData as unknown as RawBookingRow | null
  if (!booking) return { kind: 'refused', reason: `No booking numbered ${ref} exists, so there is nothing to re-book.` }

  /* A cancelled booking may absolutely be re-booked — that is D9's common
     case (the client came back, the shoot moved). The refuse-list is empty
     on purpose; stage and cancellation never block a re-book. */

  /* ── 2. The lines, without a single money column ────────────────────────── */
  const { data: lineData, error: lineError } = await supabase
    .from('booking_lines')
    .select(
      'id, line_type, product_id, bundle_id, description, qty, is_included, parent_line_id, sort_order, voided_at, ' +
        'products ( name ), bundles ( name )',
    )
    .eq('booking_id', booking.id)
    .order('sort_order', { ascending: true })

  if (lineError) throw new Error(`Could not read the lines of ${ref}: ${lineError.message}`)

  const rawLines = ((lineData ?? []) as unknown as RawLineRow[]).filter((l) => l.voided_at === null)
  const lines: RebookSourceLine[] = rawLines.map((l) => ({
    id: l.id,
    lineType: (LINE_TYPES.has(l.line_type) ? l.line_type : 'Manual item') as RebookLineType,
    productId: l.product_id,
    bundleId: l.bundle_id,
    /* Display name in the source order the booking itself uses: what staff
       typed, else the product's name, else the bundle's name. */
    name: l.description?.trim() || l.products?.name?.trim() || l.bundles?.name?.trim() || l.line_type,
    qty: l.qty,
    isIncluded: Boolean(l.is_included),
    parentLineId: l.parent_line_id,
  }))

  /* ── 3. Today's product facts, for exactly the ids the lines name ────────── */
  const productIds = [...new Set(lines.map((l) => l.productId).filter((id): id is string => !!id))]
  const products = new Map<string, RebookProductToday>()
  if (productIds.length > 0) {
    const { data: productData, error: productError } = await supabase
      .from('products')
      .select('id, name, is_active, daily_rate, categories ( name )')
      .in('id', productIds)
    if (productError) throw new Error(`Could not read today's product rates: ${productError.message}`)
    for (const p of (productData ?? []) as unknown as RawProductRow[]) {
      products.set(p.id, {
        id: p.id,
        name: p.name,
        isActive: p.is_active !== false,
        dailyRatePaisa: paisa(p.daily_rate),
        categoryName: p.categories?.name ?? '',
      })
    }
  }

  /* ── 4. Today's bundle facts ────────────────────────────────────────────── */
  const bundleIds = [...new Set(lines.map((l) => l.bundleId).filter((id): id is string => !!id))]
  const bundles = new Map<string, RebookBundleToday>()
  if (bundleIds.length > 0) {
    const { data: bundleData, error: bundleError } = await supabase
      .from('bundles_v')
      .select('id, name, is_active, daily_rate')
      .in('id', bundleIds)
    if (bundleError) throw new Error(`Could not read today's bundle rates: ${bundleError.message}`)
    for (const b of (bundleData ?? []) as unknown as RawBundleRow[]) {
      bundles.set(b.id, {
        id: b.id,
        name: b.name,
        isActive: b.is_active !== false,
        bundleRatePaisa: paisa(b.daily_rate),
      })
    }
  }

  /* ── 5a. Crew, through the masked view ──────────────────────────────────── */
  const { data: crewData, error: crewError } = await supabase
    .from('booking_crew_lines_v')
    .select('crew_member_id, name, crew_role, phone, day_rate, days, overtime, accommodation, meals, voided_at')
    .eq('booking_id', booking.id)

  if (crewError) throw new Error(`Could not read the crew of ${ref}: ${crewError.message}`)

  const crew: RebookSourceCrewLine[] = ((crewData ?? []) as unknown as RawCrewRow[])
    .filter((c) => c.voided_at === null)
    .map((c) => ({
      crewMemberId: c.crew_member_id,
      name: c.name?.trim() || 'Crew',
      role: c.crew_role ?? '',
      phone: c.phone,
      dayRatePaisa: paisa(c.day_rate),
      overtimePaisa: paisa(c.overtime),
      accommodationPaisa: paisa(c.accommodation),
      mealsPaisa: paisa(c.meals),
    }))

  /* ── 5b. Transport — absent when the source was client pickup, or when this
     role's read comes back empty (the view admits a narrower role set than
     the desk). Either way the dialog says "nothing to copy", never a guess. */
  let transport: RebookSourceTransport | null = null
  if (booking.delivery_type === 'Babin Delivery') {
    const { data: transportData, error: transportError } = await supabase
      .from('booking_transport_v')
      .select('vehicle, number_plate, driver_contact, delivery_charge, fuel_charge, special_instructions')
      .eq('booking_id', booking.id)
      .maybeSingle()

    if (transportError) throw new Error(`Could not read the transport of ${ref}: ${transportError.message}`)
    const t = transportData as unknown as RawTransportRow | null
    if (t) {
      transport = {
        vehicle: t.vehicle ?? '',
        numberPlate: t.number_plate ?? '',
        driverContact: t.driver_contact ?? '',
        deliveryChargePaisa: paisa(t.delivery_charge),
        fuelChargePaisa: paisa(t.fuel_charge),
        specialInstructions: t.special_instructions ?? '',
      }
    }
  }

  /* ── 5c. The booking-level discount — R-17, a percentage ───────────────── */
  const { data: discountData, error: discountError } = await supabase
    .from('booking_discounts')
    .select('percent')
    .eq('booking_id', booking.id)

  if (discountError) throw new Error(`Could not read the discount on ${ref}: ${discountError.message}`)
  const discountPct = ((discountData ?? []) as unknown as Array<{ percent: number | string }>).reduce(
    (sum, d) => sum + (Number(d.percent) || 0),
    0,
  )

  return {
    kind: 'ok',
    source: {
      bookingNo: booking.booking_no,
      clientId: booking.client_id,
      clientName: booking.clients?.name ?? null,
      deliveryType: booking.delivery_type === 'Babin Delivery' ? 'Babin Delivery' : 'Client Pickup',
      lines,
      crew,
      transport,
      discountPct,
    },
    products,
    bundles,
  }
}
