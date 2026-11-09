import { createAction, type ActionConfig } from '../core'
import { newClientUuid, supabase } from '../../lib/supabase'
import type { BookingChangeSnapshot } from '../../lib/queries/changeBooking'
import { bookingChangePayload } from '../../lib/queries/changeBooking'
import type { RentalDraftData } from './saveDraft'
import type { Paisa } from '../../lib/money'

export interface ChangeBookingInput {
  bookingId: string
  expectedRevision: string
  clientUuid: string
  draft: RentalDraftData
  snapshot: BookingChangeSnapshot
  depositPaisa: Paisa
  reason?: string
}

export interface BookingChangeSaveAttempt {
  fingerprint: string
  input: ChangeBookingInput
}

/** Keep the entire request stable after an uncertain response, including new line keys. */
export function prepareBookingChangeSave(
  input: Omit<ChangeBookingInput, 'clientUuid'>,
  previous: BookingChangeSaveAttempt | null,
): BookingChangeSaveAttempt {
  const fingerprint = JSON.stringify(input)
  if (previous?.fingerprint === fingerprint) return previous
  return {
    fingerprint,
    input: {
      ...input,
      clientUuid: newClientUuid(),
      draft: {
        ...input.draft,
        lines: input.draft.lines.map((line) => ({
          ...line,
          clientUuid: line.clientUuid || newClientUuid(),
        })),
      },
    },
  }
}

export const changeBookingConfig: ActionConfig<ChangeBookingInput, BookingChangeSnapshot> = {
  name: 'CHANGE_BOOKING',
  permissions: ['rental.change'],
  implemented: true,
  validate(input) {
    if (!input.bookingId || !input.expectedRevision || !input.clientUuid || input.snapshot.id !== input.bookingId) {
      throw new Error('Reload the booking before editing.')
    }
  },
  async execute(input, ctx) {
    if (!['Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'].includes(ctx.role)) {
      throw new Error('You cannot edit this booking.')
    }
    if (ctx.isOnline === false) {
      throw new Error('Connect to save this booking. Your changes are still here.')
    }
    const payload = bookingChangePayload(input.draft, input.snapshot, input.depositPaisa, input.reason)
    const { data, error } = await supabase.rpc('change_booking', {
      p_payload: {
        booking_id: input.bookingId,
        revision: input.expectedRevision,
        client_uuid: input.clientUuid,
        actor_id: ctx.userId,
        ...payload,
      },
    })
    if (error) throw new Error(error.message)
    if (!data || typeof data !== 'object' || !('revision' in data)) {
      throw new Error('The save was not confirmed. Retry without leaving this page.')
    }
    return {
      result: data as BookingChangeSnapshot,
      events: [
        {
          type: 'RENTAL_CHANGED',
          payload: { bookingId: input.bookingId, bookingNo: (data as BookingChangeSnapshot).code, stage: (data as BookingChangeSnapshot).stage },
        },
      ],
    }
  },
}

export const changeBooking = createAction(changeBookingConfig)
