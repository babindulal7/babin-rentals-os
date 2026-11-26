import { supabase } from '../supabase'

/** Read net physical pickups for the supplied booking lines, including corrections. */
export async function fetchHandoverPickupTotals(lineIds: readonly string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  const unique = [...new Set(lineIds)]
  // One row per line. Keep each request below PostgREST's usual row limit.
  for (let offset = 0; offset < unique.length; offset += 200) {
    const batch = unique.slice(offset, offset + 200)
    const { data, error } = await supabase
      .from('handover_pickup_totals')
      .select('booking_line_id, picked_qty')
      .in('booking_line_id', batch)
    if (error || !Array.isArray(data)) {
      throw new Error(`Could not read previous pickups: ${error?.message ?? 'the database returned no result'}`)
    }
    for (const row of data as Array<{ booking_line_id: unknown; picked_qty: unknown }>) {
      const id = row.booking_line_id
      const qty = typeof row.picked_qty === 'number' ? row.picked_qty
        : typeof row.picked_qty === 'string' && /^\d+$/.test(row.picked_qty) ? Number(row.picked_qty) : NaN
      if (typeof id !== 'string' || !batch.includes(id) || result.has(id) || !Number.isSafeInteger(qty) || qty < 0) {
        throw new Error('Could not verify the previous pickup quantities for this booking.')
      }
      result.set(id, qty)
    }
  }
  return result
}
