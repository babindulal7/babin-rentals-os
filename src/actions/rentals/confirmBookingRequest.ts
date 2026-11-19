/**
 * src/actions/rentals/confirmBookingRequest.ts
 *
 * Confirms an online booking request and associates it with a confirmed booking (T7-04).
 * Callable by Coordinator+.
 */

import { createAction } from '../core'
import { supabase } from '@/lib/supabase'

export interface ConfirmBookingRequestInput {
  requestId: string
  bookingId: string
}

export interface ConfirmBookingRequestOutput {
  success: boolean
  requestId: string
  bookingId: string
  alreadyConfirmed?: boolean
}

export const confirmBookingRequest = createAction<ConfirmBookingRequestInput, ConfirmBookingRequestOutput>({
  name: 'confirmBookingRequest',
  permissions: ['rental.create'],
  implemented: true,

  validate(input) {
    if (!input.requestId || !input.bookingId) {
      throw new Error('Both request ID and booking ID are required.')
    }
  },

  async execute(input, ctx) {
    if (!['Owner', 'Admin', 'Manager', 'Coordinator'].includes(ctx.role)) {
      throw new Error('Only coordinator or higher can confirm online requests.')
    }

    const isMock = import.meta.env.VITE_DATA_SOURCE === 'mock' || !supabase
    if (isMock) {
      return {
        result: {
          success: true,
          requestId: input.requestId,
          bookingId: input.bookingId,
        },
        events: [],
      }
    }

    const { data, error } = await supabase.rpc('confirm_booking_request', {
      p_request_id: input.requestId,
      p_booking_id: input.bookingId,
    })

    if (error || !data) {
      throw new Error(error?.message || 'Failed to confirm booking request.')
    }

    const res = data as Record<string, unknown>
    return {
      result: {
        success: Boolean(res.success),
        requestId: String(res.request_id),
        bookingId: String(res.booking_id),
        alreadyConfirmed: Boolean(res.already_confirmed),
      },
      events: [],
    }
  },
})
