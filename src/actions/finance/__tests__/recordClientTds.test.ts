/**
 * RULING 2026-11-17 (R-17.1, R-17.3): a client may deduct 1.5% TDS, before VAT, from a rental
 * invoice. The invoice settles at gross and the credit lives in the separate TDS ledger.
 *
 * These pin what the actions promise around the two RPCs: who may call them, what they send
 * (never a rate or an amount), that a server without the function says so honestly, that a
 * database refusal reads as a sentence, and that no payment event fires for a credit that is
 * not cash. The SQL itself is proven by `check:lifecycle` step L82.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ActionPermissionError } from '../../core'
import { DomainEvents, EVENT_TYPES } from '../../../events/eventBus'

const db = vi.hoisted(() => ({
  calls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  response: { data: null as unknown, error: null as { code?: string; message: string } | null },
}))

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      db.calls.push({ name, args })
      return db.response
    }),
  },
}))

const { recordClientTds, reverseClientTds } = await import('../recordClientTds')

const INVOICE = '11111111-1111-4111-8111-111111111111'
const KEY = '22222222-2222-4222-8222-222222222222'
const LEDGER = '33333333-3333-4333-8333-333333333333'
const ctx = (role: 'Owner' | 'Admin' | 'Manager' | 'Coordinator' | 'Accounts' | 'Warehouse' | 'Technician' | 'Driver' | 'Client', isOnline = true) => ({
  userId: 'u-1',
  role,
  isOnline,
})

const recorded = (over: Record<string, unknown> = {}) => ({
  ledger_id: LEDGER,
  invoice_id: INVOICE,
  amount: 150,
  rate_percent: 1.5,
  base_amount: 10000,
  paid_amount: 11300,
  outstanding_amount: 0,
  status: 'Paid',
  replayed: false,
  ...over,
})

const reversed = (over: Record<string, unknown> = {}) => ({
  ledger_id: '44444444-4444-4444-8444-444444444444',
  reverses_id: LEDGER,
  invoice_id: INVOICE,
  amount: 150,
  paid_amount: 11150,
  outstanding_amount: 150,
  status: 'Partially Paid',
  replayed: false,
  ...over,
})

let paymentEvents: unknown[] = []
let unsubscribe: (() => void) | null = null

beforeEach(() => {
  db.calls = []
  db.response = { data: recorded(), error: null }
  paymentEvents = []
  unsubscribe = DomainEvents.subscribe(EVENT_TYPES.PAYMENT_RECORDED, (payload: unknown) => {
    paymentEvents.push(payload)
  })
})

afterEach(() => {
  unsubscribe?.()
})

describe('recordClientTds — who may', () => {
  it.each(['Owner', 'Coordinator', 'Accounts'] as const)('lets %s through to the RPC', async (role) => {
    await recordClientTds({ invoiceId: INVOICE, clientUuid: KEY }, ctx(role))
    expect(db.calls).toHaveLength(1)
  })

  it.each(['Admin', 'Manager', 'Warehouse', 'Technician', 'Driver', 'Client'] as const)('refuses %s before anything is sent', async (role) => {
    await expect(recordClientTds({ invoiceId: INVOICE, clientUuid: KEY }, ctx(role))).rejects.toBeInstanceOf(ActionPermissionError)
    expect(db.calls).toHaveLength(0)
  })

  it('refuses offline: a money write never queues', async () => {
    await expect(recordClientTds({ invoiceId: INVOICE, clientUuid: KEY }, ctx('Accounts', false))).rejects.toThrow()
    expect(db.calls).toHaveLength(0)
  })
})

describe('recordClientTds — what it sends', () => {
  it('sends the invoice and the key only: no rate, no amount', async () => {
    await recordClientTds({ invoiceId: INVOICE, clientUuid: KEY }, ctx('Accounts'))
    expect(db.calls[0]!.name).toBe('record_client_tds')
    expect(db.calls[0]!.args).toEqual({ p_payload: { invoice_id: INVOICE, client_uuid: KEY } })
    expect(JSON.stringify(db.calls[0]!.args)).not.toMatch(/rate|amount|percent/i)
  })

  it('adds a trimmed certificate number, the date and the payment when given', async () => {
    const payment = '55555555-5555-4555-8555-555555555555'
    await recordClientTds(
      { invoiceId: INVOICE, clientUuid: KEY, certificateNumber: '  TDS-0001  ', deductedOn: '2026-11-17', paymentId: payment },
      ctx('Accounts'),
    )
    expect(db.calls[0]!.args['p_payload']).toEqual({
      invoice_id: INVOICE,
      client_uuid: KEY,
      certificate_number: 'TDS-0001',
      deducted_on: '2026-11-17',
      payment_id: payment,
    })
  })

  it('leaves a blank certificate number out', async () => {
    await recordClientTds({ invoiceId: INVOICE, clientUuid: KEY, certificateNumber: '   ' }, ctx('Accounts'))
    expect(db.calls[0]!.args['p_payload']).not.toHaveProperty('certificate_number')
  })

  it.each([
    ['a missing invoice', { invoiceId: '' }, /Choose the invoice/],
    ['a missing request key', { clientUuid: '' }, /idempotency key/],
    ['a certificate over 60 characters', { certificateNumber: 'x'.repeat(61) }, /at most 60/],
    ['a deduction date that is not a date', { deductedOn: 'yesterday' }, /calendar date/],
    ['a payment typed as a label', { paymentId: 'cash' }, /chosen from the list/],
  ])('refuses %s before anything is sent', async (_what, over, message) => {
    await expect(recordClientTds({ invoiceId: INVOICE, clientUuid: KEY, ...over }, ctx('Accounts'))).rejects.toThrow(message)
    expect(db.calls).toHaveLength(0)
  })
})

describe('recordClientTds — what it believes', () => {
  it('returns the confirmed figures in paisa', async () => {
    const out = await recordClientTds({ invoiceId: INVOICE, clientUuid: KEY }, ctx('Accounts'))
    expect(out.amountPaisa).toBe(15000)
    expect(out.ratePercent).toBe(1.5)
    expect(out.basePaisa).toBe(1000000)
    expect(out.paidPaisa).toBe(1130000)
    expect(out.outstandingPaisa).toBe(0)
    expect(out.status).toBe('Paid')
    expect(out.replayed).toBe(false)
  })

  it('does not believe an answer about a different invoice', async () => {
    db.response = { data: recorded({ invoice_id: '99999999-9999-4999-8999-999999999999' }), error: null }
    await expect(recordClientTds({ invoiceId: INVOICE, clientUuid: KEY }, ctx('Accounts'))).rejects.toThrow(/did not confirm/)
  })

  it('does not fire a payment event: a TDS credit is not cash', async () => {
    await recordClientTds({ invoiceId: INVOICE, clientUuid: KEY }, ctx('Accounts'))
    expect(paymentEvents).toHaveLength(0)
  })

  it('says so when the server does not have the function yet', async () => {
    db.response = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }
    await expect(recordClientTds({ invoiceId: INVOICE, clientUuid: KEY }, ctx('Accounts'))).rejects.toThrow(/not available on this server yet/)
  })

  it('shows a database refusal as a sentence, not a code', async () => {
    db.response = {
      data: null,
      error: { message: 'GATE:tds.already_recorded: TDS is already recorded for this invoice. Reverse it first to record it again.' },
    }
    await expect(recordClientTds({ invoiceId: INVOICE, clientUuid: KEY }, ctx('Accounts'))).rejects.toThrow(
      'TDS is already recorded for this invoice. Reverse it first to record it again.',
    )
  })
})

describe('reverseClientTds', () => {
  beforeEach(() => {
    db.response = { data: reversed(), error: null }
  })

  it.each(['Owner', 'Admin', 'Manager'] as const)('lets %s through to the RPC', async (role) => {
    await reverseClientTds({ ledgerId: LEDGER, clientUuid: KEY, reason: 'Entered on the wrong invoice' }, ctx(role))
    expect(db.calls).toHaveLength(1)
    expect(db.calls[0]!.name).toBe('reverse_client_tds')
  })

  it.each(['Coordinator', 'Accounts', 'Warehouse', 'Technician', 'Driver', 'Client'] as const)('refuses %s before anything is sent', async (role) => {
    await expect(
      reverseClientTds({ ledgerId: LEDGER, clientUuid: KEY, reason: 'Entered on the wrong invoice' }, ctx(role)),
    ).rejects.toBeInstanceOf(ActionPermissionError)
    expect(db.calls).toHaveLength(0)
  })

  it('needs a reason of at least 10 characters, and sends it trimmed', async () => {
    await expect(reverseClientTds({ ledgerId: LEDGER, clientUuid: KEY, reason: 'oops' }, ctx('Manager'))).rejects.toThrow(/at least 10/)
    expect(db.calls).toHaveLength(0)
    await reverseClientTds({ ledgerId: LEDGER, clientUuid: KEY, reason: '  Entered on the wrong invoice  ' }, ctx('Manager'))
    expect(db.calls[0]!.args).toEqual({
      p_payload: { ledger_id: LEDGER, client_uuid: KEY, reason: 'Entered on the wrong invoice' },
    })
  })

  it('returns the re-opened amount in paisa and fires no payment event', async () => {
    const out = await reverseClientTds({ ledgerId: LEDGER, clientUuid: KEY, reason: 'Entered on the wrong invoice' }, ctx('Manager'))
    expect(out.reversesId).toBe(LEDGER)
    expect(out.outstandingPaisa).toBe(15000)
    expect(out.status).toBe('Partially Paid')
    expect(paymentEvents).toHaveLength(0)
  })

  it('does not believe a reversal of a different entry', async () => {
    db.response = { data: reversed({ reverses_id: '99999999-9999-4999-8999-999999999999' }), error: null }
    await expect(
      reverseClientTds({ ledgerId: LEDGER, clientUuid: KEY, reason: 'Entered on the wrong invoice' }, ctx('Manager')),
    ).rejects.toThrow(/did not confirm/)
  })
})
