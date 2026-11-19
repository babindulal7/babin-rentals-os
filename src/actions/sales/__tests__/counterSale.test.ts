import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createCounterSaleConfig, type CreateCounterSaleInput } from '../createCounterSale'
import { cancelCounterSaleConfig, type CancelCounterSaleInput } from '../cancelCounterSale'
import type { ActionContext } from '../../core'

const db = vi.hoisted(() => {
  const state = {
    rpcResult: null as Record<string, unknown> | null,
    rpcError: null as { message: string } | null,
    rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  }

  return {
    state,
    supabase: {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        state.rpcCalls.push({ fn, args })
        if (state.rpcError) {
          return { data: null, error: state.rpcError }
        }
        return { data: state.rpcResult, error: null }
      },
    },
  }
})

vi.mock('../../../lib/supabase', () => ({
  supabase: db.supabase,
  newClientUuid: () => '99999999-9999-4999-8999-999999999999',
}))

describe('CREATE_COUNTER_SALE action', () => {
  const CTX: ActionContext = {
    userId: '11111111-1111-4111-8111-111111111111',
    role: 'Warehouse',
    isOnline: true,
  }

  beforeEach(() => {
    db.state.rpcResult = {
      booking_id: '22222222-2222-4222-8222-222222222222',
      booking_no: 'B-101',
      booking_kind: 'counter_sale',
      stage: 'Booked',
      line_count: 1,
      client_uuid: '33333333-3333-4333-8333-333333333333',
      status: 'created',
    }
    db.state.rpcError = null
    db.state.rpcCalls = []
  })

  it('declares implemented: true and permissions: [sales.create]', () => {
    expect(createCounterSaleConfig.implemented).toBe(true)
    expect(createCounterSaleConfig.permissions).toEqual(['sales.create'])
  })

  it('validates input requires lines', () => {
    expect(() => createCounterSaleConfig.validate!({ lines: [] })).toThrow(
      /At least one consumable item is required/
    )
  })

  it('validates line quantity must be a positive integer', () => {
    expect(() =>
      createCounterSaleConfig.validate!({
        lines: [{ productId: '44444444-4444-4444-8444-444444444444', qty: 0 }],
      })
    ).toThrow(/Quantity must be a positive integer/)
  })

  it('executes create_counter_sale RPC and returns result', async () => {
    const input: CreateCounterSaleInput = {
      lines: [{ productId: '44444444-4444-4444-8444-444444444444', qty: 3 }],
    }
    const res = await createCounterSaleConfig.execute(input, CTX)
    expect(db.state.rpcCalls).toHaveLength(1)
    expect(db.state.rpcCalls[0]?.fn).toBe('create_counter_sale')
    expect(res.result.bookingId).toBe('22222222-2222-4222-8222-222222222222')
    expect(res.result.bookingNo).toBe('B-101')
    expect(res.result.bookingKind).toBe('counter_sale')
  })

  it('rejects execution when RPC rejects actor spoofing', async () => {
    db.state.rpcError = {
      message: 'GATE:gate.counter_sale.actor_mismatch|Permission denied: actor must match the signed-in staff session.',
    }
    const input: CreateCounterSaleInput = {
      lines: [{ productId: '44444444-4444-4444-8444-444444444444', qty: 1 }],
    }
    await expect(createCounterSaleConfig.execute(input, CTX)).rejects.toThrow(
      /actor must match the signed-in staff session/
    )
  })
})

describe('CANCEL_COUNTER_SALE action', () => {
  const CTX: ActionContext = {
    userId: '11111111-1111-4111-8111-111111111111',
    role: 'Coordinator',
    isOnline: true,
  }

  beforeEach(() => {
    db.state.rpcResult = {
      booking_id: '22222222-2222-4222-8222-222222222222',
      status: 'cancelled',
    }
    db.state.rpcError = null
    db.state.rpcCalls = []
  })

  it('declares implemented: true and permissions: [sales.cancel]', () => {
    expect(cancelCounterSaleConfig.implemented).toBe(true)
    expect(cancelCounterSaleConfig.permissions).toEqual(['sales.cancel'])
  })

  it('validates required bookingId and reason', () => {
    expect(() =>
      cancelCounterSaleConfig.validate!({ bookingId: '', reason: 'test' })
    ).toThrow(/A valid booking UUID is required/)
    expect(() =>
      cancelCounterSaleConfig.validate!({
        bookingId: '22222222-2222-4222-8222-222222222222',
        reason: '',
      })
    ).toThrow(/A cancellation reason is required/)
  })

  it('executes cancel_counter_sale RPC', async () => {
    const input: CancelCounterSaleInput = {
      bookingId: '22222222-2222-4222-8222-222222222222',
      reason: 'Walk-in cancelled before paying',
    }
    const res = await cancelCounterSaleConfig.execute(input, CTX)
    expect(db.state.rpcCalls).toHaveLength(1)
    expect(db.state.rpcCalls[0]?.fn).toBe('cancel_counter_sale')
    expect(res.result.status).toBe('cancelled')
  })

  it('rejects execution when cancel RPC rejects actor spoofing', async () => {
    db.state.rpcError = {
      message: 'GATE:gate.counter_sale.actor_mismatch|Permission denied: actor must match the signed-in staff session.',
    }
    const input: CancelCounterSaleInput = {
      bookingId: '22222222-2222-4222-8222-222222222222',
      reason: 'Spoofed cancel attempt',
    }
    await expect(cancelCounterSaleConfig.execute(input, CTX)).rejects.toThrow(
      /actor must match the signed-in staff session/
    )
  })
})
