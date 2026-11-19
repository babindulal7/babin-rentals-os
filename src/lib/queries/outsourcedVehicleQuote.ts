import { supabase } from '../supabase'

/*
 * RULING 2026-11-19 (S2 row 8): an outsourced vehicle is handled by a manual quote with an approval
 * note. The quote is recorded against the booking after it exists (migration 0250). The approver is
 * the signed-in person; the database sets it, the caller cannot. The call is idempotent on
 * (booking, clientUuid), so a retried submit repeats safely.
 */

export type OutsourcedVehicleQuote = {
  vendor: string
  /** The typed quote in paisa. Must be more than 0. */
  quotePaisa: number
  /** The approver's own words. Required. */
  approvalNote: string
}

export type OutsourcedVehicleQuoteInput =
  | { ok: true; quote: OutsourcedVehicleQuote }
  | { ok: false; error: string }

/** Checks the form values before a booking is created, in plain words. */
export function checkOutsourcedVehicleQuote(vendor: string, quotePaisa: number, approvalNote: string): OutsourcedVehicleQuoteInput {
  const v = vendor.trim()
  const note = approvalNote.trim()
  if (v.length === 0) return { ok: false, error: 'Enter the vendor for the outsourced vehicle.' }
  if (v.length > 120) return { ok: false, error: 'The vendor name is too long (120 characters at most).' }
  if (!Number.isInteger(quotePaisa) || quotePaisa <= 0) {
    return { ok: false, error: 'Type the quoted delivery charge for the outsourced vehicle (more than Rs 0).' }
  }
  if (note.length === 0) return { ok: false, error: 'Add the approval note for the outsourced vehicle quote.' }
  if (note.length > 500) return { ok: false, error: 'The approval note is too long (500 characters at most).' }
  return { ok: true, quote: { vendor: v, quotePaisa, approvalNote: note } }
}

export async function recordOutsourcedVehicleQuote(
  bookingId: string,
  clientUuid: string,
  quote: OutsourcedVehicleQuote,
): Promise<void> {
  const { error } = await supabase.rpc('record_outsourced_vehicle_quote', {
    p_client_uuid: clientUuid,
    p_booking_id: bookingId,
    p_vendor: quote.vendor,
    p_quote_paisa: quote.quotePaisa,
    p_approval_note: quote.approvalNote,
  })
  if (error) throw new Error(`The outsourced vehicle quote was not saved: ${error.message}`)
}
