import { describe, it, expect, vi, beforeEach } from 'vitest'

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}))

vi.mock('../../../lib/supabase', () => ({
  newClientUuid: () => 'uuid-mem-1',
  supabase: {
    rpc: rpcMock,
  },
}))

import { enrollClientMembership } from '../enrollMembership'
import { rupees } from '../../../lib/money'

const ctx = { userId: 'usr-coord', role: 'Coordinator' as const }

describe('enrollClientMembership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('validates clientId, planId, and non-negative integer paisa feePaid', async () => {
    await expect(enrollClientMembership({ clientId: '', planId: 'p1' }, ctx)).rejects.toThrow(/Client ID is required/i)
    await expect(enrollClientMembership({ clientId: 'c1', planId: '' }, ctx)).rejects.toThrow(/Membership Plan ID is required/i)
    await expect(enrollClientMembership({ clientId: 'c1', planId: 'p1', feePaid: -100 }, ctx)).rejects.toThrow(/non-negative amount in integer paisa/i)
  })

  it('rejects non-authorised roles and offline sessions', async () => {
    await expect(
      enrollClientMembership({ clientId: 'c1', planId: 'p1' }, { userId: 'u-wh', role: 'Warehouse' }),
    ).rejects.toThrow(/Only Owner, Admin, Manager, or Coordinator/i)

    await expect(
      enrollClientMembership({ clientId: 'c1', planId: 'p1' }, { ...ctx, isOnline: false }),
    ).rejects.toThrow(/Connect to update client membership/i)
  })

  it('converts integer paisa feePaid to rupees at RPC boundary', async () => {
    const serverRow = {
      id: 'mem-1',
      client_id: 'c1',
      plan_id: 'p1',
      level: 'Gold',
      plan_label: 'Gold Member',
      join_date: '2026-11-27',
      fee_paid: 5000,
      superseded_membership_id: null,
    }
    rpcMock.mockResolvedValueOnce({ data: serverRow, error: null })

    const res = await enrollClientMembership(
      { clientId: 'c1', planId: 'p1', feePaid: rupees(5000), clientUuid: 'uuid-1' },
      ctx,
    )

    expect(rpcMock).toHaveBeenCalledWith('enroll_client_membership', {
      p_client_id: 'c1',
      p_plan_id: 'p1',
      p_join_date: null,
      p_fee_paid: 5000,
      p_notes: null,
      p_key: 'uuid-1',
    })
    expect(res).toEqual(serverRow)
  })
})
