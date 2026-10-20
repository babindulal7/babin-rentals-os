import { describe, expect, it } from 'vitest'
import { bookingPaymentUnavailableReason, chooseBookingPaymentInvoice } from './bookingPaymentGate'

const base = {
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
  it('does not infer terminal booking restrictions from invoice data', () => {
    expect(bookingPaymentUnavailableReason({ ...base, outstandingPaisa: 100_00 })).toBeNull()
  })
})

describe('payment invoice default', () => {
  it('picks the unpaid invoice instead of a fully paid draft', () => {
    const paid = { id: 'paid-draft', status: 'Draft', outstandingAmount: 0 }
    const owed = { id: 'owed-sent', status: 'Sent', outstandingAmount: 750_00 }
    expect(chooseBookingPaymentInvoice([paid, owed])?.id).toBe('owed-sent')
  })
  it('falls back to another unsettled invoice status', () => {
    const rows = [
      { id: 'settled', status: 'Draft', outstandingAmount: 0 },
      { id: 'overdue', status: 'Overdue', outstandingAmount: 100_00 },
    ]
    expect(chooseBookingPaymentInvoice(rows)?.id).toBe('overdue')
  })
  it('does not fabricate an invoice on an empty list', () => {
    expect(chooseBookingPaymentInvoice([])).toBeUndefined()
  })
})
