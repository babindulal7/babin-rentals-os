import type { PgError, Row } from './engine'

/**
 * Mock-mode copy of the three client-TDS functions in migration 0240
 * (`client_tds_status`, `record_client_tds`, `reverse_client_tds`).
 *
 * Kept deliberately in step with that migration: same rate, same base, same
 * refusals in the same order, same replay behaviour. If one changes, both change.
 * The mock exists so the Record TDS screen can be driven without a database; the
 * SQL itself is proven by `check:lifecycle` step L82, not by this file.
 *
 * The mock store does not emulate `recompute_invoice_payment_state`, so a mock
 * payment never moves an invoice. TDS moves `paid_amount`, `outstanding_amount` and
 * `status` itself, which is what the real recompute does with the credit.
 */

/** RULING 2026-11-17: R-17.1b. Same fixed rate as the SQL. */
const RATE = 1.5
const STATUS_ROLES = new Set(['Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts'])
const RECORD_ROLES = new Set(['Owner', 'Coordinator', 'Accounts'])
const REVERSE_ROLES = new Set(['Owner', 'Admin', 'Manager'])

export interface TdsMockEnv {
  rows(table: string): Row[]
  insert(table: string, rows: Row[]): { rows: Row[]; error: PgError | null }
  update(table: string, patch: Row, pred: (row: Row) => boolean): Row[]
  actorId: string | null
  actorRole: string | null
}

type Reply = { data: unknown; error: PgError | null }

const fail = (code: string, message: string): Reply => ({
  data: null,
  error: { code, message, details: '', hint: '' },
})

/** To the paisa, half-up — the same arithmetic as `round(x * 1.5 / 100, 2)`. */
const tdsOf = (taxable: number): number => Math.round(taxable * RATE) / 100

function activeDeduction(env: TdsMockEnv, invoiceId: unknown): Row | undefined {
  const ledger = env.rows('tds_ledger')
  return ledger.find(
    (d) =>
      d['invoice_id'] === invoiceId &&
      d['direction'] === 'Client Deducted' &&
      d['entry_type'] === 'Deduction' &&
      !ledger.some((r) => r['reverses_id'] === d['id']),
  )
}

const kathmanduToday = (): string =>
  new Date(Date.now() + (5 * 60 + 45) * 60_000).toISOString().slice(0, 10)

function settle(env: TdsMockEnv, invoice: Row, delta: number): Row {
  const total = Number(invoice['total_amount'] ?? 0)
  const paid = Math.max(0, Number(invoice['paid_amount'] ?? 0) + delta)
  const outstanding = Math.max(0, total - paid)
  const draft = invoice['status'] === 'Draft'
  const status = draft
    ? 'Draft'
    : outstanding === 0 && total > 0
      ? 'Paid'
      : paid > 0
        ? 'Partially Paid'
        : invoice['status'] === 'Paid' || invoice['status'] === 'Partially Paid'
          ? 'Sent'
          : invoice['status']
  env.update('invoices', { paid_amount: paid, outstanding_amount: outstanding, status }, (r) => r['id'] === invoice['id'])
  return { paid_amount: paid, outstanding_amount: outstanding, status }
}

export function clientTdsStatusMock(env: TdsMockEnv, invoiceId: unknown): Reply {
  if (!env.actorRole || !STATUS_ROLES.has(env.actorRole)) {
    return fail('42501', 'TDS is not available to this role.')
  }
  const invoice = env.rows('invoices').find((r) => r['id'] === invoiceId)
  if (!invoice) return fail('P0002', 'Invoice was not found.')

  const taxable = Number(invoice['taxable_amount'] ?? 0)
  const amount = tdsOf(taxable)
  const outstanding = Number(invoice['outstanding_amount'] ?? 0)
  const active = activeDeduction(env, invoice['id'])

  let reason: string | null = null
  if (invoice['voided_at'] || invoice['status'] === 'Void') reason = 'This invoice is voided, so it cannot take TDS.'
  else if (taxable <= 0 || amount <= 0) reason = 'This invoice has no taxable amount to deduct TDS from.'
  else if (active) reason = 'TDS is already recorded for this invoice.'
  else if (amount > outstanding) reason = 'The TDS is more than what is still outstanding on this invoice.'

  return {
    data: {
      invoice_id: invoice['id'],
      rate_percent: RATE,
      base_amount: taxable,
      amount,
      outstanding_amount: outstanding,
      can_record: reason === null,
      blocked_reason: reason,
      active: active
        ? {
            ledger_id: active['id'],
            amount: active['amount'],
            certificate_number: active['certificate_number'] ?? null,
            deducted_on: active['deducted_on'],
          }
        : null,
    },
    error: null,
  }
}

export function recordClientTdsMock(env: TdsMockEnv, payload: Record<string, unknown>): Reply {
  if (!env.actorId || !env.actorRole || !RECORD_ROLES.has(env.actorRole)) {
    return fail('42501', 'Only Owner, Coordinator or Accounts can record client TDS.')
  }
  const key = typeof payload['client_uuid'] === 'string' ? payload['client_uuid'] : ''
  const invoiceId = typeof payload['invoice_id'] === 'string' ? payload['invoice_id'] : ''
  if (!key || !invoiceId) return fail('22023', 'An invoice and a request key are required.')
  const cert = typeof payload['certificate_number'] === 'string' ? payload['certificate_number'].trim() : ''
  if (cert.length > 60) return fail('22023', 'A certificate number can be at most 60 characters.')

  const invoice = env.rows('invoices').find((r) => r['id'] === invoiceId)

  const replay = env.rows('tds_ledger').find((r) => r['client_uuid'] === key)
  if (replay) {
    if (replay['created_by'] === env.actorId && replay['invoice_id'] === invoiceId && replay['entry_type'] === 'Deduction') {
      return {
        data: {
          ledger_id: replay['id'], invoice_id: invoiceId, amount: replay['amount'],
          rate_percent: replay['rate_percent'], base_amount: replay['base_amount'],
          paid_amount: invoice?.['paid_amount'] ?? 0, outstanding_amount: invoice?.['outstanding_amount'] ?? 0,
          status: invoice?.['status'] ?? null, replayed: true,
        },
        error: null,
      }
    }
    return fail('23505', 'Request key already belongs to another action.')
  }

  if (!invoice) return fail('P0002', 'Invoice was not found.')
  if (invoice['voided_at'] || invoice['status'] === 'Void') {
    return fail('23514', 'GATE:tds.invoice_void: A voided invoice cannot take TDS.')
  }
  const taxable = Number(invoice['taxable_amount'] ?? 0)
  if (taxable <= 0) {
    return fail('23514', 'GATE:tds.no_base: This invoice has no taxable amount to deduct TDS from.')
  }
  if (activeDeduction(env, invoiceId)) {
    return fail('23514', 'GATE:tds.already_recorded: TDS is already recorded for this invoice. Reverse it first to record it again.')
  }
  const amount = tdsOf(taxable)
  if (amount <= 0) return fail('23514', 'GATE:tds.no_base: The TDS on this invoice rounds to zero.')
  const outstanding = Number(invoice['outstanding_amount'] ?? 0)
  if (amount > outstanding) {
    return fail('23514', `GATE:tds.exceeds_outstanding: TDS of ${amount} is more than the ${outstanding} still outstanding on this invoice.`)
  }

  const client = env.rows('clients').find((c) => c['id'] === invoice['client_id'])
  const inserted = env.insert('tds_ledger', [
    {
      client_uuid: key,
      entry_type: 'Deduction',
      direction: 'Client Deducted',
      amount,
      rate_percent: RATE,
      base_amount: taxable,
      invoice_id: invoiceId,
      payment_id: typeof payload['payment_id'] === 'string' ? payload['payment_id'] : null,
      party_name: client ? String(client['name'] ?? '') : null,
      certificate_number: cert || null,
      deducted_on: typeof payload['deducted_on'] === 'string' && payload['deducted_on'] ? payload['deducted_on'] : kathmanduToday(),
      created_by: env.actorId,
    },
  ])
  if (inserted.error) return { data: null, error: inserted.error }

  const after = settle(env, invoice, amount)
  return {
    data: {
      ledger_id: inserted.rows[0]?.['id'], invoice_id: invoiceId, amount, rate_percent: RATE, base_amount: taxable,
      ...after, replayed: false,
    },
    error: null,
  }
}

export function reverseClientTdsMock(env: TdsMockEnv, payload: Record<string, unknown>): Reply {
  if (!env.actorId || !env.actorRole || !REVERSE_ROLES.has(env.actorRole)) {
    return fail('42501', 'Only Owner, Admin or Manager can reverse client TDS.')
  }
  const key = typeof payload['client_uuid'] === 'string' ? payload['client_uuid'] : ''
  const ledgerId = typeof payload['ledger_id'] === 'string' ? payload['ledger_id'] : ''
  const reason = typeof payload['reason'] === 'string' ? payload['reason'].trim() : ''
  if (!key || !ledgerId) return fail('22023', 'A ledger entry and a request key are required.')
  if (reason.length < 10) return fail('23514', 'A reason of at least 10 characters is required.')

  const ledger = env.rows('tds_ledger')
  const replay = ledger.find((r) => r['client_uuid'] === key)
  if (replay) {
    if (replay['reverses_id'] === ledgerId && replay['created_by'] === env.actorId) {
      const inv = env.rows('invoices').find((r) => r['id'] === replay['invoice_id'])
      return {
        data: {
          ledger_id: replay['id'], reverses_id: ledgerId, invoice_id: replay['invoice_id'], amount: replay['amount'],
          paid_amount: inv?.['paid_amount'] ?? 0, outstanding_amount: inv?.['outstanding_amount'] ?? 0,
          status: inv?.['status'] ?? null, replayed: true,
        },
        error: null,
      }
    }
    return fail('23505', 'Request key already belongs to another action.')
  }

  const original = ledger.find((r) => r['id'] === ledgerId)
  if (!original || original['entry_type'] !== 'Deduction' || original['direction'] !== 'Client Deducted') {
    return fail('23514', 'GATE:tds.not_reversible: That entry is not a client TDS deduction.')
  }
  if (ledger.some((r) => r['reverses_id'] === ledgerId)) {
    return fail('23514', 'GATE:tds.already_reversed: That deduction has already been reversed.')
  }
  const invoice = env.rows('invoices').find((r) => r['id'] === original['invoice_id'])
  if (!invoice) return fail('P0002', 'Invoice was not found.')
  if (invoice['voided_at']) return fail('23514', 'GATE:tds.invoice_void: A voided invoice cannot be changed.')

  const inserted = env.insert('tds_ledger', [
    {
      client_uuid: key,
      entry_type: 'Reversal',
      direction: 'Client Deducted',
      amount: original['amount'],
      rate_percent: original['rate_percent'],
      base_amount: original['base_amount'],
      invoice_id: original['invoice_id'],
      payment_id: original['payment_id'] ?? null,
      party_name: original['party_name'] ?? null,
      certificate_number: original['certificate_number'] ?? null,
      deducted_on: kathmanduToday(),
      reverses_id: ledgerId,
      reason,
      created_by: env.actorId,
    },
  ])
  if (inserted.error) return { data: null, error: inserted.error }

  const after = settle(env, invoice, -Number(original['amount']))
  return {
    data: {
      ledger_id: inserted.rows[0]?.['id'], reverses_id: ledgerId, invoice_id: original['invoice_id'],
      amount: original['amount'], ...after, replayed: false,
    },
    error: null,
  }
}
