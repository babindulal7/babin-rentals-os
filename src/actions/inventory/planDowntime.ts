import { createAction, type ActionConfig, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { generateClientUuid } from '../../lib/dataAccess'
import { supabase } from '../../lib/supabase'

export const DOWNTIME_REASONS = [
  'Repair',
  'Service or calibration',
  'Our own shoot',
  'Lent to a partner',
  'Marketing shoot',
  'Other',
] as const

export type DowntimeReason = (typeof DOWNTIME_REASONS)[number]

export interface PlanDowntimeInput {
  clientUuid?: string
  assetId?: string | null
  productId?: string | null
  qty?: number
  startAt: string
  endAt: string
  reason: DowntimeReason
  notes?: string | null
}

export interface PlanDowntimeResult {
  success: boolean
  reservationId: string
  idempotent?: boolean
}

export const planDowntimeConfig: ActionConfig<PlanDowntimeInput, PlanDowntimeResult> = {
  name: 'PLAN_DOWNTIME',
  permissions: ['maintenance.create'],
  implemented: true,

  validate: (input) => {
    if (!input.assetId && !input.productId) {
      throw new Error('Either assetId or productId must be provided.')
    }
    if (!input.startAt || !input.endAt) {
      throw new Error('Start date and end date are required.')
    }
    const start = new Date(input.startAt).getTime()
    const end = new Date(input.endAt).getTime()
    if (isNaN(start) || isNaN(end) || start >= end) {
      throw new Error('Start date must be before end date.')
    }
    if (!DOWNTIME_REASONS.includes(input.reason)) {
      throw new Error(`Reason must be one of: ${DOWNTIME_REASONS.join(', ')}`)
    }
    if (input.reason === 'Other' && (!input.notes || input.notes.trim().length < 3)) {
      throw new Error('Notes (at least 3 characters) are required when reason is Other.')
    }
  },

  execute: async (input, _ctx: ActionContext) => {
    const clientUuid = input.clientUuid || generateClientUuid()

    const { data, error } = await supabase.rpc('plan_equipment_downtime', {
      p_client_uuid: clientUuid,
      p_asset_id: input.assetId ?? null,
      p_product_id: input.productId ?? null,
      p_qty: input.qty ?? 1,
      p_start_at: input.startAt,
      p_end_at: input.endAt,
      p_reason: input.reason,
      p_notes: input.notes?.trim() || null,
    })

    if (error) {
      throw new Error(error.message)
    }

    const res = data as unknown as { success: boolean; reservation_id: string; idempotent?: boolean }
    if (!res || !res.success) {
      throw new Error('Failed to plan equipment downtime.')
    }

    return {
      result: {
        success: true,
        reservationId: res.reservation_id,
        ...(res.idempotent !== undefined ? { idempotent: res.idempotent } : {}),
      },
      events: [
        {
          type: EVENT_TYPES.INVENTORY_DOWNTIME_PLANNED,
          payload: {
            reservationId: res.reservation_id,
            assetId: input.assetId ?? null,
            productId: input.productId ?? null,
            reason: input.reason,
            startAt: input.startAt,
            endAt: input.endAt,
          },
        },
      ],
    }
  },
}

export const planDowntime = createAction(planDowntimeConfig)
