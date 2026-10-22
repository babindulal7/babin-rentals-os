/**
 * RULING 2026-10-22. The mock's `change_client_membership` stands in for the real
 * function (0171) in `dev:mock` and in browser checks, so it must refuse and
 * behave exactly as the SQL does — same roles, same refusals, one live membership
 * per client, an idempotency receipt — or it would teach people the wrong thing.
 * The SQL itself is proven by `check:lifecycle` step L32; this keeps the stand-in
 * honest to it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Row } from '../engine'

function memoryStorage(seed: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(seed))
  return {
    get length() { return data.size },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value) },
    removeItem: (key) => { data.delete(key) },
    clear: () => { data.clear() },
  }
}

const ACTOR = '00000000-0000-4000-8000-0000000000a1'
const CLIENT = '00000000-0000-4000-8000-0000000000c1'
const GONE = '00000000-0000-4000-8000-0000000000c2'
const KEY = (n: number) => `00000000-0000-4000-8000-00000000${String(n).padStart(4, '0')}`

const baseInserts = (role: string) => [
  { table: 'users', row: { id: ACTOR, primary_role: role, is_active: true } },
  { table: 'clients', row: { id: CLIENT, client_code: 'C-0001', name: 'Asha Rai', status: 'Active', created_at: '2026-10-01T00:00:00Z' } },
  { table: 'clients', row: { id: GONE, client_code: 'C-0002', name: 'Closed Co', status: 'Deactivated', created_at: '2026-10-01T00:00:00Z' } },
  { table: 'membership_plans', row: { id: 'plan-academy', level: 'Academy', label: 'Access Member', status: 'Active', created_at: '2026-10-01T00:00:00Z' } },
  { table: 'membership_plans', row: { id: 'plan-creator', level: 'Creator', label: 'Partner', status: 'Active', created_at: '2026-10-01T00:00:00Z' } },
  { table: 'membership_plans', row: { id: 'plan-elite', level: 'Elite', label: 'Elite Member', status: 'Retired', created_at: '2026-10-01T00:00:00Z' } },
]

let storage: Storage

async function boot(role: string, signedIn = true) {
  vi.stubEnv('VITE_MOCK_SEEDED', 'false')
  storage = memoryStorage({
    'babin.mock.overlay.v1': JSON.stringify({ inserts: baseInserts(role), updates: [], deletes: [], seq: {} }),
    ...(signedIn ? { 'babin.mock.session.v1': JSON.stringify({ user: { id: ACTOR, email: 'a@b.test' } }) } : {}),
  })
  vi.stubGlobal('localStorage', storage)
  vi.resetModules()
  return (await import('../client')).mockSupabase
}

type Mock = Awaited<ReturnType<typeof boot>>
const change = (m: Mock, payload: Record<string, unknown>) => m.rpc('change_client_membership', { p_payload: payload })
const rows = async (m: Mock, table: string) => ((await m.from(table).select('*')).data ?? []) as Row[]
const liveFor = async (m: Mock) =>
  (await rows(m, 'client_memberships')).filter((r) => r['client_id'] === CLIENT && r['superseded_at'] == null)
const level = async (m: Mock) =>
  ((await m.from('client_directory_v').select('id, membership_level')).data as Row[]).find((r) => r['id'] === CLIENT)?.['membership_level']

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('who may', () => {
  it.each(['Owner', 'Admin', 'Manager', 'Coordinator'])('lets %s through', async (role) => {
    const m = await boot(role)
    const res = await change(m, { client_id: CLIENT, client_uuid: KEY(1), plan_level: 'Academy' })
    expect(res.error).toBeNull()
  })

  it.each(['Accounts', 'Warehouse', 'Technician', 'Driver', 'Client'])('refuses %s with 42501 and writes nothing', async (role) => {
    const m = await boot(role)
    const res = await change(m, { client_id: CLIENT, client_uuid: KEY(1), plan_level: 'Academy' })
    expect(res.error).toMatchObject({ code: '42501', message: expect.stringMatching(/Coordinator or above/) })
    expect(await rows(m, 'client_memberships')).toHaveLength(0)
  })

  it('refuses a caller who is not signed in', async () => {
    const m = await boot('Owner', false)
    const res = await change(m, { client_id: CLIENT, client_uuid: KEY(1), plan_level: 'Academy' })
    expect(res.error).toMatchObject({ code: '42501' })
  })
})

describe('activate, retry, change', () => {
  it('activates a client with no membership: one live row, no fee, an audit receipt, and the directory shows it', async () => {
    const m = await boot('Coordinator')
    expect(await level(m)).toBeNull()
    const res = await change(m, { client_id: CLIENT, client_uuid: KEY(1), plan_level: 'Academy', note: ' Joined at the counter ' })
    expect(res.data).toMatchObject({ client_id: CLIENT, plan_level: 'Academy', previous_level: null, superseded_membership_id: null })
    const live = await liveFor(m)
    expect(live).toHaveLength(1)
    expect(live[0]!['fee_paid']).toBeNull()
    expect(live[0]!['plan_id']).toBe('plan-academy')
    const audit = (await rows(m, 'audit_events')).filter((a) => a['client_uuid'] === KEY(1))
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ actor_id: ACTOR, actor_role: 'Coordinator', module: 'Clients', reason: 'Joined at the counter' })
    expect(await level(m)).toBe('Academy')
  })

  it('answers a retry with the first answer and writes nothing more; refuses a changed request under the same key', async () => {
    const m = await boot('Coordinator')
    const request = { client_id: CLIENT, client_uuid: KEY(1), plan_level: 'Academy' }
    const first = await change(m, request)
    const again = await change(m, request)
    expect((again.data as Row)['membership_id']).toBe((first.data as Row)['membership_id'])
    expect(await rows(m, 'client_memberships')).toHaveLength(1)
    expect((await rows(m, 'audit_events')).filter((a) => a['client_uuid'] === KEY(1))).toHaveLength(1)
    expect((await change(m, { ...request, plan_level: 'Creator' })).error?.message).toMatch(/another action/)
  })

  it('moves a client: the old row is superseded and kept, exactly one row stays live', async () => {
    const m = await boot('Manager')
    const first = await change(m, { client_id: CLIENT, client_uuid: KEY(1), plan_level: 'Academy' })
    const up = await change(m, { client_id: CLIENT, client_uuid: KEY(2), plan_level: 'Creator' })
    expect(up.data).toMatchObject({ previous_level: 'Academy', plan_level: 'Creator' })
    const all = (await rows(m, 'client_memberships')).filter((r) => r['client_id'] === CLIENT)
    expect(all).toHaveLength(2)
    expect(await liveFor(m)).toHaveLength(1)
    expect((await liveFor(m))[0]!['plan_id']).toBe('plan-creator')
    const old = all.find((r) => r['id'] === (first.data as Row)['membership_id'])!
    expect(old['superseded_by_id']).toBe((up.data as Row)['membership_id'])
    expect(old['superseded_at']).not.toBeNull()
    expect(await level(m)).toBe('Creator')
  })

  it('keeps the change across a reload', async () => {
    const m = await boot('Owner')
    await change(m, { client_id: CLIENT, client_uuid: KEY(1), plan_level: 'Creator' })
    vi.resetModules()
    const reloaded = (await import('../client')).mockSupabase
    expect(await level(reloaded)).toBe('Creator')
    expect(await liveFor(reloaded)).toHaveLength(1)
  })
})

describe('refusals leave everything as it was', () => {
  it.each([
    ['the plan they are already on', { plan_level: 'Creator' }, /already on the Creator plan/],
    ['a retired plan', { plan_level: 'Elite' }, /retired/],
    ['a plan that does not exist', { plan_level: 'Platinum' }, /does not exist/],
    ['a note over 500 characters', { plan_level: 'Academy', note: 'x'.repeat(501) }, /at most 500/],
    ['a missing plan', { plan_level: '' }, /required/],
  ])('refuses %s', async (_what, over, matcher) => {
    const m = await boot('Manager')
    await change(m, { client_id: CLIENT, client_uuid: KEY(1), plan_level: 'Creator' })
    const before = await liveFor(m)
    const res = await change(m, { client_id: CLIENT, client_uuid: KEY(2), ...over })
    expect(res.error?.message).toMatch(matcher)
    expect(await liveFor(m)).toEqual(before)
    expect(await rows(m, 'client_memberships')).toHaveLength(1)
  })

  it('refuses a deactivated client and a client that does not exist', async () => {
    const m = await boot('Manager')
    expect((await change(m, { client_id: GONE, client_uuid: KEY(1), plan_level: 'Academy' })).error?.message).toMatch(/deactivated/)
    expect((await change(m, { client_id: KEY(99), client_uuid: KEY(2), plan_level: 'Academy' })).error?.message).toMatch(/Client was not found/)
    expect(await rows(m, 'client_memberships')).toHaveLength(0)
  })
})
