import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, cardStyle } from '../../components/ui/Page'
import { PageShell } from '../../components/ui/PageShell'
import { PageBody } from '../../components/ui/PageBody'
import { DataTableShell } from '../../components/ui/DataTable'
import { useAuth } from '../../lib/auth'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { formatMoney, rupees } from '../../lib/money'
import { getLiveTransportPlans, liveTransportReadRefusal, type LiveTransportPlan } from '../../lib/queries/liveTransportPlans'

/** Read-only live transport, not a fictitious dispatch board. */
export default function LiveTransportPlans() {
  const { user } = useAuth()
  const money = useCanViewMoney()
  const role = user?.role ?? null
  const refusal = liveTransportReadRefusal(role)
  const [data, setData] = useState<LiveTransportPlan[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setData(null)
    setError(null)
    if (refusal) return () => { active = false }
    void getLiveTransportPlans(role).then((rows) => {
      if (active) setData(rows)
    }).catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : 'Transport plans unavailable.')
    })
    return () => { active = false }
  }, [role, refusal])

  return (
    <PageShell
      title="Delivery & Logistics"
      header={<PageHeader title="Delivery & Logistics" description="Live transport plans from bookings. Dispatch tracking is not connected." />}
    >
      <PageBody error={refusal}>
        <div style={cardStyle}>
          <strong>Transport plans only — dispatch status not available</strong>
          <p style={{ marginTop: 8 }}>
            These are saved booking transport details, not verified driver trips. No delivery can be
            marked Ready, In Transit, Delivered or Failed here. Driver assignment, proof of
            delivery, gate pass generation and payment collection are not yet server-backed.
          </p>
        </div>
        {!refusal && error && <div role="alert" style={cardStyle}>Unable to load live transport plans: {error}</div>}
        {!refusal && !error && !data && <div role="status" style={cardStyle}>Loading transport plans…</div>}
        {!refusal && !error && data && data.length === 0 && <div role="status" style={cardStyle}>No saved transport plans in the accessible bookings.</div>}
        {!refusal && !error && data && data.length > 0 && (
          <div style={cardStyle}>
            <h3 style={{ margin: '0 0 12px' }}>Saved transport plans ({data.length})</h3>
            <DataTableShell ariaLabel="Saved transport plans">
              <table style={{ borderCollapse: 'collapse', minWidth: 850, width: '100%' }}>
                <thead>
                  <tr>
                    {['Booking', 'Client', 'Scheduled pickup (AD)', 'Location', 'Method', 'Vehicle', 'Driver contact', ...(money ? ['Quoted delivery fee'] : [])].map((h) => (
                      <th key={h} scope="col" style={{ textAlign: 'left', padding: 12, borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((item) => (
                    <tr key={item.id}>
                      <td style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
                        <Link to={`/rentals/${encodeURIComponent(item.bookingNo)}`}>{item.bookingNo}</Link>
                      </td>
                      <td style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>{item.clientName}</td>
                      <td style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>{item.pickupAtAd}</td>
                      <td style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>{item.handoverLocation ?? '—'}</td>
                      <td style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>{item.deliveryType}</td>
                      <td style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>{[item.vehicle, item.numberPlate].filter(Boolean).join(' · ') || '—'}</td>
                      <td style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>{item.driverContact ?? '—'}</td>
                      {money && <td style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
                        {item.quotedDeliveryFeeNpr === null ? '—' : formatMoney(rupees(item.quotedDeliveryFeeNpr))}
                      </td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableShell>
          </div>
        )}
      </PageBody>
    </PageShell>
  )
}
