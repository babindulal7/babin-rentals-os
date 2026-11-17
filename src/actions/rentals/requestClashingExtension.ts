import { createAction, type ActionConfig, type ActionContext } from '../core'
import { supabase } from '../../lib/supabase'

export interface RequestClashingExtensionInput {
  bookingId: string
  days: number
  pricingOption?: 'same_rate' | 'standard_rate'
  reason: string
  conflictingBookingId?: string | null
  conflictingAssetId?: string | null
  conflictingProductId?: string | null
  clientUuid?: string | null
}

export interface RequestClashingExtensionResult {
  success: boolean
  clashId: string
  status: string
  alreadyExisted?: boolean | undefined
}

export const requestClashingExtensionConfig: ActionConfig<
  RequestClashingExtensionInput,
  RequestClashingExtensionResult
> = {
  name: 'REQUEST_CLASHING_EXTENSION',
  permissions: ['rental.extend_clash_request'],
  implemented: true,

  validate: (input) => {
    if (!input.bookingId || !input.bookingId.trim()) {
      throw new Error('Booking ID is required.')
    }
    if (!Number.isInteger(input.days) || input.days < 1) {
      throw new Error('Requested extension days must be a whole number of at least 1.')
    }
    if (!input.reason || input.reason.trim().length < 10) {
      throw new Error('Extension reason of at least 10 characters is required.')
    }
  },

  execute: async (input, _ctx: ActionContext) => {
    const clientUuid = input.clientUuid || crypto.randomUUID()

    const { data, error } = await supabase.rpc('request_clashing_extension', {
      p_payload: {
        booking_id: input.bookingId.trim(),
        requested_days: input.days,
        pricing_option: input.pricingOption ?? 'same_rate',
        reason: input.reason.trim(),
        conflicting_booking_id: input.conflictingBookingId ?? null,
        conflicting_asset_id: input.conflictingAssetId ?? null,
        conflicting_product_id: input.conflictingProductId ?? null,
        client_uuid: clientUuid,
      },
    })

    if (error) {
      throw new Error(`Failed to request clashing extension: ${error.message}`)
    }

    const res = data as {
      success: boolean
      clash_id: string
      status: string
      already_existed?: boolean
    }

    return {
      result: {
        success: res.success,
        clashId: res.clash_id,
        status: res.status,
        alreadyExisted: res.already_existed,
      },
      events: [
        {
          type: 'RENTAL_EXTENSION_CLASH_REQUESTED',
          payload: {
            clashId: res.clash_id,
            bookingId: input.bookingId,
            days: input.days,
          },
        },
      ],
    }
  },
}

export const requestClashingExtension = createAction<
  RequestClashingExtensionInput,
  RequestClashingExtensionResult
>(requestClashingExtensionConfig)
