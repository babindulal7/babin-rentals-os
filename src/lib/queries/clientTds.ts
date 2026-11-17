import { supabase } from '../supabase'
import { rupees, type Paisa } from '../money'

/**
 * # Client TDS status — what the Record TDS screen shows before anything is written
 *
 * RULING 2026-11-17: R-17.1. The page never computes TDS. `client_tds_status`
 * (migration 0240) applies the same fixed rule `record_client_tds` applies — 1.5% of
 * the invoice's taxable amount, before VAT — and this module hands that answer to the
 * screen unchanged, so the figure on screen is the figure that will be written.
 *
 * It also reports the active deduction, because a Coordinator may record TDS but has
 * no read access to the `tds_ledger` table; the function is how they see what is on
 * the invoice. Money-blind roles are refused by the function itself (Law 6), and that
 * refusal is surfaced as an error, never as "no TDS".
 */

export interface ActiveClientTds {
  /** `tds_ledger.id` of the Deduction row — what a reversal names. */
  ledgerId: string
  amountPaisa: Paisa
  certificateNumber: string | null
  /** AD date (`YYYY-MM-DD`). The Nepali month is rendered from this, never stored. */
  deductedOn: string
}

export interface ClientTdsStatus {
  invoiceId: string
  ratePercent: number
  /** The invoice's taxable amount: the base the rate is applied to. */
  basePaisa: Paisa
  /** The system-computed TDS. Shown, never recomputed by the page. */
  amountPaisa: Paisa
  outstandingPaisa: Paisa
  canRecord: boolean
  /** Why it cannot be recorded, when `canRecord` is false. */
  blockedReason: string | null
  active: ActiveClientTds | null
}

interface RawActive {
  ledger_id: string
  amount: number | string
  certificate_number: string | null
  deducted_on: string
}

interface RawStatus {
  invoice_id: string
  rate_percent: number | string
  base_amount: number | string | null
  amount: number | string
  outstanding_amount: number | string
  can_record: boolean
  blocked_reason: string | null
  active: RawActive | null
}

const toPaisa = (value: number | string | null | undefined): Paisa => rupees(Number(value ?? 0))

export async function getClientTdsStatus(invoiceId: string): Promise<ClientTdsStatus> {
  const { data, error } = await supabase.rpc('client_tds_status', { p_invoice_id: invoiceId })
  if (error) {
    if (error.code === 'PGRST202') {
      throw new Error('TDS is not available on this server yet. Ask the owner to finish the database update.')
    }
    throw new Error(`The TDS figure could not be read: ${error.message}`)
  }
  const row = data as unknown as RawStatus | null
  if (!row || row.invoice_id !== invoiceId) {
    throw new Error('The server did not answer for this invoice. Try again.')
  }
  return {
    invoiceId: row.invoice_id,
    ratePercent: Number(row.rate_percent),
    basePaisa: toPaisa(row.base_amount),
    amountPaisa: toPaisa(row.amount),
    outstandingPaisa: toPaisa(row.outstanding_amount),
    canRecord: row.can_record,
    blockedReason: row.blocked_reason,
    active: row.active
      ? {
          ledgerId: row.active.ledger_id,
          amountPaisa: toPaisa(row.active.amount),
          certificateNumber: row.active.certificate_number,
          deductedOn: row.active.deducted_on,
        }
      : null,
  }
}
