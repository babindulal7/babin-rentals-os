import { supabase } from '../supabase'
import { aggregateIssuedRevenue, type IssuedInvoiceSource, type RevenueTrend } from '../intel/revenueTrend'

const FIELDS = 'id, issue_date, status, taxable_amount, currency, voided_at'
const PAGE_SIZE = 500

/**
 * Read only financial invoice data. Call ONLY from a role authorized to read
 * executive revenue reporting; never fetch first and hide it afterwards.
 * Supabase RLS is the second and authoritative boundary.
 */
export async function getIssuedRevenueTrend(fromAd: string, toAd: string): Promise<RevenueTrend> {
  const rows: IssuedInvoiceSource[] = []
  for (let page = 0; page < 100; page++) {
    const { data, error } = await supabase
      .from('invoices')
      .select(FIELDS)
      .gte('issue_date', fromAd)
      .lte('issue_date', toAd)
      .in('status', ['Sent', 'Partially Paid', 'Paid'])
      .is('voided_at', null)
      .order('issue_date', { ascending: true })
      .order('id', { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    if (error) throw new Error('Revenue source unavailable: ' + error.message)
    if (!data) throw new Error('Revenue source returned no confirmed dataset')
    rows.push(...(data as unknown as IssuedInvoiceSource[]))
    if (data.length < PAGE_SIZE) return aggregateIssuedRevenue(rows, fromAd, toAd)
  }
  throw new Error('Revenue source exceeds safe report limit; narrow the period')
}
