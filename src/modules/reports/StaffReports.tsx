import { useState } from 'react'
import { PageHeader, KpiStrip, cardStyle } from '../../components/ui/Page'
import { DataTableShell } from '../../components/ui/DataTable'
import { PageBody } from '../../components/ui/PageBody'
import { ReportToolbar } from '../../components/ui/ReportToolbar'
import type { ReportCsvRow, ReportFilters } from '../../components/ui/ReportToolbar'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useViewport } from '../../lib/device'
import { useAuth } from '../../lib/auth'
import { formatMoney } from '../../lib/money'
import { useLoad } from '../../lib/queries/useLoad'
import { NOT_TRACKED } from '../../lib/queries/reportSupport'
import { getStaffReportsSummary, type StaffReportsSummary } from '../../lib/queries/staffReports'
import { reportFilterOptions, hasReportFilters } from './reportStates'

const cell = { padding: 'var(--sp-sm) var(--sp-md)' } as const

/** The export body: the same figures and rows the page draws, nothing the page withholds. */
function staffCsv(summary: StaffReportsSummary | null): ReportCsvRow[] {
  if (!summary) return []
  return [
    ['Figure', 'Value'],
    ['Bookings created', summary.totals.bookingsCreated],
    ['Value of bookings created', formatMoney(summary.totals.bookingValue)],
    ['Rental collections received', formatMoney(summary.totals.collections)],
    ['Floor sessions completed', summary.totals.sessionsCompleted],
    ['Average response time', NOT_TRACKED],
    [],
    ['Staff', 'Role', 'Bookings Created', 'Booking Value', 'Collections Received', 'Sessions Completed'],
    ...summary.rows.map((s): ReportCsvRow => [
      s.name,
      s.role,
      s.bookingsCreated,
      formatMoney(s.bookingValue),
      formatMoney(s.collections),
      s.sessionsCompleted,
    ]),
  ]
}

/**
 * Staff Performance.
 *
 * Phase 6 + Law 16: this page rendered five invented people from
 * `data/staffReports` whatever the read returned. It now draws the per-person
 * figures `getStaffReportsSummary` derives from bookings, payments and floor
 * sessions, through `useLoad` + `PageBody` (loading · Error + Retry ·
 * nothing-yet vs nothing in this period). The invented "performance score" and
 * response time are gone — no table records either.
 */
export default function StaffReports() {
  const money = useCanViewMoney()
  const { user } = useAuth()
  const viewport = useViewport()
  const [filters, setFilters] = useState<ReportFilters>({})
  const filtered = hasReportFilters(filters)
  // Law 6 — a money-blind role never sends the read.
  const load = useLoad(() => getStaffReportsSummary(reportFilterOptions(filters)), {
    key: JSON.stringify(filters),
    enabled: money,
  })
  const summary = load.data

  // Law 6 — booking value and collections are the report; there is no
  // money-free version of it, so the shared RESTRICTED state stands in for the
  // whole page and no export is offered above it.
  if (!money) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <PageHeader icon="users" title="Staff Performance" description="Bookings created, collections received and floor work, per person." />
        <PageBody
          restricted
          restrictedReason="Staff performance is measured in booking value and collections, so there is no version of this page your role can see."
          restrictedRequiredRole="Owner, Admin, Coordinator or Accounts"
        >
          {null}
        </PageBody>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader icon="users" title="Staff Performance" description="Bookings created, collections received and floor work, per person." />

      <ReportToolbar
        title="Staff Performance"
        value={filters}
        onChange={setFilters}
        dateColumn="created_at"
        csv={{
          filename: 'staff-performance',
          build: () => staffCsv(summary),
          ...(user?.name ? { generatedBy: user.name } : {}),
        }}
      />

      <PageBody
        noun="staff figures"
        loading={load.loading}
        error={load.error}
        onRetry={load.reload}
        hasRows={summary !== null}
        skeleton="kpi"
        empty={summary !== null && summary.rows.length === 0}
        emptyIsFiltered={filtered}
        onClearFilters={() => setFilters({})}
        emptyTitle={filtered ? 'No staff activity in this period' : 'No staff activity yet'}
        emptyMessage={
          filtered
            ? 'Nobody created a booking, received a payment or completed a floor session in the selected period.'
            : 'Figures appear here once staff create bookings, receive payments or complete floor work.'
        }
      >
        {summary && (
          <>
            <KpiStrip
              columns={viewport === 'phone' ? 1 : viewport === 'tablet' ? 2 : 4}
              items={[
                {
                  label: 'Booking Value',
                  value: formatMoney(summary.totals.bookingValue),
                  icon: 'dollar',
                  accent: 'primary',
                  note: `${summary.totals.bookingsCreated} bookings created, not cancelled`,
                },
                {
                  label: 'Collections Received',
                  value: formatMoney(summary.totals.collections),
                  icon: 'check',
                  accent: 'success',
                  note: 'Rental payments received; deposits excluded',
                },
                {
                  label: 'Floor Sessions',
                  value: String(summary.totals.sessionsCompleted),
                  icon: 'check',
                  accent: 'progress',
                  note: 'Packing, handover, return and more, completed',
                },
                {
                  label: 'Avg Response Time',
                  value: NOT_TRACKED,
                  icon: 'timer',
                  accent: 'neutral',
                  note: 'Nothing records when a task was acknowledged',
                },
              ]}
            />

            <section aria-label="Staff Breakdown" style={cardStyle}>
              <div style={{ fontSize: 'var(--t-body)', fontWeight: 600, padding: 'var(--sp-md)', borderBottom: '1px solid var(--border)' }}>
                Team Breakdown
              </div>
              <DataTableShell ariaLabel="Staff team breakdown" data-table-scroll style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)', minWidth: 640 }}>
                  <thead>
                    <tr style={{ color: 'var(--text2)' }}>
                      <th style={cell}>Staff</th>
                      <th style={cell}>Role</th>
                      <th style={{ ...cell, textAlign: 'right' }}>Bookings Created</th>
                      <th style={{ ...cell, textAlign: 'right' }}>Booking Value</th>
                      <th style={{ ...cell, textAlign: 'right' }}>Collections Received</th>
                      <th style={{ ...cell, textAlign: 'right' }}>Sessions Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.rows.map((s) => (
                      <tr key={s.userId} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ ...cell, fontWeight: 600 }}>{s.name}</td>
                        <td style={cell}>{s.role}</td>
                        <td style={{ ...cell, textAlign: 'right' }}>{s.bookingsCreated}</td>
                        <td style={{ ...cell, textAlign: 'right' }}>{formatMoney(s.bookingValue)}</td>
                        <td style={{ ...cell, textAlign: 'right' }}>{formatMoney(s.collections)}</td>
                        <td style={{ ...cell, textAlign: 'right' }}>{s.sessionsCompleted}</td>
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
