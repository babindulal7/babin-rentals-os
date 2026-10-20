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
