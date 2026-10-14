import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * A small PostgREST stand-in: it applies the filters the adapter sends, honours
 * `range()`, returns `count` when asked, and can cap each response below the
 * adapter's page size — the exact situation in which "stop at a short page"
 * would silently drop invoices.
 */
type Row = Record<string, unknown>

const server = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  maxRows: 1000,
  failOn: null as string | null,
  dropCount: false,
  /** Rows appended after the first page is served — a concurrent insert. */
  growAfterFirstPage: null as Row | null,
  calls: [] as Array<{ table: string; ops: string[] }>,
}))

vi.mock('../../supabase', () => {
  function builder(table: string) {
    const ops: string[] = []
    const filters: Array<(r: Row) => boolean> = []
    const orders: string[] = []
    let wantCount = false
    let from = 0
    let to = Number.MAX_SAFE_INTEGER
    let served = false
    const b = {
      select(_cols: string, opts?: { count?: string }) { wantCount = opts?.count === 'exact'; ops.push('select'); return b },
      in(col: string, vals: unknown[]) { ops.push(`in:${col}:${vals.join('|')}`); filters.push((r) => vals.includes(r[col])); return b },
      is(col: string, val: unknown) { ops.push(`is:${col}:${String(val)}`); filters.push((r) => r[col] === val); return b },
      gte(col: string, val: string) { ops.push(`gte:${col}:${val}`); filters.push((r) => String(r[col]) >= val); return b },
      lte(col: string, val: string) { ops.push(`lte:${col}:${val}`); filters.push((r) => String(r[col]) <= val); return b },
      order(col: string) { ops.push(`order:${col}`); orders.push(col); return b },
      limit(n: number) { to = n - 1; return b },
      range(a: number, z: number) { from = a; to = z; ops.push(`range:${a}-${z}`); return b },
      then(ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) {
        server.calls.push({ table, ops })
        if (server.failOn === table) return Promise.resolve({ data: null, error: { message: 'permission denied' }, count: null }).then(ok, err)
        const all = (server.tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
        all.sort((x, y) => {
          for (const c of orders) {
            const a = String(x[c])
            const z = String(y[c])
            if (a !== z) return a < z ? -1 : 1
          }
          return 0
        })
        const end = Math.min(to, from + server.maxRows - 1)
        const data = all.slice(from, end + 1)
        const count = wantCount && !server.dropCount ? all.length : null
        if (!served && server.growAfterFirstPage && table === 'invoices' && from === 0 && wantCount) {
          served = true
          server.tables['invoices']!.push(server.growAfterFirstPage)
          server.growAfterFirstPage = null
        }
        return Promise.resolve({ data, error: null, count }).then(ok, err)
      },
    }
    return b
  }
  return { supabase: { from: (t: string) => builder(t) } }
})

import { loadRevenueTrend, PAGE_SIZE, readAll } from '../reportRevenueTrend'

const TODAY = '2026-10-14'

function invoice(i: number, patch: Row = {}): Row {
  const day = String((i % 28) + 1).padStart(2, '0')
  return {
    id: `inv-${String(i).padStart(5, '0')}`,
    invoice_no: `INV-${i}`,
    issue_date: `2026-09-${day}`,
    status: 'Paid',
    currency: 'NPR',
    taxable_amount: 100,
    vat_amount: 13,
    total_amount: 113,
    voided_at: null,
    ...patch,
  }
}

beforeEach(() => {
  server.tables = { invoices: [], credit_notes: [] }
  server.maxRows = 1000
  server.failOn = null
  server.dropCount = false
  server.growAfterFirstPage = null
  server.calls = []
})

describe('loadRevenueTrend', () => {
  it('reads every invoice even when the server caps responses below the page size', async () => {
    server.maxRows = 120
    server.tables['invoices'] = Array.from({ length: 1234 }, (_, i) => invoice(i))
    const res = await loadRevenueTrend({ fromDay: '2026-09-01', toDay: '2026-09-30', compare: false, today: TODAY })
    expect(res.kind).toBe('report')
    if (res.kind !== 'report') return
    expect(res.report.current.totals.invoiceCount).toBe(1234)
    expect(res.report.current.totals.revenue).toBe(1234 * 10000)
    expect(res.report.status).toBe('actual')
  })

  it('asks only for issued, non-voided invoices in the window, in a deterministic order', async () => {
    server.tables['invoices'] = [
      invoice(1),
      invoice(2, { status: 'Draft' }),
      invoice(3, { status: 'Void', voided_at: '2026-09-10T00:00:00Z' }),
      invoice(4, { issue_date: '2026-08-31' }),
    ]
    const res = await loadRevenueTrend({ fromDay: '2026-09-01', toDay: '2026-09-30', compare: false, today: TODAY })
    expect(res.kind === 'report' && res.report.current.totals.invoiceCount).toBe(1)
    const ops = server.calls.find((c) => c.table === 'invoices')!.ops
    expect(ops).toEqual(
      expect.arrayContaining([
        'in:status:Sent|Partially Paid|Paid|Overdue',
        'is:voided_at:null',
        'gte:issue_date:2026-09-01',
        'lte:issue_date:2026-09-30',
        'order:issue_date',
        'order:id',
        `range:0-${PAGE_SIZE - 1}`,
      ]),
    )
  })

  it('starts "All dates" at the first issued invoice', async () => {
    server.tables['invoices'] = [invoice(1, { issue_date: '2026-04-02' }), invoice(2, { issue_date: '2026-10-01' })]
    const res = await loadRevenueTrend({ fromDay: null, toDay: null, compare: false, today: TODAY })
    expect(res.kind).toBe('report')
    if (res.kind !== 'report') return
    expect(res.report.current.window).toEqual({ fromDay: '2026-04-02', toDay: TODAY })
    expect(res.report.current.granularity).toBe('month')
    expect(res.report.current.buckets).toHaveLength(7)
  })

  it('says there is no history rather than drawing a zero line when nothing was ever issued', async () => {
    server.tables['invoices'] = [invoice(1, { status: 'Draft' })]
    expect(await loadRevenueTrend({ fromDay: null, toDay: null, compare: false, today: TODAY })).toEqual({ kind: 'no-history' })
  })

  it('fetches the comparison window with the same definition', async () => {
    server.tables['invoices'] = [invoice(1, { issue_date: '2026-09-05' }), invoice(2, { issue_date: '2026-08-05', taxable_amount: 50, vat_amount: 6.5, total_amount: 56.5 })]
    const res = await loadRevenueTrend({ fromDay: '2026-09-01', toDay: '2026-09-30', compare: true, today: TODAY })
    expect(res.kind).toBe('report')
    if (res.kind !== 'report') return
    expect(res.report.previous?.window).toEqual({ fromDay: '2026-08-02', toDay: '2026-08-31' })
    expect(res.report.previous?.layout).toBe('shifted')
    expect(res.report.previous?.totals.revenue).toBe(5000)
    expect(res.report.previous?.buckets).toHaveLength(res.report.current.buckets.length)
  })

  it('marks the report Partial when a credit note sits against a counted (live) invoice', async () => {
    server.tables['invoices'] = [invoice(1), invoice(2)]
    server.tables['credit_notes'] = [
      { id: 'cn-1', invoice_id: 'inv-00001' },
      { id: 'cn-2', invoice_id: 'some-voided-invoice' },
    ]
    const res = await loadRevenueTrend({ fromDay: '2026-09-01', toDay: '2026-09-30', compare: false, today: TODAY })
    expect(res.kind === 'report' && res.report.status).toBe('partial')
    expect(res.kind === 'report' && res.report.partialReasons[0]).toMatch(/1 credit note is recorded/)
  })

  it('throws — never returns zeros — when the read fails', async () => {
    server.tables['invoices'] = [invoice(1)]
    server.failOn = 'invoices'
    await expect(loadRevenueTrend({ fromDay: '2026-09-01', toDay: '2026-09-30', compare: false, today: TODAY })).rejects.toThrow(/permission denied/)
  })

  it('throws when the server will not confirm the row count', async () => {
    server.tables['invoices'] = [invoice(1)]
    server.dropCount = true
    await expect(loadRevenueTrend({ fromDay: '2026-09-01', toDay: '2026-09-30', compare: false, today: TODAY })).rejects.toThrow(/did not confirm/)
  })

  it('throws when invoices change between pages', async () => {
    server.maxRows = 100
    server.tables['invoices'] = Array.from({ length: 250 }, (_, i) => invoice(i))
    server.growAfterFirstPage = invoice(9999)
    await expect(loadRevenueTrend({ fromDay: '2026-09-01', toDay: '2026-09-30', compare: false, today: TODAY })).rejects.toThrow(/changed while/)
  })

  it('returns the window verdicts without reading invoices', async () => {
    expect(await loadRevenueTrend({ fromDay: '2026-11-01', toDay: '2026-11-30', compare: false, today: TODAY })).toEqual({ kind: 'future' })
    expect(server.calls).toEqual([])
  })
})

describe('readAll', () => {
  it('refuses a result set larger than the report reads at once', async () => {
    await expect(readAll('Invoices', async () => ({ data: [], error: null, count: 50_000 }))).rejects.toThrow(/shorter period/)
  })

  it('refuses a short read that does not reach the confirmed count', async () => {
    let n = 0
    await expect(
      readAll('Invoices', async () => (n++ === 0 ? { data: [{ id: 'a' }], error: null, count: 3 } : { data: [], error: null, count: 3 })),
    ).rejects.toThrow(/1 of 3/)
  })
})
