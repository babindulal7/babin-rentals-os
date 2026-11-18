import { createAction, type ActionConfig } from '../core'
import { newClientUuid, supabase } from '../../lib/supabase'
import type { QuoteSnapshot } from '../../lib/queries/quoteEditor'
import { quoteUpdatePayload } from '../../lib/queries/quoteEditor'
import type { RentalDraftData } from './saveDraft'
import type { Paisa } from '../../lib/money'

export interface ChangeBookingInput {
  bookingId: string
  expectedRevision: string
  clientUuid: string
  draft: RentalDraftData
  snapshot: QuoteSnapshot
  depositPaisa: Paisa
}

export interface BookingChangeAttempt {
  fingerprint: string
  input: ChangeBookingInput
}

/** Keep the entire request stable after an uncertain response, including new line keys. */
export function prepareBookingChange(
  input: Omit<ChangeBookingInput, 'clientUuid'>,
  previous: BookingChangeAttempt | null,
): BookingChangeAttempt {
  const fingerprint = JSON.stringify(input)
  if (previous?.fingerprint === fingerprint) return previous
  return {
    fingerprint,
    input: {
      ...input,
      clientUuid: newClientUuid(),
      draft: {
        ...input.draft,
        lines: input.draft.lines.map((line) => ({ ...line, clientUuid: line.clientUuid || newClientUuid() })),
      },
    },
  }
}

export const changeBookingConfig: ActionConfig<ChangeBookingInput, QuoteSnapshot> = {
  name: 'CHANGE_BOOKING',
  permissions: ['rental.change'],
  implemented: true,

  validate(input) {
    if (!input.bookingId || !input.expectedRevision || !input.clientUuid || input.snapshot.id !== input.bookingId) {
      throw new Error('Reload the booking before editing.')
    }
  },

  async execute(input, ctx) {
    if (!['Owner', 'Admin', 'Manager', 'Coordinator'].includes(ctx.role)) {
      throw new Error('You cannot edit this booking.')
    }
    if (ctx.isOnline === false) {
      throw new Error('Connect to save this booking. Your changes are still here.')
    }

    const payload = quoteUpdatePayload(input.draft, input.snapshot, input.depositPaisa)
    const { data, error } = await supabase.rpc('change_booking', {
      p_id: input.bookingId,
      p_revision: input.expectedRevision,
      p_key: input.clientUuid,
      p_payload: payload,
    })

    if (error) {
      throw new Error(error.message)
    }

    if (!data || typeof data !== 'object' || !('revision' in data)) {
      throw new Error('The save was not confirmed. Retry without leaving this page.')
    }

    return {
      result: data as QuoteSnapshot,
      events: [
        {
          type: 'booking.changed',
          payload: {
            bookingId: input.bookingId,
            revision: (data as QuoteSnapshot).revision,
            changedBy: ctx.userId,
            at: new Date().toISOString(),
          },
        },
      ],
    }
  },
}

export const changeBooking = createAction(changeBookingConfig)
