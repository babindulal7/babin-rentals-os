import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
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
import { getClientReportsSummary, type ClientReportsSummary } from '../../lib/queries/clientReports'
import { reportFilterOptions, hasReportFilters, NoMatchRow } from './reportStates'

const cell = { padding: 'var(--sp-sm) var(--sp-md)' } as const
const right = { ...cell, textAlign: 'right' as const }
const m = (p: Paisa | null) => (p === null ? '—' : formatMoney(p))

/** The export body. Money sections appear only for a money-visible role (Law 6), exactly as on screen. */
function clientsCsv(s: ClientReportsSummary | null): ReportCsvRow[] {
  if (!s) return []
  return [
    ['Figure', 'Value'],
    ['Clients', s.totalClients],
    ['Active clients', s.activeClients],
    ['New clients in period', s.newClients],
    ['Members', s.members],
    ['Clients who booked', s.bookedClients],
    ['Repeat clients', s.repeatClients],
    ...(s.money
      ? ([
          ['Invoiced in period', formatMoney(s.money.invoiced)],
          ['Receivables now', formatMoney(s.money.receivables)],
        ] as ReportCsvRow[])
      : []),
    [],
    ['Booking frequency', 'Clients'],
    ...s.frequency.map((f): ReportCsvRow => [f.label, f.clients]),
    [],
    ['Client', 'Code', 'Bookings', ...(s.money ? ['Invoiced', 'Outstanding'] : [])],
    ...s.topClients.map((c): ReportCsvRow => [c.name, c.code, c.bookings, ...(s.money ? [m(c.invoiced), m(c.outstanding)] : [])]),
    ...(s.money
      ? ([
          [],
          ['Receivables ageing', 'Amount', 'Invoices'],
          ...s.money.ageing.map((a): ReportCsvRow => [a.label, formatMoney(a.amount), a.invoices]),
          [],
          ['Over 60 days overdue', 'Overdue', 'Oldest (days)'],
          ...s.money.highRisk.map((r): ReportCsvRow => [r.name, formatMoney(r.overdue), r.oldestDaysOverdue]),
        ] as ReportCsvRow[])
      : []),
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
 * Client Reports.
 *
 * Phase 6 + Law 16: the page rendered `data/clientReports` (invented growth,
 * retention, ageing, top and high-risk clients, "insights") whatever the read
 * returned. It now draws the client base, booking frequency and — for a
 * money-visible role only — invoicing and receivables ageing, through
 * `useLoad` + `PageBody`.
 */
export default function ClientReports() {
  const money = useCanViewMoney()
  const viewport = useViewport()
  const [filters, setFilters] = useState<ReportFilters>({})
  const filtered = hasReportFilters(filters)
  const load = useLoad(() => getClientReportsSummary(reportFilterOptions(filters), { includeMoney: money }), {
    key: `${JSON.stringify(filters)}|${money}`,
  })
  const s = load.data

  const kpis: Kpi[] = s
    ? [
        { label: 'Clients', value: String(s.totalClients), icon: 'users', accent: 'primary', note: `${s.activeClients} active · ${s.members} members` },
        { label: 'New Clients', value: String(s.newClients), icon: 'plus', accent: 'neutral', note: filtered ? 'Added in the period' : 'All time' },
        { label: 'Clients Who Booked', value: String(s.bookedClients), icon: 'calendar', accent: 'neutral', note: `${s.repeatClients} booked more than once` },
        s.money
          ? { label: 'Receivables', value: formatMoney(s.money.receivables), icon: 'dollar', accent: s.money.receivables > 0 ? 'warn' : 'neutral', note: 'Outstanding on open invoices, now' }
          : { label: 'Repeat Clients', value: String(s.repeatClients), icon: 'check', accent: 'success', note: 'Two or more bookings' },
      ]
    : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader title="Client Reports" description="The client base, how often clients book, and — for finance roles — what they owe." />

      <ReportToolbar
        title="Client Reports"
        value={filters}
        onChange={setFilters}
        dateColumn="pickup_at"
        csv={{ filename: 'client-reports', build: () => clientsCsv(s) }}
      />

      <PageBody
        noun="client figures"
        loading={load.loading}
        error={load.error}
        onRetry={load.reload}
        hasRows={s !== null}
        skeleton="kpi"
        empty={s !== null && s.totalClients === 0}
        emptyTitle="No clients yet"
        emptyMessage="Client figures appear here once the first client is added."
      >
        {s && (
          <>
            <KpiStrip columns={viewport === 'phone' ? 1 : viewport === 'tablet' ? 2 : 4} items={kpis} />

            <Section label="Booking Frequency">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)' }}>
                <thead>
                  <tr style={{ color: 'var(--text2)' }}>
                    <th style={cell}>Bookings {filtered ? 'in period' : 'all time'}</th>
                    <th style={right}>Clients</th>
                  </tr>
                </thead>
                <tbody>
                  {s.frequency.map((f) => (
                    <tr key={f.label} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ ...cell, fontWeight: 600 }}>{f.label}</td>
                      <td style={right}>{f.clients}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section label={s.money ? 'Top Clients by Invoiced' : 'Most Active Clients'}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)', minWidth: 520 }}>
                <thead>
                  <tr style={{ color: 'var(--text2)' }}>
                    <th style={cell}>Client</th>
                    <th style={right}>Bookings</th>
                    {s.money && <th style={right}>Invoiced</th>}
                    {s.money && <th style={right}>Outstanding</th>}
                  </tr>
                </thead>
                <tbody>
                  {s.topClients.length === 0 && <NoMatchRow colSpan={s.money ? 4 : 2} noun="clients with bookings or invoices" />}
                  {s.topClients.map((c) => (
                    <tr key={c.clientId} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ ...cell, fontWeight: 600 }}>
                        <Link to={`/clients/${c.clientId}`} style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                          {c.name}
                        </Link>
                      </td>
                      <td style={right}>{c.bookings}</td>
                      {s.money && <td style={right}>{m(c.invoiced)}</td>}
                      {s.money && <td style={right}>{m(c.outstanding)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            {s.money && (
              <>
                <Section label="Receivables Ageing">
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)' }}>
                    <thead>
                      <tr style={{ color: 'var(--text2)' }}>
                        <th style={cell}>Past due date</th>
                        <th style={right}>Invoices</th>
                        <th style={right}>Outstanding</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.money.ageing.map((a) => (
                        <tr key={a.label} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ ...cell, fontWeight: 600 }}>{a.label}</td>
                          <td style={right}>{a.invoices}</td>
                          <td style={right}>{formatMoney(a.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Section>

                <Section label="Over 60 Days Overdue">
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)' }}>
                    <thead>
                      <tr style={{ color: 'var(--text2)' }}>
                        <th style={cell}>Client</th>
                        <th style={right}>Overdue</th>
                        <th style={right}>Oldest</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.money.highRisk.length === 0 && <NoMatchRow colSpan={3} noun="clients over 60 days overdue" />}
                      {s.money.highRisk.map((r) => (
                        <tr key={r.clientId} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ ...cell, fontWeight: 600 }}>{r.name}</td>
                          <td style={right}>{formatMoney(r.overdue)}</td>
                          <td style={right}>{r.oldestDaysOverdue} days</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Section>
              </>
            )}
          </>
        )}
      </PageBody>
    </div>
  )
}
