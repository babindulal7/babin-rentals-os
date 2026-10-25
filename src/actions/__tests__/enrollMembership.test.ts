import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  enrollClientMembershipConfig,
  type EnrollClientMembershipInput,
} from '../clients/enrollMembership'
import type { Role } from '../../lib/rbac'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../../lib/supabase', () => ({
  supabase: { rpc },
  newClientUuid: () => 'mock-uuid-key',
}))

const ctx = (role: Role, isOnline = true) => ({ userId: 'operator-id', role, isOnline })

describe('enrollClientMembership action', () => {
  beforeEach(() => {
    rpc.mockReset()
  })

  const validInput: EnrollClientMembershipInput = {
    clientId: 'client-001',
    planId: 'plan-gold',
    joinDate: '2026-10-24',
    feePaid: 2500000, // 25,000 NPR in paisa
    notes: 'Upgraded to Gold plan annual',
    clientUuid: 'custom-membership-key',
  }

  it('validates required clientId', () => {
    expect(() =>
      enrollClientMembershipConfig.validate({ ...validInput, clientId: '' })
    ).toThrow('Client ID is required.')
  })

  it('validates required planId', () => {
    expect(() =>
      enrollClientMembershipConfig.validate({ ...validInput, planId: '' })
    ).toThrow('Membership Plan ID is required.')
  })

  it.each([-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])('rejects invalid integer-paisa fee %s', (feePaid) => {
    expect(() => enrollClientMembershipConfig.validate({ ...validInput, feePaid })).toThrow('integer paisa')
  })

  it.each(['Owner', 'Admin', 'Manager', 'Coordinator'] as Role[])(
    'allows %s to enroll or upgrade membership',
    async (role) => {
      rpc.mockResolvedValue({
        data: {
          id: 'mem-new',
          client_id: 'client-001',
          plan_id: 'plan-gold',
          level: 'Gold',
          plan_label: 'Gold Member',
          join_date: '2026-10-24',
          fee_paid: 2500000,
          superseded_membership_id: 'mem-silver-old',
        },
        error: null,
      })

      const res = await enrollClientMembershipConfig.execute(validInput, ctx(role))
      expect(res.result.id).toBe('mem-new')
      expect(res.result.superseded_membership_id).toBe('mem-silver-old')
      expect(res.result.level).toBe('Gold')
      expect(rpc).toHaveBeenCalledWith('enroll_client_membership', {
        p_client_id: 'client-001',
        p_plan_id: 'plan-gold',
        p_join_date: '2026-10-24',
        p_fee_paid: 25000,
        p_notes: 'Upgraded to Gold plan annual',
        p_key: 'custom-membership-key',
      })
    }
  )

  it.each(['Warehouse', 'Technician', 'Driver', 'Client'] as Role[])(
    'refuses %s to enroll membership (money-blind / field roles)',
    async (role) => {
      await expect(
        enrollClientMembershipConfig.execute(validInput, ctx(role))
      ).rejects.toThrow(
        'Only Owner, Admin, Manager, or Coordinator may enroll a membership.'
      )
      expect(rpc).not.toHaveBeenCalled()
    }
  )

  it('refuses execution when offline', async () => {
    await expect(
      enrollClientMembershipConfig.execute(validInput, ctx('Coordinator', false))
    ).rejects.toThrow('Connect to update client membership.')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('throws when server returns error', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'Membership plan not found or inactive' },
    })
    await expect(
      enrollClientMembershipConfig.execute(validInput, ctx('Owner'))
    ).rejects.toThrow('Membership plan not found or inactive')
  })

  it('throws if write was not confirmed by the server', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    await expect(
      enrollClientMembershipConfig.execute(validInput, ctx('Owner'))
    ).rejects.toThrow('Membership enrollment was not confirmed by the server.')
  })
})
