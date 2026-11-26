/**
 * "Overdue" for one invoice row, as the invoice list shows it.
 *
 * 'Overdue' is never stored (0001:1010), so the status column cannot say it. The
 * label is derived here from the same rule the Overdue filter applies
 * (`overdueInvoices`) and the client profile applies (`worstDaysPastDue`): not
 * void, money still owed, and a due date before today. Drafts never reach the
 * test because `worstDaysPastDue` skips them.
 *
 * Display only. The stored status is untouched.
 */
import type { InvoiceListRow } from '../../lib/queries/finance'
import { worstDaysPastDue } from '../../lib/queries/clients'

export function isOverdueInvoice(row: InvoiceListRow): boolean {
  if (row.isVoid) return false
  return (worstDaysPastDue([row]) ?? 0) > 0
}
