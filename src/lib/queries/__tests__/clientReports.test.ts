import { beforeEach, describe, expect, it, vi } from 'vitest'
import { rupees } from '../../money'

const mockDb = vi.hoisted(() => ({
  clients: [] as Record<string, unknown>[],
  memberships: [] as Record<string, unknown>[],
  bookings: [] as Record<string, unknown>[],
  invoices: [] as Record<string, unknown>[],
  openInvoices: [] as Record<string, unknown>[],
  failTable: '',
  filters: [] as string[],
}))

vi.mock('../../supabase', () => ({
  supabase: {
    from(table: string) {
      const qFilters: string[] = []
      const q: Record<string, any> = {
        select: (_fields?: string) => q,
        is: (col: string, val: unknown) => {
          const f = `${table}:is:${col}=${val}`
          mockDb.filters.push(f)
          qFilters.push(f)
          return q
        },
        neq: (col: string, val: unknown) => {
          const f = `${table}:neq:${col}=${val}`
          mockDb.filters.push(f)
          qFilters.push(f)
          return q
        },
        in: (col: string, val: unknown[]) => {
          const f = `${table}:in:${col}=${val.join(',')}`
          mockDb.filters.push(f)
          qFilters.push(f)
          return q
        },
        gte: (col: string, val: unknown) => {
          const f = `${table}:gte:${col}=${val}`
          mockDb.filters.push(f)
          qFilters.push(f)
          return q
        },
        lte: (col: string, val: unknown) => {
          const f = `${table}:lte:${col}=${val}`
          mockDb.filters.push(f)
          qFilters.push(f)
          return q
        },
        eq: (col: string, val: unknown) => {
          const f = `${table}:eq:${col}=${val}`
          mockDb.filters.push(f)
          qFilters.push(f)
          return q
        },
        order: () => q,
        range: (start: number, end: number) => {
          if (table === mockDb.failTable) {
            return Promise.resolve({ data: null, error: { message: `database error on ${table}` } })
          }
          let rows: Record<string, unknown>[] = []
          if (table === 'clients') rows = mockDb.clients
          else if (table === 'client_memberships') rows = mockDb.memberships
          else if (table === 'bookings') rows = mockDb.bookings
          else if (table === 'invoices') {
            const hasIn = qFilters.some((f) => f.startsWith('invoices:in:status'))
            rows = hasIn ? mockDb.openInvoices : mockDb.invoices
          }
          return Promise.resolve({
            data: rows.slice(start, end + 1),
            error: null,
          })
        },
        then: (resolve: (val: any) => any) => q.range(0, 1000).then(resolve),
      }
      return q
    },
  },
}))

import { getClientReportsSummary } from '../clientReports'

describe('clientReports queries — real data and stage filtering', () => {
  beforeEach(() => {
    mockDb.clients = []
    mockDb.memberships = []
    mockDb.bookings = []
    mockDb.invoices = []
    mockDb.openInvoices = []
    mockDb.failTable = ''
    mockDb.filters = []
  })

  it('returns an honest zero summary for an empty database', async () => {
    const summary = await getClientReportsSummary({}, { includeMoney: true })
    expect(summary.totalClients).toBe(0)
    expect(summary.activeClients).toBe(0)
    expect(summary.newClients).toBe(0)
    expect(summary.members).toBe(0)
    expect(summary.bookedClients).toBe(0)
    expect(summary.repeatClients).toBe(0)
    expect(summary.topClients).toEqual([])
    expect(summary.money).toEqual({
      invoiced: rupees(0),
      receivables: rupees(0),
      ageing: [
        { label: 'Not yet due', amount: rupees(0), invoices: 0 },
        { label: '1–30 days', amount: rupees(0), invoices: 0 },
        { label: '31–60 days', amount: rupees(0), invoices: 0 },
        { label: '61–90 days', amount: rupees(0), invoices: 0 },
        { label: '90+ days', amount: rupees(0), invoices: 0 },
      ],
      highRisk: [],
    })
  })

  it('filters out quotes and cancelled bookings when reading rental activity', async () => {
    await getClientReportsSummary()
    expect(mockDb.filters).toContain('bookings:is:cancelled_at=null')
    expect(mockDb.filters).toContain('bookings:neq:stage=Quote')
  })

  it('counts repeat clients and booking frequency correctly from confirmed bookings', async () => {
    mockDb.clients = [
      { id: 'c1', client_code: 'CL-001', name: 'Alpha Productions', status: 'Active', created_at: '2026-01-01', merged_into_client_id: null },
      { id: 'c2', client_code: 'CL-002', name: 'Beta Studios', status: 'Active', created_at: '2026-01-01', merged_into_client_id: null },
      { id: 'c3', client_code: 'CL-003', name: 'Gamma Films', status: 'Inactive', created_at: '2026-01-01', merged_into_client_id: null },
    ]
    mockDb.bookings = [
      { id: 'b1', client_id: 'c1' },
      { id: 'b2', client_id: 'c1' },
      { id: 'b3', client_id: 'c2' },
    ]

    const summary = await getClientReportsSummary({}, { includeMoney: false })
    expect(summary.totalClients).toBe(3)
    expect(summary.activeClients).toBe(2)
    expect(summary.bookedClients).toBe(2)
    expect(summary.repeatClients).toBe(1) // c1 has 2 bookings
    expect(summary.frequency).toEqual([
      { label: '1 booking', clients: 1 }, // c2
      { label: '2–3 bookings', clients: 1 }, // c1
      { label: '4–6 bookings', clients: 0 },
      { label: '7+ bookings', clients: 0 },
    ])
  })

  it('respects Law 6: money is null when includeMoney is false and queries are skipped', async () => {
    mockDb.clients = [
      { id: 'c1', client_code: 'CL-001', name: 'Alpha Productions', status: 'Active', created_at: '2026-01-01', merged_into_client_id: null },
    ]
    const summary = await getClientReportsSummary({}, { includeMoney: false })
    expect(summary.money).toBeNull()
    const invoiceFilters = mockDb.filters.filter((f) => f.startsWith('invoices:'))
    expect(invoiceFilters).toHaveLength(0)
  })

  it('computes receivables and aging buckets accurately in integer paisa', async () => {
    const now = new Date('2026-10-30T12:00:00Z')
    mockDb.clients = [
      { id: 'c1', client_code: 'CL-001', name: 'Alpha Productions', status: 'Active', created_at: '2026-01-01', merged_into_client_id: null },
    ]
    mockDb.invoices = [
      { id: 'inv1', client_id: 'c1', total_amount: 150000 },
    ]
    mockDb.openInvoices = [
      // 15 days overdue -> 1-30 days bucket
      { id: 'open1', client_id: 'c1', outstanding_amount: 50000, due_date: '2026-10-15' },
      // 75 days overdue -> 61-90 days bucket & high risk
      { id: 'open2', client_id: 'c1', outstanding_amount: 100000, due_date: '2026-08-16' },
    ]

    const summary = await getClientReportsSummary({}, { includeMoney: true, now })
    expect(summary.money).not.toBeNull()
    expect(summary.money?.invoiced).toBe(rupees(150000))
    expect(summary.money?.receivables).toBe(rupees(150000))
    expect(summary.money?.ageing.find((a) => a.label === '1–30 days')?.amount).toBe(rupees(50000))
    expect(summary.money?.ageing.find((a) => a.label === '61–90 days')?.amount).toBe(rupees(100000))
    expect(summary.money?.highRisk).toHaveLength(1)
    expect(summary.money?.highRisk[0]?.name).toBe('Alpha Productions')
    expect(summary.money?.highRisk[0]?.overdue).toBe(rupees(100000))
  })

  it('throws on database query error instead of returning fake fallback data', async () => {
    mockDb.failTable = 'clients'
    await expect(getClientReportsSummary()).rejects.toThrow(/Clients read failed/i)
  })
})
