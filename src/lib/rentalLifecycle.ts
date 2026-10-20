import type { SelectedRentalBookingFacts } from './rentalMoreActionsRegistry'

export type RevertTarget = 'Quote' | 'Booked'

/** Server rechecks the live stage, custody and branch under a booking lock. */
export function rentalRevertTargets(booking: SelectedRentalBookingFacts): RevertTarget[] {
  if (booking.isCancelled || booking.isClosed) return []
  const stage = (booking.stage || '').trim()
  if (stage === 'Packed') return ['Booked', 'Quote']
  if (stage === 'Booked' || stage === 'Confirmed') return ['Quote']
  return []
}

export function rentalCanArchive(booking: SelectedRentalBookingFacts): boolean {
  const stage = (booking.stage || '').trim()
  return Boolean(
    booking.isCancelled ||
    booking.isClosed ||
    stage === 'Closed' ||
    stage === 'Completed' ||
    stage === 'Cancelled'
  )
}
