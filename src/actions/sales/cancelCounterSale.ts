import { createAction, type ActionConfig, type ActionContext } from '../core'
import { supabase } from '../../lib/supabase'

export interface CancelCounterSaleInput {
  bookingId: string
  reason: string
}

export interface CancelCounterSaleResult {
  success: true
  bookingId: string
  status: 'cancelled' | 'already_cancelled'
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const cancelCounterSaleConfig: ActionConfig<CancelCounterSaleInput, CancelCounterSaleResult> = {
  name: 'CANCEL_COUNTER_SALE',
  permissions: ['sales.cancel'],
  implemented: true,

  validate: (input) => {
    if (!input.bookingId || !UUID_RE.test(input.bookingId)) {
      throw new Error('A valid booking UUID is required.')
    }
    if (!input.reason || input.reason.trim().length === 0) {
      throw new Error('A cancellation reason is required.')
    }
  },

  execute: async (input, ctx: ActionContext) => {
    const { data, error } = await supabase.rpc('cancel_counter_sale', {
      p_booking_id: input.bookingId,
      p_reason: input.reason.trim(),
      p_actor_id: ctx.userId,
    })

    if (error) {
      throw new Error(`Failed to cancel counter sale: ${error.message}`)
    }

    const res = data as Record<string, unknown>
    const result: CancelCounterSaleResult = {
      success: true,
      bookingId: input.bookingId,
      status: (res['status'] as 'cancelled' | 'already_cancelled') ?? 'cancelled',
    }

    return {
      result,
      events: [],
    }
  },
}

export const cancelCounterSale = createAction(cancelCounterSaleConfig)
