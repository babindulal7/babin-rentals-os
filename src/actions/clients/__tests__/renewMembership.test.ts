/**
 * RULING D23 (OPEN_DECISIONS §20). Renewing on a lapsed (or ending) membership:
 * charges the plan fee (credit = 0), starts a new term from the renewal date,
 * and keeps history.
 *
 * One RPC: `renew_client_membership` (0198).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ActionPermissionError } from '../../core'
import { DomainEvents, EVENT_TYPES } from '../../../events/eventBus'

const db = vi.hoisted(() => ({
  calls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  response: { data: null as unknown, error: null as { code?: string; message: string } | null },
}))

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      db.calls.push({ name, args })
      return db.response
    }),
  },
}))

const { renewMembership } = await import('../renewMembership')

const CLIENT_DB_ID = '11111111-1111-4111-8111-111111111111'
const KEY = '22222222-2222-4222-8222-222222222222'
const ctx = (role: Parameters<typeof renewMembership>[1] extends infer C ? (C extends { role: infer R } ? R : never) : never) => ({
  userId: 'u-1',
  role,
  isOnline: true,
})

const input = (over: Record<string, unknown> = {}) => ({
  clientDbId: CLIENT_DB_ID,
  clientCode: 'C-0042',
  planLevel: 'Creator' as const,
  clientUuid: KEY,
  ...over,
})

const confirmed = (over: Record<string, unknown> = {}) => ({
  client_id: CLIENT_DB_ID,
  plan_level: 'Creator',
  previous_level: 'Creator',
  membership_id: '33333333-3333-4333-8333-333333333333',
  superseded_membership_id: 'old-1',
  joined_on: '2026-10-28',
  is_renewal: true,
  credit: 0,
  new_fee: 15000,
  new_fee_due: 15000,
  ...over,
})

let heard: unknown[] = []
let unsubscribe: (() => void) | null = null

beforeEach(() => {
  db.calls = []
  db.response = { data: confirmed(), error: null }
  heard = []
  unsubscribe = DomainEvents.subscribe(EVENT_TYPES.MEMBERSHIP_TIER_CHANGED, (payload: unknown) => {
    heard.push(payload)
  })
})

afterEach(() => {
  unsubscribe?.()
})

describe('who may renew', () => {
  it.each(['Owner', 'Admin', 'Manager', 'Coordinator'] as const)('lets %s through to the renew RPC', async (role) => {
    await renewMembership(input(), ctx(role))
    expect(db.calls).toHaveLength(1)
  })

  it.each(['Accounts', 'Warehouse', 'Technician', 'Driver', 'Client'] as const)('refuses %s before anything is sent', async (role) => {
    await expect(renewMembership(input(), ctx(role))).rejects.toBeInstanceOf(ActionPermissionError)
    expect(db.calls).toHaveLength(0)
    expect(heard).toHaveLength(0)
  })
})

describe('what it sends', () => {
  it('calls renew_client_membership once with the request key and payload', async () => {
    await renewMembership(input(), ctx('Coordinator'))
    expect(db.calls).toHaveLength(1)
    const [call] = db.calls
    expect(call!.name).toBe('renew_client_membership')
    expect(call!.args).toEqual({ p_payload: { client_id: CLIENT_DB_ID, client_uuid: KEY, plan_level: 'Creator' } })
  })

  it('sends a trimmed note, and leaves it out when blank', async () => {
    await renewMembership(input({ note: '  Renewing for 2026 term  ' }), ctx('Coordinator'))
    expect((db.calls[0]!.args['p_payload'] as Record<string, unknown>)['note']).toBe('Renewing for 2026 term')
    await renewMembership(input({ note: '   ' }), ctx('Coordinator'))
    expect(db.calls[1]!.args['p_payload']).not.toHaveProperty('note')
  })
})

describe('validation happens before any call', () => {
  it.each([
    ['a missing client', { clientDbId: '' }, /Client and request key/],
    ['a missing request key', { clientUuid: '' }, /Client and request key/],
    ['a note over 500 characters', { note: 'x'.repeat(501) }, /at most 500/],
  ])('refuses %s', async (_what, over, matcher) => {
    await expect(renewMembership(input(over), ctx('Manager'))).rejects.toThrow(matcher)
    expect(db.calls).toHaveLength(0)
  })

  it('refuses while offline and says nothing was saved', async () => {
    await expect(renewMembership(input(), { ...ctx('Manager'), isOnline: false })).rejects.toThrow(/needs a connection\. Nothing was saved/)
    expect(db.calls).toHaveLength(0)
  })
})

describe('what it believes', () => {
  it('returns the server answer and emits the tier-changed event, keyed on the client code', async () => {
    db.response = { data: confirmed(), error: null }
    const result = await renewMembership(input(), ctx('Manager'))
    expect(result.is_renewal).toBe(true)
    expect(result.previous_level).toBe('Creator')
    expect(result.membership_id).toBe('33333333-3333-4333-8333-333333333333')
    expect(result.superseded_membership_id).toBe('old-1')
    expect(heard).toEqual([{ clientId: 'C-0042', newTier: 'Creator' }])
  })

  it('passes the database refusal through as the message, and emits nothing', async () => {
    db.response = { data: null, error: { code: 'P0001', message: 'Cannot renew: client does not have an active or lapsed membership.' } }
    await expect(renewMembership(input(), ctx('Manager'))).rejects.toThrow('Cannot renew: client does not have an active or lapsed membership.')
    expect(heard).toHaveLength(0)
  })

  it('says plainly when the server does not have the function yet, and changes nothing', async () => {
    db.response = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }
    await expect(renewMembership(input(), ctx('Manager'))).rejects.toThrow(/not available on this server yet.*Nothing was changed/s)
    expect(heard).toHaveLength(0)
  })
})
