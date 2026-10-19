import { useState } from 'react'
import { PageHeader, KpiStrip, cardStyle } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { DataTableShell } from '../../components/ui/DataTable'
import { PageBody } from '../../components/ui/PageBody'
import { ReportToolbar } from '../../components/ui/ReportToolbar'
import type { ReportCsvRow, ReportFilters } from '../../components/ui/ReportToolbar'
import { formatMoney, type Paisa } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useViewport } from '../../lib/device'
import { useLoad } from '../../lib/queries/useLoad'
import { NOT_TRACKED } from '../../lib/queries/reportSupport'
import { getCashFlowSummary, type CashFlowSummary } from '../../lib/queries/liquidity'
import { reportFilterOptions, hasReportFilters, NoMatchRow } from './reportStates'

const cell = { padding: 'var(--sp-sm) var(--sp-md)' } as const
const right = { ...cell, textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' as const }
const signed = (p: Paisa) => (p < 0 ? `− ${formatMoney(Math.abs(p) as Paisa)}` : formatMoney(p))

interface StatementLine {
  label: string
  amount: Paisa | null
  note?: string
}

function statement(s: CashFlowSummary): StatementLine[] {
  return [
    { label: 'Opening cash', amount: null, note: 'No bank balance is recorded' },
    { label: 'Cash in — rental collections', amount: s.collected },
    { label: 'Cash out — refunds', amount: -s.refunds as Paisa },
    { label: 'Cash out — expenses paid', amount: -s.expensesPaid as Paisa },
    { label: 'Net operating cash', amount: s.netOperatingCash },
    { label: 'Cash out — equipment purchase', amount: null, note: 'Capital spend is not recorded' },
    { label: 'Closing cash', amount: null, note: 'Needs the opening balance' },
  ]
}

/** The export body — the statement, deposits and expense lines, as drawn. */
function cashFlowCsv(s: CashFlowSummary | null): ReportCsvRow[] {
  if (!s) return []
  return [
    ['Line', 'Amount'],
    ...statement(s).map((l): ReportCsvRow => [l.label, l.amount === null ? NOT_TRACKED : signed(l.amount)]),
    [],
    ['Deposits received (held in trust)', formatMoney(s.depositsReceived)],
    ['Deposits released', formatMoney(s.depositsReleased)],
    ['Invoiced in period', formatMoney(s.invoiced)],
    ['Collection rate', s.collectionRatePct === null ? '—' : `${s.collectionRatePct}%`],
    [],
    ['Expense category', 'Paid'],
    ...s.expensesByCategory.map((c): ReportCsvRow => [c.category, formatMoney(c.amount)]),
  ]
}

/**
 * Cash Flow.
 *
 * Phase 6 + Law 16: this page rendered one invented closed month from
 * `data/liquidityReports` whatever the read returned (and the read itself
 * could not succeed — see `liquidity.ts`). It now draws the period's real
 * collections, refunds, paid expenses and deposit movements through `useLoad`
 * + `PageBody`; opening/closing cash, capital spend and runway say "Not
 * tracked yet". Deposits are shown apart from own cash (Law 4).
 */
export default function CashFlowReport() {
  const canSeeMoney = useCanViewMoney()
  const viewport = useViewport()
  const [filters, setFilters] = useState<ReportFilters>({})
  const filtered = hasReportFilters(filters)
  // Law 6 — a money-blind role never sends the read.
  const load = useLoad(() => getCashFlowSummary(reportFilterOptions(filters)), {
    key: JSON.stringify(filters),
    enabled: canSeeMoney,
  })
  const s = load.data

  if (!canSeeMoney) {
    return (
      <>
        <PageHeader title="Cash Flow" description="Finance ▸ Reports" />
        <PageBody
          restricted
          restrictedReason="Cash reporting is money end to end — every line of the statement and every figure."
          restrictedRequiredRole="Owner, Admin, Coordinator or Accounts"
        >
          {null}
        </PageBody>
      </>
    )
  }

  const nothing =
    s !== null && s.collected === 0 && s.refunds === 0 && s.expensesPaid === 0 && s.depositsReceived === 0 && s.depositsReleased === 0 && s.invoiced === 0

  const kpis: Kpi[] = s
    ? [
        { label: 'Net operating cash', value: signed(s.netOperatingCash), icon: 'chart', accent: s.netOperatingCash >= 0 ? 'success' : 'danger', note: 'Collections − refunds − expenses paid' },
        {
          label: 'Cash collected',
          value: formatMoney(s.collected),
          icon: 'dollar',
          accent: 'primary',
          note: s.collectionRatePct === null ? 'Nothing invoiced in this period' : `${s.collectionRatePct}% of ${formatMoney(s.invoiced)} invoiced`,
          definition: 'Payments received against invoices issued in the period.',
        },
        { label: 'Deposits received', value: formatMoney(s.depositsReceived), icon: 'card', accent: 'neutral', note: `Held in trust, not own cash · ${formatMoney(s.depositsReleased)} released` },
        { label: 'Closing cash', value: NOT_TRACKED, icon: 'activity', accent: 'neutral', note: 'No bank balance is recorded', definition: 'Own funds on hand at period end; excludes client deposits held in trust.' },
      ]
    : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader title="Cash Flow" description="Cash basis · NPR · collections, refunds and paid expenses for the period" />

      <ReportToolbar
        title="Cash Flow"
        value={filters}
        onChange={setFilters}
        dateColumn="payment_date"
        csv={{ filename: 'cash-flow', build: () => cashFlowCsv(s) }}
      />

      <PageBody
        noun="cash figures"
        loading={load.loading}
        error={load.error}
        onRetry={load.reload}
        hasRows={s !== null}
        skeleton="kpi"
        empty={nothing}
        emptyIsFiltered={filtered}
        onClearFilters={() => setFilters({})}
        emptyTitle={filtered ? 'No cash movement in this period' : 'No cash movement recorded yet'}
        emptyMessage={
          filtered
            ? 'No payment, refund, paid expense, deposit or invoice falls in the selected period.'
            : 'Cash figures appear here once payments, expenses or deposits are recorded.'
        }
      >
        {s && (
          <>
            <KpiStrip columns={viewport === 'phone' ? 1 : viewport === 'tablet' ? 2 : 4} items={kpis} />

            <section aria-label="Cash movement" style={cardStyle}>
              <div style={{ fontSize: 'var(--t-body)', fontWeight: 600, padding: 'var(--sp-md)', borderBottom: '1px solid var(--border)' }}>Cash movement</div>
              <DataTableShell ariaLabel="Cash movement">
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)' }}>
                  <tbody>
                    {statement(s).map((l) => (
                      <tr key={l.label} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ ...cell, fontWeight: l.label.startsWith('Net') ? 600 : 400 }}>
                          {l.label}
                          {l.note && <div style={{ fontSize: 'var(--t-micro)', color: 'var(--text2)' }}>{l.note}</div>}
                        </td>
                        <td style={{ ...right, color: l.amount === null ? 'var(--text2)' : 'var(--text)' }}>
                          {l.amount === null ? NOT_TRACKED : signed(l.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataTableShell>
            </section>

            <section aria-label="Expenses paid by category" style={cardStyle}>
              <div style={{ fontSize: 'var(--t-body)', fontWeight: 600, padding: 'var(--sp-md)', borderBottom: '1px solid var(--border)' }}>Expenses paid by category</div>
              <DataTableShell ariaLabel="Expenses paid by category">
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)' }}>
                  <tbody>
                    {s.expensesByCategory.length === 0 && <NoMatchRow colSpan={2} noun="paid expenses" />}
                    {s.expensesByCategory.map((c) => (
                      <tr key={c.category} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ ...cell, fontWeight: 600 }}>{c.category}</td>
                        <td style={right}>{formatMoney(c.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataTableShell>
            </section>
          </>
        )}
      </PageBody>
    </div>
  )
}
