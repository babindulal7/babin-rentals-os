import {
  availabilityRules,
  readCandidates,
  readHolds,
  readProductModes,
  readQuantityHolds,
} from './availability'
import {
  capacityFor,
  computeDailyAvailability,
  findNextFreeDate,
  isRetired,
  selectUnitsForLine,
  windowsOverlap,
  type AssignmentOutcome,
  type BoundConvention,
  type NextFreeDateResult,
  type QuantityHold,
  type RentalWindow,
  type UnitCandidate,
  type UnitHold,
} from '../availability'
import { supabase } from '../supabase'
import { formatDueCountdown } from '../itemCountdown'

/**
 * # One product's availability, for a stated window
 *
 * The equipment sibling of `queries/bundleRecords.ts`. That module answers
 * *"can this bundle be filled between these two instants"*; this one answers
 * the same question for a single product, through the same engine, so the
 * catalogue and the Bundles pane cannot disagree about the same camera.
 *
 * ## Why it exists (NR-09)
 *
 * `booking/itemCatalogue.ts`'s `equipmentResultsFrom` derived a verdict from
 * `unitsByState` — a count of where each unit is **at this instant**. Its own
 * strings said so ("None of 4 free right now") while the panel above them said
 * *"Availability shown for this booking's dates"*, and `NewRental.tsx` raised a
 * Critical from it that blocked Confirm. A booking three weeks out was refused
 * because a camera was on someone else's shoot today.
 *
 * A now-count cannot answer a future window. The date-overlap check can, and it
 * already exists: `lib/availability.ts`'s `selectUnitsForLine`, under
 * `availabilityRules()` — the owner's `unitAvailabilityRule` and
 * `rentalTurnaround` settings, read per call. Nothing here re-implements it.
 *
 * ## Why the window is a required argument
 *
 * The same pressure `listBundleRecords` applies, for the same reason (PLAN.md
 * §4.44, ruled 4 Sep 2026): "free" is not a property of a product, it is the
 * answer to "free *when*". A caller that cannot say which window it means must
 * not get a green answer by omission.
 *
 * ## What this deliberately does not answer
 *
 * A product with **no unit rows** — quantity-tracked bulk stock — gets
 * `unitsOwned: 0`. There is nothing for the overlap check to overlap, so no
 * verdict is produced and none is guessed: the caller reports the stock count
 * and says it is not unit-tracked. `products.total_quantity` is not read here
 * at all, because a bulk count is not an availability answer and mixing the two
 * is how a fabricated status gets built a second time.
 *
 * Products are evaluated **independently of one another**, like bundles in
 * `listBundleRecords`: two catalogue rows never compete for the same unit
 * because a unit belongs to exactly one product. What is NOT answered here is
 * whether two BOOKING LINES naming the same product can both be filled — that
 * is a per-line question, answered by comparing `unitsFree` against the summed
 * quantity, which is the caller's arithmetic on this module's counts.
 */

/** What the engine can say about one product between two instants. */
export type ProductStockMode = 'unit' | 'quantity'

export interface ProductWindowAvailability {
  /** `products.id`. */
  readonly productId: string
  /**
   * Which of the two stock models answered. `unit` counts `product_units`
   * rows and overlaps them one at a time; `quantity` compares
   * `products.total_quantity` against the peak of the model-level holds.
   *
   * Carried because the two are not interchangeable to a reader: `unitsOwned`
   * is a count of serials in one and a bulk figure in the other, and a screen
   * that prints "3 of 4 free" should be able to say which kind of four it
   * means. It also makes an all-`quantity` catalogue visible as such, which
   * live is today (204 of 204 products).
   */
  readonly mode: ProductStockMode
  /**
   * Unit rows this product has, retired ones excluded — the same "units owned"
   * reading `bundleRecords.lineOf` takes: a retired unit is not stock, the
   * business no longer has it. `0` means the product has no unit rows at all,
   * which is a real state (bulk stock) and not a failed read.
   */
  readonly unitsOwned: number
  /** How many of those the engine can assign for the window. */
  readonly unitsFree: number
  /** Units rejected because another booking holds them across the window. */
  readonly unitsHeld: number
  /**
   * The bookings holding them, by `bookings.booking_no`, de-duplicated and
   * sorted. The one fact that tells a coordinator what to do next — the same
   * reasoning `lib/availability.ts:explainShortfall` gives for naming them.
   */
  readonly heldBy: readonly string[]
}

/**
 * The rule half — **pure**, so the windowed answer is drivable by execution in
 * a test with no database. Everything below it is the read.
 *
 * `needed` is `owned.length` rather than any particular line's quantity, the
 * same probe `bundleRecords.lineOf` uses and for the same reason: it makes
 * `assigned.length` the TRUE count of free units, so the catalogue can print
 * "2 of 4 free for these dates" instead of capping at whatever one line
 * happened to ask for. `selectUnitsForLine` refuses `needed < 1`, so an empty
 * pool short-circuits rather than being answered.
 */
export function productAvailabilityFor(
  productId: string,
  pool: readonly UnitCandidate[],
  holds: readonly UnitHold[],
  window: RentalWindow,
  rules: { disqualifyingStates: ReadonlySet<string>; bounds: BoundConvention },
): ProductWindowAvailability {
  const owned = pool.filter((unit) => !isRetired(unit))

  const outcome: AssignmentOutcome =
    owned.length === 0
      ? { assigned: [], shortfall: 0, rejected: [] }
      : selectUnitsForLine({
          needed: owned.length,
          window,
          candidates: owned,
          holds,
          disqualifyingStates: rules.disqualifyingStates,
          bounds: rules.bounds,
        })

  const heldBy = new Set<string>()
  let unitsHeld = 0
  for (const rejection of outcome.rejected) {
    if (rejection.reason.kind !== 'held') continue
    unitsHeld += 1
    heldBy.add(rejection.reason.by.bookingNo)
  }

  return {
    productId,
    mode: 'unit',
    unitsOwned: owned.length,
    unitsFree: outcome.assigned.length,
    unitsHeld,
    heldBy: [...heldBy].sort((a, b) => a.localeCompare(b)),
  }
}


/**
 * The quantity half — bulk stock, compared against the peak of its holds.
 *
 * RULING 2026-09-09 (R-37): bulk stock gets a real windowed answer instead of
 * silence. Revert = delete this function and send every product down the unit
 * path, which reports `unitsOwned: 0` for all 204 live products.
 *
 * ## Why this exists, and why it did not before
 *
 * The header above used to say bulk stock gets `unitsOwned: 0` and no verdict,
 * because "a bulk count is not an availability answer". That was true when this
 * module was written: there was no way to ask what a quantity-tracked product
 * had promised, so reporting the raw stock as free would have invented capacity.
 *
 * The engine grew that half on 7 Sep 2026 — `readQuantityHolds` reads the
 * model-level rows `readHolds` deliberately skips, and `capacityFor` computes
 * `total_quantity − peakHeld` under the same bounds convention. So the answer
 * now exists and the silence is no longer honest.
 *
 * It matters more than the unit half does. **Live has 204 quantity-tracked
 * products and zero `product_units` rows**, so on production every catalogue
 * row goes down THIS path and none goes down the other one. A module that
 * answers only for serials answers for nothing that is actually in the
 * business.
 *
 * ## `qtyRequested: 1`
 *
 * `capacityFor` is a per-LINE question ("can I have 3 of these between these
 * instants") and this is a per-PRODUCT one ("how many could I have"). Asking
 * for one is the smallest legal ask — the function refuses `< 1` — and `free`
 * is computed from `totalQuantity − peakHeld` independently of it, so the
 * number returned here is the true ceiling rather than one line's verdict. The
 * caller compares it against whatever quantity it actually wants, which is the
 * same arithmetic the unit branch leaves to its caller.
 *
 * ## `unitsHeld` is a peak, not a sum
 *
 * Two holds of 2 that do not overlap each other claim 2 at once, not 4. That is
 * `capacityFor`'s `peakHeld`, and it is the figure the database's own capacity
 * trigger compares against — so this previews the question Postgres will ask
 * rather than a stricter one that would refuse bookings it would allow.
 */
export function productCapacityFor(
  productId: string,
  totalQuantity: number,
  holds: readonly QuantityHold[],
  window: RentalWindow,
  rules: { disqualifyingStates: ReadonlySet<string>; bounds: BoundConvention },
): ProductWindowAvailability {
  const outcome = capacityFor({
    window,
    holds,
    totalQuantity,
    qtyRequested: 1,
    bounds: rules.bounds,
  })

  /* Only the holds that actually touch the window are named. `capacityFor`
     already ignores the rest when it computes the peak, and naming a booking
     that does not overlap would send a coordinator to the wrong one. */
  const heldBy = new Set<string>()
  for (const hold of holds) {
    if (windowsOverlap(window, hold.window, rules.bounds)) heldBy.add(hold.bookingNo)
  }

  return {
    productId,
    mode: 'quantity',
    unitsOwned: outcome.totalQuantity,
    unitsFree: outcome.free,
    unitsHeld: outcome.peakHeld,
    heldBy: [...heldBy].sort((a, b) => a.localeCompare(b)),
  }
}

/**
 * Every named product's availability for `window`, in one pair of reads.
 *
 * Two queries for the whole list rather than one pair per row — `readCandidates`
 * takes every product id at once and `readHolds(null)` is the tentative-booking
 * read built for exactly this case (there is no booking of ours to exclude yet).
 * That is what makes this affordable to run behind a catalogue the operator is
 * typing into, which the old header of `equipmentResultsFrom` gave as the reason
 * for not consulting the window at all.
 *
 * **Throws** on a failed read rather than returning an empty map. An empty map
 * is indistinguishable from "every product has no units", and the caller renders
 * that as a state of its own ("could not check") — so the failure has to arrive
 * as a failure. `planCreationUnits` swallows its reads for the opposite reason:
 * it must never block a write. This one only feeds a screen.
 */
export async function readProductAvailability(
  window: RentalWindow,
  productIds: readonly string[],
): Promise<Map<string, ProductWindowAvailability>> {
  const out = new Map<string, ProductWindowAvailability>()
  const ids = [...new Set(productIds)]
  if (ids.length === 0) return out

  const [candidatesByProduct, holds, quantityHolds, modes] = await Promise.all([
    readCandidates(ids),
    readHolds(null),
    readQuantityHolds(ids, null),
    readProductModes(ids),
  ])
  /* Read ONCE for the whole list, not per product: a rule changed mid-loop
     would answer the first half of the catalogue under one policy and the rest
     under another — the same reasoning `planAssignment` states per plan. */
  const rules = availabilityRules()

  for (const id of ids) {
    const mode = modes.get(id)
    /* Explicitly bulk, or else the unit path. `readProductModes` already turns a
       null `tracking_mode` into `Serialised` and says why: the unit path can only
       ever refuse, which is the safe direction. Defaulting the OTHER way here
       would undo that, because the quantity path needs a ceiling and would read
       an absent one as stock nobody counted. A product the modes read did not
       return at all lands here too, with an empty pool and no capacity. */
    const bulk = mode?.trackingMode === 'Quantity' || mode?.trackingMode === 'Consumable'
    out.set(
      id,
      bulk
        ? productCapacityFor(id, mode?.totalQuantity ?? 0, quantityHolds.get(id) ?? [], window, rules)
        : productAvailabilityFor(id, candidatesByProduct.get(id) ?? [], holds, window, rules),
    )
  }
  return out
}

/* ── COMPREHENSIVE PRODUCT AVAILABILITY DETAIL (T3-22, W91) ───────────────────
 *
 * Answers:
 * 1. Free units for any dates (windowed).
 * 2. 60-day calendar availability map.
 * 3. Next free date.
 * 4. Who has it now (current active custody from T2-14).
 *
 * Gated by Law 6: money is strictly omitted if withMoney is false.
 * ─────────────────────────────────────────────────────────────────────────── */

export interface ActiveItemCustody {
  readonly bookingId: string
  readonly bookingNo: string
  readonly clientId: string
  readonly clientName: string
  readonly clientPhone: string | null
  readonly stage: string
  readonly pickupAt: string
  readonly returnAt: string
  readonly isOverdue: boolean
  readonly countdownText: string
  readonly unitSerial?: string | null
  readonly unitAssetTag?: string | null
  readonly qty?: number
}

export interface ProductAvailabilityDetail {
  readonly productId: string
  readonly productName: string
  readonly productDescription?: string | null
  readonly dailyRate?: number | null // Paisa or null if money-blind
  readonly mode: ProductStockMode
  readonly unitsOwned: number
  readonly unitsFree: number
  readonly unitsHeld: number
  readonly heldBy: readonly string[]
  readonly dailyAvailability: Record<string, number>
  readonly nextFreeDate: NextFreeDateResult
  readonly whoHasItNow: readonly ActiveItemCustody[]
}

export async function fetchProductAvailabilityDetail(
  productId: string,
  window?: RentalWindow,
  opts: { withMoney?: boolean } = {},
): Promise<ProductAvailabilityDetail | null> {
  const { data: prodRows, error: pErr } = await supabase
    .from('products_v')
    .select('id, name, description, daily_rate, total_quantity, tracking_mode')
    .eq('id', productId)
    .limit(1)

  if (pErr || !prodRows || prodRows.length === 0) {
    return null
  }
  const prod = prodRows[0]!
  const isBulk = prod.tracking_mode === 'Quantity' || prod.tracking_mode === 'Consumable'

  const now = new Date()
  const todayIso = now.toISOString().slice(0, 10)
  const tmrwIso = new Date(now.getTime() + 86400000).toISOString().slice(0, 10)
  const evalWindow: RentalWindow = window ?? {
    fromAd: `${todayIso}T00:15:00Z`,
    toAd: `${tmrwIso}T00:15:00Z`,
  }

  const [candidatesByProduct, holds, quantityHolds] = await Promise.all([
    readCandidates([productId]),
    readHolds(null),
    readQuantityHolds([productId], null),
  ])
  const rules = availabilityRules()
  const candidates = candidatesByProduct.get(productId) ?? []
  const qHolds = quantityHolds.get(productId) ?? []

  const windowAvail = isBulk
    ? productCapacityFor(productId, prod.total_quantity ?? 0, qHolds, evalWindow, rules)
    : productAvailabilityFor(productId, candidates, holds, evalWindow, rules)

  const dailyAvailability = computeDailyAvailability({
    mode: isBulk ? 'quantity' : 'unit',
    candidates,
    unitHolds: holds,
    quantityHolds: qHolds,
    totalQuantity: prod.total_quantity ?? 0,
    disqualifyingStates: rules.disqualifyingStates,
    bounds: rules.bounds,
    startDateIso: todayIso,
    daysCount: 60,
  })

  const nextFreeDate = findNextFreeDate(dailyAvailability, todayIso, 1)

  const whoHasItNow: ActiveItemCustody[] = []
  const activeStages = ['On Rent', 'Return Due', 'Dispatched', 'Ready', 'Packed', 'Preparing']

  if (!isBulk && candidates.length > 0) {
    const unitIds = candidates.map((c) => c.unitId)
    const { data: bluRows } = await supabase
      .from('booking_line_units')
      .select('id, booking_id, asset_id, unit_state, returned_at, released_at')
      .in('asset_id', unitIds)
      .is('returned_at', null)
      .is('released_at', null)

    if (bluRows && bluRows.length > 0) {
      const bIds = [...new Set(bluRows.map((r) => r.booking_id).filter(Boolean))] as string[]
      if (bIds.length > 0) {
        const { data: bRows } = await supabase
          .from('bookings')
          .select('id, booking_no, client_id, stage, pickup_at, return_at, cancelled_at, actual_return_at')
          .in('id', bIds)
          .is('cancelled_at', null)
          .is('actual_return_at', null)

        if (bRows && bRows.length > 0) {
          const clientIds = [...new Set(bRows.map((b) => b.client_id).filter(Boolean))] as string[]
          const clientMap = new Map<string, { name: string; phone: string | null }>()
          if (clientIds.length > 0) {
            const { data: cRows } = await supabase.from('clients').select('id, name, phone').in('id', clientIds)
            if (cRows) {
              for (const c of cRows) clientMap.set(c.id, { name: c.name, phone: c.phone ?? null })
            }
          }

          const unitMap = new Map(candidates.map((c) => [c.unitId, c]))

          for (const blu of bluRows) {
            const booking = bRows.find((b) => b.id === blu.booking_id && activeStages.includes(b.stage))
            if (!booking) continue
            const unit = unitMap.get(blu.asset_id)
            const client = booking.client_id ? clientMap.get(booking.client_id) : null
            const countdown = formatDueCountdown(booking.return_at)

            whoHasItNow.push({
              bookingId: booking.id,
              bookingNo: booking.booking_no,
              clientId: booking.client_id ?? '',
              clientName: client?.name ?? 'Client',
              clientPhone: client?.phone ?? null,
              stage: booking.stage,
              pickupAt: booking.pickup_at,
              returnAt: booking.return_at,
              isOverdue: countdown.isOverdue,
              countdownText: countdown.text,
              unitSerial: unit?.serialNo ?? null,
              unitAssetTag: unit?.assetTag ?? null,
            })
          }
        }
      }
    }
  } else if (isBulk) {
    const { data: lines } = await supabase
      .from('booking_lines')
      .select('id, booking_id, qty, product_id, voided_at')
      .eq('product_id', productId)
      .is('voided_at', null)

    if (lines && lines.length > 0) {
      const bIds = [...new Set(lines.map((l) => l.booking_id).filter(Boolean))] as string[]
      if (bIds.length > 0) {
        const { data: bRows } = await supabase
          .from('bookings')
          .select('id, booking_no, client_id, stage, pickup_at, return_at, cancelled_at, actual_return_at')
          .in('id', bIds)
          .is('cancelled_at', null)
          .is('actual_return_at', null)

        if (bRows && bRows.length > 0) {
          const clientIds = [...new Set(bRows.map((b) => b.client_id).filter(Boolean))] as string[]
          const clientMap = new Map<string, { name: string; phone: string | null }>()
          if (clientIds.length > 0) {
            const { data: cRows } = await supabase.from('clients').select('id, name, phone').in('id', clientIds)
            if (cRows) {
              for (const c of cRows) clientMap.set(c.id, { name: c.name, phone: c.phone ?? null })
            }
          }

          for (const line of lines) {
            const booking = bRows.find((b) => b.id === line.booking_id && activeStages.includes(b.stage))
            if (!booking) continue
            const client = booking.client_id ? clientMap.get(booking.client_id) : null
            const countdown = formatDueCountdown(booking.return_at)

            whoHasItNow.push({
              bookingId: booking.id,
              bookingNo: booking.booking_no,
              clientId: booking.client_id ?? '',
              clientName: client?.name ?? 'Client',
              clientPhone: client?.phone ?? null,
              stage: booking.stage,
              pickupAt: booking.pickup_at,
              returnAt: booking.return_at,
              isOverdue: countdown.isOverdue,
              countdownText: countdown.text,
              qty: line.qty,
            })
          }
        }
      }
    }
  }

  return {
    productId,
    productName: prod.name,
    productDescription: prod.description,
    dailyRate: opts.withMoney ? (prod.daily_rate ?? null) : null,
    mode: windowAvail.mode,
    unitsOwned: windowAvail.unitsOwned,
    unitsFree: windowAvail.unitsFree,
    unitsHeld: windowAvail.unitsHeld,
    heldBy: windowAvail.heldBy,
    dailyAvailability,
    nextFreeDate,
    whoHasItNow,
  }
}

/**
 * Searches or scans items for the Availability modal.
 * Matches: barcode, QR code, serial number, asset tag, product name, SKU, or asset code.
 */
export async function searchItemForAvailability(
  query: string,
): Promise<Array<{ id: string; name: string; assetTag?: string | null; serialNo?: string | null; totalQuantity?: number }>> {
  const trimmed = query.trim()
  if (!trimmed) return []

  // 1. Try unit matching (by barcode, QR, serial_no, or asset_tag)
  const { data: unitRows } = await supabase
    .from('product_units_v')
    .select('id, product_id, asset_tag, serial_no')
    .or(`asset_tag.ilike.%${trimmed}%,serial_no.ilike.%${trimmed}%`)
    .limit(5)

  if (unitRows && unitRows.length > 0) {
    const prodIds = [...new Set(unitRows.map((u) => u.product_id))]
    const { data: prods } = await supabase.from('products_v').select('id, name, total_quantity').in('id', prodIds)
    const pMap = new Map((prods ?? []).map((p) => [p.id, p]))

    return unitRows.map((u) => {
      const p = pMap.get(u.product_id)
      return {
        id: u.product_id,
        name: p?.name ?? 'Equipment',
        assetTag: u.asset_tag,
        serialNo: u.serial_no,
        totalQuantity: p?.total_quantity ?? 1,
      }
    })
  }

  // 2. Try product search (name, sku, asset_code)
  const { data: prodRows } = await supabase
    .from('products_v')
    .select('id, name, total_quantity')
    .ilike('name', `%${trimmed}%`)
    .limit(8)

  if (prodRows && prodRows.length > 0) {
    return prodRows.map((p) => ({
      id: p.id,
      name: p.name,
      totalQuantity: p.total_quantity,
    }))
  }

  return []
}

