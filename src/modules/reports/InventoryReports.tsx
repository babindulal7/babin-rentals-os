import { Link } from 'react-router-dom'
import { PageHeader, KpiStrip, cardStyle } from '../../components/ui/Page'
import { DataTableShell } from '../../components/ui/DataTable'
import { ReportToolbar } from '../../components/ui/ReportToolbar'
import { PageBody } from '../../components/ui/PageBody'
import { useLoad } from '../../lib/queries/useLoad'
import type { ReportCsvRow } from '../../components/ui/ReportToolbar'
import { getInventoryReportSummary, sharePercent, type InventoryReportSummary } from '../../lib/queries/inventoryReports'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useViewport } from '../../lib/device'
import ShortageSection from './ShortageSection'

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
  const viewport = useViewport()
  /* Phase 6 — one read, one ladder. A failed count used to print "Could not
     load unit counts" with no Retry, and the KPIs read "…" then "Unavailable";
     both now come from `PageBody` (skeleton · banner with Retry · nothing-yet). */
  const load = useLoad<InventoryReportSummary>(getInventoryReportSummary)
  const summary = load.data

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
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
      <KpiStrip
        columns={viewport === 'phone' ? 1 : viewport === 'tablet' ? 2 : 4}
        items={[
          { label: 'Total Assets', value: String(summary.activeUnits), icon: 'box', accent: 'primary', note: 'Units not retired' },
          { label: 'Utilization', value: 'Not measured', icon: 'activity', accent: 'progress', note: 'No rate-over-time source yet' },
          { label: 'Available', value: String(summary.inStock), icon: 'check', accent: 'success', note: 'Units In Stock right now' },
          { label: 'Inventory Accuracy', value: 'Not measured', icon: 'checklist', accent: 'success', note: 'Needs audit variance data' },
        ]}
      />

      <section aria-label="Units by status" style={cardStyle}>
        <div style={{ fontSize: 'var(--t-body)', fontWeight: 600, padding: 'var(--sp-md)', borderBottom: '1px solid var(--border)' }}>Units by Status</div>
          <DataTableShell ariaLabel="Units by Status">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)' }}>
              <thead>
                <tr style={{ color: 'var(--text2)' }}>
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
      </section>
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
