import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, cardStyle } from '../../components/ui/Page'
import { DataTableShell } from '../../components/ui/DataTable'
import { ReportToolbar } from '../../components/ui/ReportToolbar'
import { getLiveClientActivityReport, type LiveClientActivityReport } from '../../lib/queries/liveClientActivity'
import { useViewport } from '../../lib/device'

/**
 * Live Client Reports use the database only. No mock KPIs, sample business
 * names, static charts, invented revenue or made-up risk forecasts.
 *
 * Counts reflect the records visible under the current user's RLS policies.
 */
export default function LiveClientReports() {
  const viewport = useViewport()
  const [report, setReport] = useState<LiveClientActivityReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    void getLiveClientActivityReport()
      .then((result) => { if (active) setReport(result) })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Client activity is unavailable.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const figures = report
    ? [
      { label: 'Visible Clients', value: String(report.totalVisibleClients) },
      { label: 'Clients With Rentals', value: String(report.clientsWithRentals) },
      { label: 'Repeat Clients (2+)', value: String(report.repeatClients) },
      { label: 'Repeat Rate', value: report.repeatClientRate.toFixed(1) + '%' },
      { label: 'Rental Bookings', value: String(report.totalRentalBookings) },
    ]
    : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        title="Client Reports"
        description="Confirmed rental frequency and repeat clients from your permitted database records."
      />
      <ReportToolbar
        title="Client Reports"
        csv={report && report.rows.length > 0
          ? {
            filename: 'clients-rental-activity',
            build: () => [
              ['Client', 'Client Code', 'Status', 'Confirmed/fulfilled rentals', 'Last booking created (AD)'],
              ...report.rows.map((client): readonly (string | number)[] => [
                client.name, client.clientCode, client.status,
                client.bookingCount, client.lastBookingCreatedAd ?? '',
              ]),
            ],
          }
          : undefined}
      />

      {loading && <div role="status" style={cardStyle}>Loading real client and booking records…</div>}
      {error && (
        <div role="alert" style={cardStyle}>
          Client activity report unavailable. No demo records or invented totals were substituted.
          <span style={{ display: 'block', color: 'var(--text2)' }}>{error}</span>
        </div>
      )}
      {!loading && !error && report && (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: viewport === 'phone' ? '1fr' : viewport === 'tablet' ? 'repeat(2,minmax(0,1fr))' : 'repeat(5,minmax(0,1fr))',
            gap: 'var(--sp-sm)',
          }}>
            {figures.map((figure) => (
              <div key={figure.label} style={cardStyle}>
                <div style={{ color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>{figure.label}</div>
                <div className="figure" style={{ fontSize: 'var(--t-h2)', fontWeight: 700, marginTop: 8 }}>{figure.value}</div>
              </div>
            ))}
          </div>
          <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            Repeat rate = clients with at least two confirmed/fulfilled rentals divided by clients with at least one.
            Drafts, quotes and cancelled orders are excluded. Counts are limited to records your account can access.
            Revenue, outstanding balances, retention forecasts and lifetime value are not shown until
            their live financial aggregations are verified.
          </p>
          <div style={cardStyle}>
            <h3 style={{ margin: '0 0 var(--sp-sm)' }}>Client rental activity</h3>
            {report.rows.length === 0 ? (
              <p role="status">No clients found in the accessible directory.</p>
            ) : (
              <DataTableShell ariaLabel="Client rental activity">
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 650 }}>
                  <thead>
                    <tr>
                      {['Client', 'Client ID', 'Status', 'Rentals', 'Last booking created (AD)'].map((label) => (
                        <th key={label} style={{ textAlign: 'left', padding: 12, borderBottom: '1px solid var(--border)' }}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((client) => (
                      <tr key={client.id}>
                        <td style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
                          {client.clientCode
                            ? <Link to={`/clients/${encodeURIComponent(client.clientCode)}`}>{client.name}</Link>
                            : client.name}
                        </td>
                        <td className="identifier" style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>{client.clientCode || '—'}</td>
                        <td style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>{client.status}</td>
                        <td className="figure" style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>{client.bookingCount}</td>
                        <td className="figure" style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>{client.lastBookingCreatedAd ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataTableShell>
            )}
          </div>
        </>
      )}
    </div>
  )
}
