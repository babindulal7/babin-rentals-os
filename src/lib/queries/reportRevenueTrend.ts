import { supabase } from '../supabase'
import {
  aggregateIssuedRevenue,
  reconcileInvoiceCredits,
  type IssuedInvoiceWithPayment,
  type InvoiceCreditNoteSource,
  type RevenueTrend,
  type RevenueCreditReconciliation,
} from '../intel/revenueTrend'

const INVOICE_FIELDS = 'id, issue_date, status, taxable_amount, paid_amount, currency, voided_at'
const CREDIT_FIELDS = 'id, invoice_id, amount'
const PAGE_SIZE = 500
const MAX_ROWS = 50_000
const INVOICE_ID_BATCH = 100

export interface IssuedRevenueReport extends RevenueTrend {
  creditReconciliation: RevenueCreditReconciliation
}

/**
 * One authoritative report reader. Only call from authorized money-facing
 * screens. Supabase RLS protects BOTH invoices and credit_notes.
 *
 * Include voided invoices in the read to reconcile their paid-amount credit
 * notes. The trend itself still includes only issued NONVOID invoices.
 * A credit note amount is a settlement/paid value, not a taxable sales credit.
 * Do not subtract it from revenue.
 *
 * Pagination failures, inaccessible note rows and invalid values must not
 * silently turn into "zero revenue" or an audited net sales claim.
 */
export async function getIssuedRevenueTrend(fromAd: string, toAd: string): Promise<IssuedRevenueReport> {
  // Validate the range before any database request.
  aggregateIssuedRevenue([], fromAd, toAd)
  const invoices: IssuedInvoiceWithPayment[] = []
  let invoiceReadComplete = false

  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('invoices')
      .select(INVOICE_FIELDS)
      .gte('issue_date', fromAd)
      .lte('issue_date', toAd)
      .order('issue_date', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) throw new Error('Revenue source unavailable: ' + error.message)
    if (!data) throw new Error('Revenue source returned no confirmed dataset')
    invoices.push(...(data as IssuedInvoiceWithPayment[]))
    if (data.length < PAGE_SIZE) {
      invoiceReadComplete = true
      break
    }
  }
  if (!invoiceReadComplete) throw new Error('Revenue source exceeds safe report limit; narrow the period')

  const notes: InvoiceCreditNoteSource[] = []
  const ids = invoices.map(row => row.id)
  for (let start = 0; start < ids.length; start += INVOICE_ID_BATCH) {
    const batch = ids.slice(start, start + INVOICE_ID_BATCH)
    let creditReadComplete = false
    for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('credit_notes')
        .select(CREDIT_FIELDS)
        .in('invoice_id', batch)
        .order('id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1)
      if (error) throw new Error('Credit-note source unavailable: ' + error.message)
      if (!data) throw new Error('Credit-note source returned no confirmed dataset')
      notes.push(...(data as InvoiceCreditNoteSource[]))
      if (notes.length > MAX_ROWS) throw new Error('Credit-note report exceeds safe limit')
      if (data.length < PAGE_SIZE) {
        creditReadComplete = true
        break
      }
    }
    if (!creditReadComplete) throw new Error('Credit-note source exceeds safe report limit')
  }

  const trend = aggregateIssuedRevenue(invoices, fromAd, toAd)
  const creditReconciliation = reconcileInvoiceCredits(invoices, notes)
  return { ...trend, creditReconciliation }
}
