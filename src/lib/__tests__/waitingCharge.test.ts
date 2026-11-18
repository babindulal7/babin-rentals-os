import { describe, it, expect, vi, beforeEach } from 'vitest'

const answers = vi.hoisted(() => ({
  rpcResult: { data: null, error: null } as { data: unknown; error: { message: string } | null },
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
}))

vi.mock('../supabase', () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => {
      answers.rpcCalls.push({ name, args })
      return Promise.resolve(answers.rpcResult)
    },
  },
}))

import { addWaitingChargeLine, canAddWaitingCharge, checkWaitingCharge } from '../queries/waitingCharge'

describe('canAddWaitingCharge (S2 row 6)', () => {
  it('shows the button to the four roles the database allows, and to nobody else', () => {
    for (const role of ['Owner', 'Admin', 'Manager', 'Coordinator'] as const) expect(canAddWaitingCharge(role)).toBe(true)
    for (const role of ['Warehouse', 'Technician', 'Driver', 'Accounts', 'Client'] as const) {
      expect(canAddWaitingCharge(role)).toBe(false)
    }
    expect(canAddWaitingCharge(null)).toBe(false)
    expect(canAddWaitingCharge(undefined)).toBe(false)
  })
})

describe('checkWaitingCharge (S2 row 6)', () => {
  it('reads whole minutes and a rupee amount into paisa', () => {
    expect(checkWaitingCharge('25', '150')).toEqual({ ok: true, minutes: 25, amountPaisa: 15000 })
    expect(checkWaitingCharge(' 5 ', '199.5')).toEqual({ ok: true, minutes: 5, amountPaisa: 19950 })
    expect(checkWaitingCharge('1440', '0.01')).toEqual({ ok: true, minutes: 1440, amountPaisa: 1 })
  })

  it('refuses blank, zero, fractional or huge minutes', () => {
    for (const bad of ['', '0', '-5', '2.5', 'abc', '1441']) {
      expect(checkWaitingCharge(bad, '100').ok).toBe(false)
    }
  })

  it('refuses a blank, zero, negative or three-decimal amount, so a waiting charge is never assumed free', () => {
    for (const bad of ['', '0', '0.00', '-1', '1.234', 'x']) {
      const r = checkWaitingCharge('10', bad)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toContain('more than 0')
    }
  })
})

describe('addWaitingChargeLine (S2 row 6)', () => {
  beforeEach(() => {
    answers.rpcResult = { data: null, error: null }
    answers.rpcCalls = []
  })

  it('sends the booking, key, minutes, paisa and a trimmed note, and reads the first row back', async () => {
    answers.rpcResult = { data: [{ line_id: 'l1', invoice_id: 'i1', appended_to_draft: true }], error: null }
    const result = await addWaitingChargeLine('b1', 'k1', { minutes: 25, amountPaisa: 15000, note: '  Client late  ' })
    expect(result).toEqual({ lineId: 'l1', invoiceId: 'i1', appendedToDraft: true })
    expect(answers.rpcCalls).toEqual([
      {
        name: 'add_waiting_charge_line',
        args: { p_client_uuid: 'k1', p_booking_id: 'b1', p_minutes: 25, p_amount_paisa: 15000, p_note: 'Client late' },
      },
    ])
  })

  it('sends a blank note as null and reports a line with no invoice yet', async () => {
    answers.rpcResult = { data: [{ line_id: 'l2', invoice_id: null, appended_to_draft: false }], error: null }
    const result = await addWaitingChargeLine('b1', 'k2', { minutes: 5, amountPaisa: 1000, note: '   ' })
    expect(result).toEqual({ lineId: 'l2', invoiceId: null, appendedToDraft: false })
    expect(answers.rpcCalls[0]?.args['p_note']).toBeNull()
  })

  it('shows the database refusal as it is, so an issued invoice is explained', async () => {
    answers.rpcResult = { data: null, error: { message: "This booking's invoice (INV-1) is already issued (Sent). Nothing was added." } }
    await expect(addWaitingChargeLine('b1', 'k3', { minutes: 5, amountPaisa: 1000, note: '' })).rejects.toThrow('already issued')
  })

  it('does not show success when the database returned no line', async () => {
    answers.rpcResult = { data: [], error: null }
    await expect(addWaitingChargeLine('b1', 'k4', { minutes: 5, amountPaisa: 1000, note: '' })).rejects.toThrow('Nothing was shown as added')
  })
})
