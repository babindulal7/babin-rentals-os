import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listMembers, listMembershipPlans } from '../membership'

const state = vi.hoisted(() => ({ mode: 'rows' as 'rows' | 'empty' | 'error' }))

vi.mock('../../supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'membership_plans_v') {
        const queryPromise = Promise.resolve({ data: [{ id: 'plan-1', level: 'Creator' }], error: null })
        const selectObj = Object.assign(queryPromise, {
          order: vi.fn().mockImplementation(() => {
            if (state.mode === 'error') return Promise.resolve({ data: null, error: new Error('permission denied') })
            if (state.mode === 'empty') return Promise.resolve({ data: [], error: null })
            return Promise.resolve({
              data: [
                {
                  id: 'plan-1',
                  client_uuid: '00000000-0000-0000-0000-000000000001',
                  level: 'Academy',
                  label: 'Access Member',
                  annual_fee: 6000,
                  individual_discount_pct: 10,
                  bundle_discount_pct: 5,
                  monthly_booking_limit: 3,
                  simultaneous_rental_limit: 2,
                  authorized_users: 1,
                  default_credit_limit: 0,
                  term_months: 12,
                  perks: ['Priority Booking'],
                  display_order: 1,
                  status: 'Active',
                  retired_at: null,
                  created_at: '2026-01-01T00:00:00Z',
                  updated_at: '2026-01-01T00:00:00Z',
                },
              ],
              error: null,
            })
          }),
        })
        return {
          select: vi.fn().mockReturnValue(selectObj),
        }
      }
      if (table === 'client_memberships_v') return {
        select: () => ({
          is: () => ({
            order: () => ({
              range: vi.fn().mockImplementation(() => state.mode === 'error'
                ? { data: null, error: new Error('permission denied') }
                : { data: state.mode === 'empty' ? [] : [{ id: 'membership-1', client_id: 'client-1', plan_id: 'plan-1', join_date: '2026-02-10', fee_paid: 1250 }], error: null }),
            }),
          }),
        }),
      }
      if (table === 'clients_v') return {
        select: () => ({
          in: vi.fn().mockResolvedValue({ data: [{ id: 'client-1', name: 'Asha Rai', type_parent: 'Individual' }], error: null }),
        }),
      }
      throw new Error(`Unexpected table: ${table}`)
    }),
  },
}))

describe('listMembers', () => {
  beforeEach(() => { state.mode = 'rows' })

  it('maps a current membership using its client and plan', async () => {
    const rows = await listMembers()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 'membership-1', clientId: 'client-1', name: 'Asha Rai',
      level: 'Creator', joinedIso: '2026-02-10', feePaidPaisa: 125000,
    })
  })

  it('returns an honest empty list when the table is empty', async () => {
    state.mode = 'empty'
    await expect(listMembers()).resolves.toEqual([])
  })

  it('surfaces a read error instead of reporting zero members', async () => {
    state.mode = 'error'
    await expect(listMembers()).rejects.toThrow(/permission denied/)
  })
})

describe('listMembershipPlans', () => {
  beforeEach(() => { state.mode = 'rows' })

  it('maps membership plans ordered by display_order', async () => {
    const plans = await listMembershipPlans()
    expect(plans).toHaveLength(1)
    expect(plans[0]).toMatchObject({
      id: 'plan-1',
      level: 'Academy',
      label: 'Access Member',
      annualFee: 6000,
      individualDiscountPct: 10,
      bundleDiscountPct: 5,
      status: 'Active',
    })
  })

  it('returns empty list when no plans exist', async () => {
    state.mode = 'empty'
    await expect(listMembershipPlans()).resolves.toEqual([])
  })

  it('rejects on database error', async () => {
    state.mode = 'error'
    await expect(listMembershipPlans()).rejects.toThrow(/permission denied/)
  })
})
