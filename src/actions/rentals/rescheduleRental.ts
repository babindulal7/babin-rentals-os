import { createAction, type ActionConfig } from '../core'
import { supabase } from '../../lib/supabase'
import { EVENT_TYPES } from '../../events/eventBus'

export interface RescheduleRentalInput {
  bookingId: string
  expectedRevision: string
  shiftDays: number
  reason: string
  clientUuid: string
  agreementProposalId?: string | null
}
export interface RescheduleRentalResult {
  id: string
  bookingNo: string
  pickupAt: string
  returnAt: string
  revision: string
}
// RULING 2026-10-26: calendar moves are online, fixed-duration Quote/Booked changes.
export const rescheduleRentalConfig: ActionConfig<RescheduleRentalInput, RescheduleRentalResult> = {
  name: 'RESCHEDULE_RENTAL', permissions: ['rental.reschedule'], implemented: true,
  validate(input) {
    if (!input.bookingId || !input.expectedRevision || !input.clientUuid) throw new Error('Reload the rental before adjusting its dates.')
    if (!Number.isSafeInteger(input.shiftDays) || input.shiftDays === 0) throw new Error('Choose a different pickup date. The return moves by the same whole days.')
    if (input.reason.trim().length < 10) throw new Error('Explain this date change using at least ten characters.')
  },
  async execute(input, ctx) {
    if (!['Owner', 'Admin', 'Manager', 'Coordinator'].includes(ctx.role)) throw new Error('You cannot reschedule this rental.')
    if (ctx.isOnline === false) throw new Error('Connect before rescheduling. No dates changed.')
    const { data, error } = await supabase.rpc('reschedule_rental', {
      p_booking_id: input.bookingId, p_revision: input.expectedRevision, p_shift_days: input.shiftDays,
      p_reason: input.reason.trim(), p_key: input.clientUuid, p_agreement_proposal: input.agreementProposalId ?? null,
    })
    if (error) throw new Error(['42883','PGRST202'].includes(String(error.code)) ? 'This action is not available on this server yet. No changes were saved.' : error.message)
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('The date change was not confirmed. Retry without changing this request.')
    const row = data as Record<string, unknown>
    if (row['id'] !== input.bookingId || typeof row['booking_no'] !== 'string' || typeof row['revision'] !== 'string'
      || typeof row['pickup_at'] !== 'string' || typeof row['return_at'] !== 'string'
      || !Number.isFinite(Date.parse(row['pickup_at'])) || !Number.isFinite(Date.parse(row['return_at']))
      || Date.parse(row['pickup_at']) >= Date.parse(row['return_at'])) throw new Error('The saved schedule could not be confirmed. Retry this same request.')
    return { result: { id: input.bookingId, bookingNo: row['booking_no'], revision: row['revision'],
      pickupAt: row['pickup_at'], returnAt: row['return_at'] },
      events: [{ type: EVENT_TYPES.RENTAL_RESCHEDULED, payload: { id: input.bookingId, rescheduled: true } }] }
  },
}
export const rescheduleRental = createAction(rescheduleRentalConfig)
