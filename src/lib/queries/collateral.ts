import { supabase } from '../supabase'

/**
 * True when an ID document is held as deposit collateral on this booking and has not been
 * handed back (D1, T2-03). Reads the masked view, so no document number reaches the page.
 * Any failure reads as "not held": the handover deposit mark then stays unticked, which is the
 * stricter answer, and the database gate still decides at commit.
 */
export async function hasHeldCollateral(bookingId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('collateral_documents_v')
      .select('id')
      .eq('booking_id', bookingId)
      .is('returned_at', null)
      .limit(1)
    return !error && Array.isArray(data) && data.length > 0
  } catch {
    return false
  }
}
