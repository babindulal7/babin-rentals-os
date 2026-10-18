import { supabase } from '../supabase'
import {
  aggregateIssuedRevenue,
  aggregateShiftedRevenue,
  previousWindow,
  reconcileInvoiceCredits,
  type IssuedInvoiceWithPayment,
  type InvoiceCreditNoteSource,
  type RevenueTrend,
  type RevenueCreditReconciliation,
} from '../intel/revenueTrend'

const INVOICE_FIELDS = 'id, issue_date, status, taxable_amount, paid_amount, currency, voided_at'
const CREDIT_FIELDS = 'id, invoice_id, amount'
export const PAGE_SIZE = 500
const MAX_ROWS = 50_000
const INVOICE_ID_BATCH = 100

export interface IssuedRevenueReport extends RevenueTrend {
  creditReconciliation: RevenueCreditReconciliation
}

interface PageResult<T> {
  data: T[] | null
  error: { message: string } | null
  count: number | null
}

/**
 * Pages a query until it holds exactly the server's count of rows.
 *
 * RULING 2026-10-17 (R17-4): a short page is not the last page. PostgREST caps
 * every response (`max-rows`), and a cap below PAGE_SIZE returns short pages
 * mid-read, so "stop on a short page" silently dropped rows. Each read asks for
 * the exact count, advances by the rows actually received, and refuses when
 * the count changes mid-read or the rows received differ from it.
 *
 * `page(from, to)` must order by a unique tiebreak, or rows repeat or vanish
 * between pages. Known limit (offset paging): a void AND an issue landing in
 * the milliseconds between two pages leaves the count unchanged but shifts the
 * offsets; it needs 500+ rows in the window, and Refresh corrects it.
 */
export async function readAll<T extends { id: string }>(
  source: string,
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = []
  const ids = new Set<string>()
  let expected: number | null = null
  for (;;) {
    const from = rows.length
    const { data, error, count } = await page(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`${source} unavailable: ${error.message}`)
    if (!data) throw new Error(`${source} returned no confirmed dataset`)
    if (count === null) throw new Error(`${source} did not confirm how many rows exist`)
    if (expected === null) {
      expected = count
      if (expected > MAX_ROWS) throw new Error(`${source} exceeds safe report limit; narrow the period`)
    } else if (count !== expected) {
      throw new Error(`${source} changed while it was being read; refresh`)
    }
    for (const row of data) {
      if (ids.has(row.id)) throw new Error(`${source} returned a row twice while paging; refresh`)
      ids.add(row.id)
      rows.push(row)
    }
    if (rows.length >= expected || data.length === 0) break
  }
  if (rows.length !== expected) throw new Error(`${source} returned ${rows.length} of ${expected} rows; refresh`)
  return rows
}

function invoicesIssuedIn(fromAd: string, toAd: string): Promise<IssuedInvoiceWithPayment[]> {
  return readAll<IssuedInvoiceWithPayment>('Revenue source', (from, to) =>
    supabase
      .from('invoices')
      .select(INVOICE_FIELDS, { count: 'exact' })
      .gte('issue_date', fromAd)
      .lte('issue_date', toAd)
      .order('issue_date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to) as unknown as PromiseLike<PageResult<IssuedInvoiceWithPayment>>,
  )
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
export async function getIssuedRevenueTrend(fromAd: string, toAd: string, today?: string): Promise<IssuedRevenueReport> {
  // Validate the range before any database request.
  aggregateIssuedRevenue([], fromAd, toAd)
  const invoices = await invoicesIssuedIn(fromAd, toAd)

  const notes: InvoiceCreditNoteSource[] = []
  const ids = invoices.map(row => row.id)
  for (let start = 0; start < ids.length; start += INVOICE_ID_BATCH) {
    const batch = ids.slice(start, start + INVOICE_ID_BATCH)
    notes.push(
      ...(await readAll<InvoiceCreditNoteSource>('Credit-note source', (from, to) =>
        supabase
          .from('credit_notes')
          .select(CREDIT_FIELDS, { count: 'exact' })
          .in('invoice_id', batch)
          .order('id', { ascending: true })
          .range(from, to) as unknown as PromiseLike<PageResult<InvoiceCreditNoteSource>>,
      )),
    )
    if (notes.length > MAX_ROWS) throw new Error('Credit-note report exceeds safe limit')
  }

  const trend = aggregateIssuedRevenue(invoices, fromAd, toAd, today)
  const creditReconciliation = reconcileInvoiceCredits(invoices, notes)
  return { ...trend, creditReconciliation }
}

/**
 * The comparison series for a trend already read: the same number of days
 * immediately before it, bucketed to match (`aggregateShiftedRevenue`).
 */
export async function getPreviousIssuedRevenue(current: RevenueTrend): Promise<RevenueTrend> {
  const window = previousWindow(current.fromAd, current.toAd)
  return aggregateShiftedRevenue(await invoicesIssuedIn(window.fromAd, window.toAd), current)
}

/**
 * The first day any invoice was issued — where "All dates" starts. Drafts carry
 * no issue_date (R-15); voids are included so the credit audit covers them.
 * Null when nothing has been issued yet.
 */
export async function getEarliestIssueDay(): Promise<string | null> {
  const { data, error } = (await supabase
    .from('invoices')
    .select('issue_date')
    .not('issue_date', 'is', null)
    .order('issue_date', { ascending: true })
    .limit(1)) as unknown as { data: Array<{ issue_date: string }> | null; error: { message: string } | null }
  if (error) throw new Error('Revenue source unavailable: ' + error.message)
  if (!data) throw new Error('Revenue source returned no confirmed dataset')
  return data[0]?.issue_date ?? null
}
