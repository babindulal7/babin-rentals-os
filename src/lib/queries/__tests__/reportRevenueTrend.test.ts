import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => {
  type Row = Record<string, unknown>
  const state = {
    invoices: [] as Row[],
    notes: [] as Row[],
    calls: [] as Array<{ table: string; filters: string[]; from: number; to: number }>,
    deniedTable: '' as string,
    /** PostgREST `max-rows`: the server returns at most this many rows per request. */
    serverCap: Infinity,
    /** Added to the reported count on every request after the first (a write mid-read). */
    countDrift: 0,
    omitCount: false,
  }
  const supabase = {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = []
      const recorded: string[] = []
      const builder = {
        select(columns: string, options?: { count?: 'exact' }) {
          recorded.push('select:' + columns + (options?.count ? ':count' : ''))
          return builder
        },
        not(column: string, operator: string, val: unknown) {
          recorded.push(`not:${column}.${operator}.${String(val)}`)
          filters.push(row => row[column] !== null && row[column] !== undefined)
          return builder
        },
        gte(column: string, val: string) {
          filters.push(row => String(row[column]) >= val)
          return builder
        },
        lte(column: string, val: string) {
          filters.push(row => String(row[column]) <= val)
          return builder
        },
        in(column: string, values: readonly unknown[]) {
          recorded.push('in:' + column)
          filters.push(row => values.includes(row[column]))
          return builder
        },
        order(column: string, options?: { ascending?: boolean }) {
          recorded.push('order:' + column + (options?.ascending === false ? '.desc' : ''))
          return builder
        },
        async limit(n: number) {
          state.calls.push({ table, filters: [...recorded], from: 0, to: n - 1 })
          if (state.deniedTable === table) return { data: null, error: {message:'not authorized'} }
          const rows = state.invoices.filter(row => filters.every(filter => filter(row)))
            .sort((a, b) => String(a['issue_date']).localeCompare(String(b['issue_date'])))
          return { data: rows.slice(0, n), error: null }
        },
        async range(from: number, to: number) {
          const prior = state.calls.filter(c => c.table === table).length
          state.calls.push({ table, filters: [...recorded], from, to })
          if (state.deniedTable === table) return { data: null, error: {message:'not authorized'}, count: null }
          const source = table === 'invoices' ? state.invoices : state.notes
          const matched = source.filter(row => filters.every(filter => filter(row)))
          const end = Math.min(to + 1, from + state.serverCap)
          return {
            data: matched.slice(from, end),
            error: null,
            count: state.omitCount ? null : matched.length + (prior > 0 ? state.countDrift : 0),
          }
        },
      }
      return builder
    },
  }
  return { state, supabase }
})

vi.mock('../../supabase', () => ({ supabase: db.supabase }))

import { getEarliestIssueDay, getIssuedRevenueTrend, getPreviousIssuedRevenue } from '../reportRevenueTrend'
import { loadIssuedRevenueTrend } from '../revenueTrend'

const inv = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'i1', issue_date: '2026-10-12', status: 'Sent', taxable_amount: '100.10',
  paid_amount: '0', currency: 'NPR', voided_at: null, ...patch,
})
const note = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'c1', invoice_id: 'i2', amount: '25.25', ...patch,
})

beforeEach(() => {
  db.state.invoices = []
  db.state.notes = []
  db.state.calls = []
  db.state.deniedTable = ''
  db.state.serverCap = Infinity
  db.state.countDrift = 0
  db.state.omitCount = false
})

describe('one authorized revenue and credit-note reader', () => {
  it('has one source of truth, keeping the old load function as an alias', () => {
    expect(loadIssuedRevenueTrend).toBe(getIssuedRevenueTrend)
  })

  it('includes voided invoices for credit audit but excludes them from revenue', async () => {
    db.state.invoices = [
      inv(),
      inv({ id:'i2', status:'Void', voided_at:'2026-10-13T10:00:00Z',
        taxable_amount:'250.00', paid_amount:'25.25' }),
      inv({id:'i3', status:'Draft', taxable_amount:'500.00'}),
    ]
    db.state.notes = [note()]
    const report = await getIssuedRevenueTrend('2026-10-01', '2026-10-31')
    expect(report.totalPaisa).toBe(10010)
    expect(report.issuedCount).toBe(1)
    expect(report.creditReconciliation.creditNoteAmountPaisa).toBe(2525)
    expect(report.creditReconciliation.voidedTaxablePaisa).toBe(25000)
    expect(report.creditReconciliation.paidVoidMismatchCount).toBe(0)
    expect(db.state.calls.filter(c=>c.table === 'invoices')).toHaveLength(1)
    expect(db.state.calls.filter(c=>c.table === 'credit_notes')).toHaveLength(1)
    expect(db.state.calls[0]?.filters).not.toContain('in:status')
  })

  it('refuses inaccessible credit source, never shows a fake zero-credit audit', async () => {
    db.state.invoices = [inv()]
    db.state.deniedTable = 'credit_notes'
    await expect(getIssuedRevenueTrend('2026-10-01','2026-10-31')).rejects.toThrow(/Credit-note source unavailable/)
  })

  it('rejects invalid date before calling the database', async () => {
    await expect(getIssuedRevenueTrend('2026-02-30','2026-03-31')).rejects.toThrow(/Invalid/)
    expect(db.state.calls).toHaveLength(0)
  })

  it('retrieves every invoice page and checks notes by invoice id batches', async () => {
    db.state.invoices = Array.from({length:501}, (_,i)=>
      inv({id:'i'+i, issue_date:'2026-10-12', taxable_amount:'1.00'}))
    const report = await getIssuedRevenueTrend('2026-10-01','2026-10-31')
    expect(report.issuedCount).toBe(501)
    expect(report.totalPaisa).toBe(50100)
    expect(db.state.calls.filter(c=>c.table === 'invoices').map(c=>c.from)).toEqual([0, 500])
    expect(db.state.calls.filter(c=>c.table === 'credit_notes')).toHaveLength(6)
  })

  it('asks the server for the exact count on every page', async () => {
    db.state.invoices = [inv()]
    await getIssuedRevenueTrend('2026-10-01','2026-10-31')
    expect(db.state.calls.every(c => c.filters.some(f => f.endsWith(':count')))).toBe(true)
  })
})

describe('a short page is not the last page', () => {
  const many = (n: number) => Array.from({length:n}, (_,i)=>
    inv({id:'i'+String(i).padStart(4,'0'), taxable_amount:'1.00'}))

  it('reads every row when the server caps responses below the page size', async () => {
    db.state.invoices = many(250)
    db.state.serverCap = 100
    const report = await getIssuedRevenueTrend('2026-10-01','2026-10-31')
    expect(report.issuedCount).toBe(250)
    expect(report.totalPaisa).toBe(25000)
    expect(db.state.calls.filter(c=>c.table === 'invoices').map(c=>c.from)).toEqual([0, 100, 200])
  })

  it('refuses when the count changes mid-read, never a partial trend', async () => {
    db.state.invoices = many(250)
    db.state.serverCap = 100
    db.state.countDrift = 1
    await expect(getIssuedRevenueTrend('2026-10-01','2026-10-31')).rejects.toThrow(/changed while it was being read/)
  })

  it('refuses when the server does not confirm the count', async () => {
    db.state.invoices = [inv()]
    db.state.omitCount = true
    await expect(getIssuedRevenueTrend('2026-10-01','2026-10-31')).rejects.toThrow(/did not confirm how many rows/)
  })
})

describe('comparison and All dates reads', () => {
  it('reads the same number of days immediately before, bucketed to match', async () => {
    db.state.invoices = [
      inv({id:'now', issue_date:'2026-10-05', taxable_amount:'300.00'}),
      inv({id:'before', issue_date:'2026-09-20', taxable_amount:'200.00'}),
      inv({id:'too-early', issue_date:'2026-09-10', taxable_amount:'999.00'}),
    ]
    const current = await getIssuedRevenueTrend('2026-10-01', '2026-10-14', '2026-10-14')
    const previous = await getPreviousIssuedRevenue(current)
    expect(current.totalPaisa).toBe(30000)
    expect(previous.fromAd).toBe('2026-09-17')
    expect(previous.toAd).toBe('2026-09-30')
    expect(previous.totalPaisa).toBe(20000)
    expect(previous.months).toHaveLength(current.months.length)
  })

  it('All dates starts at the first issued invoice; drafts have no issue date', async () => {
    db.state.invoices = [
      inv({id:'d', status:'Draft', issue_date:null}),
      inv({id:'b', issue_date:'2026-03-02'}),
      inv({id:'a', issue_date:'2025-12-09', status:'Void', voided_at:'2025-12-10T00:00:00Z'}),
    ]
    expect(await getEarliestIssueDay()).toBe('2025-12-09')
    db.state.invoices = []
    expect(await getEarliestIssueDay()).toBeNull()
  })

  it('a refused earliest-day read is an error, not "nothing issued"', async () => {
    db.state.deniedTable = 'invoices'
    await expect(getEarliestIssueDay()).rejects.toThrow(/Revenue source unavailable/)
  })
})
