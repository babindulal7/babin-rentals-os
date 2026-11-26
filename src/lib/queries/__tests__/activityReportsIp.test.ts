/**
 * R2-D2, audit trace for the activity report's Network IP column. The read
 * passes a missing IP through as null and supplies no default, so the screen
 * decides what a missing address looks like (an em dash, never a loopback).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fakeSupabase, type TableAnswer } from './fakeSupabase'

const state = vi.hoisted(() => ({
  client: null as unknown as { from: (t: string) => unknown },
}))
vi.mock('../../supabase', () => ({
  IS_MOCK: false,
  supabase: { from: (t: string) => state.client.from(t) },
}))

const { getActivityReport } = await import('../activityReports')

function useTables(tables: Record<string, TableAnswer>) {
  state.client = fakeSupabase(tables).client
}

beforeEach(() => useTables({}))

describe('activity report — Network IP', () => {
  it('passes a missing IP through as null, never a loopback or other default', async () => {
    useTables({
      users: [{ id: 'u1', full_name: 'Ram Thapa', primary_role: 'Warehouse', employee_code: 'S-1', is_active: true }],
      audit_events: [
        {
          id: 'e1',
          created_at: '2026-10-01T06:00:00Z',
          action: 'Packed booking',
          category: 'Operations',
          module: 'Operations',
          severity: 'Informational',
          status: 'success',
          actor_id: 'u1',
          ip_address: null,
        },
        {
          id: 'e2',
          created_at: '2026-10-01T05:00:00Z',
          action: 'Signed in',
          category: 'Authentication',
          module: 'Authentication',
          severity: 'Informational',
          status: 'success',
          actor_id: 'u1',
          ip_address: '203.0.113.7',
        },
      ],
    })

    const report = await getActivityReport()
    const ipByAction = Object.fromEntries(report.recentEvents.map((e) => [e.action, e.ipAddress]))

    expect(ipByAction['Packed booking']).toBeNull()
    expect(ipByAction['Signed in']).toBe('203.0.113.7')
  })
})
