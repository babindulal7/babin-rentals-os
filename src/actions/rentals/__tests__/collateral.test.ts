import { describe, it, expect, beforeEach, vi } from 'vitest'
import { receiveCollateral, receiveCollateralConfig } from '../receiveCollateral'
import { returnCollateral, returnCollateralConfig } from '../returnCollateral'
import type { ActionContext } from '../../core'

const db = vi.hoisted(() => {
  const state = {
    booking: { id: 'booking-1', branch_id: 'branch-1' } as { id: string; branch_id: string } | null,
    collaterals: [] as Array<Record<string, unknown>>,
    inserted: { id: 'col-1' } as { id: string } | null,
    insertError: null as { message: string } | null,
    updateError: null as { message: string } | null,
  }

  const queryBuilder = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockImplementation(async () => {
          if (state.insertError) return { data: null, error: state.insertError }
          return { data: state.inserted, error: null }
        }),
      }),
    })),
    update: vi.fn().mockImplementation(() => ({
      eq: vi.fn().mockImplementation(async () => {
        if (state.updateError) return { error: state.updateError }
        return { error: null }
      }),
    })),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockImplementation(async () => ({
      data: state.booking,
      error: null,
    })),
    then: vi.fn().mockImplementation((resolve) => resolve({ data: state.collaterals, error: null })),
  }

  return {
    state,
    supabase: {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'bookings') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: async () => ({ data: state.booking, error: null }),
              }),
            }),
          }
        }
        if (table === 'collateral_documents') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockImplementation(() => ({
                  eq: vi.fn().mockImplementation(async () => ({ data: state.collaterals, error: null })),
                  then: (resolve: (v: unknown) => unknown) => resolve({ data: state.collaterals, error: null }),
                })),
              }),
            }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: async () => {
                  if (state.insertError) return { data: null, error: state.insertError }
                  return { data: state.inserted, error: null }
                },
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: async () => {
                if (state.updateError) return { error: state.updateError }
                return { error: null }
              },
            }),
          }
        }
        return queryBuilder
      }),
    },
  }
})

vi.mock('../../../lib/supabase', () => ({
  supabase: db.supabase,
}))

vi.mock('../../../lib/audit', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../lib/dataAccess', () => ({
  generateClientUuid: () => '00000000-0000-4000-8000-000000000001',
}))

describe('Collateral Actions (D1, T2-03)', () => {
  beforeEach(() => {
    db.state.booking = { id: 'booking-1', branch_id: 'branch-1' }
    db.state.collaterals = [{ id: 'col-1', collateral_type: 'citizenship_card' }]
    db.state.inserted = { id: 'col-1' }
    db.state.insertError = null
    db.state.updateError = null
  })

  it('declares capability and implemented: true for receive and return', () => {
    expect(receiveCollateralConfig.implemented).toBe(true)
    expect(receiveCollateralConfig.capability).toBe('collateral.receive')
    expect(returnCollateralConfig.implemented).toBe(true)
    expect(returnCollateralConfig.capability).toBe('collateral.return')
  })

  it('receiveCollateral requires an authenticated context', async () => {
    const unauthCtx: ActionContext = { userId: '', role: 'Warehouse' }
    await expect(
      receiveCollateral(
        { bookingId: 'b-1', collateralType: 'citizenship_card', documentNumber: '123' },
        unauthCtx,
      ),
    ).rejects.toThrow(/active authenticated session is required/)
  })

  it('receiveCollateral rejects unauthorized roles', async () => {
    const clientCtx: ActionContext = { userId: 'u-client', role: 'Client' }
    await expect(
      receiveCollateral(
        { bookingId: 'b-1', collateralType: 'citizenship_card', documentNumber: '123' },
        clientCtx,
      ),
    ).rejects.toThrow(/not permitted to receive collateral/)
  })

  it('receiveCollateral requires document number', async () => {
    const ctx: ActionContext = { userId: 'u-1', role: 'Warehouse' }
    await expect(
      receiveCollateral(
        { bookingId: 'b-1', collateralType: 'citizenship_card', documentNumber: '  ' },
        ctx,
      ),
    ).rejects.toThrow(/document number is required/)
  })

  it('receiveCollateral succeeds with valid input and records collateral', async () => {
    const ctx: ActionContext = { userId: 'u-1', role: 'Warehouse' }
    const res = await receiveCollateral(
      { bookingId: 'booking-1', collateralType: 'passport', documentNumber: 'PA123456' },
      ctx,
    )
    expect(res.success).toBe(true)
    expect(res.collateralId).toBe('col-1')
    expect(res.collateralType).toBe('passport')
  })

  it('returnCollateral rejects unauthorized roles', async () => {
    const clientCtx: ActionContext = { userId: 'u-client', role: 'Client' }
    await expect(
      returnCollateral(
        { bookingId: 'b-1', collateralId: 'col-1' },
        clientCtx,
      ),
    ).rejects.toThrow(/not permitted to return collateral/)
  })

  it('returnCollateral succeeds for authorized roles', async () => {
    const ctx: ActionContext = { userId: 'u-1', role: 'Warehouse' }
    const res = await returnCollateral(
      { bookingId: 'booking-1', collateralId: 'col-1', notes: 'Handed back' },
      ctx,
    )
    expect(res.success).toBe(true)
    expect(res.collateralId).toBe('col-1')
    expect(res.returnedAt).toBeDefined()
  })
})
