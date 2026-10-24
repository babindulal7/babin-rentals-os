import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../../components/ui/Page'
import { ReportFamiliesNav } from '../../components/ui/ReportFamiliesNav'
import { ReportToolbar } from '../../components/ui/ReportToolbar'
import type { ReportCsvRow, ReportFilters } from '../../components/ui/ReportToolbar'
import { InteractiveRevenueTrend } from '../../components/ui/charts/InteractiveRevenueTrend'
import { PageBody } from '../../components/ui/PageBody'
import { useLoad } from '../../lib/queries/useLoad'
import { formatMoney } from '../../lib/money'
import { businessDayAd } from '../../lib/bs'
import { useAuth } from '../../lib/auth'
import { getIssuedRevenueTrend, type IssuedRevenueReport } from '../../lib/queries/reportRevenueTrend'
import {
  RheaCard,
  RheaCardHeader,
  RheaCardTitle,
  RheaCardDescription,
  RheaCardContent,
  RheaKpiCard,
  RheaChartContainer,
} from '../../components/shadcn'

/**
 * This report displays ONLY successfully fetched taxable issued-invoice values.
 * It does not pretend that a 100-row register, pulse fixture or seeded category
 * split represents the full ledger. Credit adjustments require a separate
 * reconciled ledger definition and are intentionally not claimed here.
 */
const EXECUTIVE_ROLES = new Set(['Owner', 'Admin', 'Manager', 'Accounts'])

function daysAgo(day: string, count: number): string {
  const d = new Date(day + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - count)
  return d.toISOString().slice(0, 10)
}

function readReportDate(value: string | undefined, fallback: string): string {
  if (!value) return fallback
  // ReportToolbar supplies Nepal-local date instants. The date-only portion
  // is the intended AD civil date, without coercing it through browser TZ.
  return value.slice(0, 10)
}

export default function RevenueReport() {
  const { user } = useAuth()
  const permitted = Boolean(user && EXECUTIVE_ROLES.has(user.role))
  const today = businessDayAd()
  const [filters, setFilters] = useState<ReportFilters>({})

  const from = readReportDate(filters.dateRange?.fromAd, daysAgo(today, 89))
  const to = readReportDate(filters.dateRange?.toAd, today)
  const windowIsValid = from <= to && (
    (new Date(to + 'T00:00:00Z').getUTCFullYear() - new Date(from + 'T00:00:00Z').getUTCFullYear())*12 +
    new Date(to + 'T00:00:00Z').getUTCMonth() - new Date(from + 'T00:00:00Z').getUTCMonth() < 24
  )

  /* Phase 6 — the hand-rolled load state becomes `useLoad`, so a failure
     offline is worded as such and retries on reconnect, and `PageBody` draws
     loading · Error + Retry · nothing-yet vs "nothing in this period". A role
     outside the executive set never sends the read (Law 6). */
  const filtered = Boolean(filters.dateRange?.fromAd || filters.dateRange?.toAd)
  const load = useLoad<IssuedRevenueReport>(() => getIssuedRevenueTrend(from, to), {
    key: `${from}|${to}`,
    enabled: permitted && windowIsValid,
  })
  const report = load.data

  const rows = useMemo<ReportCsvRow[]>(() => {
    if (!report) return []
    return [
      ['Issued invoice taxable revenue — actual (NPR), before VAT'],
      ['AD window', report.fromAd, report.toAd],
      ['Status', 'Issued nonvoid invoices; credit notes reconciled as paid-amount records, not subtracted from taxable sales'],
      ['Credit notes on invoices issued in window', report.creditReconciliation.creditNoteCount],
      ['Credit-note paid amounts (not taxable deductions)', formatMoney(report.creditReconciliation.creditNoteAmountPaisa)],
      ['Voided invoice taxable amounts excluded', formatMoney(report.creditReconciliation.voidedTaxablePaisa)],
      ['Paid voids needing credit review', report.creditReconciliation.paidVoidMismatchCount],
      ['Credit notes on active invoices for review', report.creditReconciliation.activeInvoiceCreditNoteCount],
      ['Month', 'Taxable value', 'Issued invoices'],
      ...report.months.map(m => [m.label, formatMoney(m.amountPaisa), m.invoiceCount] as ReportCsvRow),
      ['Total', formatMoney(report.totalPaisa), report.issuedCount],
    ]
  }, [report])

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'var(--sp-md)' }}>
      <PageHeader icon="dollar" title="Revenue Reports" description="Issued invoice taxable revenue, excluding VAT and unissued or void invoices." />
      <ReportFamiliesNav current="Revenue" />
      {!permitted ? (
        <PageBody
          restricted
          restrictedReason="Revenue figures are restricted to Owner, Admin, Manager and Accounts."
          restrictedRequiredRole="Owner, Admin, Manager or Accounts"
        >
          {null}
        </PageBody>
      ) : (
        <>
          <ReportToolbar title="Revenue Reports" value={filters} onChange={setFilters} dateColumn="issue_date"
            {...(!load.loading && !load.error && report ? { csv: { filename:'revenue-issued-monthly', build: () => rows } } : {})}
          />
          <div className="br-preset-pilot" data-ui-preset="rhea" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
            {!windowIsValid ? (
              <p role="alert">Choose a valid report window of no more than 24 calendar months.</p>
            ) : (
              <PageBody
                noun="revenue"
                loading={load.loading}
                error={load.error}
                onRetry={load.reload}
                hasRows={report !== null}
                skeleton="card"
                empty={report !== null && report.issuedCount === 0 && report.creditReconciliation.voidedInvoiceCount === 0}
                emptyIsFiltered={filtered}
                onClearFilters={() => setFilters({})}
                clearLabel="Back to the last 90 days"
                emptyTitle={filtered ? 'No invoices issued in this period' : 'No invoices issued in the last 90 days'}
                emptyMessage={
                  filtered
                    ? 'Revenue appears here for invoices issued in the selected window.'
                    : 'Revenue appears here once an invoice is issued. Choose a wider period to look further back.'
                }
              >
              {report && (
              <>
                <div className="rhea-kpi-grid">
                  <RheaKpiCard
                    label="Taxable Revenue (Before VAT)"
                    value={formatMoney(report.totalPaisa)}
                    meta="Actual taxable invoice amount"
                    badge={{ text: 'Actual', variant: 'primary' }}
                  />
                  <RheaKpiCard
                    label="Issued Invoices"
                    value={report.issuedCount}
                    meta="Active nonvoid invoices in window"
                  />
                  <RheaKpiCard
                    label="Voided Invoice Excluded"
                    value={formatMoney(report.creditReconciliation.voidedTaxablePaisa)}
                    meta={`${report.creditReconciliation.voidedInvoiceCount} invoice(s)`}
                  />
                  <RheaKpiCard
                    label="Credit-Note Corrections"
                    value={formatMoney(report.creditReconciliation.creditNoteAmountPaisa)}
                    meta={`${report.creditReconciliation.creditNoteCount} note(s)`}
                  />
                </div>

                <section aria-label="Issued invoice revenue trend">
                  <RheaChartContainer
                    title="Monthly issued invoice revenue"
                    description={`Actual taxable invoice amounts before VAT · AD calendar months · ${from} to ${to}. Current nonvoid invoice snapshot grouped by issue month: later voids may restate older months. Draft and void invoices excluded. Credit notes record paid amounts, not taxable sales deductions. Credit notes are checked separately; this is not a full audited net-sales statement.`}
                  >
                    <InteractiveRevenueTrend months={report.months} />
                  </RheaChartContainer>
                </section>

                <RheaCard size="sm" aria-label="Credit-note reconciliation for selected invoice dates" style={{ marginTop: 8 }}>
                  <RheaCardHeader>
                    <div>
                      <RheaCardTitle>Credit-note reconciliation</RheaCardTitle>
                      <RheaCardDescription>
                        For invoices issued {from} to {to}, including voided invoices omitted from the chart.
                        Credit-note amounts reflect paid-value corrections, not taxable sales credits;
                        notes issued for invoices outside this period are not in this check.
                      </RheaCardDescription>
                    </div>
                  </RheaCardHeader>
                  <RheaCardContent>
                    <dl style={{ display: 'flex', flexWrap: 'wrap', gap: 24, margin: 0 }}>
                      <div>
                        <dt style={{ color: 'var(--rhea-muted-fg)', fontSize: '0.825rem' }}>Voided invoice taxable amount excluded</dt>
                        <dd style={{ margin: 0, fontWeight: 600, fontSize: '1rem', color: 'var(--rhea-card-fg)' }}>
                          {formatMoney(report.creditReconciliation.voidedTaxablePaisa)} ({report.creditReconciliation.voidedInvoiceCount} invoices)
                        </dd>
                      </div>
                      <div>
                        <dt style={{ color: 'var(--rhea-muted-fg)', fontSize: '0.825rem' }}>Credit-note amount (settlement basis)</dt>
                        <dd style={{ margin: 0, fontWeight: 600, fontSize: '1rem', color: 'var(--rhea-card-fg)' }}>
                          {formatMoney(report.creditReconciliation.creditNoteAmountPaisa)} ({report.creditReconciliation.creditNoteCount} notes)
                        </dd>
                      </div>
                    </dl>
                    {report.creditReconciliation.paidVoidMismatchCount > 0 || report.creditReconciliation.activeInvoiceCreditNoteCount > 0 ? (
                      <p role="alert" style={{ margin: '8px 0 0', padding: '10px 14px', borderRadius: 'var(--rhea-radius-sm)', background: 'var(--danger-bg, #fee2e2)', color: 'var(--danger-fg, #991b1b)' }}>
                        Manual ledger review needed: {report.creditReconciliation.paidVoidMismatchCount} paid voided invoice(s)
                        with credit-note amounts not matching paid amounts, and {report.creditReconciliation.activeInvoiceCreditNoteCount}
                        credit note(s) on nonvoid invoices. Do not treat this as audited net sales.
                      </p>
                    ) : (
                      <p role="status" style={{ margin: '8px 0 0', color: 'var(--rhea-muted-fg)', fontSize: 'var(--t-meta)' }}>
                        No paid-void credit mismatches found in this invoice-date window. This is not an audited net-sales statement.
                      </p>
                    )}
                  </RheaCardContent>
                </RheaCard>

                {report.issuedCount === 0 && <p>No issued invoices recorded for the selected period.</p>}
              </>
              )}
              </PageBody>
            )}
          </div>
          <p style={{fontSize:'var(--t-meta)',color:'var(--text2)'}}>
            Detailed invoice records and settlement corrections remain available in <Link to="/finance?tab=invoices">Finance invoices</Link>.
            Previously hardcoded category and project-revenue figures are withheld until their attribution can be verified.
          </p>
        </>
      )}
    </div>
  )
}
