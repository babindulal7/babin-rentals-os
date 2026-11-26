import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fakeSupabase, type TableAnswer } from './fakeSupabase'

/*
 * The Operator Breakdown's Total Actions and its domain columns must come from
 * the same audit rows. Every event is in the total; an event outside the four
 * domain columns (a sign-in, say) is in `otherActions`, so the two reconcile.
 */

const state = vi.hoisted(() => ({
  client: null as unknown as { from: (table: string) => unknown },
}))
vi.mock('../../supabase', () => ({
  IS_MOCK: false,
  supabase: { from: (table: string) => state.client.from(table) },
}))

const { getActivityReport } = await import('../activityReports')

function useTables(tables: Record<string, TableAnswer>) {
  state.client = fakeSupabase(tables).client
}

const event = (id: string, extra: Record<string, unknown>) => ({
  id,
  created_at: '2026-11-24T03:29:00Z',
  action: 'Update',
  category: 'Rentals',
  module: 'Rentals',
  severity: 'Informational',
  status: 'success',
  actor_id: 'u1',
  actor_role: 'Owner',
  table_name: 'bookings',
  record_id: 'r1',
  ip_address: null,
  device_type: null,
  reason: null,
  ...extra,
})

beforeEach(() => useTables({}))

describe('Operator Breakdown: the domain columns and Total Actions come from the same rows', () => {
  it('puts a sign-in outside the domain columns, so they add up to the total', async () => {
    useTables({
      users: [{ id: 'u1', employee_code: 'E-1', full_name: 'Babin Dulal', primary_role: 'Owner', department: null, is_active: true }],
      audit_events: [
        event('a1', { category: 'Rentals' }),
        event('a2', { category: 'Rentals' }),
        event('a3', { category: 'Finance' }),
        event('a4', { category: 'Authentication', action: 'Login', table_name: 'auth.sessions' }),
      ],
    })
    const report = await getActivityReport()
    const [owner] = report.staffSummaries
    expect(owner?.totalActions).toBe(4)
    expect(owner?.actionsBreakdown).toEqual({ Rentals: 2, Finance: 1, Authentication: 1 })
    expect(owner?.otherActions).toBe(1)
    const domains = ['Rentals', 'Operations', 'Inventory', 'Finance'].reduce(
      (total, domain) => total + (owner?.actionsBreakdown[domain] ?? 0),
      0,
    )
    expect(domains + (owner?.otherActions ?? 0)).toBe(owner?.totalActions)
  })

  it('reads zero outside the domains when every event is a domain event', async () => {
    useTables({
      users: [{ id: 'u1', employee_code: 'E-1', full_name: 'Babin Dulal', primary_role: 'Owner', department: null, is_active: true }],
      audit_events: [event('a1', { category: 'Inventory' })],
    })
    const report = await getActivityReport()
    expect(report.staffSummaries[0]?.otherActions).toBe(0)
  })
})
