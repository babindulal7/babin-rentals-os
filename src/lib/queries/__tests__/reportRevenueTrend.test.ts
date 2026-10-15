import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => {
  type Row = Record<string, unknown>
  const state = {
    invoices: [] as Row[],
    notes: [] as Row[],
    calls: [] as Array<{ table: string; filters: string[]; from: number; to: number }>,
    deniedTable: '' as string,
  }
  const supabase = {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = []
      const recorded: string[] = []
      const builder = {
        select(columns: string) { recorded.push('select:' + columns); return builder },
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
        order(_column: string, _options: unknown) { return builder },
        async range(from: number, to: number) {
          state.calls.push({ table, filters: [...recorded], from, to })
          if (state.deniedTable === table) return { data: null, error: {message:'not authorized'} }
          const source = table === 'invoices' ? state.invoices : state.notes
          return { data: source.filter(row => filters.every(filter => filter(row))).slice(from, to+1), error: null }
        },
      }
      return builder
    },
  }
  return { state, supabase }
})

vi.mock('../../supabase', () => ({ supabase: db.supabase }))

import { getIssuedRevenueTrend } from '../reportRevenueTrend'
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
})
