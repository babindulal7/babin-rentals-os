import { supabase } from '../supabase'

/**
 * Inventory report — REAL counts only (Law 16, RULING 2026-10-06).
 *
 * The only honest source here is `product_units_v.status`, which carries no
 * money. Everything else the old page showed (utilization %, inventory
 * accuracy %, health tiers, category value) had no source and was a seeded
 * snapshot; those are absent and the page says "not measured".
 *
 * A failed read is `null`, never zero: zero would claim an empty warehouse.
 */

/** The locked ten `inventory_state` values, in the order of Inventory.md §4.1. */
export const INVENTORY_STATES = [
  'In Stock',
  'Reserved',
  'Packed',
  'On Rent',
  'Returning',
  'Inspection',
  'Cleaning',
  'Maintenance',
  'Missing',
  'Retired',
] as const

export type InventoryState = (typeof INVENTORY_STATES)[number]

export interface StatusCount {
  status: InventoryState
  count: number
}

export interface InventoryReportSummary {
  /** Units by lifecycle state. */
  byStatus: StatusCount[]
  /** Every unit ever registered, Retired included. */
  totalUnits: number
  /** Units still in the fleet: everything except Retired. */
  activeUnits: number
  /** Units in state `In Stock`. */
  inStock: number
}

/** Pure: derive the summary from per-status counts. */
export function summariseStatusCounts(byStatus: StatusCount[]): InventoryReportSummary {
  const totalUnits = byStatus.reduce((n, s) => n + s.count, 0)
  const retired = byStatus.find((s) => s.status === 'Retired')?.count ?? 0
  const inStock = byStatus.find((s) => s.status === 'In Stock')?.count ?? 0
  return { byStatus, totalUnits, activeUnits: totalUnits - retired, inStock }
}

/** Share of `total` as a whole percent; null when there is nothing to divide. */
export function sharePercent(count: number, total: number): number | null {
  return total > 0 ? Math.round((count / total) * 100) : null
}

/**
 * Throws when any read fails, so the page draws Error + Retry.
 *
 * RULING 2026-10-15: this returned `null` on failure and the page printed
 * "Could not load unit counts" with no way to retry; it now throws the first
 * failure's reason for `useLoad`. A count of `null` is a failure too — a
 * figure the read did not return is not a zero (Law 16). Revert = restore the
 * try/catch returning `null`.
 */
export async function getInventoryReportSummary(): Promise<InventoryReportSummary> {
  const results = await Promise.all(
    INVENTORY_STATES.map((status) =>
      supabase.from('product_units_v').select('id', { count: 'exact', head: true }).eq('status', status),
    ),
  )
  results.forEach((r, i) => {
    if (r.error) throw new Error(`getInventoryReportSummary failed on ${INVENTORY_STATES[i]}: ${r.error.message}`)
    if (r.count === null) throw new Error(`getInventoryReportSummary: no count returned for ${INVENTORY_STATES[i]}`)
  })
  return summariseStatusCounts(
    INVENTORY_STATES.map((status, i): StatusCount => ({ status, count: results[i]?.count ?? 0 })),
  )
}
