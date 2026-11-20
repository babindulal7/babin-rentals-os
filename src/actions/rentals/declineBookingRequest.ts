/**
 * src/actions/rentals/declineBookingRequest.ts
 *
 * Declines an online booking request with a client-visible reason (T7-04).
 * Callable by Coordinator+.
 */

import { createAction } from '../core'
import { supabase } from '@/lib/supabase'

export interface DeclineBookingRequestInput {
  requestId: string
  reason: string
}

export interface DeclineBookingRequestOutput {
  success: boolean
  requestId: string
  status: string
}

export const declineBookingRequest = createAction<DeclineBookingRequestInput, DeclineBookingRequestOutput>({
  name: 'declineBookingRequest',
  permissions: ['rental.create'],
  implemented: true,

  validate(input) {
    if (!input.requestId) {
      throw new Error('Request ID is required.')
    }
    if (!input.reason || !input.reason.trim()) {
      throw new Error('A reason is required to decline a request.')
    }
  },

  async execute(input, ctx) {
    if (!['Owner', 'Admin', 'Manager', 'Coordinator'].includes(ctx.role)) {
      throw new Error('Only coordinator or higher can decline online requests.')
    }

    const isMock = import.meta.env.VITE_DATA_SOURCE === 'mock' || import.meta.env.MODE === 'test' || !supabase
    if (isMock) {
      return {
        result: {
          success: true,
          requestId: input.requestId,
          status: 'declined',
        },
        events: [],
      }
    }

    const { data, error } = await supabase.rpc('decline_booking_request', {
      p_request_id: input.requestId,
      p_reason: input.reason.trim(),
    })

    if (error || !data) {
      throw new Error(error?.message || 'Failed to decline booking request.')
    }

    const res = data as Record<string, unknown>
    return {
      result: {
        success: Boolean(res.success),
        requestId: String(res.request_id),
        status: String(res.status),
      },
      events: [],
    }
  },
})
