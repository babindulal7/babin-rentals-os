import { supabase } from '../supabase'
import type { SystemRole } from '../../types/database'

/*
 * RULING 2026-11-19 (S2 row 6): waiting beyond the included 10 minutes is not priced at booking. Staff add
 * it after the trip as its own flat line on the booking, typing the amount. Migration 0251. The database
 * is the gate; the role list here only decides whether to show the button, and equals the RPC's.
 *
 * No rate, per-minute figure or block size lives here: the amount is whatever the person types.
 */

const WAITING_CHARGE_ROLES: readonly SystemRole[] = ['Owner', 'Admin', 'Manager', 'Coordinator']

/** Show the "Add waiting charge" button. A convenience only: add_waiting_charge_line enforces it. */
export function canAddWaitingCharge(role: SystemRole | null | undefined): boolean {
  return role != null && WAITING_CHARGE_ROLES.includes(role)
}

export type WaitingChargeCheck =
  | { ok: true; minutes: number; amountPaisa: number }
  | { ok: false; error: string }

const MAX_MINUTES = 1440

/** Checks the two typed values in plain words. The amount is in rupees, up to two decimals. */
export function checkWaitingCharge(minutesRaw: string, amountRaw: string): WaitingChargeCheck {
  const m = minutesRaw.trim()
  if (!/^\d+$/.test(m) || Number(m) < 1 || Number(m) > MAX_MINUTES) {
    return { ok: false, error: `Enter the minutes waited, a whole number from 1 to ${MAX_MINUTES}.` }
  }
  const a = amountRaw.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(a) || Number(a) <= 0) {
    return { ok: false, error: 'Enter the waiting charge in Rs, more than 0.' }
  }
  return { ok: true, minutes: Number(m), amountPaisa: Math.round(Number(a) * 100) }
}

export type WaitingChargeResult = {
  lineId: string
  /** The Draft invoice the line was appended to, or null when the booking has no invoice yet. */
  invoiceId: string | null
  appendedToDraft: boolean
}

type WaitingChargeRow = { line_id: string; invoice_id: string | null; appended_to_draft: boolean }

export async function addWaitingChargeLine(
  bookingId: string,
  clientUuid: string,
  charge: { minutes: number; amountPaisa: number; note: string },
): Promise<WaitingChargeResult> {
  const { data, error } = await supabase.rpc('add_waiting_charge_line', {
    p_client_uuid: clientUuid,
    p_booking_id: bookingId,
    p_minutes: charge.minutes,
    p_amount_paisa: charge.amountPaisa,
    p_note: charge.note.trim() === '' ? null : charge.note.trim(),
  })
  if (error) throw new Error(error.message)
  const rows = (Array.isArray(data) ? data : data ? [data] : []) as unknown as WaitingChargeRow[]
  const row = rows[0]
  if (!row?.line_id) throw new Error('The waiting charge was not confirmed by the database. Nothing was shown as added.')
  return { lineId: row.line_id, invoiceId: row.invoice_id ?? null, appendedToDraft: row.appended_to_draft === true }
}
