import { describe, it, expect, vi, beforeEach } from 'vitest'

const answers = vi.hoisted(() => ({
  rpcResult: { error: null } as { error: { message: string } | null },
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

import { checkOutsourcedVehicleQuote, recordOutsourcedVehicleQuote } from '../queries/outsourcedVehicleQuote'

describe('checkOutsourcedVehicleQuote (S2 row 8)', () => {
  it('accepts a vendor, a positive quote and a note, trimming the text', () => {
    expect(checkOutsourcedVehicleQuote('  Test Cargo ', 250000, ' Quote confirmed ')).toEqual({
      ok: true,
      quote: { vendor: 'Test Cargo', quotePaisa: 250000, approvalNote: 'Quote confirmed' },
    })
  })

  it('asks for each missing piece in words', () => {
    const noVendor = checkOutsourcedVehicleQuote('  ', 100, 'n')
    const noQuote = checkOutsourcedVehicleQuote('V', 0, 'n')
    const noNote = checkOutsourcedVehicleQuote('V', 100, '  ')
    expect(noVendor.ok === false && noVendor.error).toContain('vendor')
    expect(noQuote.ok === false && noQuote.error).toContain('quoted delivery charge')
    expect(noNote.ok === false && noNote.error).toContain('approval note')
  })

  it('refuses a negative or fractional-paisa quote and over-long text', () => {
    expect(checkOutsourcedVehicleQuote('V', -1, 'n').ok).toBe(false)
    expect(checkOutsourcedVehicleQuote('V', 10.5, 'n').ok).toBe(false)
    expect(checkOutsourcedVehicleQuote('V'.repeat(121), 100, 'n').ok).toBe(false)
    expect(checkOutsourcedVehicleQuote('V', 100, 'n'.repeat(501)).ok).toBe(false)
  })
})

describe('recordOutsourcedVehicleQuote (S2 row 8)', () => {
  beforeEach(() => {
    answers.rpcResult = { error: null }
    answers.rpcCalls = []
  })

  it('sends the booking, the key, the vendor, the quote and the note to the RPC', async () => {
    await recordOutsourcedVehicleQuote('b1', 'k1', { vendor: 'V', quotePaisa: 250000, approvalNote: 'ok' })
    expect(answers.rpcCalls).toEqual([
      {
        name: 'record_outsourced_vehicle_quote',
        args: { p_client_uuid: 'k1', p_booking_id: 'b1', p_vendor: 'V', p_quote_paisa: 250000, p_approval_note: 'ok' },
      },
    ])
  })

  it('throws a plain message when the database refuses it', async () => {
    answers.rpcResult = { error: { message: 'branch access denied' } }
    await expect(recordOutsourcedVehicleQuote('b1', 'k1', { vendor: 'V', quotePaisa: 1, approvalNote: 'ok' })).rejects.toThrow(
      'The outsourced vehicle quote was not saved: branch access denied',
    )
  })
})
