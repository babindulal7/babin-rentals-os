/**
 * The overdue limb of the On Stop check, for one client's invoices.
 *
 * The client profile and the directory preview both answer On Stop, and they
 * must answer it from the same rows by the same rule, or one client can read
 * "on stop" on one screen and "clear" on the other. This is the single reader
 * both use. The directory row cannot supply the answer: `client_directory_v`
 * publishes no invoice due dates (see `CreditStopFacts` in data/clients.ts).
 */
import { useMemo } from 'react'
import { useList } from '../../lib/queries/useList'
import type { ListFilters } from '../../lib/queries/listQuery'
import { listInvoices, invoicesForClient, type InvoiceListRow } from '../../lib/queries/finance'
import { worstDaysPastDue } from '../../lib/queries/clients'

/**
 * A client's invoices, keyed on `clients.id`. With no client id it answers
 * without a query: an empty chip group means no constraint, and that would
 * return every invoice in the business under one client's name.
 */
export async function fetchClientInvoices(filters: ListFilters) {
  if (!filters.chips?.['client_id']?.[0]) return { rows: [], total: 0 }
  return listInvoices(filters)
}

/**
 * Days past due on the client's most overdue issued, unpaid invoice, or `null`
 * when the question cannot be asked.
 *
 * `null` for a session that may not see money. RLS withholds the invoice list as
 * an empty result with HTTP 200, which looks exactly like "never invoiced", so
 * an empty list must not be read as "not overdue". `null` also while the list
 * is in flight or has failed.
 */
export function useClientOverdueDays(clientUuid: string | null, money: boolean): number | null {
  const filters = useMemo<ListFilters>(
    () => (clientUuid && money ? invoicesForClient(clientUuid) : { chips: { client_id: [] } }),
    [clientUuid, money],
  )
  const invoices = useList<InvoiceListRow>(fetchClientInvoices, filters, { isFilteredOverride: false })
  return useMemo(() => {
    if (!money || !clientUuid) return null
    if (invoices.loading || invoices.error) return null
    return worstDaysPastDue(invoices.rows)
  }, [money, clientUuid, invoices.loading, invoices.error, invoices.rows])
}
