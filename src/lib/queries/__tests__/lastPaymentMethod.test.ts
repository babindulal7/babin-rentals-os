/**
 * T3-15 · "how did this client pay last?" — the read behind Record Payment's
 * method default.
 *
 * Two things are pinned here.
 *
 * 1. **The parser.** `payments` has no method column (0006:176-196); the label
 *    lives in `payments.notes` as a first line `Method: <label>`, written by
 *    `composeNotes()` in `actions/finance/recordPayment.ts`. Reading it back is a
 *    text parse, so it is a pure function with its own cases — including the one
 *    that matters most: an operator's own note mentioning "Method:" must not be
 *    mistaken for the label.
 *
 * 2. **The query.** Which rows, in which order, and what a failure does. A wrong
 *    default is a receipt that says Cash for a bank transfer; the query must be
 *    narrow (one client, received money, newest first) and must not invent an
 *    answer out of a row it cannot read.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSupabase, type FakeCall, type TableAnswer } from './fakeSupabase'

const state = vi.hoisted(() => ({
  client: null as unknown as { from: (t: string) => unknown },
}))
vi.mock('../../supabase', () => ({
  IS_MOCK: false,
  supabase: { from: (t: string) => state.client.from(t) },
}))

let calls: FakeCall[] = []
function useTables(tables: Record<string, TableAnswer>) {
  const fake = fakeSupabase(tables)
  state.client = fake.client
  calls = fake.calls
}
const callsOn = (table: string) => calls.filter((c) => c.table === table)

const { PAYMENT_METHOD_LABELS, lastPaymentMethodForClient, paymentMethodFromNotes } = await import('../finance')

beforeEach(() => useTables({}))

describe('paymentMethodFromNotes — the label out of payments.notes', () => {
  it('reads the label off the first line, alone or with the operator’s note under it', () => {
    expect(paymentMethodFromNotes('Method: Cash')).toBe('Cash')
    expect(paymentMethodFromNotes('Method: Cash\nAdvance for the Pokhara shoot')).toBe('Cash')
    expect(paymentMethodFromNotes('Method: Bank Transfer\nRef #881')).toBe('Bank Transfer')
  })

  it('tolerates spacing around the label but not a different word for it', () => {
    expect(paymentMethodFromNotes('Method:   eSewa  ')).toBe('eSewa')
    // The picker's values are exact. A lowercase or re-spaced spelling is a
    // different string and must not preselect a card that does not carry it.
    expect(paymentMethodFromNotes('Method: cash')).toBeNull()
    expect(paymentMethodFromNotes('Method: Bank transfer')).toBeNull()
  })

  it('never reads a label out of the operator’s own text', () => {
    // `composeNotes` always puts the method on line 1. A note that merely
    // mentions the word must not become a method.
    expect(paymentMethodFromNotes('Rang for the balance.\nMethod: cash was refused')).toBeNull()
    expect(paymentMethodFromNotes('Client says method: bank')).toBeNull()
  })

  it('returns null for a row with no label at all', () => {
    expect(paymentMethodFromNotes(null)).toBeNull()
    expect(paymentMethodFromNotes(undefined)).toBeNull()
    expect(paymentMethodFromNotes('')).toBeNull()
    expect(paymentMethodFromNotes('   ')).toBeNull()
    expect(paymentMethodFromNotes('Advance for the shoot')).toBeNull()
    expect(paymentMethodFromNotes('Method:')).toBeNull()
    expect(paymentMethodFromNotes('Method:    ')).toBeNull()
  })

  it('refuses a label the picker cannot render', () => {
    // `recordPayment` takes `paymentMethod?: string`, so an older build or a
    // direct writer can put anything here. Returning it would preselect nothing
    // visible while the form holds a value — the worst of both states.
    expect(paymentMethodFromNotes('Method: Bitcoin')).toBeNull()
    expect(paymentMethodFromNotes('Method: Security Deposit')).toBeNull()
  })

  it('covers every label the picker offers', () => {
    for (const label of PAYMENT_METHOD_LABELS) {
      expect(paymentMethodFromNotes(`Method: ${label}`)).toBe(label)
    }
  })
})

describe('lastPaymentMethodForClient — the query', () => {
  it('asks one client for received money, newest first, in one bounded page', async () => {
    useTables({ payments: [] })
    await lastPaymentMethodForClient('cli-1')

    const sent = callsOn('payments')
    expect(sent.find((c) => c.method === 'eq' && c.args[0] === 'client_id')?.args[1]).toBe('cli-1')
    // 'Failed' and 'Cancelled' are money that did not arrive; defaulting to the
    // method of a bounced receipt is a claim nothing supports.
    expect(sent.find((c) => c.method === 'eq' && c.args[0] === 'status')?.args[1]).toBe('Received')
    expect(sent.find((c) => c.method === 'order')?.args).toEqual(['payment_date', { ascending: false }])
    expect(sent.find((c) => c.method === 'limit')?.args[0]).toBe(12)
    // Only the column the parser needs. Selecting `*` would pull the amount and
    // the client's ledger into a form default for no reason.
    expect(sent.find((c) => c.method === 'select')?.args[0]).toBe('notes')
  })

  it('walks back past receipts that carry no label', async () => {
    useTables({
      payments: [
        { notes: 'Advance for the shoot' }, // written before the METHOD block existed
        { notes: null },
        { notes: 'Method: Fonepay\nQR at the desk' },
        { notes: 'Method: Cash' }, // older still
      ],
    })
    expect(await lastPaymentMethodForClient('cli-1')).toBe('Fonepay')
  })

  it('answers null — not a guess — when no receipt carries a label', async () => {
    useTables({ payments: [{ notes: 'Advance' }, { notes: null }] })
    expect(await lastPaymentMethodForClient('cli-1')).toBeNull()
    useTables({ payments: [] })
    expect(await lastPaymentMethodForClient('cli-1')).toBeNull()
  })

  it('throws on a failed read so the caller can say why, rather than reporting “no history”', async () => {
    useTables({ payments: { error: 'permission denied for table payments' } })
    await expect(lastPaymentMethodForClient('cli-1')).rejects.toThrow(
      'lastPaymentMethodForClient failed: permission denied for table payments',
    )
  })

  it('does not round-trip for a blank client id', async () => {
    useTables({ payments: [{ notes: 'Method: Cash' }] })
    // Postgres would reject `client_id = ''` as an invalid uuid. A caller with
    // no client is "no history", not a database error.
    expect(await lastPaymentMethodForClient('')).toBeNull()
    expect(callsOn('payments')).toHaveLength(0)
  })
})
