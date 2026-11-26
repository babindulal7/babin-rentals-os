import { supabase } from '../supabase'

/** The open handover only qualifies when it still has a recorded pickup. */
export async function fetchResumableHandoverSession(bookingId: string): Promise<string | null> {
  const { data, error } = await supabase.from('handover_resumable_sessions')
    .select('session_id').eq('booking_id', bookingId).maybeSingle()
  if (error) throw new Error(`Could not check the open handover session: ${error.message}`)
  if (data === null) return null
  if (!data || typeof data.session_id !== 'string') throw new Error('Could not verify the open handover session.')
  return data.session_id
}

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
