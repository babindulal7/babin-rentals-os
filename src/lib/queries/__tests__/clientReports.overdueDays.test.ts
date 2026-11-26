import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fakeSupabase, type TableAnswer } from './fakeSupabase'

/*
 * Days past due are whole Kathmandu civil days. A due date parses to 00:00 UTC,
 * which is 05:45 in Kathmandu, so counting wall-clock milliseconds read each age
 * one day short until that hour.
 */

const state = vi.hoisted(() => ({
  client: null as unknown as { from: (table: string) => unknown },
}))
vi.mock('../../supabase', () => ({
  IS_MOCK: false,
  supabase: { from: (table: string) => state.client.from(table) },
}))

const { getClientReportsSummary } = await import('../clientReports')

function useTables(tables: Record<string, TableAnswer>) {
  state.client = fakeSupabase(tables).client
}

const client = { id: 'c1', client_code: 'C-1', name: 'Sagarmatha Pictures Pvt. Ltd.', status: 'Active', created_at: '2026-01-01T00:00:00Z', merged_into_client_id: null }

beforeEach(() => useTables({}))

describe('oldest overdue age counts whole Kathmandu days', () => {
  it('reads 116 days for a 31 Jul due date at 05:11 Kathmandu time on 24 Nov (before 05:45)', async () => {
    useTables({
      clients: [client],
      invoices: [{ id: 'i1', client_id: 'c1', outstanding_amount: 312001, due_date: '2026-07-31' }],
    })
    // 23:26 UTC on 23 Nov is 05:11 on 24 Nov in Kathmandu.
    const summary = await getClientReportsSummary({}, { includeMoney: true, now: new Date('2026-11-23T23:26:00Z') })
    expect(summary.money?.highRisk[0]?.oldestDaysOverdue).toBe(116)
  })

  it('counts the same days later in the Kathmandu day', async () => {
    useTables({
      clients: [client],
      invoices: [{ id: 'i1', client_id: 'c1', outstanding_amount: 312001, due_date: '2026-07-31' }],
    })
    const summary = await getClientReportsSummary({}, { includeMoney: true, now: new Date('2026-11-24T14:15:00Z') })
    expect(summary.money?.highRisk[0]?.oldestDaysOverdue).toBe(116)
  })

  it('keeps an invoice due today in the not-yet-due bucket, not one day late', async () => {
    useTables({
      clients: [client],
      invoices: [{ id: 'i1', client_id: 'c1', outstanding_amount: 5000, due_date: '2026-11-24' }],
    })
    const summary = await getClientReportsSummary({}, { includeMoney: true, now: new Date('2026-11-23T23:26:00Z') })
    expect(summary.money?.ageing.find((a) => a.label === 'Not yet due')?.invoices).toBe(1)
    expect(summary.money?.highRisk).toEqual([])
  })
})
