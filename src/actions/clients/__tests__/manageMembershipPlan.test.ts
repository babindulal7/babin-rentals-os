import { describe, expect, it, vi, beforeEach } from 'vitest'
import { saveMembershipPlanConfig, type SaveMembershipPlanInput } from '../saveMembershipPlan'
import { retireMembershipPlanConfig } from '../retireMembershipPlan'
import type { ActionContext } from '../../core'

const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = []

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn().mockImplementation((name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn: name, args })
      if (name === 'save_membership_plan') {
        return Promise.resolve({
          data: { ok: true, plan_id: args.p_plan_id ?? 'new-plan-id', level: args.p_level, status: 'Active' },
          error: null,
        })
      }
      if (name === 'retire_membership_plan') {
        return Promise.resolve({
          data: { ok: true, plan_id: args.p_plan_id, level: 'Creator', status: args.p_retire ? 'Retired' : 'Active' },
          error: null,
        })
      }
      return Promise.resolve({ data: null, error: { message: `unhandled rpc: ${name}` } })
    }),
  },
  newClientUuid: () => '00000000-0000-0000-0000-000000000001',
}))

function makeCtx(role: any): ActionContext {
  return {
    userId: 'user-1',
    role,
    isOnline: true,
  }
}

describe('saveMembershipPlan action config', () => {
  beforeEach(() => {
    rpcCalls.length = 0
  })

  it('declares implemented: true and permissions', () => {
    expect(saveMembershipPlanConfig.implemented).toBe(true)
    expect(saveMembershipPlanConfig.permissions).toEqual(['client.update'])
  })

  it('validates level is an allowed membership level', () => {
    expect(() =>
      saveMembershipPlanConfig.validate({
        level: 'InvalidTier',
        label: 'Partner',
        annualFee: 10000,
        individualDiscountPct: 10,
        bundleDiscountPct: 5,
        monthlyBookingLimit: 5,
        simultaneousRentalLimit: 2,
        authorizedUsers: 1,
        defaultCreditLimit: 50000,
      }),
    ).toThrow(/Level must be one of/)
  })

  it('validates label is an allowed membership label', () => {
    expect(() =>
      saveMembershipPlanConfig.validate({
        level: 'Creator',
        label: 'Super VIP',
        annualFee: 10000,
        individualDiscountPct: 10,
        bundleDiscountPct: 5,
        monthlyBookingLimit: 5,
        simultaneousRentalLimit: 2,
        authorizedUsers: 1,
        defaultCreditLimit: 50000,
      }),
    ).toThrow(/Label must be one of/)
  })

  it('enforces discount hard cap of 25% on individual discount', () => {
    expect(() =>
      saveMembershipPlanConfig.validate({
        level: 'Creator',
        label: 'Partner',
        annualFee: 10000,
        individualDiscountPct: 26,
        bundleDiscountPct: 5,
        monthlyBookingLimit: 5,
        simultaneousRentalLimit: 2,
        authorizedUsers: 1,
        defaultCreditLimit: 50000,
      }),
    ).toThrow(/Individual discount cannot exceed 25%/)
  })

  it('enforces discount hard cap of 25% on bundle discount', () => {
    expect(() =>
      saveMembershipPlanConfig.validate({
        level: 'Creator',
        label: 'Partner',
        annualFee: 10000,
        individualDiscountPct: 10,
        bundleDiscountPct: 30,
        monthlyBookingLimit: 5,
        simultaneousRentalLimit: 2,
        authorizedUsers: 1,
        defaultCreditLimit: 50000,
      }),
    ).toThrow(/Bundle discount cannot exceed 25%/)
  })

  it('validates term months is positive integer', () => {
    expect(() =>
      saveMembershipPlanConfig.validate({
        level: 'Creator',
        label: 'Partner',
        annualFee: 10000,
        individualDiscountPct: 10,
        bundleDiscountPct: 5,
        monthlyBookingLimit: 5,
        simultaneousRentalLimit: 2,
        authorizedUsers: 1,
        defaultCreditLimit: 50000,
        termMonths: -1,
      }),
    ).toThrow(/Term months must be a positive integer/)
  })

  it('validates negative fees or negative credit limit', () => {
    expect(() =>
      saveMembershipPlanConfig.validate({
        level: 'Creator',
        label: 'Partner',
        annualFee: -100,
        individualDiscountPct: 10,
        bundleDiscountPct: 5,
        monthlyBookingLimit: 5,
        simultaneousRentalLimit: 2,
        authorizedUsers: 1,
        defaultCreditLimit: 50000,
      }),
    ).toThrow(/Annual fee cannot be negative/)

    expect(() =>
      saveMembershipPlanConfig.validate({
        level: 'Creator',
        label: 'Partner',
        annualFee: 1000,
        individualDiscountPct: 10,
        bundleDiscountPct: 5,
        monthlyBookingLimit: 5,
        simultaneousRentalLimit: 2,
        authorizedUsers: 1,
        defaultCreditLimit: -50,
      }),
    ).toThrow(/Default credit limit cannot be negative/)
  })

  it('refuses Coordinator role with permission error', async () => {
    const input: SaveMembershipPlanInput = {
      level: 'Creator',
      label: 'Partner',
      annualFee: 10000,
      individualDiscountPct: 10,
      bundleDiscountPct: 5,
      monthlyBookingLimit: 5,
      simultaneousRentalLimit: 2,
      authorizedUsers: 1,
      defaultCreditLimit: 50000,
    }

    await expect(saveMembershipPlanConfig.execute(input, makeCtx('Coordinator'))).rejects.toThrow(
      /Only Manager, Admin, or Owner can create or edit membership plans/,
    )
  })

  it('allows Manager to save plan', async () => {
    const input: SaveMembershipPlanInput = {
      level: 'Creator',
      label: 'Partner',
      annualFee: 10000,
      individualDiscountPct: 10,
      bundleDiscountPct: 5,
      monthlyBookingLimit: 5,
      simultaneousRentalLimit: 2,
      authorizedUsers: 1,
      defaultCreditLimit: 50000,
      termMonths: 12,
      perks: ['Priority check-in'],
    }

    const { result } = await saveMembershipPlanConfig.execute(input, makeCtx('Manager'))
    expect(result.ok).toBe(true)
    expect(result.level).toBe('Creator')
    expect(rpcCalls.length).toBe(1)
    expect(rpcCalls[0]?.fn).toBe('save_membership_plan')
    expect(rpcCalls[0]?.args.p_level).toBe('Creator')
    expect(rpcCalls[0]?.args.p_annual_fee).toBe(10000)
  })
})

describe('retireMembershipPlan action config', () => {
  beforeEach(() => {
    rpcCalls.length = 0
  })

  it('validates planId is required', () => {
    expect(() => retireMembershipPlanConfig.validate({ planId: '' })).toThrow(/Membership Plan ID is required/)
  })

  it('refuses Coordinator role with permission error', async () => {
    await expect(
      retireMembershipPlanConfig.execute({ planId: 'plan-1' }, makeCtx('Coordinator')),
    ).rejects.toThrow(/Only Manager, Admin, or Owner can retire or reactivate membership plans/)
  })

  it('allows Manager to retire plan', async () => {
    const { result } = await retireMembershipPlanConfig.execute(
      { planId: 'plan-1', retire: true },
      makeCtx('Manager'),
    )
    expect(result.ok).toBe(true)
    expect(result.status).toBe('Retired')
    expect(rpcCalls[0]?.fn).toBe('retire_membership_plan')
    expect(rpcCalls[0]?.args.p_retire).toBe(true)
  })

  it('allows Manager to reactivate plan', async () => {
    const { result } = await retireMembershipPlanConfig.execute(
      { planId: 'plan-1', retire: false },
      makeCtx('Manager'),
    )
    expect(result.ok).toBe(true)
    expect(result.status).toBe('Active')
    expect(rpcCalls[0]?.fn).toBe('retire_membership_plan')
    expect(rpcCalls[0]?.args.p_retire).toBe(false)
  })
})
