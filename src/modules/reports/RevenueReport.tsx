import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../../components/ui/Page'
import { ReportFamiliesNav } from '../../components/ui/ReportFamiliesNav'
import { ReportToolbar } from '../../components/ui/ReportToolbar'
import type { ReportCsvRow, ReportFilters } from '../../components/ui/ReportToolbar'
import { PageBody } from '../../components/ui/PageBody'
import { useLoad } from '../../lib/queries/useLoad'
import { formatMoney, type Paisa } from '../../lib/money'
import { businessDayAd } from '../../lib/bs'
import { useAuth } from '../../lib/auth'
import { getIssuedRevenueTrend, type IssuedRevenueReport } from '../../lib/queries/reportRevenueTrend'
import {
  ReportAreaChart,
  ReportChartCard,
  ReportKpiCard,
  ReportKpiStrip,
  type ReportChartPoint,
} from '../../components/ui/reports'
import '../../styles/reportChartTokens.css'
import '../../styles/shadcn-preset-pilot.css'

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
  return value.slice(0, 10)
}

export default function RevenueReport() {
  const { user } = useAuth()
  const permitted = Boolean(user && EXECUTIVE_ROLES.has(user.role))
  const today = businessDayAd()
  const [filters, setFilters] = useState<ReportFilters>({})

  const from = readReportDate(filters.dateRange?.fromAd, daysAgo(today, 89))
  const to = readReportDate(filters.dateRange?.toAd, today)
  const windowIsValid =
    from <= to &&
    (new Date(to + 'T00:00:00Z').getUTCFullYear() - new Date(from + 'T00:00:00Z').getUTCFullYear()) * 12 +
      new Date(to + 'T00:00:00Z').getUTCMonth() -
      new Date(from + 'T00:00:00Z').getUTCMonth() <
      24

  const filtered = Boolean(filters.dateRange?.fromAd || filters.dateRange?.toAd)
  const load = useLoad<IssuedRevenueReport>(() => getIssuedRevenueTrend(from, to), {
    key: `${from}|${to}`,
    enabled: permitted && windowIsValid,
  })

  const report = load.data

  const rows: ReportCsvRow[] = useMemo(() => {
    if (!report) return []
    return [
      ['Report', 'Issued invoice taxable revenue (monthly trend)'],
      ['Basis', 'Taxable invoice amounts before VAT for issued invoices grouped by AD issue date. Excludes drafts and voids. Credit notes are reconciled below on a cash-paid correction basis, not as taxable sales deductions.'],
      ['Date window', `${from} to ${to}`],
      ['Total taxable value', formatMoney(report.totalPaisa)],
      ['Total issued invoices', report.issuedCount],
      ['Voided invoice taxable value excluded', formatMoney(report.creditReconciliation.voidedTaxablePaisa)],
      ['Voided invoices excluded', report.creditReconciliation.voidedInvoiceCount],
      ['Credit notes issued on period invoices', report.creditReconciliation.creditNoteCount],
      ['Total credit-note value', formatMoney(report.creditReconciliation.creditNoteAmountPaisa)],
      ['Paid voids needing credit review', report.creditReconciliation.paidVoidMismatchCount],
      ['Credit notes on active invoices for review', report.creditReconciliation.activeInvoiceCreditNoteCount],
      ['Month', 'Taxable value', 'Issued invoices'],
      ...report.months.map((m) => [m.label, formatMoney(m.amountPaisa), m.invoiceCount] as ReportCsvRow),
      ['Total', formatMoney(report.totalPaisa), report.issuedCount],
    ]
  }, [report, from, to])

  const chartData: ReportChartPoint[] = useMemo(() => {
    if (!report) return []
    return report.months.map((m) => ({
      periodKey: m.periodStartUtc,
      periodLabel: m.label,
      value: m.amountPaisa,
      formattedValue: formatMoney(m.amountPaisa),
      subText: `${m.invoiceCount} issued invoice${m.invoiceCount === 1 ? '' : 's'}`,
    }))
  }, [report])

  const averageInvoicePaisa = useMemo<Paisa>(() => {
    if (!report || report.issuedCount === 0) return 0 as Paisa
    return Math.round(report.totalPaisa / report.issuedCount) as Paisa
  }, [report])

  return (
    <div
      className="babin-report br-preset-pilot"
      data-ui-preset="rhea"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}
    >
      <PageHeader
        icon="dollar"
        title="Revenue Reports"
        description="Issued invoice taxable revenue, excluding VAT and unissued or void invoices."
      />
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
          <ReportToolbar
            title="Revenue Reports"
            value={filters}
            onChange={setFilters}
            dateColumn="issue_date"
            {...(!load.loading && !load.error && report ? { csv: { filename: 'revenue-issued-monthly', build: () => rows } } : {})}
          />

          {!windowIsValid ? (
            <div
              role="alert"
              style={{
                padding: 'var(--sp-md)',
                borderRadius: 'var(--r-card)',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                color: 'var(--st-cancelled-fg, #ef4444)',
              }}
            >
              Selected date range is invalid. Please select an end date on or after the start date, spanning less than 24 months.
            </div>
          ) : (
            <PageBody
              noun="revenue"
              loading={load.loading}
              error={load.error}
              onRetry={load.reload}
              hasRows={report !== null}
              skeleton="table"
              empty={report !== null && report.issuedCount === 0}
              emptyIsFiltered={filtered}
              onClearFilters={() => setFilters({})}
              emptyTitle={filtered ? 'No revenue recorded in this period' : 'No invoices issued in the last 90 days'}
              emptyMessage={
                filtered
                  ? 'No taxable nonvoid invoices were issued in the selected date window. Clear the filters to see the default 90-day window.'
                  : 'Revenue figures appear here once invoices are issued to clients in Finance.'
              }
            >
              {report && (
                <>
                  {/* KPI Summary Strip */}
                  <ReportKpiStrip ariaLabel="Revenue summary metrics">
                    <ReportKpiCard
                      label="Taxable revenue"
                      value={formatMoney(report.totalPaisa)}
                      icon="dollar"
                      note="Before VAT · Actual"
                    />
                    <ReportKpiCard
                      label="Issued invoices"
                      value={report.issuedCount}
                      icon="file"
                      note={`${report.months.length} calendar months`}
                    />
                    <ReportKpiCard
                      label="Average invoice"
                      value={formatMoney(averageInvoicePaisa)}
                      icon="receipt"
                      note="Per issued invoice"
                    />
                    <ReportKpiCard
                      label="Excluded voids"
                      value={formatMoney(report.creditReconciliation.voidedTaxablePaisa)}
                      icon="archive"
                      note={`${report.creditReconciliation.voidedInvoiceCount} voided invoices`}
                    />
                  </ReportKpiStrip>

                  {/* Primary Chart Card */}
                  <ReportChartCard
                    title="Monthly issued invoice revenue"
                    basis="Actual taxable invoice amounts before VAT · AD calendar months"
                    dateWindow={`${from} to ${to}`}
                    source="Finance · issued invoices"
                    description="Current nonvoid invoice snapshot grouped by issue month. Later voids may restate older months. Draft and void invoices excluded. Credit notes record paid amounts, not taxable sales deductions."
                    ariaLabel="Issued invoice revenue trend"
                    reconciliation={
                      <section aria-label="Credit-note reconciliation for selected invoice dates" style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                        <h4 style={{ margin: '0 0 8px', fontSize: 'var(--t-body, 14px)', fontWeight: 600 }}>
                          Credit-note reconciliation
                        </h4>
                        <p style={{ color: 'var(--text2)', fontSize: 'var(--t-meta, 12px)', margin: '0 0 10px' }}>
                          For invoices issued {from} to {to}, including voided invoices omitted from the chart.
                          Credit-note amounts reflect paid-value corrections, not taxable sales credits;
                          notes issued for invoices outside this period are not in this check.
                        </p>
                        <dl style={{ display: 'flex', flexWrap: 'wrap', gap: 24, margin: '0 0 10px' }}>
                          <div>
                            <dt style={{ color: 'var(--text2)', fontSize: 11 }}>Voided invoice taxable amount excluded</dt>
                            <dd style={{ margin: 0, fontWeight: 600, fontFamily: 'JetBrains Mono Variable, monospace' }}>
                              {formatMoney(report.creditReconciliation.voidedTaxablePaisa)} ({report.creditReconciliation.voidedInvoiceCount} invoices)
                            </dd>
                          </div>
                          <div>
                            <dt style={{ color: 'var(--text2)', fontSize: 11 }}>Credit-note amount (settlement basis)</dt>
                            <dd style={{ margin: 0, fontWeight: 600, fontFamily: 'JetBrains Mono Variable, monospace' }}>
                              {formatMoney(report.creditReconciliation.creditNoteAmountPaisa)} ({report.creditReconciliation.creditNoteCount} notes)
                            </dd>
                          </div>
                        </dl>
                        {report.creditReconciliation.paidVoidMismatchCount > 0 || report.creditReconciliation.activeInvoiceCreditNoteCount > 0 ? (
                          <p role="alert" style={{ color: 'var(--st-cancelled-fg, #ef4444)', margin: 0 }}>
                            Manual ledger review needed: {report.creditReconciliation.paidVoidMismatchCount} paid voided invoice(s)
                            with credit-note amounts not matching paid amounts, and {report.creditReconciliation.activeInvoiceCreditNoteCount}
                            credit note(s) on nonvoid invoices. Do not treat this as audited net sales.
                          </p>
                        ) : (
                          <p role="status" style={{ color: 'var(--text2)', margin: 0 }}>
                            No paid-void credit mismatches found in this invoice-date window. This is not an audited net-sales statement.
                          </p>
                        )}
                      </section>
                    }
                  >
                    <ReportAreaChart
                      data={chartData}
                      ariaLabel="Issued invoice revenue trend chart"
                      metricLabel="Taxable invoice revenue"
                      height={280}
                      empty={report.months.length === 0}
                      emptyMessage="No issued invoices recorded for the selected period."
                    />
                  </ReportChartCard>
                </>
              )}
            </PageBody>
          )}

          <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 4 }}>
            Detailed invoice records and settlement corrections remain available in{' '}
            <Link to="/finance?tab=invoices" style={{ color: 'var(--link)' }}>
              Finance invoices
            </Link>
            . Previously hardcoded category and project-revenue figures are withheld until their attribution can be verified.
          </p>
        </>
      )}
    </div>
  )
}
