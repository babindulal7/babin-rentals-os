import { useState, type ReactNode } from 'react'
import { PageHeader, KpiStrip, cardStyle } from '../../components/ui/Page'
import { DataTableShell } from '../../components/ui/DataTable'
import { PageBody } from '../../components/ui/PageBody'
import { ReportToolbar } from '../../components/ui/ReportToolbar'
import type { ReportCsvRow, ReportFilters } from '../../components/ui/ReportToolbar'
import { formatMoney } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useViewport } from '../../lib/device'
import { useLoad } from '../../lib/queries/useLoad'
import { NOT_TRACKED } from '../../lib/queries/reportSupport'
import { getProductReportsSummary, type ProductReportsSummary } from '../../lib/queries/productReports'
import { reportFilterOptions, hasReportFilters, NoMatchRow } from './reportStates'

const cell = { padding: 'var(--sp-sm) var(--sp-md)' } as const
const right = { ...cell, textAlign: 'right' as const }

/** The export body. Money columns appear only for a money-visible role (Law 6), exactly as on screen. */
function productsCsv(summary: ProductReportsSummary | null, money: boolean): ReportCsvRow[] {
  if (!summary) return []
  return [
    ['Figure', 'Value'],
    ['Products', summary.productCount],
    ['Active products', summary.activeProducts],
    ['Products booked in period', summary.productsBooked],
    ...(money ? [['Revenue from product lines', formatMoney(summary.revenue)] as ReportCsvRow] : []),
    ['Gross profit', NOT_TRACKED],
    [],
    ['Category', 'Bookings', ...(money ? ['Revenue'] : [])],
    ...summary.byCategory.map((c): ReportCsvRow => [c.category, c.bookings, ...(money ? [formatMoney(c.revenue)] : [])]),
    [],
    ['Product', 'Category', 'Bookings', 'Quantity Booked', ...(money ? ['Revenue'] : [])],
    ...summary.topRevenue.map((p): ReportCsvRow => [p.name, p.category, p.bookings, p.quantityBooked, ...(money ? [formatMoney(p.revenue)] : [])]),
    [],
    ['Not booked in period', 'Category'],
    ...summary.notBooked.map((p): ReportCsvRow => [p.name, p.category]),
    [],
    ['At or below reorder level', 'On hand', 'Reorder level'],
    ...summary.lowStock.map((p): ReportCsvRow => [p.name, p.onHand, p.reorderLevel]),
  ]
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} style={cardStyle}>
      <div style={{ fontSize: 'var(--t-body)', fontWeight: 600, padding: 'var(--sp-md)', borderBottom: '1px solid var(--border)' }}>{label}</div>
      <DataTableShell ariaLabel={label}>{children}</DataTableShell>
    </section>
  )
}

/**
 * Product Reports.
 *
 * Phase 6 + Law 16: the page rendered `data/productReports` (invented trends,
 * profit, turnover, returns and suppliers) whatever the read returned. It now
 * draws catalogue, demand and stock figures from the catalogue and priced
 * booking lines, through `useLoad` + `PageBody`. Revenue is shown to
 * money-visible roles only (Law 6); a figure with no source says so.
 */
export default function ProductReports() {
  const money = useCanViewMoney()
  const viewport = useViewport()
  const [filters, setFilters] = useState<ReportFilters>({})
  const filtered = hasReportFilters(filters)
  const load = useLoad(() => getProductReportsSummary(reportFilterOptions(filters)), { key: JSON.stringify(filters) })
  const summary = load.data

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader title="Product Reports" description="Catalogue, demand by product and category, and stock at or below reorder level." />

      <ReportToolbar
        title="Product Reports"
        value={filters}
        onChange={setFilters}
        dateColumn="pickup_at"
        csv={{ filename: 'product-reports', build: () => productsCsv(summary, money) }}
      />

      <PageBody
        noun="product figures"
        loading={load.loading}
        error={load.error}
        onRetry={load.reload}
        hasRows={summary !== null}
        skeleton="kpi"
        empty={summary !== null && summary.productCount === 0}
        emptyTitle="No products yet"
        emptyMessage="Product figures appear here once the first product is added to Inventory."
      >
        {summary && (
          <>
            <KpiStrip
              columns={viewport === 'phone' ? 1 : viewport === 'tablet' ? 2 : 4}
              items={[
                { label: 'Active Products', value: String(summary.activeProducts), icon: 'box', accent: 'primary', note: `${summary.productCount} in the catalogue` },
                {
                  label: 'Booked in Period',
                  value: String(summary.productsBooked),
                  icon: 'calendar',
                  accent: 'neutral',
                  note: filtered ? 'Products on bookings picked up in the period' : 'Products on any booking',
                },
                money
                  ? { label: 'Product Revenue', value: formatMoney(summary.revenue), icon: 'dollar', accent: 'success', note: 'Priced lines, bookings not cancelled' }
                  : { label: 'Reorder Alerts', value: String(summary.lowStock.length), icon: 'alert_triangle', accent: 'warn', note: 'At or below reorder level' },
                { label: 'Gross Profit', value: NOT_TRACKED, icon: 'chart', accent: 'neutral', note: 'No product cost is recorded' },
              ]}
            />

            <Section label="Demand by Category">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)' }}>
                <thead>
                  <tr style={{ color: 'var(--text2)' }}>
                    <th style={cell}>Category</th>
                    <th style={right}>Bookings</th>
                    {money && <th style={right}>Revenue</th>}
                  </tr>
                </thead>
                <tbody>
                  {summary.byCategory.length === 0 && <NoMatchRow colSpan={money ? 3 : 2} noun="categories with bookings" />}
                  {summary.byCategory.map((c) => (
                    <tr key={c.category} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ ...cell, fontWeight: 600 }}>{c.category}</td>
                      <td style={right}>{c.bookings}</td>
                      {money && <td style={right}>{formatMoney(c.revenue)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section label={money ? 'Top Products by Revenue' : 'Most Booked Products'}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)', minWidth: 520 }}>
                <thead>
                  <tr style={{ color: 'var(--text2)' }}>
                    <th style={cell}>Product</th>
                    <th style={cell}>Category</th>
                    <th style={right}>Bookings</th>
                    <th style={right}>Quantity</th>
                    {money && <th style={right}>Revenue</th>}
                  </tr>
                </thead>
                <tbody>
                  {summary.topRevenue.length === 0 && <NoMatchRow colSpan={money ? 5 : 4} noun="booked products" />}
                  {summary.topRevenue.map((p) => (
                    <tr key={p.productId} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ ...cell, fontWeight: 600 }}>{p.name}</td>
                      <td style={cell}>{p.category}</td>
                      <td style={right}>{p.bookings}</td>
                      <td style={right}>{p.quantityBooked}</td>
                      {money && <td style={right}>{formatMoney(p.revenue)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section label="Not Booked in Period">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)' }}>
                <thead>
                  <tr style={{ color: 'var(--text2)' }}>
                    <th style={cell}>Product</th>
                    <th style={cell}>Category</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.notBooked.length === 0 && <NoMatchRow colSpan={2} noun="idle products" />}
                  {summary.notBooked.slice(0, 20).map((p) => (
                    <tr key={p.productId} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ ...cell, fontWeight: 600 }}>{p.name}</td>
                      <td style={cell}>{p.category}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section label="At or Below Reorder Level">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)' }}>
                <thead>
                  <tr style={{ color: 'var(--text2)' }}>
                    <th style={cell}>Product</th>
                    <th style={right}>On Hand</th>
                    <th style={right}>Reorder Level</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.lowStock.length === 0 && <NoMatchRow colSpan={3} noun="products at or below reorder level" />}
                  {summary.lowStock.map((p) => (
                    <tr key={p.productId} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ ...cell, fontWeight: 600 }}>{p.name}</td>
                      <td style={right}>{p.onHand}</td>
                      <td style={right}>{p.reorderLevel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          </>
        )}
      </PageBody>
    </div>
  )
}
