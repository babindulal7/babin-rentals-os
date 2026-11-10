import { rupees } from '../money'
import type { InvoiceLineItem, InvoiceListRow } from '../queries/finance'
import type { InvoicePdfCompany, InvoicePdfData } from './generatePdf'

/** Export the recorded invoice snapshot; never reconstruct tax or discounts from the grand total. */
export function invoicePdfData(invoice: InvoiceListRow, lines: readonly InvoiceLineItem[], company: InvoicePdfCompany): InvoicePdfData {
  if (lines.length === 0) throw new Error('No persisted invoice lines were returned. Retry after the invoice lines are available.')
  return {
    invoiceNo: invoice.invoiceNo,
    status: invoice.status,
    issueDateAd: invoice.issueDateAd,
    dueDateAd: invoice.dueDateAd,
    bookingNo: invoice.bookingNo,
    project: invoice.projectName ?? null,
    client: { name: invoice.clientName },
    company,
    lines: lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      rentalDays: line.days,
      ratePaisa: rupees(line.unitRate),
      totalPaisa: rupees(line.lineTotal),
    })),
    subtotalPaisa: invoice.subtotal,
    discountPaisa: invoice.discountAmount,
    discountPercent: invoice.discountPercent,
    taxablePaisa: invoice.taxableAmount,
    vatPercent: invoice.vatRate * 100,
    vatPaisa: invoice.vatAmount,
    totalPaisa: invoice.totalAmount,
    paidPaisa: invoice.paidAmount,
    outstandingPaisa: invoice.outstandingAmount,
    notes: invoice.notes,
  }
}
