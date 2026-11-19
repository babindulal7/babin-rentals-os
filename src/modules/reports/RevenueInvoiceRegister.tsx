import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Page'
import { DataTableShell } from '../../components/ui/DataTable'
import { PageBody } from '../../components/ui/PageBody'
import { formatAd } from '../../lib/bs'
import { formatMoney } from '../../lib/money'
import { listInvoices, type InvoiceListRow } from '../../lib/queries/finance'
import { useLoad } from '../../lib/queries/useLoad'

/**
 * RULING 2026-10-17 (R17-5): the register lists issued invoices and voids, never
 * Drafts. A Draft has no number and no issue date yet (R-15), so under a wide
 * window it would sort first with nothing to link to. 'Overdue' is derived, not
 * stored, so it is not a filter value. Voids stay listed for the record; they
 * are never counted as revenue.
 */
export const REGISTER_STATUSES: Array<InvoiceListRow['status']> = ['Sent', 'Partially Paid', 'Paid', 'Void']
export const REGISTER_PAGE = 100

interface RegisterPage {
  rows: InvoiceListRow[]
  total: number | null
}

const th = {
  textAlign: 'left' as const,
  padding: '10px 12px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid var(--border)',
}
const td = {
  height: 'var(--row-min-h)',
  padding: '10px 12px',
  fontSize: 'var(--t-meta)',
  color: 'var(--text)',
  borderBottom: '1px solid var(--border)',
}
const num = { ...td, textAlign: 'right' as const }

/**
 * The invoice register for one civil-day window. Mount it with `key` set to the
 * window so a new window starts on page one.
 */
export function RevenueInvoiceRegister({ fromAd, toAd }: { fromAd?: string; toAd: string }) {
  const [page, setPage] = useState(0)
  // Set just before a Newer / Older turn, so focus moves to the new range once it lands.
  const turning = useRef(false)
  const summaryRef = useRef<HTMLParagraphElement>(null)

  const load = useLoad<RegisterPage>(
    async () => {
      // `issue_date` is a DATE column: the bounds are the report's civil days, not instants.
      // All dates has no lower bound: the register then lists from the first issued invoice.
      const res = await listInvoices({
        page: { index: page, size: REGISTER_PAGE },
        dateRange: { column: 'issue_date', toAd, ...(fromAd ? { fromAd } : {}) },
        chips: { status: REGISTER_STATUSES },
        presence: { issue_date: true },
        withCount: true,
      })
      return { rows: res.rows, total: res.total ?? null }
    },
    { key: `${fromAd ?? 'all'}|${toAd}|${page}` },
  )

  useEffect(() => {
    if (turning.current && load.data) {
      turning.current = false
      summaryRef.current?.focus()
    }
  }, [load.data])

  const rows = load.data?.rows ?? []
  const total = load.data?.total ?? null
  const paged = total !== null && total > REGISTER_PAGE
  const lastPage = total !== null && (page + 1) * REGISTER_PAGE >= total
  const turnTo = (next: number) => {
    if (load.loading) return
    turning.current = true
    setPage(next)
  }

  return (
    <PageBody
      noun="invoices"
      loading={load.loading}
      error={load.error}
      onRetry={load.reload}
      hasRows={rows.length > 0}
      skeleton="table"
      empty={load.data !== null && rows.length === 0}
      emptyTitle="No invoices in this period"
      emptyMessage="Choose a wider period, or issue an invoice from a rental."
    >
      <div aria-busy={load.loading} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
        <p ref={summaryRef} tabIndex={-1} style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', outline: 'none' }}>
          {paged
            ? `Invoices ${page * REGISTER_PAGE + 1}–${page * REGISTER_PAGE + rows.length} of ${total}, newest first.`
            : `${rows.length} invoice${rows.length === 1 ? '' : 's'}, newest first.`}{' '}
          Voided invoices are listed for the record; they are never counted as revenue. Drafts are not listed until they are issued.
        </p>
        <DataTableShell ariaLabel="Invoice register with settlement status">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th scope="col" style={th}>Invoice</th>
                <th scope="col" style={th}>Client</th>
                <th scope="col" style={th}>Issued</th>
                <th scope="col" style={th}>Status</th>
                <th scope="col" style={{ ...th, textAlign: 'right' }}>Before VAT</th>
                <th scope="col" style={{ ...th, textAlign: 'right' }}>VAT</th>
                <th scope="col" style={{ ...th, textAlign: 'right' }}>Total</th>
                <th scope="col" style={{ ...th, textAlign: 'right' }}>Paid</th>
                <th scope="col" style={{ ...th, textAlign: 'right' }}>Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((inv) => (
                <tr key={inv.id}>
                  <td style={td}>
                    {/* Finance ▸ Invoices opens on live invoices, so a void's number is text, not a link to an empty list. */}
                    {inv.invoiceNo && !inv.isVoid ? (
                      <Link
                        to={`/finance?tab=invoices&search=${encodeURIComponent(inv.invoiceNo)}`}
                        style={{ color: 'var(--link)', fontWeight: 600, textDecoration: 'none' }}
                      >
                        {inv.invoiceNo}
                      </Link>
                    ) : (
                      inv.invoiceNo || 'No number'
                    )}
                  </td>
                  <td style={td}>{inv.clientName}</td>
                  <td style={td}>{inv.issueDateAd ? formatAd(new Date(`${inv.issueDateAd}T00:00:00.000Z`)) : '—'}</td>
                  <td style={td}>{inv.isVoid ? 'Void' : inv.status}</td>
                  <td style={num} className="figure">{formatMoney(inv.taxableAmount)}</td>
                  <td style={num} className="figure">{formatMoney(inv.vatAmount)}</td>
                  <td style={num} className="figure">{formatMoney(inv.totalAmount)}</td>
                  <td style={num} className="figure">{formatMoney(inv.paidAmount)}</td>
                  <td style={num} className="figure">{formatMoney(inv.outstandingAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableShell>
        {paged && (
          // aria-disabled rather than disabled: a focused control that becomes disabled drops focus to <body>.
          <div style={{ display: 'flex', gap: 'var(--sp-sm)', justifyContent: 'flex-end' }}>
            <Button
              icon="chevron_left"
              aria-disabled={page === 0 || load.loading}
              style={page === 0 || load.loading ? { opacity: 0.45 } : undefined}
              onClick={() => {
                if (page > 0) turnTo(page - 1)
              }}
            >
              Newer
            </Button>
            <Button
              icon="chevron_right"
              aria-disabled={lastPage || load.loading}
              style={lastPage || load.loading ? { opacity: 0.45 } : undefined}
              onClick={() => {
                if (!lastPage) turnTo(page + 1)
              }}
            >
              Older
            </Button>
          </div>
        )}
      </div>
    </PageBody>
  )
}
