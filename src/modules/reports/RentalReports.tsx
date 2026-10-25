import { formatAd } from '../../lib/bs'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, Button, cardStyle } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { PageBody } from '../../components/ui/PageBody'
import { useLoad } from '../../lib/queries/useLoad'
import { NOT_TRACKED } from '../../lib/queries/reportSupport'
import { reportFilterOptions, hasReportFilters } from './reportStates'
import { ReportToolbar } from '../../components/ui/ReportToolbar'
import type { ReportCsvRow, ReportFilters } from '../../components/ui/ReportToolbar'
import { Donut, Legend, HBars, type Slice } from '../../components/ui/Charts'
import Icon from '../../components/ui/Icon'
import { formatMoney, type Paisa } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useViewport } from '../../lib/device'
import {
  ReportKpiCard,
  ReportKpiStrip,
  ReportDataTable,
} from '../../components/ui/reports'
import '../../styles/reportChartTokens.css'
import {
  getRentalPerformanceReport,
  getRentalDurationReport,
  getCancellationsReport,
  type TopBookingItem,
  type DurationBucket,
  type CancelledBookingItem,
} from '../../lib/queries/rentalReports'

type RentalTab = 'performance' | 'duration' | 'cancellations'


export default function RentalReports() {
  const money = useCanViewMoney()
  const viewport = useViewport()
  const [activeTab, setActiveTab] = useState<RentalTab>('performance')
  const [filters, setFilters] = useState<ReportFilters>({})
  const [searchQuery, setSearchQuery] = useState('')

  /* Phase 6 — one read for the three tabs, one ladder. These queries used to
     return seed figures on failure and on an empty period (Law 16); they now
     throw, and `PageBody` draws loading · Error + Retry · nothing-yet vs
     "nothing in this period". */
  const filtered = hasReportFilters(filters)
  const load = useLoad(
    () => {
      const opts = reportFilterOptions(filters)
      return Promise.all([getRentalPerformanceReport(opts), getRentalDurationReport(opts), getCancellationsReport(opts)])
    },
    { key: JSON.stringify(filters) },
  )
  const [perfData, durationData, cancelData] = load.data ?? [null, null, null]

  // Performance KPI strip
  const performanceKpis = useMemo<Kpi[]>(() => {
    if (!perfData) return []
    const m = perfData.metrics
    return [
      {
        label: 'Total Bookings',
        value: String(m.totalBookings),
        icon: 'box',
        accent: 'primary',
        note: `${m.completedRentals} completed · ${m.activeRentals} active`,
      },
      {
        label: 'Rental Revenue',
        value: money ? formatMoney(m.totalRevenue) : '—',
        icon: 'dollar',
        accent: 'success',
        note: money ? `Avg ${formatMoney(m.averageBookingValue)} / booking` : /* Restricted (Law 6) */ "Restricted",
        definition: 'Rental revenue from confirmed bookings in the period, excluding deposits (liabilities).',
      },
      {
        label: 'Rental Days',
        value: String(m.totalRentalDays),
        icon: 'calendar',
        accent: 'neutral',
        note: `Avg ${m.averageDurationDays} days / rental`,
      },
      {
        label: 'Cancellations',
        value: String(m.cancelledRentals),
        icon: 'alert_triangle',
        accent: m.cancelledRentals > 0 ? 'danger' : 'neutral',
        note: `${((m.cancelledRentals / (m.totalBookings || 1)) * 100).toFixed(1)}% cancellation rate`,
      },
    ]
  }, [perfData, money])

  // Duration KPI strip
  const durationKpis = useMemo<Kpi[]>(() => {
    if (!durationData) return []
    return [
      {
        label: 'Average Duration',
        value: `${durationData.averageDuration} Days`,
        icon: 'timer',
        accent: 'primary',
        note: `Median ${durationData.medianDuration} days`,
      },
      {
        label: 'Shortest Rental',
        value: `${durationData.shortestDuration} Day`,
        icon: 'calendar',
        accent: 'neutral',
        note: 'Shortest non-cancelled booking',
      },
      {
        label: 'Longest Rental',
        value: `${durationData.longestDuration} Days`,
        icon: 'calendar',
        accent: 'progress',
        note: 'Longest non-cancelled booking',
      },
      {
        label: 'Total Analyzed',
        value: String(durationData.totalRentals),
        icon: 'box',
        accent: 'neutral',
        note: 'Non-cancelled bookings',
      },
    ]
  }, [durationData])

  // Cancellations KPI strip
  const cancellationKpis = useMemo<Kpi[]>(() => {
    if (!cancelData) return []
    return [
      {
        label: 'Total Cancellations',
        value: String(cancelData.totalCancellations),
        icon: 'alert_triangle',
        accent: 'danger',
        note: 'Terminal booking dropouts',
      },
      {
        label: 'Cancellation Rate',
        value: `${cancelData.cancellationRate}%`,
        icon: 'chart',
        accent: cancelData.cancellationRate > 10 ? 'danger' : 'warn',
        note: 'Against total booking volume',
      },
      {
        label: 'Lost Revenue',
        value: money ? formatMoney(cancelData.totalLostRevenue) : '—',
        icon: 'dollar',
        accent: 'danger',
        note: money ? 'Unrealized quote & booking total' : /* Restricted (Law 6) */ "Restricted",
        definition: 'Revenue lost from cancelled bookings; sum of their rental totals.',
      },
      {
        label: 'Average Notice',
        value: cancelData.averageNoticeDays === null ? '—' : `${cancelData.averageNoticeDays} Days`,
        icon: 'timer',
        accent: 'neutral',
        note: cancelData.averageNoticeDays === null ? 'No cancellation in this period' : 'Lead time before pickup',
      },
    ]
  }, [cancelData, money])

  // CSV export generator across tabs
  const getCsvRows = (): ReportCsvRow[] => {
    if (activeTab === 'performance') {
      const rows: ReportCsvRow[] = [
        ['Rental Performance Report'],
        ['Metric', 'Value'],
        ['Total Bookings', perfData?.metrics.totalBookings ?? 0],
        ['Active Rentals', perfData?.metrics.activeRentals ?? 0],
        ['Completed Rentals', perfData?.metrics.completedRentals ?? 0],
        ['Cancelled Rentals', perfData?.metrics.cancelledRentals ?? 0],
        ['Total Revenue', money ? formatMoney(perfData?.metrics.totalRevenue ?? (0 as Paisa)) : 'Restricted'],
        ['Avg Booking Value', money ? formatMoney(perfData?.metrics.averageBookingValue ?? (0 as Paisa)) : 'Restricted'],
        ['Total Rental Days', perfData?.metrics.totalRentalDays ?? 0],
        ['Avg Duration Days', perfData?.metrics.averageDurationDays ?? 0],
        [],
        ['Stage Breakdown'],
        ['Stage', 'Count', 'Revenue', 'Share %'],
        ...(perfData?.stages.map((st): ReportCsvRow => [
          st.stage,
          st.count,
          money ? formatMoney(st.revenue) : 'Restricted',
          `${st.percent}%`,
        ]) ?? []),
        [],
        ['Project Types Breakdown'],
        ['Project Type', 'Count', 'Revenue', 'Share %'],
        ...(perfData?.projectTypes === null ? [[NOT_TRACKED] as ReportCsvRow] : []),
        ...(perfData?.projectTypes?.map((pt): ReportCsvRow => [
          pt.projectType,
          pt.count,
          money ? formatMoney(pt.revenue) : 'Restricted',
          `${pt.percent}%`,
        ]) ?? []),
        [],
        ['Top Bookings'],
        ['Booking No', 'Client', 'Project', 'Days', 'Stage', 'Value'],
        ...(perfData?.topBookings.map((b): ReportCsvRow => [
          b.bookingNo,
          b.clientName,
          b.project,
          b.days,
          b.stage,
          money ? formatMoney(b.value) : 'Restricted',
        ]) ?? []),
      ]
      return rows
    } else if (activeTab === 'duration') {
      const rows: ReportCsvRow[] = [
        ['Rental Duration Distribution Report'],
        ['Metric', 'Value'],
        ['Total Rentals', durationData?.totalRentals ?? 0],
        ['Average Duration', `${durationData?.averageDuration ?? 0} Days`],
        ['Median Duration', `${durationData?.medianDuration ?? 0} Days`],
        [],
        ['Duration Buckets'],
        ['Bucket', 'Bookings Count', 'Share %', 'Total Equipment Days', 'Revenue', 'Avg Daily Rate'],
        ...(durationData?.buckets.map((b): ReportCsvRow => [
          b.label,
          b.count,
          `${b.sharePercent}%`,
          b.totalDays,
          money ? formatMoney(b.revenue) : 'Restricted',
          money ? formatMoney(b.avgDailyRate) : 'Restricted',
        ]) ?? []),
      ]
      return rows
    } else {
      const rows: ReportCsvRow[] = [
        ['Cancellations & Lost Quotes Report'],
        ['Metric', 'Value'],
        ['Total Cancellations', cancelData?.totalCancellations ?? 0],
        ['Cancellation Rate', `${cancelData?.cancellationRate ?? 0}%`],
        ['Total Lost Revenue', money ? formatMoney(cancelData?.totalLostRevenue ?? (0 as Paisa)) : 'Restricted'],
        ['Avg Notice Days', cancelData?.averageNoticeDays == null ? '—' : `${cancelData.averageNoticeDays} Days`],
        [],
        ['Cancellation Reasons'],
        ['Reason', 'Count', 'Share %', 'Lost Revenue'],
        ...(cancelData?.reasons.map((r): ReportCsvRow => [
          r.reason,
          r.count,
          `${r.percent}%`,
          money ? formatMoney(r.lostRevenue) : 'Restricted',
        ]) ?? []),
        [],
        ['Cancelled Bookings Log'],
        ['Booking No', 'Client', 'Project', 'Cancelled Date', 'Scheduled Pickup', 'Lost Revenue', 'Reason'],
        ...(cancelData?.cancelledBookings.map((cb): ReportCsvRow => [
          cb.bookingNo,
          cb.clientName,
          cb.project,
          cb.cancelledAt,
          cb.scheduledPickup,
          money ? formatMoney(cb.lostRevenue) : 'Restricted',
          cb.reason,
        ]) ?? []),
      ]
      return rows
    }
  }

  // Slices for Donut charts
  const stageSlices: Slice[] = useMemo(() => {
    if (!perfData) return []
    return perfData.stages.map((st) => ({
      label: st.stage,
      value: st.count,
      display: `${st.count} bookings`,
      percent: `${st.percent}%`,
    }))
  }, [perfData])

  const reasonSlices: Slice[] = useMemo(() => {
    if (!cancelData) return []
    return cancelData.reasons.map((r) => ({
      label: r.reason,
      value: r.count,
      display: `${r.count} (${r.percent}%)`,
      percent: `${r.percent}%`,
    }))
  }, [cancelData])

  const durationBars = useMemo(() => {
    if (!durationData) return []
    return durationData.buckets.map((b) => ({
      label: b.label,
      value: b.count,
      display: `${b.count} bookings (${b.sharePercent}%)`,
    }))
  }, [durationData])

  const filteredTopBookings = useMemo(() => {
    if (!perfData?.topBookings) return []
    if (!searchQuery.trim()) return perfData.topBookings
    const q = searchQuery.toLowerCase().trim()
    return perfData.topBookings.filter(
      (b) =>
        b.bookingNo.toLowerCase().includes(q) ||
        b.clientName.toLowerCase().includes(q) ||
        b.project.toLowerCase().includes(q),
    )
  }, [perfData?.topBookings, searchQuery])

  const filteredCancelledBookings = useMemo(() => {
    if (!cancelData?.cancelledBookings) return []
    if (!searchQuery.trim()) return cancelData.cancelledBookings
    const q = searchQuery.toLowerCase().trim()
    return cancelData.cancelledBookings.filter(
      (b) =>
        b.bookingNo.toLowerCase().includes(q) ||
        b.clientName.toLowerCase().includes(q) ||
        b.project.toLowerCase().includes(q) ||
        b.reason.toLowerCase().includes(q),
    )
  }, [cancelData?.cancelledBookings, searchQuery])

  const handleExportCsv = () => {
    const rows = getCsvRows()
    const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
    const body = rows.map((r) => r.map(cell).join(',')).join('\r\n')
    const blob = new Blob([body], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rentals-${activeTab}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="babin-report" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="calendar"
        title="Rentals Reports"
        description="Comprehensive analysis of rental turnover, duration distribution, and lost quote cancellations."
        status={
          <span className="badge badge-neutral" style={{ textTransform: 'capitalize', fontWeight: 600 }}>
            {activeTab}
          </span>
        }
        search={{
          value: searchQuery,
          onChange: setSearchQuery,
          onClear: () => setSearchQuery(''),
          placeholder: 'Search report data…',
          ariaLabel: 'Search report bookings and projects',
        }}
        actions={
          <Button icon="download" onClick={handleExportCsv} aria-label="Export CSV report">
            Export CSV
          </Button>
        }
      />

      {/* Shared Toolbar */}
      <ReportToolbar
        title="Rentals Reports"
        value={filters}
        onChange={setFilters}
        dateColumn="pickup_at"
        csv={{
          filename: `rentals-${activeTab}`,
          build: getCsvRows,
        }}
      >
        <div
          role="group"
          aria-label="Rental report views"
          className="report-view-toggle"
          style={{ display: 'inline-flex' }}
        >
          {([
            ['Performance', 'performance'],
            ['Duration', 'duration'],
            ['Cancellations', 'cancellations'],
          ] as const).map(([label, key]) => {
            const on = activeTab === key
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() => setActiveTab(key)}
                className={`report-toggle-btn ${on ? 'is-active' : ''}`}
                style={{ minHeight: 44 }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </ReportToolbar>

      <PageBody
        noun="rental figures"
        loading={load.loading}
        error={load.error}
        onRetry={load.reload}
        hasRows={perfData !== null}
        skeleton="kpi"
        empty={perfData !== null && perfData.metrics.totalBookings === 0}
        emptyIsFiltered={filtered}
        onClearFilters={() => setFilters({})}
        emptyTitle={filtered ? 'No bookings in this period' : 'No bookings yet'}
        emptyMessage={
          filtered
            ? 'Nothing was picked up in the selected period or branch. Clear the filters to see every booking.'
            : 'Rental figures appear here once the first booking is created.'
        }
      >
      {/* TAB 1: PERFORMANCE */}
      {activeTab === 'performance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          <ReportKpiStrip ariaLabel="Rental performance summary metrics">
            {performanceKpis.map((k) => (
              <ReportKpiCard
                key={k.label}
                label={k.label}
                value={k.value}
                icon={k.icon}
                note={k.note}
              />
            ))}
          </ReportKpiStrip>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: viewport === 'desktop' ? '1fr 1fr' : '1fr',
              gap: 'var(--sp-md)',
            }}
          >
            {/* Stage breakdown card */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600, marginBottom: 'var(--sp-sm)' }}>
                Bookings by Operational Stage
              </h3>
              <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginBottom: 'var(--sp-md)' }}>
                Fulfillment workflow distribution from quote to completed return.
              </p>
              {stageSlices.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', alignItems: 'center' }}>
                  <Donut slices={stageSlices} size={180} />
                  <Legend slices={stageSlices} />
                </div>
              )}
            </div>

            {/* Project Types card */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600, marginBottom: 'var(--sp-sm)' }}>
                Production Types Breakdown
              </h3>
              <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginBottom: 'var(--sp-md)' }}>
                Bookings by the project type recorded on each rental.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
                {perfData?.projectTypes === null && (
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                    {NOT_TRACKED} — project type is not readable for this session.
                  </div>
                )}
                {perfData?.projectTypes?.map((pt) => (
                  <div
                    key={pt.projectType}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 14px',
                      background: 'var(--surface-hover)',
                      borderRadius: 'var(--r-sm)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 'var(--t-body)' }}>{pt.projectType}</div>
                      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                        {pt.count} bookings ({pt.percent}% of fleet hires)
                      </div>
                    </div>
                    {money && (
                      <div style={{ textAlign: 'right', fontWeight: 600, fontSize: 'var(--t-body)' }}>
                        {formatMoney(pt.revenue)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top bookings table */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-sm)' }}>
              <div>
                <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600 }}>High-Value Rental Contracts</h3>
                <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                  Top equipment hires driving turnover in this period.
                </p>
              </div>
              <Link
                to="/rentals"
                style={{
                  fontSize: 'var(--t-meta)',
                  color: 'var(--primary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  textDecoration: 'none',
                }}
              >
                View all rentals <Icon name="chevron_right" size={12} />
              </Link>
            </div>

            <ReportDataTable<TopBookingItem>
              ariaLabel="High-Value Rental Contracts" rows={filteredTopBookings} getRowId={row => row.id} searchable={false}
              emptyMessage={searchQuery.trim() ? `No bookings match “${searchQuery.trim()}”.` : 'No bookings to show.'}
              columns={[
                { id: 'number', header: 'Booking No', cell: row => <Link to={`/rentals/${row.bookingNo}`}>{row.bookingNo}</Link>, sortValue: row => row.bookingNo },
                { id: 'client', header: 'Client', cell: row => row.clientName, sortValue: row => row.clientName },
                { id: 'project', header: 'Production / Project', cell: row => row.project, sortValue: row => row.project },
                { id: 'duration', header: 'Duration', cell: row => `${row.days} days`, sortValue: row => row.days },
                { id: 'stage', header: 'Stage', cell: row => <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><Icon name="box" size={14} />{row.stage}</span>, sortValue: row => row.stage },
                ...(money ? [{ id: 'value', header: 'Rental Value', align: 'right' as const, cell: (row: TopBookingItem) => formatMoney(row.value), sortValue: (row: TopBookingItem) => row.value }] : []),
              ]}
            />
          </div>
        </div>
      )}

      {/* TAB 2: DURATION */}
      {activeTab === 'duration' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          <ReportKpiStrip ariaLabel="Rental duration summary metrics">
            {durationKpis.map((k) => (
              <ReportKpiCard
                key={k.label}
                label={k.label}
                value={k.value}
                icon={k.icon === 'timer' ? 'clock' : k.icon}
                note={k.note}
              />
            ))}
          </ReportKpiStrip>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: viewport === 'desktop' ? '1fr 1fr' : '1fr',
              gap: 'var(--sp-md)',
            }}
          >
            {/* Horizontal bars distribution */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600, marginBottom: 'var(--sp-sm)' }}>
                Rental Duration Histogram
              </h3>
              <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginBottom: 'var(--sp-md)' }}>
                Proportion of bookings across operational rental day spans.
              </p>
              {durationBars.length > 0 && <HBars rows={durationBars} axisTicks={['0', '10', '20', '30', '40+']} />}
            </div>

          </div>

          {/* Duration buckets table */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600, marginBottom: 'var(--sp-sm)' }}>
              Rental Duration Buckets Summary
            </h3>
            <ReportDataTable<DurationBucket>
              ariaLabel="Rental Duration Buckets Summary" rows={durationData?.buckets ?? []} getRowId={row => row.key}
              columns={[
                { id: 'span', header: 'Span', cell: row => row.label, sortValue: row => row.minDays },
                { id: 'bookings', header: 'Bookings', cell: row => `${row.count} hires`, sortValue: row => row.count },
                { id: 'share', header: 'Volume Share', cell: row => `${row.sharePercent}%`, sortValue: row => row.sharePercent },
                { id: 'days', header: 'Total Equipment Days', cell: row => `${row.totalDays} unit days`, sortValue: row => row.totalDays },
                ...(money ? [
                  { id: 'revenue', header: 'Total Revenue', align: 'right' as const, cell: (row: DurationBucket) => formatMoney(row.revenue), sortValue: (row: DurationBucket) => row.revenue },
                  { id: 'rate', header: 'Avg Daily Rate', align: 'right' as const, cell: (row: DurationBucket) => `${formatMoney(row.avgDailyRate)} / day`, sortValue: (row: DurationBucket) => row.avgDailyRate },
                ] : []),
              ]}
            />
          </div>
        </div>
      )}

      {/* TAB 3: CANCELLATIONS */}
      {activeTab === 'cancellations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          <ReportKpiStrip ariaLabel="Rental cancellations summary metrics">
            {cancellationKpis.map((k) => (
              <ReportKpiCard
                key={k.label}
                label={k.label}
                value={k.value}
                icon={k.icon}
                note={k.note}
              />
            ))}
          </ReportKpiStrip>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: viewport === 'desktop' ? '1fr 1fr' : '1fr',
              gap: 'var(--sp-md)',
            }}
          >
            {/* Cancellation reasons Donut */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600, marginBottom: 'var(--sp-sm)' }}>
                Primary Cancellation Causes
              </h3>
              <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginBottom: 'var(--sp-md)' }}>
                Categorization of lost quotes and dropped reservations.
              </p>
              {reasonSlices.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', alignItems: 'center' }}>
                  <Donut slices={reasonSlices} size={180} />
                  <Legend slices={reasonSlices} />
                </div>
              )}
            </div>

          </div>

          {/* Cancelled bookings table */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600, marginBottom: 'var(--sp-sm)' }}>
              Cancelled Bookings Register
            </h3>
            <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginBottom: 'var(--sp-md)' }}>
              Audit trail of terminal cancellation transitions and client cited reasons.
            </p>
            <ReportDataTable<CancelledBookingItem>
              ariaLabel="Cancelled Bookings Register" rows={filteredCancelledBookings} getRowId={row => row.id} searchable={false}
              emptyMessage={searchQuery.trim() ? `No cancelled bookings match “${searchQuery.trim()}”.` : 'No cancelled bookings to show.'}
              columns={[
                { id: 'number', header: 'Booking No', cell: row => <Link to={`/rentals/${row.bookingNo}`}>{row.bookingNo}</Link>, sortValue: row => row.bookingNo },
                { id: 'client', header: 'Client', cell: row => row.clientName, sortValue: row => row.clientName },
                { id: 'project', header: 'Production / Project', cell: row => row.project, sortValue: row => row.project },
                { id: 'pickup', header: 'Scheduled Pickup', cell: row => formatAd(new Date(row.scheduledPickup)), sortValue: row => row.scheduledPickup },
                ...(money ? [{ id: 'value', header: 'Lost Value', align: 'right' as const, cell: (row: CancelledBookingItem) => formatMoney(row.lostRevenue), sortValue: (row: CancelledBookingItem) => row.lostRevenue }] : []),
                { id: 'reason', header: 'Cancellation Reason', cell: row => row.reason, sortValue: row => row.reason },
              ]}
            />
          </div>
        </div>
      )}
      </PageBody>
    </div>
  )
}
