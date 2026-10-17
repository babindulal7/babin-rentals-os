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
import { getPromotionsReportsSummary, type PromotionsReportsSummary } from '../../lib/queries/promotionsReports'
import { reportFilterOptions, hasReportFilters, NoMatchRow } from './reportStates'

const cell = { padding: 'var(--sp-sm) var(--sp-md)' } as const
const right = { ...cell, textAlign: 'right' as const }
const pct = (n: number | null) => (n === null ? '—' : `${n}%`)

/** The export body — the same figures and tables the page draws. */
function promotionsCsv(s: PromotionsReportsSummary | null): ReportCsvRow[] {
  if (!s) return []
  return [
    ['Figure', 'Value'],
    ['Coupons (active)', `${s.couponCount} (${s.activeCoupons})`],
    ['Redemptions', s.redemptionCount],
    ['Discount given', formatMoney(s.discountsGiven)],
    ['Revenue on bookings that redeemed a coupon', formatMoney(s.promotionRevenue)],
    ['Return on promotion', s.returnOnPromotion === null ? '—' : `${s.returnOnPromotion}x`],
    [],
    ['Coupon', 'Percent', 'Active', 'Redemptions', 'Discount Given', 'Booking Revenue'],
    ...s.coupons.map((c): ReportCsvRow => [c.code, pct(c.discountPercent), c.isActive ? 'Yes' : 'No', c.redemptions, formatMoney(c.discountGiven), formatMoney(c.bookingRevenue)]),
    [],
    ['Discount Source', 'Count', 'Average Percent'],
    ...s.discountSources.map((d): ReportCsvRow => [d.source, d.count, pct(d.averagePercent)]),
    [],
    ['Bundle', 'Bookings', 'Revenue'],
    ...s.bundles.map((b): ReportCsvRow => [b.name, b.bookings, formatMoney(b.revenue)]),
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
 * Promotions & Discounts.
 *
 * Phase 6 + Law 16: the page rendered `data/promotionsReports` whatever the
 * read returned. It now draws coupon redemptions, discount sources and bundle
 * usage from their tables, through `useLoad` + `PageBody`.
 */
export default function PromotionsReports() {
  const money = useCanViewMoney()
  const viewport = useViewport()
  const [filters, setFilters] = useState<ReportFilters>({})
  const filtered = hasReportFilters(filters)
  // Law 6 — a money-blind role never sends the read.
  const load = useLoad(() => getPromotionsReportsSummary(reportFilterOptions(filters)), {
    key: JSON.stringify(filters),
    enabled: money,
  })
  const s = load.data

  if (!money) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <PageHeader icon="box" title="Promotions & Discounts" description="Coupon redemptions, discounts given and bundle usage." />
        <PageBody
          restricted
          restrictedReason="Promotions are reported as revenue against discount given, so every headline figure on this page is money."
          restrictedRequiredRole="Owner, Admin, Coordinator or Accounts"
        >
          {null}
        </PageBody>
      </div>
    )
  }

  const nothing = s !== null && s.couponCount === 0 && s.discountSources.length === 0 && s.bundles.length === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader icon="box" title="Promotions & Discounts" description="Coupon redemptions, discounts given and bundle usage." />

      <ReportToolbar
        title="Promotions & Discounts"
        value={filters}
        onChange={setFilters}
        dateColumn="redeemed_at"
        csv={{ filename: 'promotions', build: () => promotionsCsv(s) }}
      />

      <PageBody
        noun="promotion figures"
        loading={load.loading}
        error={load.error}
        onRetry={load.reload}
        hasRows={s !== null}
        skeleton="kpi"
        empty={nothing}
        emptyIsFiltered={filtered}
        onClearFilters={() => setFilters({})}
        emptyTitle={filtered ? 'No promotions in this period' : 'No promotions yet'}
        emptyMessage={
          filtered
            ? 'No coupon was redeemed, no discount applied and no bundle booked in the selected period.'
            : 'Figures appear here once a coupon, discount or bundle is used.'
        }
      >
        {s && (
          <>
            <KpiStrip
              columns={viewport === 'phone' ? 1 : viewport === 'tablet' ? 2 : 4}
              items={[
                { label: 'Redemptions', value: String(s.redemptionCount), icon: 'check', accent: 'primary', note: `${s.activeCoupons} of ${s.couponCount} coupons active` },
                { label: 'Discount Given', value: formatMoney(s.discountsGiven), icon: 'dollar', accent: 'warn', note: 'On coupon redemptions' },
                { label: 'Promotion Revenue', value: formatMoney(s.promotionRevenue), icon: 'chart', accent: 'success', note: 'Bookings that redeemed a coupon' },
                {
                  label: 'Return on Promotion',
                  value: s.returnOnPromotion === null ? '—' : `${s.returnOnPromotion}x`,
                  icon: 'activity',
                  accent: 'neutral',
                  note: s.returnOnPromotion === null ? 'No discount given in this period' : 'Revenue per rupee of discount',
                },
              ]}
            />

            <Section label="Coupon Performance">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)', minWidth: 560 }}>
                <thead>
                  <tr style={{ color: 'var(--text2)' }}>
                    <th style={cell}>Coupon</th>
                    <th style={right}>Percent</th>
                    <th style={cell}>Active</th>
                    <th style={right}>Redemptions</th>
                    <th style={right}>Discount Given</th>
                    <th style={right}>Booking Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {s.coupons.length === 0 && <NoMatchRow colSpan={6} noun="coupons" />}
                  {s.coupons.map((c) => (
                    <tr key={c.couponId} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ ...cell, fontWeight: 600 }}>{c.code}</td>
                      <td style={right}>{pct(c.discountPercent)}</td>
                      <td style={cell}>{c.isActive ? 'Yes' : 'No'}</td>
                      <td style={right}>{c.redemptions}</td>
                      <td style={right}>{formatMoney(c.discountGiven)}</td>
                      <td style={right}>{formatMoney(c.bookingRevenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section label="Discounts by Source">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)' }}>
                <thead>
                  <tr style={{ color: 'var(--text2)' }}>
                    <th style={cell}>Source</th>
                    <th style={right}>Discounts</th>
                    <th style={right}>Average Percent</th>
                  </tr>
                </thead>
                <tbody>
                  {s.discountSources.length === 0 && <NoMatchRow colSpan={3} noun="discounts" />}
                  {s.discountSources.map((d) => (
                    <tr key={d.source} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ ...cell, fontWeight: 600 }}>{d.source}</td>
                      <td style={right}>{d.count}</td>
                      <td style={right}>{pct(d.averagePercent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section label="Bundle Usage">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)' }}>
                <thead>
                  <tr style={{ color: 'var(--text2)' }}>
                    <th style={cell}>Bundle</th>
                    <th style={right}>Bookings</th>
                    <th style={right}>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {s.bundles.length === 0 && <NoMatchRow colSpan={3} noun="bundles booked" />}
                  {s.bundles.map((b) => (
                    <tr key={b.bundleId} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ ...cell, fontWeight: 600 }}>{b.name}</td>
                      <td style={right}>{b.bookings}</td>
                      <td style={right}>{formatMoney(b.revenue)}</td>
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
