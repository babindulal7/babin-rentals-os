import type { SelectedRentalBookingFacts } from './rentalMoreActionsRegistry'

export type RevertTarget = 'Quote' | 'Booked'

/** Server rechecks the live stage, custody and branch under a booking lock. */
export function rentalRevertTargets(booking: SelectedRentalBookingFacts): RevertTarget[] {
  if (booking.isCancelled || booking.isClosed) return []
  if (booking.stage === 'Packed') return ['Booked', 'Quote']
  return booking.stage === 'Booked' ? ['Quote'] : []
}

export function rentalCanArchive(booking: SelectedRentalBookingFacts): boolean {
  return Boolean(booking.isCancelled || booking.isClosed || booking.stage === 'Closed')
}
