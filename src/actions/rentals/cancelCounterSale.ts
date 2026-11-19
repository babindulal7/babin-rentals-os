import { createAction, type ActionConfig, type ActionContext } from '../core'
import { supabase } from '../../lib/supabase'

export type CancelCounterSaleInput = {
  bookingId: string
  reason: string
}

export type CancelCounterSaleResult = {
  success: true
  bookingId: string
  cancelledAt: string
  restored: boolean
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const cancelCounterSaleConfig: ActionConfig<CancelCounterSaleInput, CancelCounterSaleResult> = {
  name: 'CANCEL_COUNTER_SALE',
  permissions: ['rental.cancel'],
  implemented: true,

  validate: (input) => {
    if (!input.bookingId || !UUID_RE.test(input.bookingId)) {
      throw new Error('A valid booking UUID is required.')
    }
    if (!input.reason || input.reason.trim().length < 10) {
      throw new Error('A cancellation reason of at least 10 characters is required.')
    }
  },

  execute: async (input, ctx: ActionContext) => {
    const { data, error } = await supabase.rpc('cancel_counter_sale', {
      p_payload: {
        booking_id: input.bookingId,
        reason: input.reason.trim(),
      },
    })

    if (error) {
      throw new Error(error.message)
    }

    const res = (data ?? {}) as Record<string, unknown>
    const result: CancelCounterSaleResult = {
      success: true,
      bookingId: String(res['booking_id'] ?? input.bookingId),
      cancelledAt: String(res['cancelled_at'] ?? new Date().toISOString()),
      restored: Boolean(res['restored']),
    }

    return {
      result,
      events: [
        {
          type: 'rental.counter_sale_cancelled',
          payload: {
            bookingId: result.bookingId,
            reason: input.reason.trim(),
            userId: ctx.userId,
          },
        },
      ],
    }
  },
}

export const cancelCounterSale = createAction(cancelCounterSaleConfig)
