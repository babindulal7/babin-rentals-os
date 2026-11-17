/**
 * RULING 2026-11-17 (R-17.1): the status read hands the system's own figure to the screen. It
 * converts rupees to paisa and nothing else; it never computes TDS, and an error is an error,
 * never "no TDS".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({
  calls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  response: { data: null as unknown, error: null as { code?: string; message: string } | null },
}))

vi.mock('../../supabase', () => ({
  supabase: {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      db.calls.push({ name, args })
      return db.response
    }),
  },
}))

const { getClientTdsStatus } = await import('../clientTds')

const INVOICE = '11111111-1111-4111-8111-111111111111'

const row = (over: Record<string, unknown> = {}) => ({
  invoice_id: INVOICE,
  rate_percent: 1.5,
  base_amount: 10000,
  amount: 150,
  outstanding_amount: 150,
  can_record: true,
  blocked_reason: null,
  active: null,
  ...over,
})

beforeEach(() => {
  db.calls = []
  db.response = { data: row(), error: null }
})

describe('getClientTdsStatus', () => {
  it('asks the server for the invoice and returns its figures in paisa', async () => {
    const out = await getClientTdsStatus(INVOICE)
    expect(db.calls).toEqual([{ name: 'client_tds_status', args: { p_invoice_id: INVOICE } }])
    expect(out).toMatchObject({ ratePercent: 1.5, basePaisa: 1_000_000, amountPaisa: 15_000, outstandingPaisa: 15_000, canRecord: true, active: null })
  })

  it('carries the active deduction and its certificate', async () => {
    db.response = {
      data: row({ can_record: false, blocked_reason: 'TDS is already recorded for this invoice.', active: { ledger_id: 'led-1', amount: 150, certificate_number: 'TDS-1', deducted_on: '2026-11-17' } }),
      error: null,
    }
    const out = await getClientTdsStatus(INVOICE)
    expect(out.canRecord).toBe(false)
    expect(out.active).toEqual({ ledgerId: 'led-1', amountPaisa: 15_000, certificateNumber: 'TDS-1', deductedOn: '2026-11-17' })
  })

  it('does not believe an answer about a different invoice', async () => {
    db.response = { data: row({ invoice_id: '99999999-9999-4999-8999-999999999999' }), error: null }
    await expect(getClientTdsStatus(INVOICE)).rejects.toThrow(/did not answer for this invoice/)
  })

  it('says so when the server does not have the function yet', async () => {
    db.response = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }
    await expect(getClientTdsStatus(INVOICE)).rejects.toThrow(/not available on this server yet/)
  })

  it('shows a refusal as an error, never as "no TDS"', async () => {
    db.response = { data: null, error: { code: '42501', message: 'TDS is not available to this role.' } }
    await expect(getClientTdsStatus(INVOICE)).rejects.toThrow(/could not be read.*not available to this role/)
  })
})
