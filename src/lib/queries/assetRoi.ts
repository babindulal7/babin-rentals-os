import { supabase } from '../supabase'
import { rupees, type Paisa } from '../money'
import { completeReportRead, rowsOf } from './reportSupport'

/**
 * # Asset ROI & True Cost of Ownership (Pillar 4)
 *
 *  - Purchase Price (Capital Expenditure)         — `product_units_v.purchase_price`
 *  - Cumulative Maintenance Expense               — `maintenance_records_v.cost`
 *  - Lifetime Rental Revenue per unit             — NOT TRACKED YET (see below)
 *  - Net Return = Revenue − (Purchase Price + Maintenance), ROI %, Maintenance Drag %
 *    — all need the revenue figure, so they are `null` until it exists.
 *
 * RULING 2026-10-16 (R-P6-STATES, Law 16): this module used to "estimate"
 * revenue as purchase price × 1.6 (or × 0.6, chosen by cycling five seed rows),
 * default a missing purchase price to ₹5,00,000, invent 5 % maintenance where
 * none was recorded, copy utilization from the seed rows, and return those
 * five seed rows whenever the read failed or found no units. Every figure on
 * the page was therefore fiction. It now throws on failure, returns no rows for
 * an empty fleet, and leaves revenue-derived figures `null` ("Not tracked yet").
 * TODO(decision): how a booking line's value is attributed to the units that
 * served it (PLAN §4 / OPEN_DECISIONS) — until ruled, per-unit revenue has no
 * source. Revert = restore DEFAULT_FLEET_ROWS and the estimate.
 *
 * All money is integer paisa (Law 1). Money-blind roles never reach this read
 * (Law 6) — and the view returns null prices to them anyway.
 */

export interface UnitRoiRow {
  readonly unitId: string
  readonly assetTag: string
  readonly serialNo: string | null
  readonly productName: string
  readonly category: string
  /** Null when no purchase price is recorded on the unit. */
  readonly purchasePricePaisa: Paisa | null
  /** Null: no per-unit revenue attribution exists yet. */
  readonly lifetimeRevenuePaisa: Paisa | null
  readonly maintenanceCostPaisa: Paisa
  readonly netProfitPaisa: Paisa | null
  readonly roiPercent: number | null
  readonly maintenanceDragPercent: number | null
  /** Null: no rate-over-time source exists yet. */
  readonly utilizationPercent: number | null
  /** Null when neither a purchase date nor a created date is recorded. */
  readonly daysOwned: number | null
}

export interface FleetRoiSummary {
  readonly totalCapitalInvestedPaisa: Paisa
  /** Units with no purchase price recorded — excluded from the capital total, and said so. */
  readonly unpricedUnits: number
  /** Null when any row's revenue is unknown — a partial sum would understate it. */
  readonly totalInvoicedRevenuePaisa: Paisa | null
  readonly totalMaintenanceExpensePaisa: Paisa
  readonly netFleetReturnPaisa: Paisa | null
  readonly fleetRoiPercent: number | null
  readonly averageMaintenanceDragPercent: number | null
  readonly rows: readonly UnitRoiRow[]
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function computeFleetSummary(rows: readonly UnitRoiRow[]): FleetRoiSummary {
  const totalCap = rows.reduce((s, r) => s + (r.purchasePricePaisa ?? 0), 0)
  const totalMaint = rows.reduce((s, r) => s + r.maintenanceCostPaisa, 0)
  const revenueKnown = rows.length > 0 && rows.every((r) => r.lifetimeRevenuePaisa !== null)
  const totalRev = revenueKnown ? rows.reduce((s, r) => s + (r.lifetimeRevenuePaisa ?? 0), 0) : null
  const netFleet = totalRev === null ? null : totalRev - (totalCap + totalMaint)

  return {
    totalCapitalInvestedPaisa: totalCap as Paisa,
    unpricedUnits: rows.filter((r) => r.purchasePricePaisa === null).length,
    totalInvoicedRevenuePaisa: totalRev as Paisa | null,
    totalMaintenanceExpensePaisa: totalMaint as Paisa,
    netFleetReturnPaisa: netFleet as Paisa | null,
    fleetRoiPercent: netFleet === null || totalCap <= 0 ? null : round1((netFleet / totalCap) * 100),
    averageMaintenanceDragPercent: totalRev === null || totalRev <= 0 ? null : round1((totalMaint / totalRev) * 100),
    rows,
  }
}

type UnitRow = {
  id: string
  asset_tag: string | null
  serial_no: string | null
  product_id: string | null
  purchase_price: number | string | null
  purchase_date: string | null
  created_at: string | null
  retired_at: string | null
}

/** Throws on a failed read (Error + Retry); an empty fleet is an empty summary. */
export async function getFleetAssetRoiSummary(now: Date = new Date()): Promise<FleetRoiSummary> {
  const [unitsRes, maintRes, productsRes, categoriesRes] = await Promise.all([
    completeReportRead(supabase
      .from('product_units_v')
      .select('id, asset_tag, serial_no, product_id, purchase_price, purchase_date, created_at, retired_at'), 'Units read failed'),
    completeReportRead(supabase.from('maintenance_records_v').select('id, product_unit_id, cost'), 'Maintenance read failed'),
    completeReportRead(supabase.from('products').select('id, name, category_id'), 'Products read failed'),
    completeReportRead(supabase.from('inventory_categories').select('id, name'), 'Categories read failed'),
  ])
  const units = rowsOf<UnitRow>(unitsRes, 'Units read failed').filter((u) => !u.retired_at)
  const maint = rowsOf<{ product_unit_id: string | null; cost: number | string | null }>(maintRes, 'Maintenance read failed')
  const products = rowsOf<{ id: string; name: string | null; category_id: string | null }>(productsRes, 'Products read failed')
  const categories = rowsOf<{ id: string; name: string | null }>(categoriesRes, 'Categories read failed')

  const maintByUnit = new Map<string, number>()
  for (const m of maint) {
    if (!m.product_unit_id || m.cost == null) continue
    maintByUnit.set(m.product_unit_id, (maintByUnit.get(m.product_unit_id) ?? 0) + rupees(Number(m.cost) || 0))
  }
  const productById = new Map(products.map((p) => [p.id, p]))
  const categoryName = new Map(categories.map((c) => [c.id, c.name?.trim() || '—']))

  const rows: UnitRoiRow[] = units.map((u) => {
    const product = u.product_id ? productById.get(u.product_id) : undefined
    const price = u.purchase_price == null || u.purchase_price === '' ? null : rupees(Number(u.purchase_price) || 0)
    const since = Date.parse(u.purchase_date ?? u.created_at ?? '')
    return {
      unitId: u.id,
      assetTag: u.asset_tag?.trim() || '—',
      serialNo: u.serial_no ?? null,
      productName: product?.name?.trim() || '—',
      category: (product?.category_id && categoryName.get(product.category_id)) || 'Uncategorised',
      purchasePricePaisa: price,
      lifetimeRevenuePaisa: null,
      maintenanceCostPaisa: (maintByUnit.get(u.id) ?? 0) as Paisa,
      netProfitPaisa: null,
      roiPercent: null,
      maintenanceDragPercent: null,
      utilizationPercent: null,
      daysOwned: Number.isNaN(since) ? null : Math.max(0, Math.round((now.getTime() - since) / 86_400_000)),
    }
  })

  return computeFleetSummary(rows)
}
