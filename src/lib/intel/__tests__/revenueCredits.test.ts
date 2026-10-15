import { describe, expect, it } from 'vitest'
import {
  reconcileInvoiceCredits,
  type IssuedInvoiceWithPayment,
  type InvoiceCreditNoteSource,
} from '../revenueTrend'

function invoice(patch: Partial<IssuedInvoiceWithPayment> = {}): IssuedInvoiceWithPayment {
  return {
    id: 'inv-1',
    issue_date: '2026-10-01',
    status: 'Void',
    taxable_amount: '1000.50',
    paid_amount: '300.25',
    currency: 'NPR',
    voided_at: '2026-10-09T12:00:00Z',
    ...patch,
  }
}

const credit = (patch: Partial<InvoiceCreditNoteSource> = {}): InvoiceCreditNoteSource => ({
  id: 'cn-1',
  invoice_id: 'inv-1',
  amount: '300.25',
  ...patch,
})

describe('credit-note audit is not net-sales accounting', () => {
  it('reconciles a paid void without deducting settlement credit from taxable totals', () => {
    const r = reconcileInvoiceCredits([invoice()], [credit()])
    expect(r.voidedTaxablePaisa).toBe(100050)
    expect(r.creditNoteAmountPaisa).toBe(30025)
    expect(r.voidedInvoiceCount).toBe(1)
    expect(r.creditNoteCount).toBe(1)
    expect(r.paidVoidMismatchCount).toBe(0)
  })

  it('reports absent or mismatched paid-void credits as requiring review', () => {
    expect(reconcileInvoiceCredits([invoice()], []).paidVoidMismatchCount).toBe(1)
    expect(reconcileInvoiceCredits([invoice()], [credit({amount:'300.24'})]).paidVoidMismatchCount).toBe(1)
    expect(reconcileInvoiceCredits([invoice({paid_amount:'0'})], []).paidVoidMismatchCount).toBe(0)
  })

  it('counts notes on nonvoid invoices separately, without pretending they reduce sales', () => {
    const result = reconcileInvoiceCredits([
      invoice({status:'Sent', voided_at:null}),
    ], [credit()])
    expect(result.activeInvoiceCreditNoteCount).toBe(1)
    expect(result.voidedTaxablePaisa).toBe(0)
    expect(result.creditNoteAmountPaisa).toBe(30025)
  })

  it('refuses duplicates, orphan records and invalid credit amounts', () => {
    expect(() => reconcileInvoiceCredits([invoice(), invoice()], [])).toThrow(/Duplicate invoice/)
    expect(() => reconcileInvoiceCredits([invoice()], [credit(), credit()])).toThrow(/Duplicate credit/)
    expect(() => reconcileInvoiceCredits([invoice()], [credit({invoice_id:'other'})])).toThrow(/no invoice/)
    expect(() => reconcileInvoiceCredits([invoice()], [credit({amount:'NaN'})])).toThrow(/Unusable/)
    expect(() => reconcileInvoiceCredits([invoice()], [credit({amount:'0'})])).toThrow(/positive/)
  })

  it('reconciles multiple partial notes to one paid void exactly in integer paisa', () => {
    const result = reconcileInvoiceCredits([invoice()], [
      credit({id:'c1', amount:'100.10'}),
      credit({id:'c2', amount:'200.15'}),
    ])
    expect(result.creditNoteAmountPaisa).toBe(30025)
    expect(result.paidVoidMismatchCount).toBe(0)
    expect(result.creditNoteCount).toBe(2)
  })
})
