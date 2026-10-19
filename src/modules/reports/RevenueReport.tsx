import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, KpiStrip, Button, cardStyle } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { DataTableShell } from '../../components/ui/DataTable'
import { ReportFamiliesNav } from '../../components/ui/ReportFamiliesNav'
import { ReportToolbar, reportPresetRange, reportRangeDays } from '../../components/ui/ReportToolbar'
import type { ReportCompare, ReportCsvRow, ReportFilters } from '../../components/ui/ReportToolbar'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { EmptyState, ErrorBanner, LoadingSkeleton, RestrictedState } from '../../components/ui/StateViews'
import { InteractiveTrendChart, type TrendSeries } from '../../components/ui/charts/InteractiveTrendChart'
import { formatMoney, type Paisa } from '../../lib/money'
import { businessDayAd, formatAd } from '../../lib/bs'
import { useAuth } from '../../lib/auth'
import { useCanViewFinancialReports } from '../../lib/moneyVisibility'
import { compactMoneyLabel, countLabel } from '../../lib/intel/chartScale'
import { changeLabel, coverageNotes, dayLabel, windowLabel, type RevenueMonth, type RevenueTrend } from '../../lib/intel/revenueTrend'
import {
  getEarliestIssueDay,
  getIssuedRevenueTrend,
  getPreviousIssuedRevenue,
  type IssuedRevenueReport,
} from '../../lib/queries/reportRevenueTrend'
import { listInvoices, type InvoiceListRow } from '../../lib/queries/finance'

/**
 * This report displays ONLY successfully fetched taxable issued-invoice values.
 * It does not pretend that a 100-row register, pulse fixture or seeded category
 * split represents the full ledger. Credit adjustments require a separate
 * reconciled ledger definition and are intentionally not claimed here.
 */

type RevenueTab = 'trend' | 'invoices'
// RULING 2026-10-17 (R17-8): the one view switcher is taxable amount or invoice count —
// both from the same read. VAT views wait for the engine to read VAT (not ported from #16).
type RevenueView = 'revenue' | 'count'

const VIEWS: ReadonlyArray<{ id: RevenueView; label: string; series: string }> = [
  { id: 'revenue', label: 'Before VAT', series: 'Taxable amount (before VAT)' },
  { id: 'count', label: 'Invoices', series: 'Invoices issued' },
]

const MAX_MONTHS = 24

function monthSpan(fromAd: string, toAd: string): number {
  return (Number(toAd.slice(0, 4)) - Number(fromAd.slice(0, 4))) * 12 + Number(toAd.slice(5, 7)) - Number(fromAd.slice(5, 7)) + 1
}

const valueOf = (m: RevenueMonth, view: RevenueView) => (view === 'revenue' ? m.amountPaisa : m.invoiceCount)
const fmtView = (view: RevenueView, v: number) =>
  view === 'count' ? `${countLabel(v)} invoice${v === 1 ? '' : 's'}` : formatMoney(v as Paisa)

/**
 * What the toolbar's range resolves to. RULING 2026-10-17 (R17-7): the page
 * starts on the toolbar's own "Last 90 days", so the control names the window
 * the chart draws. "All dates" runs from the 1st of the first issued invoice's
 * month (voids included) to today; an end after today stops at today, because
 * no invoice can be issued later.
 */
type Window =
  | { kind: 'ok'; fromAd: string; toAd: string; clamped: boolean }
  | { kind: 'nothing-issued' }
  | { kind: 'future' }
  | { kind: 'inverted' }
  | { kind: 'too-long'; months: number }

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'window'; window: Exclude<Window, { kind: 'ok' }> }
  | { kind: 'done'; report: IssuedRevenueReport; previous: RevenueTrend | null; clamped: boolean }

async function resolveWindow(fromDay: string | null, toDay: string | null, today: string): Promise<Window> {
  const earliest = fromDay === null ? await getEarliestIssueDay() : null
  if (fromDay === null && earliest === null) return { kind: 'nothing-issued' }
  // Nothing was issued earlier in the first invoice's month, so "All dates" opens
  // that month on the 1st: a complete month, not a "part month".
  const fromAd = fromDay ?? `${(earliest as string).slice(0, 8)}01`
  const toAd = toDay === null || toDay > today ? today : toDay
  if (fromDay !== null && toDay !== null && fromDay > toDay) return { kind: 'inverted' }
  if (fromAd > today) return { kind: 'future' }
  if (fromAd > toAd) return { kind: 'nothing-issued' }
  const months = monthSpan(fromAd, toAd)
  if (months > MAX_MONTHS) return { kind: 'too-long', months }
  return { kind: 'ok', fromAd, toAd, clamped: toDay !== null && toDay > today }
}

export default function RevenueReport() {
  const permitted = useCanViewFinancialReports()
  const { user } = useAuth()
  const today = businessDayAd()
  const [tab, setTab] = useState<RevenueTab>('trend')
  const [view, setView] = useState<RevenueView>('revenue')
  // The toolbar's own preset, so the control always names the window drawn (R17-7).
  const [filters, setFilters] = useState<ReportFilters>(() => ({ dateRange: reportPresetRange('issue_date', 'last90') }))
  const [compare, setCompare] = useState<ReportCompare>('off')
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  const { fromDay, toDay } = reportRangeDays(filters.dateRange)
  // RULING 2026-10-17 (R17-2): compare needs a bounded period; "All dates" has no period before it.
  const bounded = fromDay !== null && toDay !== null
  const compareOn = bounded && compare === 'previous'

  useEffect(() => {
    // Never fetch for a role that may not see the figures — not "fetch and hide".
    if (!permitted) return
    let active = true
    setState({ kind: 'loading' })
    void (async () => {
      const window = await resolveWindow(fromDay, toDay, today)
      if (window.kind !== 'ok') return { kind: 'window', window } as const
      const report = await getIssuedRevenueTrend(window.fromAd, window.toAd, today)
      const previous = compareOn ? await getPreviousIssuedRevenue(report) : null
      return { kind: 'done', report, previous, clamped: window.clamped } as const
    })()
      .then((next) => {
        if (active) setState(next)
      })
      .catch((cause: unknown) => {
        if (active) setState({ kind: 'error', message: cause instanceof Error ? cause.message : 'Revenue report unavailable' })
      })
    return () => {
      active = false
    }
  }, [permitted, fromDay, toDay, today, compareOn, revision])

  const done = state.kind === 'done' ? state : null

  const rows = useMemo<ReportCsvRow[]>(() => {
    if (!done) return []
    const { report, previous } = done
    return [
      ['Issued invoice taxable revenue — actual (NPR), before VAT'],
      ['AD window', report.fromAd, report.toAd],
      ...(previous ? [['Compared with', previous.fromAd, previous.toAd] as ReportCsvRow] : []),
      ['Status', 'Issued nonvoid invoices; credit notes reconciled as paid-amount records, not subtracted from taxable sales'],
      ['Credit notes on invoices issued in window', report.creditReconciliation.creditNoteCount],
      ['Credit-note paid amounts (not taxable deductions)', formatMoney(report.creditReconciliation.creditNoteAmountPaisa)],
      ['Voided invoice taxable amounts excluded', formatMoney(report.creditReconciliation.voidedTaxablePaisa)],
      ['Paid voids needing credit review', report.creditReconciliation.paidVoidMismatchCount],
      ['Credit notes on active invoices for review', report.creditReconciliation.activeInvoiceCreditNoteCount],
      ['Month', 'Taxable value', 'Issued invoices', ...(previous ? ['Previous period', 'Previous taxable value', 'Previous invoices', 'Change'] : [])],
      ...report.months.map((m, i): ReportCsvRow => {
        const p = previous?.months[i]
        return [
          m.longLabel,
          formatMoney(m.amountPaisa),
          m.invoiceCount,
          ...(p ? [p.longLabel, formatMoney(p.amountPaisa), p.invoiceCount, changeLabel(m.amountPaisa, p.amountPaisa)] : []),
        ]
      }),
      [
        'Total',
        formatMoney(report.totalPaisa),
        report.issuedCount,
        ...(previous
          ? [windowLabel(previous.fromAd, previous.toAd), formatMoney(previous.totalPaisa), previous.issuedCount, changeLabel(report.totalPaisa, previous.totalPaisa)]
          : []),
      ],
    ]
  }, [done])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader icon="dollar" title="Revenue Reports" description="Issued invoice taxable revenue, excluding VAT and unissued or void invoices." />
      <ReportFamiliesNav current="Revenue" />
      {!permitted ? (
        <RestrictedState reason="Your role cannot view the company revenue report." requiredRole="Owner, Admin, Manager or Accounts" />
      ) : (
        <>
          <ReportToolbar
            title="Revenue Reports"
            value={filters}
            onChange={setFilters}
            dateColumn="issue_date"
            {...(bounded && tab === 'trend' ? { compare, onCompareChange: setCompare } : {})}
            {...(tab === 'trend' && done ? { csv: { filename: 'revenue-issued-monthly', build: () => rows, generatedBy: user?.name } } : {})}
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
            <TrendPanel state={state} view={view} onView={setView} onRetry={() => setRevision((r) => r + 1)} />
          ) : (
            <InvoiceRegister key={`${fromDay}|${toDay}`} fromDay={fromDay} toDay={toDay} />
          )}
          <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            Detailed invoice records and settlement corrections remain available in <Link to="/finance?tab=invoices">Finance invoices</Link>.
            Previously hardcoded category and project-revenue figures are withheld until their attribution can be verified.
          </p>
        </>
      )}
    </div>
  )
}

/* ── the trend tab ─────────────────────────────────────────────────────── */

function TrendPanel({
  state,
  view,
  onView,
  onRetry,
}: {
  state: LoadState
  view: RevenueView
  onView: (v: RevenueView) => void
  onRetry: () => void
}) {
  if (state.kind === 'loading') return <LoadingSkeleton type="card" rows={4} label="Loading verified invoice records…" />
  if (state.kind === 'error') {
    return <ErrorBanner title="Revenue could not be calculated" message={`${state.message.replace(/\.$/, '')}. No figures are shown rather than incomplete ones.`} onRetry={onRetry} />
  }
  if (state.kind === 'window') {
    const w = state.window
    const [title, description] =
      w.kind === 'nothing-issued'
        ? ['No issued invoices in this period', 'Revenue appears here once an invoice is issued. Drafts and voided invoices are not revenue.']
        : w.kind === 'future'
          ? ['This period has not started', 'Actual revenue can only be shown up to today. Choose a period that has begun.']
          : w.kind === 'inverted'
            ? ['The start date is after the end date', 'Swap the two dates to see this period.']
            : ['Choose a period of 24 months or less', `This range touches ${w.months} calendar months; the trend reads up to ${MAX_MONTHS} at a time.`]
    return (
      <section aria-label="Issued invoice revenue trend" style={cardStyle}>
        <EmptyState title={title} description={description} />
      </section>
    )
  }
  return <TrendReport report={state.report} previous={state.previous} clamped={state.clamped} view={view} onView={onView} />
}

function TrendReport({
  report,
  previous,
  clamped,
  view,
  onView,
}: {
  report: IssuedRevenueReport
  previous: RevenueTrend | null
  clamped: boolean
  view: RevenueView
  onView: (v: RevenueView) => void
}) {
  const viewMeta = VIEWS.find((v) => v.id === view) ?? VIEWS[0]!
  const credit = report.creditReconciliation

  const points = useMemo(() => report.months.map((m) => ({ key: m.startDay, axisLabel: m.label, longLabel: m.longLabel })), [report])
  const series = useMemo<TrendSeries[]>(() => {
    const out: TrendSeries[] = [{ key: 'current', label: viewMeta.series, status: 'actual', values: report.months.map((m) => valueOf(m, view)) }]
    if (previous) {
      out.push({ key: 'previous', label: 'Previous period', status: 'actual', values: previous.months.map((m) => valueOf(m, view)), slot: 1, marker: 'square' })
    }
    return out
  }, [report, previous, view, viewMeta.series])

  const describePoint = previous
    ? (i: number) => {
        const p = previous.months[i]
        const c = report.months[i]
        if (!p || !c) return null
        return `Previous period, ${p.longLabel}: ${fmtView(view, valueOf(p, view))} (${changeLabel(valueOf(c, view), valueOf(p, view))})`
      }
    : undefined

  const kpis: Kpi[] = [
    {
      label: 'Taxable amount (before VAT)',
      value: formatMoney(report.totalPaisa),
      icon: 'dollar',
      accent: 'primary',
      definition: 'Issued, non-voided invoices after discount and before VAT, by issue date.',
      zeroExplanation: 'No invoices were issued in this period.',
      ...(previous && previous.totalPaisa !== report.totalPaisa
        ? {
            delta: {
              direction: report.totalPaisa > previous.totalPaisa ? ('up' as const) : ('down' as const),
              text: `${changeLabel(report.totalPaisa, previous.totalPaisa)} vs previous period`,
              good: report.totalPaisa > previous.totalPaisa,
            },
          }
        : {}),
    },
    {
      label: 'Issued invoices',
      value: countLabel(report.issuedCount),
      icon: 'file',
      accent: 'neutral',
      definition: 'Issued invoices in the period. Drafts and voided invoices are excluded.',
      ...(previous ? { detail: `${countLabel(previous.issuedCount)} in the previous period` } : {}),
    },
  ]

  const notes = [
    ...coverageNotes(report),
    ...(clamped ? [`The chosen period ends after today, so the figures run to today, ${dayLabel(report.toAd)}.`] : []),
  ]
  const nothingIssued = report.issuedCount === 0 && (!previous || previous.issuedCount === 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <KpiStrip items={kpis} columns={2} />
      <section aria-labelledby="revenue-trend-title" style={{ ...cardStyle, padding: 'var(--sp-md)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--sp-sm)' }}>
          <div style={{ minWidth: 0 }}>
            <h3 id="revenue-trend-title" style={{ margin: 0, color: 'var(--text)' }}>Monthly issued invoice revenue</h3>
            <p style={{ margin: '4px 0 0', color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>
              {windowLabel(report.fromAd, report.toAd)} · AD calendar months · Data: Actual
              {previous ? ` · Compared with ${windowLabel(previous.fromAd, previous.toAd)}` : ''}
            </p>
          </div>
          <SegmentedControl<RevenueView> ariaLabel="Chart measure" size="sm" value={view} onChange={onView} options={VIEWS.map((v) => ({ id: v.id, label: v.label }))} />
        </div>
        {nothingIssued ? (
          <p style={{ margin: 'var(--sp-sm) 0', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>No issued invoices recorded for the selected period.</p>
        ) : (
          <InteractiveTrendChart
            title={`${viewMeta.series} by month`}
            points={points}
            series={series}
            formatValue={(v) => fmtView(view, v)}
            formatTick={view === 'count' ? countLabel : compactMoneyLabel}
            minStep={view === 'count' ? 1 : 100}
            {...(describePoint ? { describePoint } : {})}
          />
        )}
        <div style={{ color: 'var(--text2)', fontSize: 'var(--t-meta)', lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {notes.map((n) => (
            <p key={n} style={{ margin: 0 }}>{n}</p>
          ))}
          <p style={{ margin: 0 }}>
            Actual taxable invoice amounts before VAT, grouped by issue month. Current nonvoid invoice snapshot: later voids may restate older months.
            Draft and void invoices excluded. Credit notes record paid amounts, not taxable sales deductions, and are checked separately; this is not a
            full audited net-sales statement.
          </p>
        </div>
        <section aria-label="Credit-note reconciliation for selected invoice dates" style={{ marginTop: 12, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <h4 style={{ margin: '0 0 8px' }}>Credit-note reconciliation</h4>
          <p style={{ color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>
            For invoices issued {windowLabel(report.fromAd, report.toAd)}, including voided invoices omitted from the chart. Credit-note amounts reflect
            paid-value corrections, not taxable sales credits; notes issued for invoices outside this period are not in this check.
          </p>
          <dl style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
            <div><dt>Voided invoice taxable amount excluded</dt><dd>{formatMoney(credit.voidedTaxablePaisa)} ({credit.voidedInvoiceCount} invoices)</dd></div>
            <div><dt>Credit-note amount (settlement basis)</dt><dd>{formatMoney(credit.creditNoteAmountPaisa)} ({credit.creditNoteCount} notes)</dd></div>
          </dl>
          {credit.paidVoidMismatchCount > 0 || credit.activeInvoiceCreditNoteCount > 0 ? (
            <p role="alert">
              Manual ledger review needed: {credit.paidVoidMismatchCount} paid voided invoice(s) with credit-note amounts not matching paid amounts, and{' '}
              {credit.activeInvoiceCreditNoteCount} credit note(s) on nonvoid invoices. Do not treat this as audited net sales.
            </p>
          ) : (
            <p role="status">No paid-void credit mismatches found in this invoice-date window. This is not an audited net-sales statement.</p>
          )}
        </section>
      </section>
    </div>
  )
}

/* ── the invoice register tab ──────────────────────────────────────────── */

const REGISTER_PAGE = 100

/**
 * RULING 2026-10-17 (R17-5): issued invoices and voids — not Drafts. A Draft has
 * no number and no issue date yet (R-15), so under "All dates" it would sort
 * first with nothing to link to. 'Overdue' is derived, never stored.
 */
const REGISTER_STATUSES: Array<InvoiceListRow['status']> = ['Sent', 'Partially Paid', 'Paid', 'Void']

const th = {
  textAlign: 'left' as const,
  padding: '10px 12px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid var(--border)',
}
const td = { height: 'var(--row-min-h)', padding: '10px 12px', fontSize: 'var(--t-meta)', color: 'var(--text)', borderBottom: '1px solid var(--border)' }
const num = { ...td, textAlign: 'right' as const }

function InvoiceRegister({ fromDay, toDay }: { fromDay: string | null; toDay: string | null }) {
  const [rows, setRows] = useState<InvoiceListRow[] | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  // After Newer / Older, focus lands on the summary that names the new range.
  const summaryRef = useRef<HTMLParagraphElement>(null)
  const paged = useRef(false)

  useEffect(() => {
    let active = true
    // Rows stay on screen while the next page loads; only the first read shows a skeleton.
    setLoading(true)
    setError(null)
    // `issue_date` is a DATE, so the bounds are the toolbar's civil days — the same
    // days the trend reads — not its +05:45 instants.
    const dateRange = fromDay || toDay ? { column: 'issue_date', ...(fromDay ? { fromAd: fromDay } : {}), ...(toDay ? { toAd: toDay } : {}) } : undefined
    listInvoices({
      page: { index: page, size: REGISTER_PAGE },
      dateRange,
      chips: { status: REGISTER_STATUSES },
      // A Draft voided before issue has no issue date or number; it is not an issued invoice.
      presence: { issue_date: true },
      withCount: true,
    })
      .then((res) => {
        if (!active) return
        setRows(res.rows)
        setTotal(res.total ?? null)
        setLoading(false)
        if (paged.current) {
          paged.current = false
          summaryRef.current?.focus()
        }
      })
      .catch((cause: unknown) => {
        if (!active) return
        setError(cause instanceof Error ? cause.message : 'The invoices could not be read.')
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [fromDay, toDay, page, revision])

  if (error) return <ErrorBanner title="The invoice register could not be loaded" message={error} onRetry={() => setRevision((r) => r + 1)} />
  if (rows === null) return <LoadingSkeleton rows={6} label="Loading invoices…" />
  if (rows.length === 0 && page === 0) {
    return (
      <section aria-label="Invoice register" style={cardStyle}>
        <EmptyState title="No invoices in this period" description="Choose a wider period, or issue an invoice from a rental." />
      </section>
    )
  }

  return (
    <div aria-busy={loading} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
      <p ref={summaryRef} tabIndex={-1} style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', outline: 'none' }}>
        {total !== null && total > REGISTER_PAGE
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
                  {/* Finance ▸ Invoices opens on live invoices, so a void's link would find nothing. */}
                  {inv.invoiceNo && !inv.isVoid ? (
                    <Link to={`/finance?tab=invoices&search=${encodeURIComponent(inv.invoiceNo)}`} style={{ color: 'var(--link)', fontWeight: 600, textDecoration: 'none' }}>
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
      {total !== null && total > REGISTER_PAGE && (
        <div style={{ display: 'flex', gap: 'var(--sp-sm)', justifyContent: 'flex-end' }}>
          {/* aria-disabled, not disabled: a focused button that becomes disabled drops focus. */}
          <Button
            icon="chevron_left"
            aria-disabled={page === 0 || loading}
            style={page === 0 || loading ? { opacity: 0.45 } : undefined}
            onClick={() => {
              if (page === 0 || loading) return
              paged.current = true
              setPage((p) => p - 1)
            }}
          >
            Newer
          </Button>
          <Button
            icon="chevron_right"
            aria-disabled={(page + 1) * REGISTER_PAGE >= total || loading}
            style={(page + 1) * REGISTER_PAGE >= total || loading ? { opacity: 0.45 } : undefined}
            onClick={() => {
              if ((page + 1) * REGISTER_PAGE >= total || loading) return
              paged.current = true
              setPage((p) => p + 1)
            }}
          >
            Older
          </Button>
        </div>
      )}
    </div>
  )
}
