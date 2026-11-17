import { createAction, type ActionConfig } from '../core'
import { supabase } from '../../lib/supabase'
import { rupees, type Paisa } from '../../lib/money'

/**
 * # RECORD_CLIENT_TDS / REVERSE_CLIENT_TDS — tax a client deducted from a rental invoice
 *
 * RULING 2026-11-17: R-17.1, R-17.3 (RULINGS-2026-11-17.md). A client may deduct 1.5% TDS,
 * before VAT, from what they pay on a rental invoice. The invoice SETTLES AT GROSS: the
 * cash received is the net amount, and the TDS is a credit in the separate TDS ledger
 * (`tds_ledger`, migration 0240). Law 5: payments are immutable, so the deduction is its own
 * row and a correction is a Reversal row.
 *
 * The rate and base are fixed in the database. This action sends only the invoice, a request
 * key and an optional certificate number, so a typed percentage cannot reach the invoice.
 *
 * Who may: recording follows `payment.create` (Owner · Coordinator · Accounts); reversing
 * follows `payment.reverse` (Owner · Admin · Manager). Both refuse offline: money writes never queue.
 *
 * Deliberately emits no `PAYMENT_RECORDED` event. A TDS credit is not cash, and receipts and
 * notifications listen for that event.
 */

export const TDS_REASON_MIN = 10
export const CERTIFICATE_MAX = 60

export interface RecordClientTdsInput {
  /** `invoices.id`. */
  invoiceId: string
  /** One per attempt (Law 8). The caller keeps it across retries of the same request. */
  clientUuid: string
  /** The client's TDS certificate reference, for claiming the credit. Optional. */
  certificateNumber?: string | undefined
  /** AD date the TDS was deducted. Defaults to today's Kathmandu day on the server. */
  deductedOn?: string | undefined
  /** The cash payment this deduction came with, when known. */
  paymentId?: string | undefined
}

export interface RecordClientTdsResult {
  ledgerId: string
  invoiceId: string
  amountPaisa: Paisa
  ratePercent: number
  basePaisa: Paisa
  paidPaisa: Paisa
  outstandingPaisa: Paisa
  status: string
  /** True when this request key had already been recorded and nothing new was written. */
  replayed: boolean
}

export interface ReverseClientTdsInput {
  /** The Deduction row in `tds_ledger` to reverse. */
  ledgerId: string
  clientUuid: string
  /** Why the deduction is wrong. At least 10 characters. */
  reason: string
}

export interface ReverseClientTdsResult extends Omit<RecordClientTdsResult, 'ratePercent' | 'basePaisa'> {
  reversesId: string
}

interface TdsRpcRow {
  ledger_id: string
  invoice_id: string
  amount: number | string
  rate_percent?: number | string
  base_amount?: number | string
  reverses_id?: string
  paid_amount: number | string
  outstanding_amount: number | string
  status: string
  replayed: boolean
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const toPaisa = (value: number | string | undefined): Paisa => rupees(Number(value ?? 0))

/** The database refuses with `GATE:tds.*: message`. Show the sentence, not the code. */
function readable(message: string): string {
  const gate = /^GATE:tds\.[a-z_]+:\s*(.*)$/s.exec(message)
  return gate?.[1]?.trim() || message
}

function notInstalled(error: { code?: string } | null): boolean {
  // Written locally, applied only when the owner approves (N-5). Until then the function does not exist.
  return error?.code === 'PGRST202'
}

export const recordClientTdsConfig: ActionConfig<RecordClientTdsInput, RecordClientTdsResult> = {
  name: 'RECORD_CLIENT_TDS',
  permissions: ['payment.create'],
  implemented: true,

  validate(input) {
    if (!input.invoiceId || !UUID_RE.test(input.invoiceId)) {
      throw new Error('Choose the invoice the TDS was deducted from.')
    }
    if (!input.clientUuid || !UUID_RE.test(input.clientUuid)) {
      throw new Error('This request carries no idempotency key, so a retry could record it twice. Nothing was sent.')
    }
    if ((input.certificateNumber ?? '').trim().length > CERTIFICATE_MAX) {
      throw new Error(`A certificate number can be at most ${CERTIFICATE_MAX} characters.`)
    }
    if (input.deductedOn !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(input.deductedOn)) {
      throw new Error('The deduction date must be a calendar date.')
    }
    if (input.paymentId !== undefined && !UUID_RE.test(input.paymentId)) {
      throw new Error('The payment must be chosen from the list, not typed.')
    }
  },

  async execute(input, ctx) {
    if (ctx.isOnline === false) {
      throw new Error('Recording TDS needs a connection. Nothing was saved.')
    }
    const certificate = (input.certificateNumber ?? '').trim()
    const { data, error } = await supabase.rpc('record_client_tds', {
      p_payload: {
        invoice_id: input.invoiceId,
        client_uuid: input.clientUuid,
        ...(certificate ? { certificate_number: certificate } : {}),
        ...(input.deductedOn ? { deducted_on: input.deductedOn } : {}),
        ...(input.paymentId ? { payment_id: input.paymentId } : {}),
      },
    })
    if (notInstalled(error)) {
      throw new Error('TDS recording is not available on this server yet. Ask the owner to finish the database update. Nothing was changed.')
    }
    if (error) throw new Error(readable(error.message))

    const row = data as unknown as TdsRpcRow | null
    if (!row || row.invoice_id !== input.invoiceId) {
      throw new Error('The server did not confirm this TDS entry. Retry with the same request.')
    }
    return {
      result: {
        ledgerId: row.ledger_id,
        invoiceId: row.invoice_id,
        amountPaisa: toPaisa(row.amount),
        ratePercent: Number(row.rate_percent ?? 0),
        basePaisa: toPaisa(row.base_amount),
        paidPaisa: toPaisa(row.paid_amount),
        outstandingPaisa: toPaisa(row.outstanding_amount),
        status: row.status,
        replayed: row.replayed,
      },
      events: [],
    }
  },
}

export const reverseClientTdsConfig: ActionConfig<ReverseClientTdsInput, ReverseClientTdsResult> = {
  name: 'REVERSE_CLIENT_TDS',
  permissions: ['payment.reverse'],
  implemented: true,

  validate(input) {
    if (!input.ledgerId || !UUID_RE.test(input.ledgerId)) {
      throw new Error('Choose the TDS entry to reverse.')
    }
    if (!input.clientUuid || !UUID_RE.test(input.clientUuid)) {
      throw new Error('This request carries no idempotency key, so a retry could reverse it twice. Nothing was sent.')
    }
    if ((input.reason ?? '').trim().length < TDS_REASON_MIN) {
      throw new Error(`Give a reason of at least ${TDS_REASON_MIN} characters.`)
    }
  },

  async execute(input, ctx) {
    if (ctx.isOnline === false) {
      throw new Error('Reversing TDS needs a connection. Nothing was saved.')
    }
    const { data, error } = await supabase.rpc('reverse_client_tds', {
      p_payload: {
        ledger_id: input.ledgerId,
        client_uuid: input.clientUuid,
        reason: input.reason.trim(),
      },
    })
    if (notInstalled(error)) {
      throw new Error('TDS reversal is not available on this server yet. Ask the owner to finish the database update. Nothing was changed.')
    }
    if (error) throw new Error(readable(error.message))

    const row = data as unknown as TdsRpcRow | null
    if (!row || row.reverses_id !== input.ledgerId) {
      throw new Error('The server did not confirm this reversal. Retry with the same request.')
    }
    return {
      result: {
        ledgerId: row.ledger_id,
        reversesId: row.reverses_id,
        invoiceId: row.invoice_id,
        amountPaisa: toPaisa(row.amount),
        paidPaisa: toPaisa(row.paid_amount),
        outstandingPaisa: toPaisa(row.outstanding_amount),
        status: row.status,
        replayed: row.replayed,
      },
      events: [],
    }
  },
}

export const recordClientTds = createAction(recordClientTdsConfig)
export const reverseClientTds = createAction(reverseClientTdsConfig)
