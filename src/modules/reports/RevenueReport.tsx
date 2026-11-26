import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, Button } from '../../components/ui/Page'
import { ReportFamiliesNav } from '../../components/ui/ReportFamiliesNav'
import { ReportToolbar, reportDateRange } from '../../components/ui/ReportToolbar'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import type { ReportCompare, ReportCsvRow, ReportFilters } from '../../components/ui/ReportToolbar'
import { PageBody } from '../../components/ui/PageBody'
import { useLoad } from '../../lib/queries/useLoad'
import { formatMoney, rupees } from '../../lib/money'
import { businessDayAd } from '../../lib/bs'
import { useCanViewFinancialReports } from '../../lib/moneyVisibility'
import { getEarliestIssueDay, getIssuedRevenueTrend, type IssuedRevenueReport } from '../../lib/queries/reportRevenueTrend'
import { coverageNotes } from '../../lib/intel/revenueTrend'
import { averageReportAmount, hasRevenueActivity, precedingReportWindow, reportMoneyChange } from '../../lib/intel/reportPresentation'
import {
  ReportAreaChart,
  ReportChartCard,
  ReportKpiCard,
  ReportKpiStrip,
  ReportDataTable,
  type ReportChartPoint,
} from '../../components/ui/reports'
import { RevenueInvoiceRegister } from './RevenueInvoiceRegister'
import '../../styles/reportChartTokens.css'

type RevenueTab = 'trend' | 'register'

/**
 * This report displays ONLY successfully fetched taxable issued-invoice values.
 * It does not pretend that a 100-row register, pulse fixture or seeded category
 * split represents the full ledger. Credit adjustments require a separate
 * reconciled ledger definition and are intentionally not claimed here.
 */

function daysAgo(day: string, count: number): string {
  const d = new Date(day + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - count)
  return d.toISOString().slice(0, 10)
}

function readReportDate(value: string | undefined, fallback: string): string {
  if (!value) return fallback
  return value.slice(0, 10)
}

/** Calendar months from `fromAd` to `toAd`, both inclusive. */
function calendarMonths(fromAd: string, toAd: string): number {
  return (Number(toAd.slice(0, 4)) - Number(fromAd.slice(0, 4))) * 12 + Number(toAd.slice(5, 7)) - Number(fromAd.slice(5, 7)) + 1
}

/** The default window: the 90 days ending on `today`. */
function defaultFilters(today: string): ReportFilters {
  return { dateRange: reportDateRange('issue_date', daysAgo(today, 89), today) }
}

/**
 * RULING 2026-11-19 (R19-1, restoring R17-7): All dates runs from the 1st of the
 * first issued invoice's month to today. Nothing was issued earlier in that
 * month, so the first month is complete and is never labelled a part month.
 */
async function loadAllDates(today: string): Promise<IssuedRevenueReport> {
  const earliest = await getEarliestIssueDay()
  const start = earliest ? `${earliest.slice(0, 8)}01` : today
  const months = calendarMonths(start, today)
  if (months > 24) {
    throw new Error(`All dates covers ${months} calendar months; the trend reads up to 24 at a time. Choose a shorter period.`)
  }
  return getIssuedRevenueTrend(start, today, today)
}

export default function RevenueReport() {
  // RULING 2026-10-17 (R17-1): the gate lives in rbac.ts, shared with the report menu.
  const permitted = useCanViewFinancialReports()
  const today = businessDayAd()
  const [filters, setFilters] = useState<ReportFilters>(() => defaultFilters(businessDayAd()))
  const [compare, setCompare] = useState<ReportCompare>('off')
  const [tab, setTab] = useState<RevenueTab>('trend')

  // All dates is the toolbar with no bounds. Its window is checked when it loads (loadAllDates).
  const allDates = !filters.dateRange?.fromAd && !filters.dateRange?.toAd
  const from = allDates ? today : readReportDate(filters.dateRange?.fromAd, daysAgo(today, 89))
  const to = readReportDate(filters.dateRange?.toAd, today)
  const displayedFilters: ReportFilters = allDates ? filters : { ...filters, dateRange: reportDateRange('issue_date', from, to) }
  // Compare needs a bounded period; All dates has no period before it.
  const effectiveCompare: ReportCompare = allDates ? 'off' : compare
  const windowIsValid =
    from <= to &&
    (new Date(to + 'T00:00:00Z').getUTCFullYear() - new Date(from + 'T00:00:00Z').getUTCFullYear()) * 12 +
      new Date(to + 'T00:00:00Z').getUTCMonth() -
      new Date(from + 'T00:00:00Z').getUTCMonth() <
      24

  const isDefaultWindow = !allDates && from === daysAgo(today, 89) && to === today
  const filtered = !allDates && !isDefaultWindow
  const load = useLoad<IssuedRevenueReport>(() => (allDates ? loadAllDates(today) : getIssuedRevenueTrend(from, to, today)), {
    key: `${allDates ? 'all' : from}|${to}|${today}`,
    enabled: permitted && windowIsValid,
  })

  const report = load.data
  const displayedFrom = report?.fromAd ?? from
  const displayedTo = report?.toAd ?? to
  const previousWindow = useMemo(() => (windowIsValid && !allDates ? precedingReportWindow(from, to) : null), [from, to, windowIsValid, allDates])
  const priorLoad = useLoad<IssuedRevenueReport>(() => {
    if (!previousWindow) return Promise.reject(new Error('Invalid comparison window'))
    return getIssuedRevenueTrend(previousWindow.fromAd, previousWindow.toAd, today)
  }, { key: previousWindow ? `${previousWindow.fromAd}|${previousWindow.toAd}|${today}` : 'invalid', enabled: permitted && windowIsValid && effectiveCompare === 'previous' })
  const prior = effectiveCompare === 'previous' && previousWindow && !priorLoad.loading && !priorLoad.error && report?.fromAd === from && report.toAd === to && priorLoad.data?.fromAd === previousWindow.fromAd && priorLoad.data.toAd === previousWindow.toAd ? priorLoad.data : null

  const rows: ReportCsvRow[] = useMemo(() => {
    if (!report) return []
    return [
      ['Report', 'Issued invoice taxable revenue (monthly trend)'],
      ['Basis', 'Taxable invoice amounts before VAT for issued invoices grouped by AD issue date. Excludes drafts and voids. Credit notes are reconciled below on a cash-paid correction basis, not as taxable sales deductions.'],
      ['Date window', `${displayedFrom} to ${displayedTo}`],
      ...(effectiveCompare === 'previous' && previousWindow ? [
        ['Previous date window', `${previousWindow.fromAd} to ${previousWindow.toAd}`],
        ...(prior ? [['Previous taxable value', formatMoney(prior.totalPaisa)], ['Change from previous period', reportMoneyChange(report.totalPaisa, prior.totalPaisa).value]] : [['Previous period status', 'Not available']]),
      ] as ReportCsvRow[] : []),
      ['Total taxable value', formatMoney(report.totalPaisa)],
      ['Total issued invoices', report.issuedCount],
      ['Voided invoice taxable value excluded', formatMoney(report.creditReconciliation.voidedTaxablePaisa)],
      ['Voided invoices excluded', report.creditReconciliation.voidedInvoiceCount],
      ['Credit notes issued on period invoices', report.creditReconciliation.creditNoteCount],
      ['Total credit-note value', formatMoney(report.creditReconciliation.creditNoteAmountPaisa)],
      ['Paid voids needing credit review', report.creditReconciliation.paidVoidMismatchCount],
      ['Credit notes on active invoices for review', report.creditReconciliation.activeInvoiceCreditNoteCount],
      ['Month', 'Taxable value', 'Issued invoices'],
      ...report.months.map((m) => [m.longLabel || m.label, formatMoney(m.amountPaisa), m.invoiceCount] as ReportCsvRow),
      ['Total', formatMoney(report.totalPaisa), report.issuedCount],
      ...(prior ? [[], ['Previous period monthly detail'], ['Month', 'Taxable value', 'Issued invoices'], ...prior.months.map(month => [month.longLabel || month.label, formatMoney(month.amountPaisa), month.invoiceCount]), ['Total', formatMoney(prior.totalPaisa), prior.issuedCount]] as ReportCsvRow[] : []),
    ]
  }, [report, displayedFrom, displayedTo, effectiveCompare, previousWindow, prior])

  const chartData: ReportChartPoint[] = useMemo(() => {
    if (!report) return []
    return report.months.map((m) => ({
      periodKey: m.periodStartUtc,
      periodLabel: m.label,
      value: m.amountPaisa,
      formattedValue: formatMoney(m.amountPaisa),
      subText: `${m.longLabel} · ${m.invoiceCount} issued invoice${m.invoiceCount === 1 ? '' : 's'}`,
    }))
  }, [report])

  const averageInvoicePaisa = useMemo(() => {
    return report ? averageReportAmount(report.totalPaisa, report.issuedCount) : rupees(0)
  }, [report])
  const notes = useMemo(() => {
    if (!report) return []
    return coverageNotes(report)
  }, [report])
  const detailRows = useMemo(() => [
    ...(report?.months ?? []).map(month => ({ ...month, series: 'Current', id: `current-${month.periodStartUtc}` })),
    ...(prior?.months ?? []).map(month => ({ ...month, series: 'Previous', id: `previous-${month.periodStartUtc}` })),
  ], [report, prior])

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
            value={displayedFilters}
            onChange={setFilters}
            dateColumn="issue_date"
            {...(allDates ? {} : { compare, onCompareChange: setCompare })}
            {...(tab === 'trend' && !load.loading && !load.error && report && (effectiveCompare === 'off' || (prior && !priorLoad.loading && !priorLoad.error)) ? { csv: { filename: 'revenue-issued-monthly', build: () => rows } } : {})}
          />
          {windowIsValid && (
            <SegmentedControl<RevenueTab>
              ariaLabel="Revenue report views"
              size="sm"
              value={tab}
              onChange={setTab}
              options={[
                { id: 'trend', label: 'Revenue trend' },
                { id: 'register', label: 'Invoice register' },
              ]}
            />
          )}
          {tab === 'trend' && effectiveCompare === 'previous' && previousWindow && <div style={{ color: 'var(--text2)' }}>
            Previous period: {previousWindow.fromAd} to {previousWindow.toAd} · same number of days, immediately before the selected period.
            {priorLoad.loading && <p role="status">Loading previous period…</p>}
            {priorLoad.error && <p role="alert">Previous period unavailable: {priorLoad.error} <Button variant="secondary" onClick={priorLoad.reload}>Retry comparison</Button></p>}
          </div>}

          {tab === 'register' && windowIsValid ? (
            <RevenueInvoiceRegister key={`${allDates ? 'all' : from}|${to}`} {...(allDates ? {} : { fromAd: from })} toAd={to} />
          ) : !windowIsValid ? (
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
              empty={report !== null && !hasRevenueActivity(report) && (!prior || !hasRevenueActivity(prior))}
              emptyIsFiltered={filtered}
              onClearFilters={() => setFilters(defaultFilters(today))}
              emptyTitle={filtered ? 'No revenue recorded in this period' : allDates ? 'No invoices issued yet' : 'No invoices issued in the last 90 days'}
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
                      {...(prior ? { delta: reportMoneyChange(report.totalPaisa, prior.totalPaisa) } : {})}
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
                    dateWindow={`${displayedFrom} to ${displayedTo}`}
                    source="Finance · issued invoices"
                    description={
                      notes.length > 0
                        ? `Current nonvoid invoice snapshot grouped by issue month. ${notes.join(' ')} Draft and void invoices excluded. Credit notes record paid amounts, not taxable sales deductions.`
                        : "Current nonvoid invoice snapshot grouped by issue month. Later voids may restate older months. Draft and void invoices excluded. Credit notes record paid amounts, not taxable sales deductions."
                    }
                    ariaLabel="Issued invoice revenue trend"
                    reconciliation={
                      <section aria-label="Credit-note reconciliation for selected invoice dates" style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                        <h4 style={{ margin: '0 0 8px', fontSize: 'var(--t-body, 14px)', fontWeight: 600 }}>
                          Credit-note reconciliation
                        </h4>
                        <p style={{ color: 'var(--text2)', fontSize: 'var(--t-meta, 12px)', margin: '0 0 10px' }}>
                          For invoices issued {displayedFrom} to {displayedTo}, including voided invoices omitted from the chart.
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
                      currency="NPR"
                      valueUnit="paisa"
                      height={280}
                      empty={report.months.length === 0}
                      emptyMessage="No issued invoices recorded for the selected period."
                    />
                  </ReportChartCard>
                  <ReportDataTable
                    ariaLabel="Monthly invoice revenue details"
                    rows={detailRows}
                    getRowId={row => row.id}
                    sourceAction={<Link to="/finance?tab=invoices" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', color: 'var(--link)' }}>Open source invoices</Link>}
                    columns={[
                      { id: 'period', header: 'Month', cell: row => row.longLabel || row.label, sortValue: row => row.periodStartUtc },
                      { id: 'series', header: 'Period', cell: row => row.series, sortValue: row => row.series },
                      { id: 'amount', header: 'Taxable value', align: 'right', cell: row => formatMoney(row.amountPaisa), sortValue: row => row.amountPaisa },
                      { id: 'count', header: 'Issued invoices', align: 'right', cell: row => row.invoiceCount, sortValue: row => row.invoiceCount },
                    ]}
                  />
                </>
              )}
            </PageBody>
          )}

          {/* Developer note, not UI copy: the category and project-revenue figures that were once hard-coded seed
              values are withheld until their attribution can be verified. */}
          <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 4 }}>
            Detailed invoice records and settlement corrections remain available in{' '}
            <Link to="/finance?tab=invoices" style={{ color: 'var(--link)' }}>
              Finance invoices
            </Link>
            . Category and project revenue figures are not shown until their attribution is verified.
          </p>
        </>
      )}
    </div>
  )
}
