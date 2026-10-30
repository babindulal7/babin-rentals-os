import { createAction, type ActionConfig, type ActionContext } from '../core'
import { supabase } from '../../lib/supabase'
import { generateClientUuid } from '../../lib/dataAccess'

export interface CreateHoldInput {
  bookingId: string
  bookingLineId: string
  assetId?: string | null
  productId?: string | null
  qty?: number
  durationMinutes?: number
  clientUuid?: string
}

export interface CreateHoldResult {
  success: true
  reservationId: string
  holdState: 'active_hold'
  expiresAt: string
  qty: number
}

export const createHoldConfig: ActionConfig<CreateHoldInput, CreateHoldResult> = {
  name: 'INVENTORY_HOLD_CREATE',
  permissions: ['rental.draft'],
  implemented: true,

  validate: (input) => {
    if (!input.bookingId) throw new Error('bookingId is required to place a hold')
    if (!input.bookingLineId) throw new Error('bookingLineId is required to place a hold')
    if (!input.assetId && !input.productId) {
      throw new Error('Either assetId or productId must be provided to place a hold')
    }
  },

  execute: async (input, ctx: ActionContext) => {
    const clientUuid = input.clientUuid ?? generateClientUuid()
    const duration = input.durationMinutes ?? 240 // 4 hours default

    const { data, error } = await supabase.rpc('create_or_extend_hold', {
      p_booking_id: input.bookingId,
      p_booking_line_id: input.bookingLineId,
      p_asset_id: input.assetId ?? null,
      p_product_id: input.productId ?? null,
      p_qty: input.qty ?? 1,
      p_duration_minutes: duration,
      p_client_uuid: clientUuid,
      p_actor_id: ctx.userId,
    })

    if (error) {
      throw new Error(`Failed to place inventory hold: ${error.message}`)
    }

    const res = data as unknown as { success: boolean; reservation_id: string; hold_state: string; expires_at: string; qty: number }
    return {
      result: {
        success: true as const,
        reservationId: res.reservation_id,
        holdState: 'active_hold' as const,
        expiresAt: res.expires_at,
        qty: res.qty,
      },
    }
  },
}

export const createHold = createAction(createHoldConfig)

export interface ReleaseHoldInput {
  reservationId: string
  reason?: string
}

export interface ReleaseHoldResult {
  success: true
  reservationId: string
}

export const releaseHoldConfig: ActionConfig<ReleaseHoldInput, ReleaseHoldResult> = {
  name: 'INVENTORY_HOLD_RELEASE',
  permissions: ['rental.draft'],
  implemented: true,

  validate: (input) => {
    if (!input.reservationId) throw new Error('reservationId is required to release a hold')
  },

  execute: async (input, ctx: ActionContext) => {
    const { data, error } = await supabase.rpc('release_hold', {
      p_reservation_id: input.reservationId,
      p_reason: input.reason ?? 'Released manually by staff',
      p_actor_id: ctx.userId,
    })

    if (error) {
      throw new Error(`Failed to release inventory hold: ${error.message}`)
    }

    const res = data as unknown as { success: boolean; reservation_id: string }
    if (!res.success) {
      throw new Error('Hold could not be released or was already released.')
    }

    return {
      result: {
        success: true as const,
        reservationId: input.reservationId,
      },
    }
  },
}

export const releaseHold = createAction(releaseHoldConfig)
