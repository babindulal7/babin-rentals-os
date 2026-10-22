import { describe, it, expect } from 'vitest'
import { rentalRevertTargets, rentalCanArchive } from '../rentalLifecycle'
import type { SelectedRentalBookingFacts } from '../rentalMoreActionsRegistry'

describe('rentalLifecycle', () => {
  const baseBooking: SelectedRentalBookingFacts = {
    id: 'b-1',
    bookingNo: 'BK-100',
    stage: 'Booked',
  }

  describe('rentalRevertTargets', () => {
    it('returns [Quote] for Booked stage', () => {
      expect(rentalRevertTargets(baseBooking)).toEqual(['Quote'])
    })

    it('returns [Quote] for Confirmed stage (normalized Booked)', () => {
      expect(rentalRevertTargets({ ...baseBooking, stage: 'Confirmed' })).toEqual(['Quote'])
    })

    it('returns [Booked, Quote] for Packed stage', () => {
      expect(rentalRevertTargets({ ...baseBooking, stage: 'Packed' })).toEqual(['Booked', 'Quote'])
    })

    it('returns empty array when booking is cancelled or closed', () => {
      expect(rentalRevertTargets({ ...baseBooking, isCancelled: true })).toEqual([])
      expect(rentalRevertTargets({ ...baseBooking, isClosed: true })).toEqual([])
    })

    it('returns empty array for On Rent stage', () => {
      expect(rentalRevertTargets({ ...baseBooking, stage: 'On Rent' })).toEqual([])
    })
  })

  describe('rentalCanArchive', () => {
    it('returns true for cancelled or closed bookings', () => {
      expect(rentalCanArchive({ ...baseBooking, isCancelled: true })).toBe(true)
      expect(rentalCanArchive({ ...baseBooking, isClosed: true })).toBe(true)
      expect(rentalCanArchive({ ...baseBooking, stage: 'Closed' })).toBe(true)
      expect(rentalCanArchive({ ...baseBooking, stage: 'Completed' })).toBe(true)
      expect(rentalCanArchive({ ...baseBooking, stage: 'Cancelled' })).toBe(true)
    })

    it('returns false for active unclosed bookings', () => {
      expect(rentalCanArchive(baseBooking)).toBe(false)
      expect(rentalCanArchive({ ...baseBooking, stage: 'On Rent' })).toBe(false)
      expect(rentalCanArchive({ ...baseBooking, stage: 'Packed' })).toBe(false)
    })
  })
})
