import { createAction, type ActionConfig, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { supabase } from '../../lib/supabase'

export type TransportAction = 'assign' | 'dispatch' | 'deliver' | 'fail'

export interface MutateBookingTransportInput {
  transportId: string
  revision: number
  clientUuid: string
  action: TransportAction
  driverId?: string | null | undefined
  recipientName?: string | null | undefined
  note?: string | null | undefined
}

export interface MutateBookingTransportResult {
  id: string
  revision: number
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const mutateBookingTransportConfig: ActionConfig<
  MutateBookingTransportInput,
  MutateBookingTransportResult
> = {
  name: 'MUTATE_BOOKING_TRANSPORT',
  permissions: ['transport.mutate'],
  implemented: true,

  validate: (input) => {
    if (!input.transportId || !UUID_RE.test(input.transportId.trim())) {
      throw new Error('Valid transport ID is required.')
    }
    if (!Number.isInteger(input.revision) || input.revision < 1) {
      throw new Error('Valid transport revision (>= 1) is required.')
    }
    if (!input.clientUuid || !UUID_RE.test(input.clientUuid.trim())) {
      throw new Error('Valid idempotency key is required.')
    }
    if (!['assign', 'dispatch', 'deliver', 'fail'].includes(input.action)) {
      throw new Error(`Invalid transport action: "${input.action}". Expected assign, dispatch, deliver, or fail.`)
    }
    if (input.action === 'assign') {
      if (!input.driverId || !UUID_RE.test(input.driverId.trim())) {
        throw new Error('Driver ID is required for assignment.')
      }
    }
    if (input.action === 'deliver') {
      if (!input.recipientName || input.recipientName.trim().length < 2) {
        throw new Error('Recipient name (minimum 2 characters) is required to complete delivery.')
      }
    }
    if (input.action === 'fail') {
      if (!input.note || input.note.trim().length < 10) {
        throw new Error('Reason for failed delivery (minimum 10 characters) is required.')
      }
    }
  },

  execute: async (input, ctx: ActionContext) => {
    const { data, error } = await supabase.rpc('mutate_booking_transport', {
      p_id: input.transportId.trim(),
      p_revision: input.revision,
      p_key: input.clientUuid.trim(),
      p_action: input.action,
      p_driver: input.driverId?.trim() ?? null,
      p_recipient: input.recipientName?.trim() ?? null,
      p_note: input.note?.trim() ?? null,
    })

    if (error) {
      throw new Error(error.message, { cause: error })
    }

    if (!data || typeof data !== 'object' || !('id' in data) || !('revision' in data)) {
      throw new Error('Database refused transport transition or returned unexpected format.')
    }

    const res = data as { id: string; revision: number }

    return {
      result: {
        id: res.id,
        revision: res.revision,
      },
      events: [
        {
          type: EVENT_TYPES.TRANSPORT_UPDATED,
          payload: {
            transportId: res.id,
            revision: res.revision,
            action: input.action,
            driverId: input.driverId ?? null,
            recipientName: input.recipientName ?? null,
            actorId: ctx.userId,
            actorRole: ctx.role,
            timestamp: new Date().toISOString(),
          },
        },
      ],
    }
  },
}

export const mutateBookingTransport = createAction<
  MutateBookingTransportInput,
  MutateBookingTransportResult
>(mutateBookingTransportConfig)
