import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, cardStyle } from '../../components/ui/Page'
import { PageBody } from '../../components/ui/PageBody'
import { ReportToolbar } from '../../components/ui/ReportToolbar'
import type { ReportCsvRow, ReportFilters } from '../../components/ui/ReportToolbar'
import {
  getEquipmentPerformanceSummary,
  type EquipmentPerformanceRow,
  type EquipmentPerformanceSummary,
} from '../../lib/queries/equipmentPerformance'
import { formatMoney } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useLoad } from '../../lib/queries/useLoad'
import { NOT_TRACKED } from '../../lib/queries/reportSupport'
import { reportFilterOptions, hasReportFilters } from './reportStates'
import {
  ReportKpiCard,
  ReportKpiStrip,
  ReportChartCard,
  ReportDataTable,
} from '../../components/ui/reports'
import '../../styles/reportChartTokens.css'

const perUnit = (r: EquipmentPerformanceRow) => (r.revenuePerUnit === null ? '—' : formatMoney(r.revenuePerUnit))

/** The export body — the same headline figures and tables the page draws. */
function equipmentCsv(summary: EquipmentPerformanceSummary | null): ReportCsvRow[] {
  if (!summary) return []
  const row = (p: EquipmentPerformanceRow): ReportCsvRow => [p.name, p.category, p.bookings, p.units, formatMoney(p.revenue), perUnit(p)]
  return [
    ['Figure', 'Value'],
    ['Equipment revenue', formatMoney(summary.revenue)],
    ['Products rented', summary.productsRented],
    ['Utilization', NOT_TRACKED],
    ['Idle cost', NOT_TRACKED],
    [],
    ['Product', 'Category', 'Bookings', 'Units', 'Revenue', 'Revenue per Unit'],
    ...summary.rows.map(row),
  ]
}

/* The caption counts the rows the table draws, so a short list is never captioned as a top five. */
const productCount = (n: number) => `${n} ${n === 1 ? 'product' : 'products'}`

/* The table sorts ascending by its first column, so the lowest-per-unit list leads with Per Unit. */
function PerformerTable({ label, caption, rows, leadWithPerUnit = false }: { label: string; caption: (count: string) => string; rows: EquipmentPerformanceRow[]; leadWithPerUnit?: boolean }) {
  const productColumns = [
    { id: 'product', header: 'Product', cell: (row: EquipmentPerformanceRow) => <Link to={`/inventory/${row.productId}`}>{row.name}</Link>, sortValue: (row: EquipmentPerformanceRow) => row.name },
    { id: 'category', header: 'Category', cell: (row: EquipmentPerformanceRow) => row.category, sortValue: (row: EquipmentPerformanceRow) => row.category },
    { id: 'bookings', header: 'Bookings', align: 'right' as const, cell: (row: EquipmentPerformanceRow) => row.bookings, sortValue: (row: EquipmentPerformanceRow) => row.bookings },
    { id: 'units', header: 'Units', align: 'right' as const, cell: (row: EquipmentPerformanceRow) => row.units, sortValue: (row: EquipmentPerformanceRow) => row.units },
    { id: 'revenue', header: 'Revenue', align: 'right' as const, cell: (row: EquipmentPerformanceRow) => formatMoney(row.revenue), sortValue: (row: EquipmentPerformanceRow) => row.revenue },
  ]
  const perUnitColumn = { id: 'perUnit', header: 'Per Unit', align: 'right' as const, cell: perUnit, sortValue: (row: EquipmentPerformanceRow) => row.revenuePerUnit }
  return <section aria-label={label} style={cardStyle}>
    <h3 style={{ margin: 0, fontSize: 'var(--t-body)', paddingBottom: 4 }}>{label}</h3>
    <p style={{ margin: '0 0 12px', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{caption(productCount(rows.length))}</p>
    <ReportDataTable<EquipmentPerformanceRow>
      ariaLabel={label} rows={rows} getRowId={row => row.productId}
      columns={leadWithPerUnit ? [perUnitColumn, ...productColumns] : [...productColumns, perUnitColumn]}
    />
  </section>
}

function PerformerRankingBars({ rows }: { rows: EquipmentPerformanceRow[] }) {
  const maxRevenue = useMemo(() => {
    return Math.max(...rows.map((r) => r.revenue as number), 1)
  }, [rows])

  if (rows.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r, idx) => {
        const pct = Math.max(Math.round(((r.revenue as number) / maxRevenue) * 100), 2)
        return (
          <div key={r.productId} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              style={{
                width: 140,
                flexShrink: 0,
                fontSize: 'var(--t-meta, 12px)',
                fontWeight: 600,
                color: 'var(--text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={r.name}
            >
              {idx + 1}. {r.name}
            </span>
            <div
              style={{
                flex: 1,
                minWidth: 0,
                height: 18,
                background: 'var(--card2)',
                borderRadius: 4,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  background: 'var(--chart-1, #0284c7)',
                  borderRadius: 4,
                  transition: 'width var(--dur-drawer) var(--ease)',
                }}
              />
            </div>
            <span
              className="figure"
              style={{
                width: 90,
                flexShrink: 0,
                textAlign: 'right',
                fontSize: 'var(--t-meta, 12px)',
                fontWeight: 700,
              }}
            >
              {formatMoney(r.revenue)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Equipment Performance.
 *
 * Phase 6 + Law 16: the page rendered seed performers whatever the read
 * returned. It now draws per-product revenue from priced booking lines, through
 * `useLoad` + `PageBody`. Utilization and idle cost say "Not tracked yet".
 */
export default function EquipmentPerformance() {
  const money = useCanViewMoney()
  const [filters, setFilters] = useState<ReportFilters>({})
  const filtered = hasReportFilters(filters)
  // Law 6 — a money-blind role never sends the read.
  const load = useLoad(() => getEquipmentPerformanceSummary(reportFilterOptions(filters)), {
    key: JSON.stringify(filters),
    enabled: money,
  })
  const summary = load.data

  if (!money) {
    return (
      <div className="babin-report" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <PageHeader icon="activity" title="Equipment Performance" description="Revenue per product and per unit in service." />
        <PageBody
          restricted
          restrictedReason="Equipment performance is reported entirely in money, so there is no version of this page your role can see."
          restrictedRequiredRole="Owner, Admin, Coordinator or Accounts"
        >
          {null}
        </PageBody>
      </div>
    )
  }

  return (
    <div className="babin-report" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader icon="activity" title="Equipment Performance" description="Revenue per product and per unit in service." />

      <ReportToolbar
        title="Equipment Performance"
        value={filters}
        onChange={setFilters}
        dateColumn="pickup_at"
        csv={{ filename: 'equipment-performance', build: () => equipmentCsv(summary) }}
      />

      <PageBody
        noun="equipment figures"
        loading={load.loading}
        error={load.error}
        onRetry={load.reload}
        hasRows={summary !== null}
        skeleton="kpi"
        empty={summary !== null && summary.rows.length === 0}
        emptyIsFiltered={filtered}
        onClearFilters={() => setFilters({})}
        emptyTitle={filtered ? 'No equipment rented in this period' : 'No equipment yet'}
        emptyMessage={
          filtered
            ? 'Nothing was picked up in the selected period or branch. Clear the filters to see every product.'
            : 'Figures appear here once products are added to Inventory and rented.'
        }
      >
        {summary && (
          <>
            <ReportKpiStrip ariaLabel="Equipment performance metrics">
              <ReportKpiCard
                label="Equipment Revenue"
                value={formatMoney(summary.revenue)}
                icon="dollar"
                note="Priced lines on bookings, not cancelled"
              />
              <ReportKpiCard
                label="Products Rented"
                value={String(summary.productsRented)}
                icon="box"
                note={`of ${summary.rows.length} with units or revenue`}
              />
              <ReportKpiCard
                label="Utilization"
                value={NOT_TRACKED}
                icon="chart"
                note="Needs unit state history over time"
              />
              <ReportKpiCard
                label="Idle Cost"
                value={NOT_TRACKED}
                icon="alert_triangle"
                note="Needs unit state history over time"
              />
            </ReportKpiStrip>

            {summary.topPerformers.length > 0 && (
              <ReportChartCard
                title="Top Performing Models by Revenue"
                basis="Priced equipment lines on noncancelled bookings · pickup date window"
                source="Bookings · Line item attribution"
                description="Relative comparison of top revenue-generating products in the selected period."
              >
                <PerformerRankingBars rows={summary.topPerformers.slice(0, 6)} />
              </ReportChartCard>
            )}

            <PerformerTable label="Top Performing Equipment" caption={(count) => `Top ${count} by revenue.`} rows={summary.topPerformers} />
            <PerformerTable
              label="Lowest Revenue per Unit"
              caption={(count) => `Lowest ${count} by revenue per unit, lowest first.`}
              rows={summary.worstPerformers}
              leadWithPerUnit
            />
          </>
        )}
      </PageBody>
    </div>
  )
}
