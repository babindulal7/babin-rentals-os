/**
 * `invoiceOverdue.ts` — the per-row "Overdue" label the invoice list shows.
 *
 * The rule under test is the one the Overdue filter applies: issued, unpaid,
 * not void, and due before today. The row fixtures are built as the query layer
 * returns them (camelCase, paisa amounts), with only the fields the rule reads.
 */
import { describe, expect, it } from 'vitest'
import { rupees } from '../../../lib/money'
import type { InvoiceListRow } from '../../../lib/queries/finance'
import { isOverdueInvoice } from '../invoiceOverdue'

/** A row due long before any sensible "today", so the result does not depend on the clock. */
function invoice(overrides: Partial<InvoiceListRow> = {}): InvoiceListRow {
  return {
    id: 'inv-1',
    invoiceNo: 'INV-10',
    bookingId: 'b-1',
    bookingNo: 'B-715',
    clientId: 'c-1',
    clientName: 'ABC Films',
    status: 'Sent',
    issueDateAd: '2026-07-01',
    dueDateAd: '2026-07-08',
    currency: 'NPR',
    subtotal: 0,
    discountAmount: 0,
    discountPercent: 0,
    taxableAmount: 0,
    vatRate: 0.13,
    vatAmount: 0,
    totalAmount: 3_466_725,
    paidAmount: 0,
    outstandingAmount: 3_466_725,
    isVoid: false,
    voidedAtAd: null,
    voidReason: null,
    creditNoteNo: null,
    notes: null,
    createdAtAd: '2026-07-01T00:00:00Z',
    ...overrides,
  } as InvoiceListRow
}

describe('isOverdueInvoice', () => {
  it('flags an issued invoice that is unpaid and past its due date', () => {
    expect(isOverdueInvoice(invoice({ status: 'Sent' }))).toBe(true)
  })

  it('flags a partly paid invoice past its due date too', () => {
    expect(isOverdueInvoice(invoice({ status: 'Partially Paid', paidAmount: rupees(1_000), outstandingAmount: rupees(33_667.25) }))).toBe(true)
  })

  it('does not flag an invoice whose due date is still ahead', () => {
    expect(isOverdueInvoice(invoice({ dueDateAd: '2999-01-01' }))).toBe(false)
  })

  it('does not flag a settled invoice, even one whose due date is long past', () => {
    expect(isOverdueInvoice(invoice({ status: 'Paid', outstandingAmount: rupees(0) }))).toBe(false)
  })

  it('does not flag a draft, which has not been issued to anybody', () => {
    expect(isOverdueInvoice(invoice({ status: 'Draft' }))).toBe(false)
  })

  it('does not flag a void invoice, whatever its status label says', () => {
    expect(isOverdueInvoice(invoice({ isVoid: true }))).toBe(false)
  })

  it('does not flag a row whose due date cannot be read', () => {
    expect(isOverdueInvoice(invoice({ dueDateAd: 'not-a-date' }))).toBe(false)
  })
})
