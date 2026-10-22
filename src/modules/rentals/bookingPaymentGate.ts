/** Permission gating stays in BookingDetail (payment.create). This helper is
 * the invoice/balance gate only: never infer payment eligibility from a
 * booking stage or a refundable security deposit.
 */
export function bookingPaymentUnavailableReason(args: {
  hasInvoice: boolean
  invoicesUnknownReason: string | null
  outstandingPaisa: number
  noInvoiceReason: string
}): string | null {
  if (!args.hasInvoice) return args.invoicesUnknownReason ?? args.noInvoiceReason
  if (args.outstandingPaisa <= 0) return 'This booking has no outstanding rental balance to collect.'
  return null
}

/**
 * A booking can have more than one live invoice. Prefer an unsettled invoice,
 * not merely the first Draft, to avoid preselecting a fully-paid invoice while
 * a different invoice carries the outstanding balance.
 */
export function chooseBookingPaymentInvoice<T extends { status: string; outstandingAmount: number }>(
  invoices: readonly T[],
): T | undefined {
  return invoices.find((invoice) =>
    invoice.outstandingAmount > 0 &&
    (invoice.status === 'Draft' || invoice.status === 'Sent' || invoice.status === 'Partially Paid'),
  ) ?? invoices.find((invoice) => invoice.outstandingAmount > 0) ?? invoices[0]
}
