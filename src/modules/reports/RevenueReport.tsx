import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, KpiStrip, Button, cardStyle } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { DataTableShell } from '../../components/ui/DataTable'
import { ReportToolbar, reportRangeDays } from '../../components/ui/ReportToolbar'
import type { ReportCompare, ReportCsvRow, ReportFilters } from '../../components/ui/ReportToolbar'
import { ReportFamiliesNav } from '../../components/ui/ReportFamiliesNav'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { EmptyState, ErrorBanner, LoadingSkeleton, RestrictedState } from '../../components/ui/StateViews'
import { InteractiveTrendChart, SERIES_STATUS_LABEL, type TrendSeries } from '../../components/ui/charts/InteractiveTrendChart'
import Icon from '../../components/ui/Icon'
import { formatAd, formatAdDateTime, businessDayAd } from '../../lib/bs'
import { formatMoney, type Paisa } from '../../lib/money'
import { useAuth } from '../../lib/auth'
import { useCanViewFinancialReports } from '../../lib/moneyVisibility'
import { useViewport } from '../../lib/device'
import { compactMoneyLabel, countLabel } from '../../lib/intel/chartScale'
import {
  bucketAxisLabel,
  bucketLongLabel,
  changeLabel,
  coverageNotes,
  summarySentence,
  windowLabel,
  type RevenueBucket,
  type RevenueTrendReport,
} from '../../lib/intel/revenueTrend'
import { loadRevenueTrend, type RevenueTrendResult } from '../../lib/queries/reportRevenueTrend'
import { listInvoices, type InvoiceListRow } from '../../lib/queries/finance'

/*
 * RULING 2026-10-14 (R14-18): the Revenue report shows only figures read from issued
 * invoices. It used to chart the Pulse seed ledger (a generated, browser-side
 * fixture) and print hardcoded category and project-type splits, fallback KPIs
 * ("42 invoices", "Rs 35,000 average") and a KPI total that summed voided
 * invoices. The category and project-type tabs are withdrawn until a verified
 * attribution source exists. Revert = restore this file from git history.
 */

type RevenueTab = 'trend' | 'invoices'
type RevenueView = 'revenue' | 'gross' | 'count'

const VIEWS: ReadonlyArray<{ id: RevenueView; label: string; series: string }> = [
  { id: 'revenue', label: 'Before VAT', series: 'Billed revenue (before VAT)' },
  { id: 'gross', label: 'Incl. VAT', series: 'Invoiced, VAT included' },
  { id: 'count', label: 'Invoices', series: 'Invoices issued' },
]

const DEFINITION_NOTE =
  'Billed revenue is the amount on issued invoices after discount and before VAT, dated by the invoice issue date. Draft and voided invoices are not counted; security deposits and cash collected are separate measures.'

const CATEGORY_UNAVAILABLE_NOTE =
  'Revenue by equipment category and by project type is not shown: invoices do not yet record a verified split, and invented shares would not reconcile with the totals above.'

function valueOf(b: RevenueBucket, view: RevenueView): number {
  return view === 'revenue' ? b.revenue : view === 'gross' ? b.gross : b.invoiceCount
}

function fmtView(view: RevenueView, v: number): string {
  return view === 'count' ? `${countLabel(v)} invoice${v === 1 ? '' : 's'}` : formatMoney(v as Paisa)
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

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; result: RevenueTrendResult }

export default function RevenueReport() {
  const permitted = useCanViewFinancialReports()
  const { user } = useAuth()
  const viewport = useViewport()
  const [tab, setTab] = useState<RevenueTab>('trend')
  const [view, setView] = useState<RevenueView>('revenue')
  const [filters, setFilters] = useState<ReportFilters>({})
  const [compare, setCompare] = useState<ReportCompare>('off')
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  const { fromDay, toDay } = reportRangeDays(filters.dateRange)
  // Compare needs a bounded period: "All dates" has no period before it.
  const bounded = fromDay !== null && toDay !== null
  const compareOn = bounded && compare === 'previous'

  useEffect(() => {
    // Never fetch for a role that may not see the figures — not "fetch and hide".
    if (!permitted) return
    let active = true
    setState({ kind: 'loading' })
    loadRevenueTrend({ fromDay, toDay, compare: compareOn, today: businessDayAd() })
      .then((result) => {
        if (active) setState({ kind: 'done', result })
      })
      .catch((cause: unknown) => {
        if (active) setState({ kind: 'error', message: cause instanceof Error ? cause.message : 'The invoices could not be read.' })
      })
    return () => {
      active = false
    }
  }, [permitted, fromDay, toDay, compareOn, revision])

  const report: RevenueTrendReport | null = state.kind === 'done' && state.result.kind === 'report' ? state.result.report : null

  const csvRows = useMemo<ReportCsvRow[] | null>(() => {
    if (!report) return null
    const { current, previous } = report
    const head: ReportCsvRow = [
      'Period',
      'Billed revenue (before VAT)',
      'VAT',
      'Invoiced (VAT included)',
      'Invoices issued',
      ...(previous ? ['Previous period', 'Previous billed revenue (before VAT)', 'Change'] : []),
    ]
    return [
      ['Measure', DEFINITION_NOTE],
      ['Data status', report.status === 'actual' ? 'Actual' : `Partial data: ${report.partialReasons.join(' ')}`],
      ['Covers', windowLabel(current.window)],
      ['Periods', current.granularity === 'month' ? 'AD calendar months' : 'Days'],
      ['Calculated', formatAdDateTime(report.calculatedAt)],
      [],
      head,
      ...current.buckets.map((b, i): ReportCsvRow => {
        const p = previous?.buckets[i]
        return [
          bucketLongLabel(b, current.granularity),
          formatMoney(b.revenue),
          formatMoney(b.vat),
          formatMoney(b.gross),
          b.invoiceCount,
          ...(previous && p ? [bucketLongLabel(p, previous.granularity, previous.layout), formatMoney(p.revenue), changeLabel(b.revenue, p.revenue)] : []),
        ]
      }),
      [
        'Total',
        formatMoney(current.totals.revenue),
        formatMoney(current.totals.vat),
        formatMoney(current.totals.gross),
        current.totals.invoiceCount,
        ...(previous
          ? [windowLabel(previous.window), formatMoney(previous.totals.revenue), changeLabel(current.totals.revenue, previous.totals.revenue)]
          : []),
      ],
    ]
  }, [report])

  if (!permitted) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <PageHeader icon="dollar" title="Revenue Reports" description="Billed revenue from issued invoices." />
        <ReportFamiliesNav current="Revenue" />
        <RestrictedState reason="Your role cannot view revenue reports." requiredRole="Owner, Admin, Manager or Accounts" />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader icon="dollar" title="Revenue Reports" description="Billed revenue from issued invoices, by period, with the invoice register." />

      <ReportFamiliesNav current="Revenue" />

      <ReportToolbar
        title="Revenue Reports"
        value={filters}
        onChange={setFilters}
        dateColumn="issue_date"
        {...(bounded && tab === 'trend' ? { compare, onCompareChange: setCompare } : {})}
        {...(tab === 'trend' && csvRows
          ? { csv: { filename: 'revenue-billed', build: () => csvRows, generatedBy: user?.name } }
          : {})}
      >
        <SegmentedControl<RevenueTab>
          ariaLabel="Revenue report views"
          size="sm"
          value={tab}
          onChange={setTab}
          options={[
            { id: 'trend', label: 'Revenue trend' },
            { id: 'invoices', label: 'Invoice register' },
          ]}
        />
      </ReportToolbar>

      {tab === 'trend' ? (
        <TrendPanel
          state={state}
          view={view}
          onView={setView}
          onRetry={() => setRevision((r) => r + 1)}
          kpiColumns={viewport === 'phone' ? 1 : viewport === 'tablet' ? 2 : 4}
        />
      ) : (
        <InvoiceRegister filters={filters} />
      )}

      <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.5 }}>
        {CATEGORY_UNAVAILABLE_NOTE} Every invoice, with its payments and credit notes, is in{' '}
        <Link to="/finance?tab=invoices" style={{ color: 'var(--link)', fontWeight: 600 }}>
          Finance ▸ Invoices
        </Link>
        .
      </p>
    </div>
  )
}

/* ── the trend tab ─────────────────────────────────────────────────────── */

function TrendPanel({
  state,
  view,
  onView,
  onRetry,
  kpiColumns,
}: {
  state: LoadState
  view: RevenueView
  onView: (v: RevenueView) => void
  onRetry: () => void
  kpiColumns: number
}) {
  if (state.kind === 'loading') return <LoadingSkeleton type="card" rows={4} label="Reading issued invoices…" />
  if (state.kind === 'error') {
    return <ErrorBanner title="Revenue could not be calculated" message={`${state.message} No figures are shown rather than incomplete ones.`} onRetry={onRetry} />
  }

  const result = state.result
  if (result.kind === 'no-history') {
    return (
      <section aria-label="Revenue trend" style={cardStyle}>
        <EmptyState kind="nothing-yet" title="No issued invoices yet" description="Revenue appears here once an invoice is issued. Drafts and voided invoices are not revenue." />
      </section>
    )
  }
  if (result.kind === 'future') {
    return (
      <section aria-label="Revenue trend" style={cardStyle}>
        <EmptyState title="This period has not started" description="Actual revenue can only be shown up to today. Choose a period that has begun." />
      </section>
    )
  }
  if (result.kind === 'inverted') {
    return (
      <section aria-label="Revenue trend" style={cardStyle}>
        <EmptyState title="The start date is after the end date" description="Swap the two dates to see this period." />
      </section>
    )
  }
  if (result.kind === 'too-long') {
    return (
      <section aria-label="Revenue trend" style={cardStyle}>
        <EmptyState
          title="Choose a period of five years or less"
          description={`This range covers ${result.months} months; the trend reads up to 60 at a time.`}
        />
      </section>
    )
  }

  return <TrendReport report={result.report} clampedToToday={result.clampedToToday} view={view} onView={onView} onRefresh={onRetry} kpiColumns={kpiColumns} />
}

function TrendReport({
  report,
  clampedToToday,
  view,
  onView,
  onRefresh,
  kpiColumns,
}: {
  report: RevenueTrendReport
  clampedToToday: boolean
  view: RevenueView
  onView: (v: RevenueView) => void
  onRefresh: () => void
  kpiColumns: number
}) {
  const { current, previous } = report
  const status = report.status === 'actual' ? 'actual' : 'partial'
  const viewMeta = VIEWS.find((v) => v.id === view) ?? VIEWS[0]!
  const g = current.granularity

  const points = useMemo(
    () => current.buckets.map((b) => ({ key: b.key, axisLabel: bucketAxisLabel(b, g), longLabel: bucketLongLabel(b, g) })),
    [current, g],
  )

  const series = useMemo<TrendSeries[]>(() => {
    const out: TrendSeries[] = [{ key: 'current', label: viewMeta.series, status, values: current.buckets.map((b) => valueOf(b, view)) }]
    if (previous) {
      out.push({ key: 'previous', label: 'Previous period', status, values: previous.buckets.map((b) => valueOf(b, view)), slot: 1, marker: 'square' })
    }
    return out
  }, [current, previous, view, viewMeta.series, status])

  const revenueDelta =
    previous && current.totals.revenue !== previous.totals.revenue
      ? {
          direction: current.totals.revenue > previous.totals.revenue ? ('up' as const) : ('down' as const),
          text: `${changeLabel(current.totals.revenue, previous.totals.revenue)} vs previous period`,
          good: current.totals.revenue > previous.totals.revenue,
        }
      : null

  const kpis: Kpi[] = [
    {
      label: 'Billed revenue',
      value: formatMoney(current.totals.revenue),
      icon: 'dollar',
      accent: 'primary',
      definition: 'Issued, non-voided invoices after discount and before VAT, by issue date.',
      zeroExplanation: 'No invoices were issued in this period.',
      ...(revenueDelta ? { delta: revenueDelta } : {}),
    },
    {
      label: 'Output VAT',
      value: formatMoney(current.totals.vat),
      icon: 'receipt',
      accent: 'neutral',
      definition: 'VAT charged on the same invoices. It is owed to the government and is not revenue.',
    },
    {
      label: 'Total incl. VAT',
      value: formatMoney(current.totals.gross),
      icon: 'invoice',
      accent: 'neutral',
      definition: 'The invoice totals as Finance ▸ Invoices shows them: billed revenue plus VAT.',
    },
    {
      label: 'Invoices issued',
      value: countLabel(current.totals.invoiceCount),
      icon: 'file',
      accent: 'neutral',
      definition: 'Issued invoices in the period. Drafts and voided invoices are excluded.',
      ...(previous ? { detail: `${countLabel(previous.totals.invoiceCount)} in the previous period` } : {}),
    },
  ]

  const nothingIssued = current.totals.invoiceCount === 0 && (!previous || previous.totals.invoiceCount === 0)
  const notes = [
    ...coverageNotes(current),
    ...(clampedToToday ? [`The chosen period ends after today, so the figures run to today, ${formatAd(new Date(`${current.window.toDay}T00:00:00.000Z`))}.`] : []),
  ]

  const describePoint = previous
    ? (i: number) => {
        const p = previous.buckets[i]
        const c = current.buckets[i]
        if (!p || !c) return null
        return `Previous period, ${bucketLongLabel(p, previous.granularity, previous.layout)}: ${fmtView(view, valueOf(p, view))} (${changeLabel(valueOf(c, view), valueOf(p, view))})`
      }
    : undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <KpiStrip items={kpis} columns={kpiColumns} />

      <section aria-labelledby="revenue-trend-title" style={{ ...cardStyle, padding: 'var(--sp-md)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--sp-sm)' }}>
          <div style={{ minWidth: 0 }}>
            <h3 id="revenue-trend-title" style={{ margin: 0, fontSize: 'var(--t-h3)', color: 'var(--text)' }}>
              Billed revenue by {g === 'month' ? 'month' : 'day'}
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              {windowLabel(current.window)} · {g === 'month' ? 'AD calendar months' : 'days'} · Data: {SERIES_STATUS_LABEL[status]}
              {previous ? ` · Compared with ${windowLabel(previous.window)}` : ''}
            </p>
          </div>
          <SegmentedControl<RevenueView>
            ariaLabel="Chart measure"
            size="sm"
            value={view}
            onChange={onView}
            options={VIEWS.map((v) => ({ id: v.id, label: v.label }))}
          />
        </div>

        {report.status === 'partial' && (
          <div
            role="note"
            style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 'var(--r-sm)', background: 'var(--st-warn-bg)', color: 'var(--st-warn-fg)', fontSize: 'var(--t-meta)' }}
          >
            <Icon name="alert_triangle" size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>Partial data.</strong> {report.partialReasons.join(' ')}
            </div>
          </div>
        )}

        {nothingIssued ? (
          <p style={{ margin: 'var(--sp-sm) 0', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>No invoices were issued in this period, so there is no line to draw.</p>
        ) : (
          <InteractiveTrendChart
            title={`${viewMeta.series} by ${g === 'month' ? 'month' : 'day'}`}
            points={points}
            series={series}
            formatValue={(v) => fmtView(view, v)}
            formatTick={view === 'count' ? countLabel : compactMoneyLabel}
            minStep={view === 'count' ? 1 : 100}
            showTable={false}
            {...(describePoint ? { describePoint } : {})}
          />
        )}

        <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <p style={{ margin: 0, color: 'var(--text)' }}>{summarySentence(current)}</p>
          {notes.map((n) => (
            <p key={n} style={{ margin: 0 }}>
              {n}
            </p>
          ))}
          <p style={{ margin: 0 }}>{DEFINITION_NOTE}</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
          <span>Calculated {formatAdDateTime(report.calculatedAt)} from the invoices on record.</span>
          <Button icon="refresh" onClick={onRefresh}>
            Refresh
          </Button>
        </div>
      </section>

      <DataTableShell ariaLabel="Billed revenue by period">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <caption className="sr-only">Billed revenue by period, with VAT and invoice counts</caption>
          <thead>
            <tr>
              <th scope="col" style={th}>Period</th>
              <th scope="col" style={{ ...th, textAlign: 'right' }}>Billed revenue (before VAT)</th>
              <th scope="col" style={{ ...th, textAlign: 'right' }}>VAT</th>
              <th scope="col" style={{ ...th, textAlign: 'right' }}>Invoiced, VAT included</th>
              <th scope="col" style={{ ...th, textAlign: 'right' }}>Invoices</th>
              {previous && <th scope="col" style={{ ...th, textAlign: 'right' }}>Previous period (before VAT)</th>}
              {previous && <th scope="col" style={{ ...th, textAlign: 'right' }}>Change</th>}
            </tr>
          </thead>
          <tbody>
            {current.buckets.map((b, i) => {
              const p = previous?.buckets[i]
              return (
                <tr key={b.key}>
                  <th scope="row" style={{ ...td, fontWeight: 600, textAlign: 'left' }}>
                    {bucketLongLabel(b, g)}
                  </th>
                  <td style={num} className="figure">{formatMoney(b.revenue)}</td>
                  <td style={num} className="figure">{formatMoney(b.vat)}</td>
                  <td style={num} className="figure">{formatMoney(b.gross)}</td>
                  <td style={num} className="figure">{countLabel(b.invoiceCount)}</td>
                  {previous && <td style={num} className="figure">{p ? formatMoney(p.revenue) : '—'}</td>}
                  {previous && <td style={num} className="figure">{p ? changeLabel(b.revenue, p.revenue) : '—'}</td>}
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" style={{ ...td, fontWeight: 700, textAlign: 'left' }}>Total</th>
              <td style={{ ...num, fontWeight: 700 }} className="figure">{formatMoney(current.totals.revenue)}</td>
              <td style={{ ...num, fontWeight: 700 }} className="figure">{formatMoney(current.totals.vat)}</td>
              <td style={{ ...num, fontWeight: 700 }} className="figure">{formatMoney(current.totals.gross)}</td>
              <td style={{ ...num, fontWeight: 700 }} className="figure">{countLabel(current.totals.invoiceCount)}</td>
              {previous && <td style={{ ...num, fontWeight: 700 }} className="figure">{formatMoney(previous.totals.revenue)}</td>}
              {previous && <td style={{ ...num, fontWeight: 700 }} className="figure">{changeLabel(current.totals.revenue, previous.totals.revenue)}</td>}
            </tr>
          </tfoot>
        </table>
      </DataTableShell>
    </div>
  )
}

/* ── the invoice register tab ──────────────────────────────────────────── */

const REGISTER_PAGE = 100

function InvoiceRegister({ filters }: { filters: ReportFilters }) {
  const [rows, setRows] = useState<InvoiceListRow[] | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true
    setRows(null)
    setError(null)
    listInvoices({ page: { index: 0, size: REGISTER_PAGE }, dateRange: filters.dateRange, withCount: true })
      .then((res) => {
        if (!active) return
        setRows(res.rows)
        setTotal(res.total ?? null)
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'The invoices could not be read.')
      })
    return () => {
      active = false
    }
  }, [filters.dateRange, revision])

  if (error) return <ErrorBanner title="The invoice register could not be loaded" message={error} onRetry={() => setRevision((r) => r + 1)} />
  if (rows === null) return <LoadingSkeleton rows={6} label="Loading invoices…" />
  if (rows.length === 0) {
    return (
      <section aria-label="Invoice register" style={cardStyle}>
        <EmptyState title="No invoices in this period" description="Choose a wider period, or issue an invoice from a rental." />
      </section>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
      <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
        {total !== null && total > rows.length
          ? `Showing the ${rows.length} most recent of ${total} invoices. Finance ▸ Invoices lists them all.`
          : `${rows.length} invoice${rows.length === 1 ? '' : 's'}, newest first.`}{' '}
        Voided invoices are listed for the record; they are never counted as revenue.
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
                  <Link to={`/finance?invoice=${encodeURIComponent(inv.invoiceNo)}`} style={{ color: 'var(--link)', fontWeight: 600, textDecoration: 'none' }}>
                    {inv.invoiceNo}
                  </Link>
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
    </div>
  )
}
