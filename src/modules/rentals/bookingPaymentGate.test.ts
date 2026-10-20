import { describe, expect, it } from 'vitest'
import { bookingPaymentUnavailableReason } from './bookingPaymentGate'

const base = {
  cancelledReason: null,
  hasInvoice: true,
  invoicesUnknownReason: null,
  outstandingPaisa: 500_00,
  noInvoiceReason: 'An invoice is required before collecting a payment.',
}

describe('booking payment quick-action eligibility', () => {
  it('allows a positive unpaid invoice balance', () => {
    expect(bookingPaymentUnavailableReason(base)).toBeNull()
  })
  it('does not treat a zero balance as collectible', () => {
    expect(bookingPaymentUnavailableReason({ ...base, outstandingPaisa: 0 }))
      .toMatch(/no outstanding rental balance/)
  })
  it('blocks a missing invoice even if the booking has a balance', () => {
    expect(bookingPaymentUnavailableReason({ ...base, hasInvoice: false })).toBe(base.noInvoiceReason)
  })
  it('displays invoice-read failures without claiming no invoice exists', () => {
    expect(bookingPaymentUnavailableReason({ ...base, hasInvoice: false, invoicesUnknownReason: 'Invoice service unavailable' }))
      .toBe('Invoice service unavailable')
  })
  it('blocks cancelled bookings before other conditions', () => {
    expect(bookingPaymentUnavailableReason({ ...base, cancelledReason: 'Booking cancelled' }))
      .toBe('Booking cancelled')
  })
})
