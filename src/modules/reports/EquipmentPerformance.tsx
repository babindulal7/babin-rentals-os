import { useState } from 'react'
import { PageHeader, KpiStrip, cardStyle } from '../../components/ui/Page'
import { DataTableShell } from '../../components/ui/DataTable'
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
import { useViewport } from '../../lib/device'
import { useLoad } from '../../lib/queries/useLoad'
import { NOT_TRACKED } from '../../lib/queries/reportSupport'
import { reportFilterOptions, hasReportFilters, NoMatchRow } from './reportStates'

const cell = { padding: 'var(--sp-sm) var(--sp-md)' } as const
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

function PerformerTable({ label, rows }: { label: string; rows: EquipmentPerformanceRow[] }) {
  return (
    <section aria-label={label} style={cardStyle}>
      <div style={{ fontSize: 'var(--t-body)', fontWeight: 600, padding: 'var(--sp-md)', borderBottom: '1px solid var(--border)' }}>{label}</div>
      <DataTableShell ariaLabel={label}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)', minWidth: 560 }}>
          <thead>
            <tr style={{ color: 'var(--text2)' }}>
              <th style={cell}>Product</th>
              <th style={cell}>Category</th>
              <th style={{ ...cell, textAlign: 'right' }}>Bookings</th>
              <th style={{ ...cell, textAlign: 'right' }}>Units</th>
              <th style={{ ...cell, textAlign: 'right' }}>Revenue</th>
              <th style={{ ...cell, textAlign: 'right' }}>Per Unit</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <NoMatchRow colSpan={6} noun="products" />}
            {rows.map((p) => (
              <tr key={p.productId} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ ...cell, fontWeight: 600 }}>{p.name}</td>
                <td style={cell}>{p.category}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{p.bookings}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{p.units}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{formatMoney(p.revenue)}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{perUnit(p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataTableShell>
    </section>
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
  const viewport = useViewport()
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
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
            <KpiStrip
              columns={viewport === 'phone' ? 1 : viewport === 'tablet' ? 2 : 4}
              items={[
                { label: 'Equipment Revenue', value: formatMoney(summary.revenue), icon: 'dollar', accent: 'primary', note: 'Priced lines on bookings, not cancelled' },
                { label: 'Products Rented', value: String(summary.productsRented), icon: 'box', accent: 'neutral', note: `of ${summary.rows.length} with units or revenue` },
                { label: 'Utilization', value: NOT_TRACKED, icon: 'chart', accent: 'neutral', note: 'Needs unit state history over time' },
                { label: 'Idle Cost', value: NOT_TRACKED, icon: 'alert_triangle', accent: 'neutral', note: 'Needs unit state history over time' },
              ]}
            />
            <PerformerTable label="Top Performing Equipment" rows={summary.topPerformers} />
            <PerformerTable label="Lowest Revenue per Unit" rows={summary.worstPerformers} />
          </>
        )}
      </PageBody>
    </div>
  )
}
