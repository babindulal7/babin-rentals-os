/** Canonical navigation paths shared by route declarations and contextual actions. */
export const PRODUCTIONS_HUB_PATH = '/rentals/productions'
export const AUDIT_LOG_PATH = '/admin/audit-log'
export const PROBLEM_REPORTS_PATH = '/admin/problem-reports'

export type FinanceTabSlug = 'closing' | 'invoices' | 'payments' | 'expenses' | 'documents' | 'reports'

/** A record ID belongs to the registered audit trail, not the old /audit route. */
export function rentalAuditLogPath(recordId: string): string {
  return AUDIT_LOG_PATH + '?' + new URLSearchParams({ recordId }).toString()
}

/** Keep query filters and hash intact when canonicalizing legacy Finance routes. */
export function financeTabPath(tab: FinanceTabSlug, existingSearch = '', hash = ''): string {
  const params = new URLSearchParams(existingSearch)
  params.set('tab', tab)
  return '/finance?' + params.toString() + hash
}

export function rentalInvoicesPath(bookingNo: string): string {
  return financeTabPath('invoices', new URLSearchParams({ search: bookingNo }).toString())
}
