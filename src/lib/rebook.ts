/**
 * src/lib/rebook.ts — the Re-book engine (card T3-01, ruling D9 of
 * RULINGS-2026-10-26.md; L1/W5/W8 of RULINGS-2026-10-26-workflow.md).
 *
 * D9, verbatim intent: "1 and we can choose" — by default a re-book copies
 * **client, products and quantities** into a new Quote at **today's rates**,
 * with empty dates (the L1 default window) and serials picked fresh at
 * confirm. Staff may also tick **crew, delivery, discounts** to copy those.
 *
 * Law 1: this module is the whole re-book decision procedure. It is pure —
 * no Supabase, no React, no clocks — so it is the only thing a test has to
 * believe. `src/lib/queries/rebook.ts` feeds it facts; the dialog collects
 * ticks; New Rental applies the output. Nothing here writes anything: a
 * re-book opens a prefilled form, and D9 forbids the eager draft the old
 * Duplicate flow wrote ("nothing is written until staff save").
 *
 * "Today's rates" means the CURRENT rate card, never the source booking's
 * historical rates: D9's reading is a fresh quote, and a re-book that
 * silently carried 2082's prices into a 2083 quote would put stale money in
 * front of a client. Historical line rates are not even read — the source
 * query reads no money columns at all.
 *
 * Law 5/6 posture: the engine emits paisa figures only into fields the
 * booking-desk roles already see (rates, crew day rates, transport charges).
 * It is reached only through `canWriteBookingDesk` actions, and the money it
 * copies is the money the source booking's own desk surfaces show.
 */

import { formatMoney, type Paisa } from './money'

/** The three extra parts D9 lets staff choose to copy. Order is display order. */
export const REBOOK_COPY_KEYS = ['crew', 'delivery', 'discounts'] as const
export type RebookCopyKey = (typeof REBOOK_COPY_KEYS)[number]

export interface RebookCopyOptions {
  crew: boolean
  delivery: boolean
  discounts: boolean
}

/** D9's default: nothing extra is copied — client, products and quantities only. */
export const REBOOK_COPY_NONE: RebookCopyOptions = { crew: false, delivery: false, discounts: false }

/**
 * Parse the `copy=` URL parameter. Unknown keys are ignored (never a hard
 * error — a stale bookmark must not block a re-book), and a missing or empty
 * parameter means D9's default: copy nothing extra.
 */
export function parseRebookCopyOptions(raw: string | null | undefined): RebookCopyOptions {
  const out: RebookCopyOptions = { ...REBOOK_COPY_NONE }
  if (!raw) return out
  for (const part of raw.split(',')) {
    const key = part.trim().toLowerCase()
    if (key === 'crew') out.crew = true
    else if (key === 'delivery') out.delivery = true
    else if (key === 'discounts') out.discounts = true
  }
  return out
}

/** The inverse of {@link parseRebookCopyOptions} — builds the `copy=` value, or `null` when nothing extra is copied. */
export function formatRebookCopyOptions(options: RebookCopyOptions): string | null {
  const keys = REBOOK_COPY_KEYS.filter((k) => options[k])
  return keys.length > 0 ? keys.join(',') : null
}

/** A product's CURRENT facts, as the re-book needs them. */
export interface RebookProductToday {
  id: string
  name: string
  /** `products.is_active` — the same fact the New Rental catalogue filters on. */
  isActive: boolean
  /** `products.daily_rate` in paisa. Today's rate, never the booking's stored rate. */
  dailyRatePaisa: Paisa
  /** `inventory_categories.name` — so a copied line's category column reads like one the catalogue built. */
  categoryName: string
}

/** A bundle's CURRENT facts, for a copied bundle parent line. */
export interface RebookBundleToday {
  id: string
  name: string
  isActive: boolean
  /** The bundle's own daily rate in paisa — the parent line's `ratePaisa`. */
  bundleRatePaisa: Paisa
}

export type RebookLineType = 'Equipment' | 'Bundle' | 'Accessory' | 'Service' | 'Sub-rental' | 'Manual item'

/** One source booking line, as the query layer read it. No money columns — rates come from the products/bundles of today. */
export interface RebookSourceLine {
  id: string
  lineType: RebookLineType
  productId: string | null
  bundleId: string | null
  /** Display name, resolved by the query layer from description or product/bundle name. */
  name: string
  qty: number
  isIncluded: boolean
  /** The source line's own id when this is a bundle component, else null. */
  parentLineId: string | null
}

/** A source crew line. `booking_crew_lines_v` money is masked for money-blind roles; the query layer passes what it read. */
export interface RebookSourceCrewLine {
  crewMemberId: string | null
  name: string
  role: string
  phone: string | null
  dayRatePaisa: Paisa
  overtimePaisa: Paisa
  accommodationPaisa: Paisa
  mealsPaisa: Paisa
}

export interface RebookSourceTransport {
  vehicle: string
  numberPlate: string
  driverContact: string
  deliveryChargePaisa: Paisa
  fuelChargePaisa: Paisa
  specialInstructions: string
}

/** Everything the engine needs about the source booking. Assembled by `queries/rebook.ts`. */
export interface RebookSource {
  bookingNo: string
  clientId: string | null
  clientName: string | null
  deliveryType: 'Client Pickup' | 'Babin Delivery'
  lines: RebookSourceLine[]
  crew: RebookSourceCrewLine[]
  /** Null when the source was client pickup, or the transport was not readable by this role. */
  transport: RebookSourceTransport | null
  /** Sum of `booking_discounts.percent` (R-17: a percentage, never an amount). */
  discountPct: number
}

/** One prefilled booking line, ready for New Rental's `Line[]` state. Mirrors `BookingLineDraft` — see the shape note there. */
export interface RebookPrefillLine {
  id: string
  clientUuid: string
  parentClientUuid: string | null
  lineType: RebookLineType
  isIncluded: boolean
  productId: string | null
  bundleId: string | null
  name: string
  serial: string
  category: string
  ratePaisa: Paisa
  /** The window re-stamps this: `daysOverridden` is NOT set, so changing the dates moves copied lines too. */
  days: number
  qty: number
  discountPct: number
  location: string
  committedTo: string
}

export interface RebookPrefillCrew {
  crewMemberId: string | null
  name: string
  role: string
  phone: string
  dayRatePaisa: Paisa
  overtimePaisa: Paisa
  accommodationPaisa: Paisa
  mealsPaisa: Paisa
}

export interface RebookPrefillDelivery {
  deliveryType: 'Client Pickup' | 'Babin Delivery'
  deliveryChargePaisa: Paisa
  fuelChargePaisa: Paisa
  vehicle: string
  numberPlate: string
  driverContact: string
  specialInstructions: string
}

export interface RebookPrefill {
  /** The booking this prefill came from, for the banner. */
  sourceBookingNo: string
  clientId: string | null
  lines: RebookPrefillLine[]
  /** Empty unless the crew tick was set. */
  crew: RebookPrefillCrew[]
  /** Null unless the delivery tick was set. */
  delivery: RebookPrefillDelivery | null
  /** Null unless the discounts tick was set — null means "leave the field at 0". */
  discountPct: number | null
  /** Products left out of the copy, each with the reason. Rendered verbatim. */
  unavailable: ReadonlyArray<{ name: string; reason: string }>
}

/** The honest sentence for a product the catalogue would not offer today. Kept as a constant so the UI and tests quote it identically. */
export const REBOOK_UNAVAILABLE_REASON = 'Not available any more'

/**
 * Build the re-book prefill.
 *
 * @param source    the source booking, from `fetchRebookSource`
 * @param products  today's product facts, keyed by id (the query layer read exactly the ids the source lines name)
 * @param bundles   today's bundle facts, keyed by id
 * @param options   D9's ticks — crew / delivery / discounts
 * @param mintUuid  fresh id generator, one per line; injectable so tests are deterministic
 */
export function buildRebookPrefill(
  source: RebookSource,
  products: ReadonlyMap<string, RebookProductToday>,
  bundles: ReadonlyMap<string, RebookBundleToday>,
  options: RebookCopyOptions,
  mintUuid: () => string,
): RebookPrefill {
  /* First pass: mint a fresh client_uuid for every source line, keyed by the
     source line's id, so a bundle component can point at its parent's NEW
     uuid in one lookup. Reusing the source's own uuids would collide with
     the source booking's rows at save time (client_uuid is the line key). */
  const lineKeyBySourceId = new Map<string, string>()
  for (const line of source.lines) {
    lineKeyBySourceId.set(line.id, mintUuid())
  }

  const unavailable: Array<{ name: string; reason: string }> = []
  const lines: RebookPrefillLine[] = []

  for (const line of source.lines) {
    /* Bundle parent lines carry the bundle's TODAY rate; the components ride
       with isIncluded at 0 — the same convention `addBundleToBooking` uses,
       because that is how the pricing pipeline avoids double charging. */
    if (line.lineType === 'Bundle') {
      const bundle = line.bundleId ? bundles.get(line.bundleId) : undefined
      if (!bundle) {
        unavailable.push({ name: line.name || 'Bundle', reason: REBOOK_UNAVAILABLE_REASON })
        /* The bundle's components are dropped with it — a component without
           its parent is a double-bill waiting to happen. */
        continue
      }
      if (!bundle.isActive) {
        unavailable.push({ name: bundle.name, reason: REBOOK_UNAVAILABLE_REASON })
        continue
      }
      lines.push({
        id: mintUuid(),
        clientUuid: lineKeyBySourceId.get(line.id) ?? mintUuid(),
        parentClientUuid: null,
        lineType: 'Bundle',
        isIncluded: false,
        productId: null,
        bundleId: line.bundleId,
        name: bundle.name || line.name,
        serial: '—',
        category: 'Bundle',
        ratePaisa: bundle.bundleRatePaisa,
        days: 1,
        qty: Math.max(1, line.qty || 1),
        discountPct: 0,
        location: '—',
        committedTo: '—',
      })
      continue
    }

    /* Product-backed lines (equipment, accessories, services, sub-rentals):
       re-priced at today's rate; a product the catalogue no longer offers is
       named and left out, never silently dropped and never carried stale. */
    if (line.productId) {
      const product = products.get(line.productId)
      if (!product) {
        unavailable.push({ name: line.name || 'Product', reason: REBOOK_UNAVAILABLE_REASON })
        continue
      }
      if (!product.isActive) {
        unavailable.push({ name: product.name || line.name, reason: REBOOK_UNAVAILABLE_REASON })
        continue
      }
      lines.push({
        id: mintUuid(),
        clientUuid: lineKeyBySourceId.get(line.id) ?? mintUuid(),
        parentClientUuid: line.parentLineId ? lineKeyBySourceId.get(line.parentLineId) ?? null : null,
        lineType: line.lineType,
        isIncluded: line.isIncluded,
        productId: line.productId,
        bundleId: line.bundleId,
        name: product.name || line.name,
        serial: '—',
        category: product.categoryName || line.lineType,
        ratePaisa: product.dailyRatePaisa,
        days: 1,
        qty: Math.max(1, line.qty || 1),
        discountPct: 0,
        location: '—',
        committedTo: '—',
      })
      continue
    }

    /* Manual lines: no product, so there is no "today's rate" to look up —
       D9 copies products and quantities, and a manual line is staff's own
       text. Its stored rate is not readable (money columns are revoked from
       `booking_lines`), so it copies at rate 0 with its name and quantity
       intact: visible, editable, and never a stale price presented as
       current. */
    lines.push({
      id: mintUuid(),
      clientUuid: lineKeyBySourceId.get(line.id) ?? mintUuid(),
      parentClientUuid: line.parentLineId ? lineKeyBySourceId.get(line.parentLineId) ?? null : null,
      lineType: line.lineType,
      isIncluded: line.isIncluded,
      productId: null,
      bundleId: null,
      name: line.name || 'Line',
      serial: '—',
      category: line.lineType,
      ratePaisa: 0 as Paisa,
      days: 1,
      qty: Math.max(1, line.qty || 1),
      discountPct: 0,
      location: '—',
      committedTo: '—',
    })
  }

  const crew: RebookPrefillCrew[] = options.crew
    ? source.crew.map((c) => ({
        crewMemberId: c.crewMemberId,
        name: c.name,
        role: c.role,
        phone: c.phone ?? '',
        dayRatePaisa: c.dayRatePaisa,
        overtimePaisa: c.overtimePaisa,
        accommodationPaisa: c.accommodationPaisa,
        mealsPaisa: c.mealsPaisa,
      }))
    : []

  const delivery: RebookPrefillDelivery | null = options.delivery
    ? {
        deliveryType: source.deliveryType,
        deliveryChargePaisa: source.transport?.deliveryChargePaisa ?? (0 as Paisa),
        fuelChargePaisa: source.transport?.fuelChargePaisa ?? (0 as Paisa),
        vehicle: source.transport?.vehicle ?? '',
        numberPlate: source.transport?.numberPlate ?? '',
        driverContact: source.transport?.driverContact ?? '',
        specialInstructions: source.transport?.specialInstructions ?? '',
      }
    : null

  return {
    sourceBookingNo: source.bookingNo,
    clientId: source.clientId,
    lines,
    crew,
    delivery,
    discountPct: options.discounts ? source.discountPct : null,
    unavailable,
  }
}

/**
 * The summary line the dialog shows beside each tick, so the choice is never
 * blind: "Crew — 2 members", "Delivery — Rs 1,500", "Discounts — 10%".
 * Pure presentation, but it lives with the engine so the wording cannot drift
 * between the dialog and the tests.
 */
export function rebookTickSummary(kind: RebookCopyKey, source: RebookSource): string | null {
  if (kind === 'crew') {
    if (source.crew.length === 0) return null
    return source.crew.length === 1 ? '1 member' : `${source.crew.length} members`
  }
  if (kind === 'delivery') {
    if (source.deliveryType !== 'Babin Delivery') return null
    if (!source.transport) return null
    const total = (source.transport.deliveryChargePaisa + source.transport.fuelChargePaisa) as Paisa
    return formatMoney(total)
  }
  if (source.discountPct <= 0) return null
  return `${source.discountPct}%`
}
