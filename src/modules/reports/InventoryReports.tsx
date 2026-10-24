import { Link } from 'react-router-dom'
import { PageHeader, cardStyle } from '../../components/ui/Page'
import { DataTableShell } from '../../components/ui/DataTable'
import { ReportToolbar } from '../../components/ui/ReportToolbar'
import { PageBody } from '../../components/ui/PageBody'
import { useLoad } from '../../lib/queries/useLoad'
import type { ReportCsvRow } from '../../components/ui/ReportToolbar'
import { getInventoryReportSummary, sharePercent, type InventoryReportSummary } from '../../lib/queries/inventoryReports'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import ShortageSection from './ShortageSection'
import {
  ReportKpiCard,
  ReportKpiStrip,
  ReportChartCard,
} from '../../components/ui/reports'
import '../../styles/reportChartTokens.css'

const NOT_MEASURED = 'not measured'
const NOT_TRACKED = 'not tracked yet'

/**
 * The export body — the same figures the page shows, no more.
 *
 * Counts come from `product_units_v.status` (no money). Utilization and
 * inventory accuracy have no source and export as "not measured"; category
 * value has none and, being money, is only named for roles that may see money
 * (Law 6) — a money-blind role's file carries no trace of it.
 * RULING 2026-10-06: Law 16 — the seeded figures are gone.
 */
export function inventoryCsv(summary: InventoryReportSummary | null, money: boolean): ReportCsvRow[] {
  const count = (n: number | undefined): string | number => (summary && n !== undefined ? n : NOT_MEASURED)
  return [
    ['Figure', 'Value'],
    ['Total units (incl. Retired)', count(summary?.totalUnits)],
    ['Active units (excl. Retired)', count(summary?.activeUnits)],
    ['In stock', count(summary?.inStock)],
    ['Utilization', NOT_MEASURED],
    ['Inventory accuracy', NOT_MEASURED],
    [],
    ['Units by status'],
    ['Status', 'Count', 'Share of all units'],
    ...(summary?.byStatus ?? []).map((r): ReportCsvRow => {
      const pct = sharePercent(r.count, summary?.totalUnits ?? 0)
      return [r.status, r.count, pct === null ? NOT_MEASURED : `${pct}%`]
    }),
    ...(money ? ([[], ['Top categories by value', NOT_TRACKED]] as ReportCsvRow[]) : []),
  ]
}

export default function InventoryReports() {
  const money = useCanViewMoney()
  /* Phase 6 — one read, one ladder. A failed count used to print "Could not
     load unit counts" with no Retry, and the KPIs read "…" then "Unavailable";
     both now come from `PageBody` (skeleton · banner with Retry · nothing-yet). */
  const load = useLoad<InventoryReportSummary>(getInventoryReportSummary)
  const summary = load.data

  return (
    <div className="babin-report" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="box"
        title="Inventory Reports"
        description="Unit counts by lifecycle state. Figures with no source yet say so."
      />

      {/* Export only — a status snapshot has no date or warehouse axis to narrow. */}
      <ReportToolbar title="Inventory Reports" csv={{ filename: 'inventory-reports', build: () => inventoryCsv(summary, money) }} />

      {/* §4.41(a): until 6fb1c62 this route rendered ProductReports; the
          restructure swapped screens without rehoming the old one. Now that it
          lives at /reports/products, this line is the way back — the register
          cannot carry it (43-count pinned by rulings §11.3). */}
      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
        Product sales, turnover, dead stock and supplier performance moved to{' '}
        <Link to="/reports/products" style={{ color: 'var(--link)', fontWeight: 600, textDecoration: 'none' }}>
          Product Reports
        </Link>
      </div>

      <PageBody
        noun="unit counts"
        loading={load.loading}
        error={load.error}
        onRetry={load.reload}
        hasRows={summary !== null}
        skeleton="kpi"
        empty={summary !== null && summary.totalUnits === 0}
        emptyTitle="No units recorded yet"
        emptyMessage="Unit counts appear here once the first piece of equipment is added to Inventory."
      >
        {summary && (
          <>
            {/* Real counts only (Law 16). A figure with no source reads "Not measured",
                never 0 or a plausible default. */}
            <ReportKpiStrip ariaLabel="Inventory status metrics">
              <ReportKpiCard
                label="Total Assets"
                value={String(summary.activeUnits)}
                icon="box"
                note="Units not retired"
              />
              <ReportKpiCard
                label="Utilization"
                value="Not measured"
                icon="chart"
                note="No rate-over-time source yet"
              />
              <ReportKpiCard
                label="Available"
                value={String(summary.inStock)}
                icon="check"
                note="Units In Stock right now"
              />
              <ReportKpiCard
                label="Inventory Accuracy"
                value="Not measured"
                icon="checklist"
                note="Needs audit variance data"
              />
            </ReportKpiStrip>

            <ReportChartCard
              title="Units by Status"
              basis="Live physical unit lifecycle status counts"
              source="Inventory · product_units_v"
              description="Current inventory distribution across physical asset states."
            >
              {/* Status proportion bar */}
              {summary.totalUnits > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      height: 14,
                      borderRadius: 4,
                      overflow: 'hidden',
                      display: 'flex',
                      background: 'var(--card2)',
                    }}
                  >
                    {summary.byStatus.map((r, idx) => {
                      const pct = Math.max(Math.round((r.count / summary.totalUnits) * 100), 1)
                      const colors = [
                        'var(--chart-1, #0284c7)',
                        'var(--chart-2, #0d9488)',
                        'var(--chart-3, #d97706)',
                        'var(--chart-4, #dc2626)',
                        'var(--chart-5, #7c3aed)',
                        'var(--chart-6, #db2777)',
                      ]
                      return (
                        <div
                          key={r.status}
                          style={{
                            width: `${pct}%`,
                            background: colors[idx % colors.length],
                            height: '100%',
                          }}
                          title={`${r.status}: ${r.count} (${pct}%)`}
                        />
                      )
                    })}
                  </div>
                </div>
              )}

              <DataTableShell ariaLabel="Units by Status">
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)' }}>
                  <thead>
                    <tr style={{ color: 'var(--text2)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Status</th>
                      <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Count</th>
                      <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Share of all units</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.byStatus.map((r) => {
                      const pct = sharePercent(r.count, summary.totalUnits)
                      return (
                        <tr key={r.status} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: 'var(--sp-sm) var(--sp-md)', fontWeight: 600 }}>{r.status}</td>
                          <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{r.count}</td>
                          <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{pct === null ? 'Not measured' : `${pct}%`}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </DataTableShell>
            </ReportChartCard>
          </>
        )}
      </PageBody>

      {/* C7 — the one list of over-committed products for a period. Real holds and
          real stock. Outside the ladder above: it has its own read and its own
          states, and a failed unit count must not hide it. */}
      <ShortageSection />

      {money && (
        <section aria-label="Top Categories by Value" style={cardStyle}>
          <div style={{ fontSize: 'var(--t-body)', fontWeight: 600, padding: 'var(--sp-md)', borderBottom: '1px solid var(--border)' }}>Top Categories by Value</div>
          {/* TODO(decision): category valuation (purchase_price vs replacement_value) is unruled. */}
          <div style={{ padding: 'var(--sp-md)', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Not tracked yet.</div>
        </section>
      )}
    </div>
  )
}
