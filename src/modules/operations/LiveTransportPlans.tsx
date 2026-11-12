import { useEffect, useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, cardStyle, Button } from '../../components/ui/Page'
import { PageShell } from '../../components/ui/PageShell'
import { PageBody } from '../../components/ui/PageBody'
import { DataTableShell } from '../../components/ui/DataTable'
import { SearchInput } from '../../components/ui/SearchInput'
import { EmptyState, LoadingSkeleton } from '../../components/ui/StateViews'
import Icon from '../../components/ui/Icon'
import { useViewport } from '../../lib/device'
import { useAuth } from '../../lib/auth'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { formatMoney, rupees } from '../../lib/money'
import { useDomainEvent } from '../../events/useDomainEvent'
import { EVENT_TYPES } from '../../events/eventBus'
import { useToast } from '../../components/ui/Toast'
import { DriverHandoverModal } from './DriverHandoverModal'
import { SendToRiderModal } from './SendToRiderModal'
import {
  getLiveTransportPlans,
  liveTransportReadRefusal,
  type LiveTransportPlan,
} from '../../lib/queries/liveTransportPlans'

export default function LiveTransportPlans() {
  const { user } = useAuth()
  const viewport = useViewport()
  const onPhone = viewport === 'phone'
  const money = useCanViewMoney()
  const role = user?.role ?? null
  const refusal = liveTransportReadRefusal(role)
  const [data, setData] = useState<LiveTransportPlan[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [methodFilter, setMethodFilter] = useState<'All' | string>('All')
  const [handoverTarget, setHandoverTarget] = useState<LiveTransportPlan | null>(null)
  const [riderModalTarget, setRiderModalTarget] = useState<LiveTransportPlan | null>(null)
  const { showSuccessToast } = useToast()

  const loadData = useCallback(() => {
    if (refusal) return
    setLoading(true)
    setError(null)
    void getLiveTransportPlans(role)
      .then((rows) => {
        setData(rows)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Transport plans unavailable.')
        setLoading(false)
      })
  }, [role, refusal])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Realtime updates when bookings change or handovers complete
  useDomainEvent(EVENT_TYPES.RENTAL_HANDED_OVER, loadData)
  useDomainEvent(EVENT_TYPES.RENTAL_CONFIRMED, loadData)
  useDomainEvent(EVENT_TYPES.RENTAL_PICKED_UP, loadData)

  const filteredData = useMemo(() => {
    if (!data) return []
    const term = search.trim().toLowerCase()
    return data.filter((item) => {
      if (methodFilter !== 'All' && item.deliveryType !== methodFilter) return false
      if (!term) return true
      return (
        item.bookingNo.toLowerCase().includes(term) ||
        item.clientName.toLowerCase().includes(term) ||
        (item.handoverLocation && item.handoverLocation.toLowerCase().includes(term)) ||
        (item.vehicle && item.vehicle.toLowerCase().includes(term)) ||
        (item.numberPlate && item.numberPlate.toLowerCase().includes(term)) ||
        (item.driverContact && item.driverContact.toLowerCase().includes(term))
      )
    })
  }, [data, search, methodFilter])

  const deliveryMethods = useMemo(() => {
    if (!data) return []
    return Array.from(new Set(data.map((d) => d.deliveryType))).filter(Boolean)
  }, [data])

  return (
    <PageShell
      title="Delivery & Logistics"
      header={
        <PageHeader
          title="Delivery & Logistics"
          description="Live transport plans and driver dispatch. Real-time database synced."
          actions={
            <Button
              icon="refresh"
              variant="outline"
              onClick={loadData}
              disabled={loading}
              aria-label="Refresh transport plans"
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
          }
        />
      }
    >
      <PageBody error={refusal}>
        <div style={{ ...cardStyle, padding: '14px 18px', marginBottom: 'var(--sp-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <strong style={{ fontSize: 'var(--t-h3, 16px)' }}>Live Dispatch & Handover Queue</strong>
              <p style={{ margin: '4px 0 0', color: 'var(--text2)', fontSize: 'var(--t-meta, 13px)' }}>
                Saved transport plans from confirmed bookings. Tap <strong>Deliver & Sign</strong> to record proof of delivery with digital client signature and GPS location.
              </p>
            </div>
          </div>
        </div>

        {/* Toolbar: Search & Delivery Method Filters */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 'var(--sp-md)',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: '1 1 260px', maxWidth: 360 }}>
            <SearchInput
              value={search}
              onChange={setSearch}
              onClear={() => setSearch('')}
              placeholder="Search booking, client, vehicle, location…"
              aria-label="Search delivery transport plans"
            />
          </div>

          {deliveryMethods.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setMethodFilter('All')}
                style={{
                  minHeight: 44,
                  padding: '0 14px',
                  borderRadius: 'var(--r-btn, 8px)',
                  border: `1px solid ${methodFilter === 'All' ? 'var(--primary)' : 'var(--border)'}`,
                  background: methodFilter === 'All' ? 'var(--nav-active-bg)' : 'var(--card)',
                  color: methodFilter === 'All' ? 'var(--primary-text)' : 'var(--text)',
                  fontSize: 'var(--t-meta, 13px)',
                  fontWeight: methodFilter === 'All' ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all var(--dur-fast) var(--ease)',
                }}
              >
                All Methods ({data?.length ?? 0})
              </button>
              {deliveryMethods.map((m) => {
                const count = data?.filter((d) => d.deliveryType === m).length ?? 0
                const active = methodFilter === m
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethodFilter(m)}
                    style={{
                      minHeight: 44,
                      padding: '0 14px',
                      borderRadius: 'var(--r-btn, 8px)',
                      border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                      background: active ? 'var(--nav-active-bg)' : 'var(--card)',
                      color: active ? 'var(--primary-text)' : 'var(--text)',
                      fontSize: 'var(--t-meta, 13px)',
                      fontWeight: active ? 700 : 500,
                      cursor: 'pointer',
                      transition: 'all var(--dur-fast) var(--ease)',
                    }}
                  >
                    {m} ({count})
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {!refusal && error && (
          <div role="alert" style={{ ...cardStyle, color: 'var(--danger-text)', padding: 16 }}>
            Unable to load live transport plans: {error}
          </div>
        )}

        {!refusal && !error && loading && !data && (
          <div style={{ ...cardStyle, padding: 24 }}>
            <LoadingSkeleton rows={4} type="table" label="Loading live transport plans from database…" />
          </div>
        )}

        {!refusal && !error && data && data.length === 0 && (
          <EmptyState
            kind="nothing-yet"
            title="No transport plans found"
            description="Confirmed bookings requiring Babin Delivery or Courier transport will appear here."
          />
        )}

        {!refusal && !error && data && data.length > 0 && filteredData.length === 0 && (
          <EmptyState
            kind="no-results"
            title="No transport plans match your filter"
            description={`No plans match "${search}". Try clearing your search query.`}
            actionLabel="Clear filter"
            onAction={() => {
              setSearch('')
              setMethodFilter('All')
            }}
          />
        )}

        {!refusal && !error && filteredData.length > 0 && (
          onPhone ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
              <div style={{ padding: '4px 2px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0, fontSize: 'var(--t-h3, 15px)', fontWeight: 700 }}>
                  Active Transport Plans ({filteredData.length})
                </h3>
              </div>
              {filteredData.map((item) => (
                <article
                  key={item.id}
                  style={{
                    ...cardStyle,
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    position: 'relative',
                  }}
                >
                  {/* Top row: Booking Number & Delivery Type Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <Link
                      to={`/rentals/${encodeURIComponent(item.bookingNo)}`}
                      style={{
                        fontSize: 'var(--t-h3, 16px)',
                        fontWeight: 700,
                        color: 'var(--primary-text)',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Icon name="truck" size={16} />
                      <span>{item.bookingNo}</span>
                    </Link>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: 'var(--r-badge, 4px)',
                        background: item.deliveryType === 'Babin Delivery' ? 'var(--nav-active-bg)' : 'var(--surface-2)',
                        color: item.deliveryType === 'Babin Delivery' ? 'var(--primary-text)' : 'var(--text2)',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      {item.deliveryType}
                    </span>
                  </div>

                  {/* Client & Destination */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 'var(--t-ui, 15px)', fontWeight: 600, color: 'var(--text)' }}>
                      {item.clientName}
                    </div>
                    {item.handoverLocation && (
                      <div style={{ fontSize: 'var(--t-meta, 13px)', color: 'var(--text2)', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                        <Icon name="truck" size={14} style={{ flexShrink: 0, marginTop: 2, color: 'var(--muted)' }} />
                        <span style={{ wordBreak: 'break-word' }}>{item.handoverLocation}</span>
                      </div>
                    )}
                  </div>

                  {/* Scheduled & Vehicle/Driver Info Box */}
                  <div
                    style={{
                      padding: '10px 12px',
                      background: 'var(--card2)',
                      borderRadius: 'var(--r-sm, 6px)',
                      border: '1px solid var(--border)',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                      gap: 8,
                      fontSize: 'var(--t-meta, 13px)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>
                        Scheduled Pickup
                      </div>
                      <div style={{ fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>
                        {item.pickupAtAd}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>
                        Vehicle
                      </div>
                      <div style={{ fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>
                        {[item.vehicle, item.numberPlate].filter(Boolean).join(' · ') || 'Unassigned'}
                      </div>
                    </div>
                    {item.driverContact && (
                      <div style={{ gridColumn: 'span 2', borderTop: '1px dashed var(--border)', paddingTop: 6, marginTop: 2 }}>
                        <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>
                          Driver Contact
                        </div>
                        <a
                          href={`tel:${item.driverContact}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            color: 'var(--info)',
                            fontWeight: 600,
                            textDecoration: 'none',
                            marginTop: 2,
                            minHeight: 28,
                          }}
                        >
                          <Icon name="phone" size={12} /> {item.driverContact}
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Delivery Fee if permitted */}
                  {money && item.quotedDeliveryFeeNpr !== null && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--t-meta, 13px)' }}>
                      <span style={{ color: 'var(--text2)' }}>Delivery Fee:</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text)' }}>
                        {formatMoney(rupees(item.quotedDeliveryFeeNpr))}
                      </span>
                    </div>
                  )}

                  {/* Action CTAs */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button
                      variant="primary"
                      icon="truck"
                      onClick={() => setHandoverTarget(item)}
                      aria-label={`Deliver and sign for booking ${item.bookingNo}`}
                      style={{
                        minHeight: 48,
                        flex: 1,
                        fontSize: 'var(--t-ui, 14px)',
                        fontWeight: 600,
                        justifyContent: 'center',
                      }}
                    >
                      Deliver & Sign
                    </Button>
                    <Button
                      variant="outline"
                      icon="external_link"
                      onClick={() => setRiderModalTarget(item)}
                      aria-label={`Send booking ${item.bookingNo} to hired rider`}
                      style={{
                        minHeight: 48,
                        flex: 1,
                        fontSize: 'var(--t-ui, 14px)',
                        fontWeight: 600,
                        justifyContent: 'center',
                      }}
                    >
                      Send to Rider
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div style={cardStyle}>
              <div style={{ padding: '14px 18px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0, fontSize: 'var(--t-h3, 15px)' }}>
                  Active Transport Plans ({filteredData.length})
                </h3>
              </div>
              <DataTableShell ariaLabel="Saved transport plans">
                <table style={{ borderCollapse: 'collapse', minWidth: 920, width: '100%' }}>
                  <thead>
                    <tr>
                      {[
                        'Booking',
                        'Client',
                        'Scheduled pickup (AD)',
                        'Location',
                        'Method',
                        'Vehicle',
                        'Driver contact',
                        ...(money ? ['Delivery fee'] : []),
                        'Action',
                      ].map((h) => (
                        <th
                          key={h}
                          scope="col"
                          style={{
                            textAlign: 'left',
                            padding: '12px 14px',
                            borderBottom: '1px solid var(--border)',
                            fontSize: 'var(--t-th, 12px)',
                            color: 'var(--text2)',
                            fontWeight: 600,
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.map((item) => (
                      <tr key={item.id} style={{ transition: 'background-color var(--dur-fast) var(--ease)' }}>
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
                          <Link
                            to={`/rentals/${encodeURIComponent(item.bookingNo)}`}
                            style={{ color: 'var(--primary-text)', textDecoration: 'none' }}
                          >
                            {item.bookingNo}
                          </Link>
                        </td>
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontWeight: 500 }}>
                          {item.clientName}
                        </td>
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', color: 'var(--text2)', fontSize: 'var(--t-meta, 13px)' }}>
                          {item.pickupAtAd}
                        </td>
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.handoverLocation ?? '—'}
                        </td>
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                          <span
                            style={{
                              padding: '3px 8px',
                              borderRadius: 'var(--r-badge, 4px)',
                              background: item.deliveryType === 'Babin Delivery' ? 'var(--nav-active-bg)' : 'var(--surface-2)',
                              color: item.deliveryType === 'Babin Delivery' ? 'var(--primary-text)' : 'var(--text2)',
                              fontSize: '12px',
                              fontWeight: 600,
                            }}
                          >
                            {item.deliveryType}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                          {[item.vehicle, item.numberPlate].filter(Boolean).join(' · ') || '—'}
                        </td>
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', color: 'var(--text2)', fontSize: 'var(--t-meta, 13px)' }}>
                          {item.driverContact ?? '—'}
                        </td>
                        {money && (
                          <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                            {item.quotedDeliveryFeeNpr === null ? '—' : formatMoney(rupees(item.quotedDeliveryFeeNpr))}
                          </td>
                        )}
                        <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <Button
                              variant="primary"
                              icon="truck"
                              onClick={() => setHandoverTarget(item)}
                              aria-label={`Deliver and sign for booking ${item.bookingNo}`}
                              style={{ minHeight: 44, padding: '0 12px' }}
                            >
                              Deliver & Sign
                            </Button>
                            <Button
                              variant="outline"
                              icon="external_link"
                              onClick={() => setRiderModalTarget(item)}
                              aria-label={`Send booking ${item.bookingNo} to hired rider`}
                              style={{ minHeight: 44, padding: '0 10px' }}
                            >
                              Send to Rider
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataTableShell>
            </div>
          )
        )}

        {/* Handover & Proof of Delivery Modal */}
        {handoverTarget && (
          <DriverHandoverModal
            isOpen={true}
            onClose={() => setHandoverTarget(null)}
            bookingNo={handoverTarget.bookingNo}
            bookingId={handoverTarget.bookingId}
            clientName={handoverTarget.clientName}
            deliveryAddress={handoverTarget.handoverLocation}
            itemCount={1}
            onSuccess={() => {
              showSuccessToast(`Delivery handover confirmed for ${handoverTarget.bookingNo}`)
              setHandoverTarget(null)
              loadData()
            }}
          />
        )}

        {/* Send to Rider Modal (T4-08, W49) */}
        {riderModalTarget && (
          <SendToRiderModal
            isOpen={true}
            onClose={() => setRiderModalTarget(null)}
            jobId={riderModalTarget.id}
            bookingNo={riderModalTarget.bookingNo}
            clientName={riderModalTarget.clientName}
            destination={riderModalTarget.handoverLocation ?? undefined}
          />
        )}
      </PageBody>
    </PageShell>
  )
}
