import { useState } from 'react'
import { PageHeader, KpiStrip, cardStyle } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { DataTableShell } from '../../components/ui/DataTable'
import { PageBody } from '../../components/ui/PageBody'
import { ReportToolbar } from '../../components/ui/ReportToolbar'
import type { ReportCsvRow, ReportFilters } from '../../components/ui/ReportToolbar'
import { formatMoney } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useViewport } from '../../lib/device'
import { useLoad } from '../../lib/queries/useLoad'
import { NOT_TRACKED } from '../../lib/queries/reportSupport'
import { getWorkingCapitalSummary, type WorkingCapitalSummary } from '../../lib/queries/liquidity'

const cell = { padding: 'var(--sp-sm) var(--sp-md)' } as const
const right = { ...cell, textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' as const }

/** The export body — the position and ageing as drawn. */
function workingCapitalCsv(s: WorkingCapitalSummary | null): ReportCsvRow[] {
  if (!s) return []
  return [
    ['Line', 'Amount'],
    ['Cash', NOT_TRACKED],
    ['Receivables', formatMoney(s.receivables)],
    ['of which overdue', formatMoney(s.overdueReceivables)],
    ['Deposits held in trust (liability)', formatMoney(s.depositsHeld)],
    ['Approved, unpaid expenses', formatMoney(s.approvedUnpaidExpenses)],
    ['Supplier payables', NOT_TRACKED],
    ['Working capital', NOT_TRACKED],
    ['Current ratio', NOT_TRACKED],
    ['Days sales outstanding', s.daysSalesOutstanding === null ? '—' : s.daysSalesOutstanding],
    [],
    ['Receivables ageing', 'Amount', 'Invoices'],
    ...s.ageing.map((a): ReportCsvRow => [a.label, formatMoney(a.amount), a.invoices]),
  ]
}

/**
 * Working Capital — the position now.
 *
 * Phase 6 + Law 16: this page rendered an invented balance sheet from
 * `data/liquidityReports` whatever the read returned. It now draws what the
 * ledgers hold — receivables and their ageing, deposits held, approved unpaid
 * expenses — through `useLoad` + `PageBody`. Cash, supplier payables, working
 * capital and the current ratio need a bank balance and a supplier-invoice
 * table, neither of which exists, so they say "Not tracked yet". The position
 * is "now": a period would narrow nothing, so only the branch filter applies.
 */
export default function WorkingCapitalReport() {
  const canSeeMoney = useCanViewMoney()
  const viewport = useViewport()
  const [filters, setFilters] = useState<ReportFilters>({})
  const branchId = filters.chips?.['branch_id']?.[0]
  // Law 6 — a money-blind role never sends the read.
  const load = useLoad(() => getWorkingCapitalSummary(branchId ? { branchId } : {}), {
    key: branchId ?? '',
    enabled: canSeeMoney,
  })
  const s = load.data

  if (!canSeeMoney) {
    return (
      <>
        <PageHeader title="Working Capital" description="Finance ▸ Reports" />
        <PageBody
          restricted
          restrictedReason="Working capital is money end to end — receivables, deposits held and payables."
          restrictedRequiredRole="Owner, Admin, Coordinator or Accounts"
        >
          {null}
        </PageBody>
      </>
    )
  }

  const nothing = s !== null && s.receivables === 0 && s.depositsHeld === 0 && s.approvedUnpaidExpenses === 0
  const kpis: Kpi[] = s
    ? [
        { label: 'Receivables', value: formatMoney(s.receivables), icon: 'dollar', accent: 'primary', note: `${formatMoney(s.overdueReceivables)} past due`, definition: 'Total tied up in unpaid invoices; overdue portion is past due date.' },
        { label: 'Deposits held', value: formatMoney(s.depositsHeld), icon: 'card', accent: 'neutral', note: 'A liability held in trust, not own cash' },
        {
          label: 'Days sales outstanding',
          value: s.daysSalesOutstanding === null ? '—' : `${s.daysSalesOutstanding} days`,
          icon: 'timer',
          accent: 'neutral',
          note: s.daysSalesOutstanding === null ? 'Nothing invoiced in the last 90 days' : 'Receivables ÷ daily invoicing, last 90 days',
        },
        { label: 'Working capital', value: NOT_TRACKED, icon: 'activity', accent: 'neutral', note: 'Needs the bank balance and supplier payables', definition: 'Current assets minus current liabilities; negative means short-term obligations exceed liquid assets.' },
      ]
    : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader title="Working Capital" description="The position now · receivables, deposits held and payables · NPR" />

      <ReportToolbar title="Working Capital" value={filters} onChange={setFilters} csv={{ filename: 'working-capital', build: () => workingCapitalCsv(s) }} />

      <PageBody
        noun="working capital"
        loading={load.loading}
        error={load.error}
        onRetry={load.reload}
        hasRows={s !== null}
        skeleton="kpi"
        empty={nothing}
        emptyIsFiltered={Boolean(branchId)}
        onClearFilters={() => setFilters({})}
        emptyTitle={branchId ? 'Nothing open for this branch' : 'Nothing open right now'}
        emptyMessage="No invoice is outstanding, no deposit is held and no approved expense is unpaid."
      >
        {s && (
          <>
            <KpiStrip columns={viewport === 'phone' ? 1 : viewport === 'tablet' ? 2 : 4} items={kpis} />

            <section aria-label="Position" style={cardStyle}>
              <div style={{ fontSize: 'var(--t-body)', fontWeight: 600, padding: 'var(--sp-md)', borderBottom: '1px solid var(--border)' }}>Position</div>
              <DataTableShell ariaLabel="Position">
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)' }}>
                  <tbody>
                    {(
                      [
                        ['Cash', null, 'No bank balance is recorded'],
                        ['Receivables', s.receivables, 'Outstanding on open invoices'],
                        ['Deposits held in trust', s.depositsHeld, 'Owed back to clients — a liability'],
                        ['Approved, unpaid expenses', s.approvedUnpaidExpenses, 'Approved but not yet paid'],
                        ['Supplier payables', null, 'No supplier-invoice table exists'],
                        ['Current ratio', null, 'Needs cash and supplier payables'],
                      ] as const
                    ).map(([label, amount, note]) => (
                      <tr key={label} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={cell}>
                          {label}
                          <div style={{ fontSize: 'var(--t-micro)', color: 'var(--text2)' }}>{note}</div>
                        </td>
                        <td style={{ ...right, color: amount === null ? 'var(--text2)' : 'var(--text)' }}>{amount === null ? NOT_TRACKED : formatMoney(amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataTableShell>
            </section>

            <section aria-label="Receivables ageing" style={cardStyle}>
              <div style={{ fontSize: 'var(--t-body)', fontWeight: 600, padding: 'var(--sp-md)', borderBottom: '1px solid var(--border)' }}>Receivables ageing</div>
              <DataTableShell ariaLabel="Receivables ageing">
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)' }}>
                  <thead>
                    <tr style={{ color: 'var(--text2)' }}>
                      <th style={cell}>Past due date</th>
                      <th style={right}>Invoices</th>
                      <th style={right}>Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.ageing.map((a) => (
                      <tr key={a.label} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ ...cell, fontWeight: 600 }}>{a.label}</td>
                        <td style={right}>{a.invoices}</td>
                        <td style={right}>{formatMoney(a.amount)}</td>
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
