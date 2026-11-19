import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createCounterSaleConfig } from '../createCounterSale'
import { cancelCounterSaleConfig } from '../cancelCounterSale'

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

describe('T3-31 Counter Sale Actions', () => {
  beforeEach(() => {
    db.state.rpcResult = null
    db.state.rpcError = null
    db.state.rpcCalls = []
  })

  describe('createCounterSaleConfig', () => {
    it('declares permissions and implemented', () => {
      expect(createCounterSaleConfig.implemented).toBe(true)
      expect(createCounterSaleConfig.permissions).toEqual(['rental.create'])
    })

    it('validates client ID is a valid UUID', () => {
      expect(() =>
        createCounterSaleConfig.validate?.(
          {
            clientId: 'bad-client',
            lines: [{ productId: '11111111-1111-4111-8111-111111111111', qty: 1 }],
          },
          {} as never,
        ),
      ).toThrow(/A valid client UUID is required/)
    })

    it('validates at least one line is required', () => {
      expect(() =>
        createCounterSaleConfig.validate?.(
          {
            clientId: '00000000-0000-4000-8000-00000000f201',
            lines: [],
          },
          {} as never,
        ),
      ).toThrow(/At least one consumable item must be added/)
    })

    it('validates product UUID and positive integer quantity', () => {
      expect(() =>
        createCounterSaleConfig.validate?.(
          {
            clientId: '00000000-0000-4000-8000-00000000f201',
            lines: [{ productId: 'invalid', qty: 1 }],
          },
          {} as never,
        ),
      ).toThrow(/valid product UUID/)

      expect(() =>
        createCounterSaleConfig.validate?.(
          {
            clientId: '00000000-0000-4000-8000-00000000f201',
            lines: [{ productId: '11111111-1111-4111-8111-111111111111', qty: 0 }],
          },
          {} as never,
        ),
      ).toThrow(/Quantity must be a positive integer/)
    })

    it('executes create_counter_sale RPC and returns result', async () => {
      db.state.rpcResult = {
        booking_id: 'b1111111-1111-4111-8111-111111111111',
        booking_no: 'BK-2026-CS01',
        invoice_id: 'i1111111-1111-4111-8111-111111111111',
        line_count: 1,
        total_amount: 800,
      }

      const res = await createCounterSaleConfig.execute(
        {
          clientId: '00000000-0000-4000-8000-00000000f201',
          notes: 'Walk-in cash buy',
          lines: [{ productId: '11111111-1111-4111-8111-111111111111', qty: 2 }],
        },
        { userId: 'u1111111-1111-4111-8111-111111111111' } as never,
      )

      expect(db.state.rpcCalls).toHaveLength(1)
      expect(db.state.rpcCalls[0]?.fn).toBe('create_counter_sale')
      expect(res.result.success).toBe(true)
      expect(res.result.bookingId).toBe('b1111111-1111-4111-8111-111111111111')
      expect(res.result.bookingNo).toBe('BK-2026-CS01')
      expect(res.result.totalAmount).toBe(800)
      expect(res.events?.[0]?.type).toBe('rental.counter_sale_created')
    })
  })

  describe('cancelCounterSaleConfig', () => {
    it('declares permissions and implemented', () => {
      expect(cancelCounterSaleConfig.implemented).toBe(true)
      expect(cancelCounterSaleConfig.permissions).toEqual(['rental.cancel'])
    })

    it('validates booking ID UUID', () => {
      expect(() =>
        cancelCounterSaleConfig.validate?.(
          { bookingId: 'bad', reason: 'Customer changed mind' },
          {} as never,
        ),
      ).toThrow(/A valid booking UUID is required/)
    })

    it('validates reason at least 10 characters', () => {
      expect(() =>
        cancelCounterSaleConfig.validate?.(
          { bookingId: '00000000-0000-4000-8000-00000000f201', reason: 'too short' },
          {} as never,
        ),
      ).toThrow(/at least 10 characters/)
    })

    it('executes cancel_counter_sale RPC and returns result', async () => {
      db.state.rpcResult = {
        booking_id: 'b1111111-1111-4111-8111-111111111111',
        cancelled_at: '2026-11-19T12:00:00Z',
        restored: true,
      }

      const res = await cancelCounterSaleConfig.execute(
        {
          bookingId: 'b1111111-1111-4111-8111-111111111111',
          reason: 'Customer walked out without paying',
        },
        { userId: 'u1111111-1111-4111-8111-111111111111' } as never,
      )

      expect(db.state.rpcCalls).toHaveLength(1)
      expect(db.state.rpcCalls[0]?.fn).toBe('cancel_counter_sale')
      expect(res.result.success).toBe(true)
      expect(res.result.restored).toBe(true)
      expect(res.events?.[0]?.type).toBe('rental.counter_sale_cancelled')
    })
  })
})
