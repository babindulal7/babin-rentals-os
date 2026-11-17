/**
 * The mock copy of the client-TDS functions (migration 0240) must refuse and answer the way
 * the SQL does, or a mock-mode pass proves nothing. The SQL itself is proven by
 * `check:lifecycle` step L82; this pins that the mock stays in step with it.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { Row } from '../engine'
import { clientTdsStatusMock, recordClientTdsMock, reverseClientTdsMock, type TdsMockEnv } from '../tds'

const INVOICE = 'inv-1'
const KEY_A = '00000000-0000-4000-8000-00000000a001'
const KEY_B = '00000000-0000-4000-8000-00000000a002'
const KEY_C = '00000000-0000-4000-8000-00000000a003'

let tables: Record<string, Row[]>

function env(role: string | null, actor: string | null = 'u-1'): TdsMockEnv {
  return {
    rows: (t) => (tables[t] ??= []),
    insert: (t, rows) => {
      for (const r of rows) (tables[t] ??= []).push({ id: `${t}-${(tables[t] ?? []).length + 1}`, ...r })
      return { rows: (tables[t] ?? []).slice(-rows.length), error: null }
    },
    update: (t, patch, pred) => {
      const hits = (tables[t] ?? []).filter(pred)
      for (const r of hits) Object.assign(r, patch)
      return hits
    },
    actorId: actor,
    actorRole: role,
  }
}

beforeEach(() => {
  tables = {
    invoices: [
      {
        id: INVOICE, client_id: 'c-1', status: 'Sent', voided_at: null,
        taxable_amount: 10000, total_amount: 11300, paid_amount: 11150, outstanding_amount: 150,
      },
    ],
    clients: [{ id: 'c-1', name: 'Test Client' }],
    tds_ledger: [],
  }
})

describe('client_tds_status (mock)', () => {
  it('shows the 1.5% figure on the taxable base, before VAT', () => {
    const { data, error } = clientTdsStatusMock(env('Accounts'), INVOICE)
    expect(error).toBeNull()
    expect(data).toMatchObject({ rate_percent: 1.5, base_amount: 10000, amount: 150, can_record: true, active: null })
  })

  it.each(['Warehouse', 'Technician', 'Driver', 'Client'])('refuses %s: money-blind', (role) => {
    expect(clientTdsStatusMock(env(role), INVOICE).error?.code).toBe('42501')
  })

  it('refuses with no session', () => {
    expect(clientTdsStatusMock(env(null, null), INVOICE).error?.code).toBe('42501')
  })

  it('says why it cannot be recorded when more than is outstanding', () => {
    tables['invoices']![0]!['outstanding_amount'] = 100
    const { data } = clientTdsStatusMock(env('Accounts'), INVOICE)
    expect(data).toMatchObject({ can_record: false })
    expect((data as Row)['blocked_reason']).toMatch(/more than what is still outstanding/)
  })
})

describe('record_client_tds (mock)', () => {
  it.each(['Admin', 'Manager', 'Warehouse'])('refuses %s', (role) => {
    expect(recordClientTdsMock(env(role), { invoice_id: INVOICE, client_uuid: KEY_A }).error?.code).toBe('42501')
  })

  it('records, settles the invoice at gross and returns the confirmed figures', () => {
    const { data, error } = recordClientTdsMock(env('Accounts'), { invoice_id: INVOICE, client_uuid: KEY_A, certificate_number: ' TDS-1 ' })
    expect(error).toBeNull()
    expect(data).toMatchObject({ amount: 150, paid_amount: 11300, outstanding_amount: 0, status: 'Paid', replayed: false })
    expect(tables['tds_ledger']![0]).toMatchObject({ certificate_number: 'TDS-1', party_name: 'Test Client', direction: 'Client Deducted' })
  })

  it('replays the same key without writing again', () => {
    recordClientTdsMock(env('Accounts'), { invoice_id: INVOICE, client_uuid: KEY_A })
    const again = recordClientTdsMock(env('Accounts'), { invoice_id: INVOICE, client_uuid: KEY_A })
    expect(again.data).toMatchObject({ replayed: true })
    expect(tables['tds_ledger']).toHaveLength(1)
  })

  it('refuses a second active deduction on one invoice', () => {
    recordClientTdsMock(env('Accounts'), { invoice_id: INVOICE, client_uuid: KEY_A })
    const second = recordClientTdsMock(env('Accounts'), { invoice_id: INVOICE, client_uuid: KEY_B })
    expect(second.error?.message).toMatch(/GATE:tds\.already_recorded/)
  })

  it('refuses TDS above what is outstanding', () => {
    tables['invoices']![0]!['outstanding_amount'] = 0
    const out = recordClientTdsMock(env('Accounts'), { invoice_id: INVOICE, client_uuid: KEY_A })
    expect(out.error?.message).toMatch(/GATE:tds\.exceeds_outstanding/)
  })

  it('refuses a voided invoice', () => {
    tables['invoices']![0]!['voided_at'] = '2026-11-01T00:00:00Z'
    expect(recordClientTdsMock(env('Accounts'), { invoice_id: INVOICE, client_uuid: KEY_A }).error?.message).toMatch(/GATE:tds\.invoice_void/)
  })
})

describe('reverse_client_tds (mock)', () => {
  const recorded = () => {
    recordClientTdsMock(env('Accounts'), { invoice_id: INVOICE, client_uuid: KEY_A })
    return String(tables['tds_ledger']![0]!['id'])
  }

  it.each(['Coordinator', 'Accounts', 'Warehouse'])('refuses %s', (role) => {
    const ledger = recorded()
    expect(reverseClientTdsMock(env(role), { ledger_id: ledger, client_uuid: KEY_B, reason: 'Entered on the wrong invoice' }).error?.code).toBe('42501')
  })

  it('needs a reason of at least 10 characters', () => {
    const ledger = recorded()
    expect(reverseClientTdsMock(env('Manager'), { ledger_id: ledger, client_uuid: KEY_B, reason: 'oops' }).error?.message).toMatch(/10 characters/)
  })

  it('adds a Reversal row, re-opens the amount and lets it be recorded again', () => {
    const ledger = recorded()
    const out = reverseClientTdsMock(env('Manager'), { ledger_id: ledger, client_uuid: KEY_B, reason: 'Entered on the wrong invoice' })
    expect(out.data).toMatchObject({ reverses_id: ledger, outstanding_amount: 150, status: 'Partially Paid' })
    expect(tables['tds_ledger']).toHaveLength(2)
    expect(tables['tds_ledger']![0]!['entry_type']).toBe('Deduction')
    const again = recordClientTdsMock(env('Accounts'), { invoice_id: INVOICE, client_uuid: KEY_C })
    expect(again.error).toBeNull()
  })

  it('refuses reversing twice', () => {
    const ledger = recorded()
    reverseClientTdsMock(env('Manager'), { ledger_id: ledger, client_uuid: KEY_B, reason: 'Entered on the wrong invoice' })
    const second = reverseClientTdsMock(env('Manager'), { ledger_id: ledger, client_uuid: KEY_C, reason: 'Entered on the wrong invoice' })
    expect(second.error?.message).toMatch(/GATE:tds\.already_reversed/)
  })
})
