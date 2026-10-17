import { supabase } from '../supabase'
import type { Paisa } from '../money'
import { lineValue, readLineValues, rowsOf, type ReportFilterOptions } from './reportSupport'

/**
 * Product Reports — catalogue, demand and stock, from the catalogue itself.
 *
 * RULING 2026-10-16 (R-P6-STATES, Law 16): this read counted `products_v`
 * (falling back to the seed list's length when the count was 0) and the page
 * rendered `data/productReports` — invented sales trends, profit trends,
 * turnover, returns, suppliers and products — on every path. It now returns:
 *
 *   - catalogue counts                     — `products` (active / total)
 *   - demand in the period                 — priced lines (`booking_lines_v`) on
 *                                            non-cancelled bookings picked up in it
 *   - revenue by category, top products    — the same lines, money-visible roles
 *                                            only (the view nulls rates otherwise)
 *   - products with no booking in period   — active products none of those lines name
 *   - at or below reorder level            — `total_quantity` ≤ `reorder_level`
 *
 * Profit, turnover, returns and supplier ranking have no source and are not
 * returned. Throws on failure; an empty catalogue is empty.
 * Revert = restore the seed re-exports and the `catch`.
 */

export interface ProductReportRow {
  productId: string
  name: string
  category: string
  bookings: number
  quantityBooked: number
  revenue: Paisa
}

export interface CategoryRevenue {
  category: string
  revenue: Paisa
  bookings: number
}

export interface LowStockRow {
  productId: string
  name: string
  onHand: number
  reorderLevel: number
}

export interface ProductReportsSummary {
  productCount: number
  activeProducts: number
  productsBooked: number
  revenue: Paisa
  byCategory: CategoryRevenue[]
  topRevenue: ProductReportRow[]
  /** Active products no booking in the period named. */
  notBooked: { productId: string; name: string; category: string }[]
  lowStock: LowStockRow[]
}

type ProductRow = {
  id: string
  name: string | null
  category_id: string | null
  is_active: boolean | null
  total_quantity: number | null
  reorder_level: number | null
}

export async function getProductReportsSummary(options?: ReportFilterOptions): Promise<ProductReportsSummary> {
  let bookingsQ = supabase.from('bookings').select('id').is('cancelled_at', null)
  if (options?.from) bookingsQ = bookingsQ.gte('pickup_at', options.from)
  if (options?.to) bookingsQ = bookingsQ.lte('pickup_at', options.to)
  if (options?.branchId) bookingsQ = bookingsQ.eq('branch_id', options.branchId)

  const [productsRes, categoriesRes, bookingsRes, lineMap] = await Promise.all([
    supabase.from('products').select('id, name, category_id, is_active, total_quantity, reorder_level'),
    supabase.from('inventory_categories').select('id, name'),
    bookingsQ,
    readLineValues(),
  ])
  const products = rowsOf<ProductRow>(productsRes, 'Products read failed')
  const categories = rowsOf<{ id: string; name: string | null }>(categoriesRes, 'Categories read failed')
  const bookings = rowsOf<{ id: string }>(bookingsRes, 'Bookings read failed')

  const categoryName = new Map(categories.map((c) => [c.id, c.name?.trim() || '—']))
  const catOf = (p: ProductRow | undefined) => (p?.category_id && categoryName.get(p.category_id)) || 'Uncategorised'
  const productById = new Map(products.map((p) => [p.id, p]))

  const perProduct = new Map<string, { bookings: Set<string>; qty: number; revenue: number }>()
  for (const b of bookings) {
    for (const l of lineMap.get(b.id) ?? []) {
      if (!l.product_id) continue
      const acc = perProduct.get(l.product_id) ?? { bookings: new Set<string>(), qty: 0, revenue: 0 }
      acc.bookings.add(b.id)
      acc.qty += Number(l.qty) || 0
      acc.revenue += lineValue(l)
      perProduct.set(l.product_id, acc)
    }
  }

  const rows: ProductReportRow[] = [...perProduct.entries()].map(([id, v]) => ({
    productId: id,
    name: productById.get(id)?.name?.trim() || '—',
    category: catOf(productById.get(id)),
    bookings: v.bookings.size,
    quantityBooked: v.qty,
    revenue: v.revenue as Paisa,
  }))

  const catMap = new Map<string, { revenue: number; bookings: Set<string> }>()
  for (const [id, v] of perProduct) {
    const cat = catOf(productById.get(id))
    const acc = catMap.get(cat) ?? { revenue: 0, bookings: new Set<string>() }
    acc.revenue += v.revenue
    v.bookings.forEach((b) => acc.bookings.add(b))
    catMap.set(cat, acc)
  }

  const active = products.filter((p) => p.is_active !== false)
  return {
    productCount: products.length,
    activeProducts: active.length,
    productsBooked: perProduct.size,
    revenue: rows.reduce((a, r) => a + r.revenue, 0) as Paisa,
    byCategory: [...catMap.entries()]
      .map(([category, v]) => ({ category, revenue: v.revenue as Paisa, bookings: v.bookings.size }))
      .sort((a, b) => b.revenue - a.revenue || b.bookings - a.bookings),
    topRevenue: [...rows].sort((a, b) => b.revenue - a.revenue || b.bookings - a.bookings).slice(0, 10),
    notBooked: active
      .filter((p) => !perProduct.has(p.id))
      .map((p) => ({ productId: p.id, name: p.name?.trim() || '—', category: catOf(p) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    lowStock: active
      .filter((p) => (p.reorder_level ?? 0) > 0 && (p.total_quantity ?? 0) <= (p.reorder_level ?? 0))
      .map((p) => ({ productId: p.id, name: p.name?.trim() || '—', onHand: p.total_quantity ?? 0, reorderLevel: p.reorder_level ?? 0 })),
  }
}
