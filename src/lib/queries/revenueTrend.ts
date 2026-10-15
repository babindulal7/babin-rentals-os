import { supabase } from '../supabase'
import { aggregateIssuedRevenue, type IssuedInvoiceSource, type RevenueTrend } from '../intel/revenueTrend'

/**
 * Read-only financial report source. This module is the single query owner
 * for the issued-invoice trend; never call it from a money-blind screen.
 * RLS must enforce auth_can_view_money() on invoices.
 */
export async function loadIssuedRevenueTrend(fromAd: string, toAd: string): Promise<RevenueTrend> {
  // Validate the date window before contacting the database.
  aggregateIssuedRevenue([], fromAd, toAd)
  const rows: IssuedInvoiceSource[] = []
  const pageSize = 500
  const maximumRows = 50_000
  for (let offset = 0; offset < maximumRows; offset += pageSize) {
    const { data, error } = await supabase
      .from('invoices')
      .select('id,issue_date,status,taxable_amount,currency,voided_at')
      .gte('issue_date', fromAd)
      .lte('issue_date', toAd)
      .order('issue_date', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (error) throw new Error('Revenue source unavailable: ' + error.message)
    if (!data) throw new Error('Revenue source returned no result')
    rows.push(...data as IssuedInvoiceSource[])
    if (data.length < pageSize) return aggregateIssuedRevenue(rows, fromAd, toAd)
  }
  throw new Error('Revenue report exceeds 50,000 invoices; totals withheld to prevent partial reporting')
}
