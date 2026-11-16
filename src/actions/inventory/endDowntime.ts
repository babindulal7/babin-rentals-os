import { createAction, type ActionConfig, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { generateClientUuid } from '../../lib/dataAccess'
import { supabase } from '../../lib/supabase'

export interface EndDowntimeInput {
  reservationId: string
  clientUuid?: string
}

export interface EndDowntimeResult {
  success: boolean
  alreadyEnded?: boolean
  endedAt?: string
}

export const endDowntimeConfig: ActionConfig<EndDowntimeInput, EndDowntimeResult> = {
  name: 'END_DOWNTIME',
  permissions: ['maintenance.create'],
  implemented: true,

  validate: (input) => {
    if (!input.reservationId || input.reservationId.trim().length === 0) {
      throw new Error('Reservation ID is required.')
    }
  },

  execute: async (input, _ctx: ActionContext) => {
    const clientUuid = input.clientUuid || generateClientUuid()

    const { data, error } = await supabase.rpc('end_equipment_downtime' as never, {
      p_reservation_id: input.reservationId,
      p_client_uuid: clientUuid,
    } as never)

    if (error) {
      throw new Error(error.message)
    }

    const res = data as unknown as { success: boolean; already_ended?: boolean; ended_at?: string }
    if (!res || !res.success) {
      throw new Error('Failed to end equipment downtime.')
    }

    return {
      result: {
        success: true,
        ...(res.already_ended !== undefined ? { alreadyEnded: res.already_ended } : {}),
        ...(res.ended_at ? { endedAt: res.ended_at } : {}),
      },
      events: [
        {
          type: EVENT_TYPES.INVENTORY_DOWNTIME_ENDED,
          payload: {
            reservationId: input.reservationId,
            endedAt: res.ended_at,
          },
        },
      ],
    }
  },
}

export const endDowntime = createAction(endDowntimeConfig)
