import { supabase } from '../supabase'
import type { Paisa } from '../money'
import { lineValue, readLineValues, rowsOf, type ReportFilterOptions } from './reportSupport'

/**
 * Equipment Performance — revenue per product over a period.
 *
 * RULING 2026-10-16 (R-P6-STATES, Law 16): this read summed every invoice
 * (falling back to a seed figure when the sum was 0), and the page rendered
 * `data/equipmentPerformance` — invented performers with invented utilization
 * and an invented idle cost — on every path. It now attributes the value of
 * each priced booking line (`booking_lines_v`, non-cancelled bookings picked up
 * in the period) to its product, and divides by the product's units in
 * service. Utilization and idle cost need unit state history, which nothing
 * records, so they are not returned. Throws on failure; an empty period is an
 * empty list. Revert = restore the seed re-exports and the `catch`.
 */

export interface EquipmentPerformanceRow {
  productId: string
  name: string
  category: string
  revenue: Paisa
  bookings: number
  units: number
  /** Revenue ÷ units in service; null for a product with no units. */
  revenuePerUnit: Paisa | null
}

export interface EquipmentPerformanceSummary {
  revenue: Paisa
  productsRented: number
  rows: EquipmentPerformanceRow[]
  topPerformers: EquipmentPerformanceRow[]
  /** Products with units in service, lowest revenue per unit first. */
  worstPerformers: EquipmentPerformanceRow[]
}

export async function getEquipmentPerformanceSummary(options?: ReportFilterOptions): Promise<EquipmentPerformanceSummary> {
  let bookingsQ = supabase.from('bookings').select('id').is('cancelled_at', null)
  if (options?.from) bookingsQ = bookingsQ.gte('pickup_at', options.from)
  if (options?.to) bookingsQ = bookingsQ.lte('pickup_at', options.to)
  if (options?.branchId) bookingsQ = bookingsQ.eq('branch_id', options.branchId)

  const [bookingsRes, lineMap, productsRes, categoriesRes, unitsRes] = await Promise.all([
    bookingsQ,
    readLineValues(),
    supabase.from('products').select('id, name, category_id'),
    supabase.from('inventory_categories').select('id, name'),
    supabase.from('product_units_v').select('id, product_id, retired_at'),
  ])
  const bookings = rowsOf<{ id: string }>(bookingsRes, 'Bookings read failed')
  const products = rowsOf<{ id: string; name: string | null; category_id: string | null }>(productsRes, 'Products read failed')
  const categories = rowsOf<{ id: string; name: string | null }>(categoriesRes, 'Categories read failed')
  const units = rowsOf<{ id: string; product_id: string | null; retired_at: string | null }>(unitsRes, 'Units read failed')

  const categoryName = new Map(categories.map((c) => [c.id, c.name?.trim() || '—']))
  const unitsByProduct = new Map<string, number>()
  for (const u of units) {
    if (!u.product_id || u.retired_at) continue
    unitsByProduct.set(u.product_id, (unitsByProduct.get(u.product_id) ?? 0) + 1)
  }

  const revenue = new Map<string, number>()
  const bookingSets = new Map<string, Set<string>>()
  for (const b of bookings) {
    for (const l of lineMap.get(b.id) ?? []) {
      if (!l.product_id) continue
      revenue.set(l.product_id, (revenue.get(l.product_id) ?? 0) + lineValue(l))
      const set = bookingSets.get(l.product_id) ?? new Set<string>()
      set.add(b.id)
      bookingSets.set(l.product_id, set)
    }
  }

  const rows: EquipmentPerformanceRow[] = products
    .filter((p) => revenue.has(p.id) || unitsByProduct.has(p.id))
    .map((p) => {
      const rev = (revenue.get(p.id) ?? 0) as Paisa
      const n = unitsByProduct.get(p.id) ?? 0
      return {
        productId: p.id,
        name: p.name?.trim() || '—',
        category: (p.category_id && categoryName.get(p.category_id)) || 'Uncategorised',
        revenue: rev,
        bookings: bookingSets.get(p.id)?.size ?? 0,
        units: n,
        revenuePerUnit: n > 0 ? (Math.round(rev / n) as Paisa) : null,
      }
    })
    .sort((a, b) => b.revenue - a.revenue)

  const withUnits = rows.filter((r) => r.units > 0)
  return {
    revenue: rows.reduce((a, r) => a + r.revenue, 0) as Paisa,
    productsRented: rows.filter((r) => r.bookings > 0).length,
    rows,
    topPerformers: rows.filter((r) => r.revenue > 0).slice(0, 5),
    worstPerformers: [...withUnits].sort((a, b) => (a.revenuePerUnit ?? 0) - (b.revenuePerUnit ?? 0)).slice(0, 5),
  }
}
