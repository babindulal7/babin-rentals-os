import { createAction, type ActionConfig } from '../core'
import { supabase } from '../../lib/supabase'
import type { RevertTarget } from '../../lib/rentalLifecycle'

export interface RentalLifecycleInput {
  bookingId: string
  reason: string
  clientUuid: string
  targetStage?: RevertTarget | undefined
}
export interface RentalLifecycleResult { booking_id: string; lifecycle_action: 'revert' | 'archive' }

function config(action: 'revert' | 'archive'): ActionConfig<RentalLifecycleInput, RentalLifecycleResult> {
  return {
    name: action === 'revert' ? 'REVERT_RENTAL' : 'ARCHIVE_RENTAL',
    permissions: [`rental.${action}`],
    implemented: true,
    validate(input) {
      if (!input.bookingId || !input.clientUuid || input.reason.trim().length < 10) {
        throw new Error('Booking, request key and a reason of at least ten characters are required.')
      }
      if (action === 'revert' && !['Quote', 'Booked'].includes(input.targetStage ?? '')) {
        throw new Error('Choose Quote or Booked as the earlier stage.')
      }
    },
    async execute(input) {
      const { data, error } = await supabase.rpc('manage_rental_lifecycle', { p_payload: {
        booking_id: input.bookingId, client_uuid: input.clientUuid,
        action, reason: input.reason.trim(), ...(action === 'revert' ? { target_stage: input.targetStage } : {}),
      } })
      if (error) throw new Error(error.message)
      const result = data as unknown as RentalLifecycleResult | null
      if (result?.booking_id !== input.bookingId || result.lifecycle_action !== action) {
        throw new Error('The server did not confirm this rental change. Retry with the same request.')
      }
      return { result, events: [] }
    },
  }
}
export const revertRental = createAction(config('revert'))
export const archiveRental = createAction(config('archive'))
