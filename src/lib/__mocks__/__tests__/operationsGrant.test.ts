import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})

async function client(grants: Array<Record<string, unknown>> = [], active = true, identified = true) {
  vi.stubEnv('VITE_MOCK_SEEDED', 'false')
  const values = new Map<string, string>([
    ['babin.mock.overlay.v1', JSON.stringify({
      inserts: [
        { table: 'users', row: { id: 'test-actor', primary_role: 'Warehouse', is_active: active } },
        { table: 'bookings', row: { id: 'test-booking', branch_id: 'branch-A' } },
        ...grants.map(row => ({ table: 'operations_grants', row })),
      ], updates: [], deletes: [], seq: {},
    })],
  ])
  if (identified) values.set('babin.mock.session.v1', JSON.stringify({ user: { id: 'test-actor', email: 'test@isolated.test' } }))
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  })
  return (await import('../client')).mockSupabase
}

describe('mock branch preflight mirrors narrowing-only grant history', () => {
  const args = { p_operation: 'reset', p_booking_id: 'test-booking' }
  it('allows an active pristine actor', async () => {
    expect((await (await client()).rpc('assert_operation_branch_grant', args)).error).toBeNull()
  })
  it.each([
    { branch_id: 'branch-A', revoked_at: null, allowed: true },
    { branch_id: 'branch-B', revoked_at: null, allowed: false },
    { branch_id: 'branch-A', revoked_at: '2026-10-23', allowed: false },
  ])('checks exact branch and revoke: $branch_id / $revoked_at', async row => {
    const db = await client([{ id: 'grant', user_id: 'test-actor', operation: 'reset', ...row }])
    expect((await db.rpc('assert_operation_branch_grant', args)).error === null).toBe(row.allowed)
  })
  it.each([[false, true], [true, false]])('refuses inactive or absent identity (%s/%s)', async (active, identified) => {
    expect((await (await client([], active, identified)).rpc('assert_operation_branch_grant', args)).error).not.toBeNull()
  })
  it('refuses unknown bookings and operations', async () => {
    const db = await client()
    expect((await db.rpc('assert_operation_branch_grant', { ...args, p_booking_id: 'missing' })).error).not.toBeNull()
    expect((await db.rpc('assert_operation_branch_grant', { ...args, p_operation: 'unknown' })).error).not.toBeNull()
  })
})
