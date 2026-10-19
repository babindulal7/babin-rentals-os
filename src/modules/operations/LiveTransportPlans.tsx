import { useEffect, useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, cardStyle, Button } from '../../components/ui/Page'
import { PageShell } from '../../components/ui/PageShell'
import { PageBody } from '../../components/ui/PageBody'
import { DataTableShell } from '../../components/ui/DataTable'
import { SearchInput } from '../../components/ui/SearchInput'
import { EmptyState } from '../../components/ui/StateViews'
import { Modal } from '../../components/ui/Modal'
import Icon, { type IconName } from '../../components/ui/Icon'
import { useAuth } from '../../lib/auth'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { formatMoney } from '../../lib/money'
import { useDomainEvent } from '../../events/useDomainEvent'
import { EVENT_TYPES } from '../../events/eventBus'
import { useToast } from '../../components/ui/Toast'
import { formatAdDateTime } from '../../lib/bs'
import { newClientUuid } from '../../lib/supabase'
import {
  fetchDeliveryTransportList,
  deliveryTransportReadRefusal,
  type DeliveryTransportItem,
  type DeliveryTransportStatus,
} from '../../lib/queries/deliveryTransport'
import { mutateBookingTransport } from '../../actions/operations'
import { fetchStaffDirectory, type StaffDirectoryRow } from '../../lib/queries/staff'

const STATUS_BADGE_STYLE: Record<
  DeliveryTransportStatus,
  { bg: string; color: string; border: string; icon: IconName }
> = {
  Scheduled: {
    bg: 'var(--st-neutral-bg, #f1f5f9)',
    color: 'var(--st-neutral-fg, #475569)',
    border: '1px solid var(--border, #cbd5e1)',
    icon: 'timer',
  },
  Ready: {
    bg: 'var(--st-progress-bg, #fef3c7)',
    color: 'var(--st-progress-fg, #92400e)',
    border: '1px solid var(--st-warning-border, #fcd34d)',
    icon: 'box',
  },
  'In Transit': {
    bg: 'var(--st-out-bg, #e0f2fe)',
    color: 'var(--st-out-fg, #0369a1)',
    border: '1px solid var(--primary-border, #7dd3fc)',
    icon: 'truck',
  },
  Delivered: {
    bg: 'var(--st-in-bg, #dcfce7)',
    color: 'var(--st-in-fg, #15803d)',
    border: '1px solid var(--success-border, #86efac)',
    icon: 'check',
  },
  Failed: {
    bg: 'var(--st-danger-bg, #fee2e2)',
    color: 'var(--st-danger-fg, #b91c1c)',
    border: '1px solid var(--danger-border, #fca5a5)',
    icon: 'alert_circle',
  },
}

export default function LiveTransportPlans() {
  const { user } = useAuth()
  const money = useCanViewMoney()
  const role = user?.role ?? null
  const refusal = deliveryTransportReadRefusal(role)
  const canMutate = role === 'Owner' || role === 'Admin'

  const [data, setData] = useState<DeliveryTransportItem[] | null>(null)
  const [staff, setStaff] = useState<StaffDirectoryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'All' | DeliveryTransportStatus>('All')
  const [methodFilter, setMethodFilter] = useState<'All' | string>('All')
  const { showSuccessToast } = useToast()

  // Mutation modal state
  const [assignTarget, setAssignTarget] = useState<DeliveryTransportItem | null>(null)
  const [selectedDriverId, setSelectedDriverId] = useState<string>('')
  const [deliverTarget, setDeliverTarget] = useState<DeliveryTransportItem | null>(null)
  const [recipientName, setRecipientName] = useState('')
  const [deliveryNote, setDeliveryNote] = useState('')
  const [failTarget, setFailTarget] = useState<DeliveryTransportItem | null>(null)
  const [failReason, setFailReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  const loadData = useCallback(() => {
    if (refusal) return
    setLoading(true)
    setError(null)
    void fetchDeliveryTransportList(role)
      .then((rows) => {
        setData(rows)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Transport records unavailable.')
        setLoading(false)
      })
  }, [role, refusal])

  // Load available drivers from staff directory
  useEffect(() => {
    if (canMutate) {
      void fetchStaffDirectory()
        .then((res) => {
          if (res.kind === 'ok') {
            setStaff(res.rows.filter((s: StaffDirectoryRow) => s.isActive))
          }
        })
        .catch(() => {
          // Non-blocking for staff list
        })
    }
  }, [canMutate])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Realtime updates when transport or bookings change
  useDomainEvent(EVENT_TYPES.TRANSPORT_UPDATED, loadData)
  useDomainEvent(EVENT_TYPES.RENTAL_HANDED_OVER, loadData)
  useDomainEvent(EVENT_TYPES.RENTAL_CONFIRMED, loadData)
  useDomainEvent(EVENT_TYPES.RENTAL_PICKED_UP, loadData)

  const filteredData = useMemo(() => {
    if (!data) return []
    const term = search.trim().toLowerCase()
    return data.filter((item) => {
      if (statusFilter !== 'All' && item.deliveryStatus !== statusFilter) return false
      if (methodFilter !== 'All' && item.deliveryType !== methodFilter) return false
      if (!term) return true
      return (
        item.bookingNo.toLowerCase().includes(term) ||
        item.clientName.toLowerCase().includes(term) ||
        (item.destination && item.destination.toLowerCase().includes(term)) ||
        (item.vehicle && item.vehicle.toLowerCase().includes(term)) ||
        (item.numberPlate && item.numberPlate.toLowerCase().includes(term)) ||
        (item.driverName && item.driverName.toLowerCase().includes(term))
      )
    })
  }, [data, search, statusFilter, methodFilter])

  const deliveryMethods = useMemo(() => {
    if (!data) return []
    return Array.from(new Set(data.map((d) => d.deliveryType))).filter(Boolean)
  }, [data])

  // KPI counts
  const inTransitCount = data?.filter((d) => d.deliveryStatus === 'In Transit').length ?? 0
  const readyCount = data?.filter((d) => d.deliveryStatus === 'Ready').length ?? 0
  const scheduledCount = data?.filter((d) => d.deliveryStatus === 'Scheduled').length ?? 0
  const deliveredCount = data?.filter((d) => d.deliveryStatus === 'Delivered').length ?? 0

  // Action handlers
  const handleOpenAssign = (item: DeliveryTransportItem) => {
    setModalError(null)
    setAssignTarget(item)
    setSelectedDriverId(item.driverId ?? (staff[0]?.id || ''))
  }

  const handleSaveAssign = async () => {
    if (!assignTarget || !user || !selectedDriverId) return
    setIsSubmitting(true)
    setModalError(null)
    try {
      await mutateBookingTransport(
        {
          transportId: assignTarget.id,
          revision: assignTarget.deliveryRevision,
          clientUuid: newClientUuid(),
          action: 'assign',
          driverId: selectedDriverId,
        },
        { userId: user.id, role: user.role },
      )
      showSuccessToast('Driver Assigned', `Trip for ${assignTarget.bookingNo} is now ready for dispatch.`)
      setAssignTarget(null)
      loadData()
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Unable to assign driver.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDispatchTrip = async (item: DeliveryTransportItem) => {
    if (!user) return
    if (item.bookingStage !== 'On Rent') {
      setError(`Cannot dispatch ${item.bookingNo}: Booking stage must reach "On Rent" (equipment handed over) first.`)
      return
    }
    setLoading(true)
    setError(null)
    try {
      await mutateBookingTransport(
        {
          transportId: item.id,
          revision: item.deliveryRevision,
          clientUuid: newClientUuid(),
          action: 'dispatch',
        },
        { userId: user.id, role: user.role },
      )
      showSuccessToast('Trip Dispatched', `${item.bookingNo} is now In Transit.`)
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to dispatch transport trip.')
      setLoading(false)
    }
  }

  const handleOpenDeliver = (item: DeliveryTransportItem) => {
    setModalError(null)
    setDeliverTarget(item)
    setRecipientName(item.recipientName || item.clientName)
    setDeliveryNote('')
  }

  const handleConfirmDeliver = async () => {
    if (!deliverTarget || !user) return
    if (!recipientName.trim() || recipientName.trim().length < 2) {
      setModalError('Enter the name of the recipient (at least 2 characters).')
      return
    }
    setIsSubmitting(true)
    setModalError(null)
    try {
      await mutateBookingTransport(
        {
          transportId: deliverTarget.id,
          revision: deliverTarget.deliveryRevision,
          clientUuid: newClientUuid(),
          action: 'deliver',
          recipientName: recipientName.trim(),
          note: deliveryNote.trim() || null,
        },
        { userId: user.id, role: user.role },
      )
      showSuccessToast('Delivery Confirmed', `${deliverTarget.bookingNo} marked as Delivered.`)
      setDeliverTarget(null)
      loadData()
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Unable to confirm delivery.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleOpenFail = (item: DeliveryTransportItem) => {
    setModalError(null)
    setFailTarget(item)
    setFailReason('')
  }

  const handleConfirmFail = async () => {
    if (!failTarget || !user) return
    if (!failReason.trim() || failReason.trim().length < 10) {
      setModalError('Please explain the failed delivery in at least 10 characters.')
      return
    }
    setIsSubmitting(true)
    setModalError(null)
    try {
      await mutateBookingTransport(
        {
          transportId: failTarget.id,
          revision: failTarget.deliveryRevision,
          clientUuid: newClientUuid(),
          action: 'fail',
          note: failReason.trim(),
        },
        { userId: user.id, role: user.role },
      )
      showSuccessToast('Delivery Marked Failed', `Status recorded for ${failTarget.bookingNo}.`)
      setFailTarget(null)
      loadData()
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Unable to record failed delivery.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <PageShell
      title="Delivery & Logistics"
      header={
        <PageHeader
          title="Delivery & Logistics"
          description="Live Kathmandu Valley dispatch, vehicle tracking, and proof of delivery."
          actions={
            <Button
              icon="refresh"
              variant="outline"
              onClick={loadData}
              disabled={loading}
              aria-label="Refresh transport records"
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
          }
        />
      }
    >
      <PageBody error={refusal}>
        {/* KPI Strip */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12,
            marginBottom: 'var(--sp-md)',
          }}
        >
          <div style={{ ...cardStyle, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--t-meta, 13px)', color: 'var(--text2)', fontWeight: 600 }}>In Transit</span>
              <Icon name="truck" size={18} style={{ color: 'var(--primary)' }} />
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, fontFamily: 'var(--font-mono)' }}>
              {inTransitCount}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>En route on road</div>
          </div>

          <div style={{ ...cardStyle, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--t-meta, 13px)', color: 'var(--text2)', fontWeight: 600 }}>Ready / Staged</span>
              <Icon name="box" size={18} style={{ color: 'var(--warn-text)' }} />
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, fontFamily: 'var(--font-mono)' }}>
              {readyCount}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>Driver assigned, ready to roll</div>
          </div>

          <div style={{ ...cardStyle, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--t-meta, 13px)', color: 'var(--text2)', fontWeight: 600 }}>Scheduled</span>
              <Icon name="timer" size={18} style={{ color: 'var(--text2)' }} />
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, fontFamily: 'var(--font-mono)' }}>
              {scheduledCount}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>Awaiting driver assignment</div>
          </div>

          <div style={{ ...cardStyle, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--t-meta, 13px)', color: 'var(--text2)', fontWeight: 600 }}>Delivered</span>
              <Icon name="check" size={18} style={{ color: 'var(--success)' }} />
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, fontFamily: 'var(--font-mono)' }}>
              {deliveredCount}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>Handovers completed</div>
          </div>
        </div>

        {/* Status Filters & Toolbar */}
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
              placeholder="Search booking, client, vehicle, driver…"
              aria-label="Search delivery records"
            />
          </div>

          {/* Status Tabs */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['All', 'In Transit', 'Ready', 'Scheduled', 'Delivered', 'Failed'] as const).map((st) => {
              const active = statusFilter === st
              const count = st === 'All' ? data?.length ?? 0 : data?.filter((d) => d.deliveryStatus === st).length ?? 0
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  style={{
                    minHeight: 44,
                    padding: '0 12px',
                    borderRadius: 'var(--r-btn, 8px)',
                    border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                    background: active ? 'var(--nav-active-bg)' : 'var(--card)',
                    color: active ? 'var(--primary-text)' : 'var(--text)',
                    fontSize: 'var(--t-meta, 13px)',
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                    transition: 'all var(--dur-fast) ease',
                  }}
                >
                  {st} ({count})
                </button>
              )
            })}
          </div>

          {/* Delivery Method Filter */}
          {deliveryMethods.length > 1 && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={() => setMethodFilter('All')}
                style={{
                  minHeight: 44,
                  padding: '0 12px',
                  borderRadius: 'var(--r-btn, 8px)',
                  border: `1px solid ${methodFilter === 'All' ? 'var(--primary)' : 'var(--border)'}`,
                  background: methodFilter === 'All' ? 'var(--nav-active-bg)' : 'var(--card)',
                  color: methodFilter === 'All' ? 'var(--primary-text)' : 'var(--text)',
                  fontSize: 'var(--t-meta, 13px)',
                  fontWeight: methodFilter === 'All' ? 700 : 500,
                  cursor: 'pointer',
                }}
              >
                All Methods
              </button>
              {deliveryMethods.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethodFilter(m)}
                  style={{
                    minHeight: 44,
                    padding: '0 12px',
                    borderRadius: 'var(--r-btn, 8px)',
                    border: `1px solid ${methodFilter === m ? 'var(--primary)' : 'var(--border)'}`,
                    background: methodFilter === m ? 'var(--nav-active-bg)' : 'var(--card)',
                    color: methodFilter === m ? 'var(--primary-text)' : 'var(--text)',
                    fontSize: 'var(--t-meta, 13px)',
                    fontWeight: methodFilter === m ? 700 : 500,
                    cursor: 'pointer',
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>

        {!refusal && error && (
          <div role="alert" style={{ ...cardStyle, color: 'var(--danger-text)', padding: 16, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {!refusal && !error && loading && !data && (
          <div role="status" style={{ ...cardStyle, padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
            Loading live transport dispatches from database…
          </div>
        )}

        {!refusal && !error && data && data.length === 0 && (
          <div role="status" style={{ ...cardStyle, padding: 32, textAlign: 'center' }}>
            <strong style={{ display: 'block', fontSize: 'var(--t-h3, 16px)', marginBottom: 6 }}>
              No transport records found
            </strong>
            <p style={{ color: 'var(--text2)', margin: 0 }}>
              Bookings requiring Babin Delivery or Courier transport will appear here once booked.
            </p>
          </div>
        )}

        {!refusal && !error && data && data.length > 0 && filteredData.length === 0 && (
          <EmptyState
            kind="no-results"
            title="No dispatches match your filter"
            description={`No dispatches match "${search}". Try clearing your search query.`}
            actionLabel="Clear filter"
            onAction={() => {
              setSearch('')
              setStatusFilter('All')
              setMethodFilter('All')
            }}
          />
        )}

        {!refusal && !error && filteredData.length > 0 && (
          <div style={cardStyle}>
            <div style={{ padding: '14px 18px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--t-h3, 15px)' }}>
                Transport Dispatches ({filteredData.length})
              </h3>
            </div>
            <DataTableShell ariaLabel="Transport dispatches">
              <table style={{ borderCollapse: 'collapse', minWidth: 980, width: '100%' }}>
                <thead>
                  <tr>
                    {[
                      'Booking',
                      'Client',
                      'Destination',
                      'Scheduled (AD)',
                      'Vehicle / Plate',
                      'Driver',
                      'Status',
                      ...(money ? ['Fee'] : []),
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
                  {filteredData.map((item) => {
                    const badge = STATUS_BADGE_STYLE[item.deliveryStatus] || STATUS_BADGE_STYLE.Scheduled
                    const isRent = item.bookingStage === 'On Rent'

                    return (
                      <tr key={item.id} style={{ transition: 'background-color var(--dur-fast) ease' }}>
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
                          <Link
                            to={`/rentals/${encodeURIComponent(item.bookingNo)}`}
                            style={{ color: 'var(--primary-text)', textDecoration: 'none' }}
                          >
                            {item.bookingNo}
                          </Link>
                          <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 400 }}>
                            Stage: {item.bookingStage}
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ fontWeight: 600 }}>{item.clientName}</div>
                          {item.clientPhone && (
                            <div style={{ fontSize: 12, color: 'var(--text2)' }}>{item.clientPhone}</div>
                          )}
                        </td>
                        <td
                          style={{
                            padding: '12px 14px',
                            borderBottom: '1px solid var(--border)',
                            maxWidth: 200,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.destination ?? '—'}
                        </td>
                        <td
                          style={{
                            padding: '12px 14px',
                            borderBottom: '1px solid var(--border)',
                            color: 'var(--text2)',
                            fontSize: 'var(--t-meta, 13px)',
                          }}
                        >
                          {formatAdDateTime(item.scheduledAt)}
                        </td>
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                          {[item.vehicle, item.numberPlate].filter(Boolean).join(' · ') || '—'}
                        </td>
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                          {item.driverName ? (
                            <span style={{ fontWeight: 600 }}>{item.driverName}</span>
                          ) : (
                            <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Unassigned</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              padding: '3px 8px',
                              borderRadius: 'var(--r-badge, 4px)',
                              background: badge.bg,
                              color: badge.color,
                              border: badge.border,
                              fontSize: '12px',
                              fontWeight: 600,
                            }}
                          >
                            <Icon name={badge.icon} size={13} />
                            {item.deliveryStatus}
                          </span>
                        </td>
                        {money && (
                          <td
                            style={{
                              padding: '12px 14px',
                              borderBottom: '1px solid var(--border)',
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 600,
                            }}
                          >
                            {item.deliveryChargePaisa !== null ? formatMoney(item.deliveryChargePaisa) : '—'}
                          </td>
                        )}
                        <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            {canMutate && item.deliveryStatus === 'Scheduled' && (
                              <Button
                                variant="outline"
                                icon="users"
                                onClick={() => handleOpenAssign(item)}
                                aria-label={`Assign driver for ${item.bookingNo}`}
                                style={{ minHeight: 44, padding: '0 12px' }}
                              >
                                Assign Driver
                              </Button>
                            )}

                            {canMutate && item.deliveryStatus === 'Ready' && (
                              <Button
                                variant="primary"
                                icon="truck"
                                onClick={() => handleDispatchTrip(item)}
                                disabled={!isRent}
                                title={!isRent ? 'Booking must be On Rent stage before dispatch' : 'Dispatch trip'}
                                aria-label={`Dispatch trip for ${item.bookingNo}`}
                                style={{ minHeight: 44, padding: '0 12px' }}
                              >
                                Dispatch
                              </Button>
                            )}

                            {canMutate && item.deliveryStatus === 'In Transit' && (
                              <>
                                <Button
                                  variant="primary"
                                  icon="check"
                                  onClick={() => handleOpenDeliver(item)}
                                  aria-label={`Confirm delivered for ${item.bookingNo}`}
                                  style={{ minHeight: 44, padding: '0 12px' }}
                                >
                                  Delivered
                                </Button>
                                <Button
                                  variant="ghost"
                                  icon="close"
                                  onClick={() => handleOpenFail(item)}
                                  aria-label={`Report delivery failed for ${item.bookingNo}`}
                                  style={{ minHeight: 44, padding: '0 8px', color: 'var(--danger-text)' }}
                                >
                                  Fail
                                </Button>
                              </>
                            )}

                            {item.deliveryStatus === 'Delivered' && (
                              <div style={{ fontSize: 12, color: 'var(--success)' }}>
                                ✓ Handed to {item.recipientName || 'Client'}
                              </div>
                            )}

                            {item.deliveryStatus === 'Failed' && (
                              <div style={{ fontSize: 12, color: 'var(--danger-text)' }}>
                                ✕ {item.deliveryNote || 'Undeliverable'}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </DataTableShell>
          </div>
        )}

        {/* Modal: Assign Driver */}
        {assignTarget && (
          <Modal
            isOpen={true}
            onClose={() => setAssignTarget(null)}
            title={`Assign Driver · ${assignTarget.bookingNo}`}
          >
            <div style={{ padding: 16 }}>
              <p style={{ margin: '0 0 16px', color: 'var(--text2)', fontSize: 14 }}>
                Select an active driver or staff member to assign to this delivery trip.
              </p>

              {modalError && (
                <div role="alert" style={{ ...cardStyle, color: 'var(--danger-text)', padding: 12, marginBottom: 16 }}>
                  {modalError}
                </div>
              )}

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                  Assigned Driver *
                </label>
                <select
                  value={selectedDriverId}
                  onChange={(e) => setSelectedDriverId(e.target.value)}
                  style={{
                    width: '100%',
                    minHeight: 44,
                    padding: '8px 12px',
                    borderRadius: 'var(--r-btn, 8px)',
                    border: '1px solid var(--border)',
                    background: 'var(--card)',
                    color: 'var(--text)',
                    fontSize: 14,
                  }}
                >
                  <option value="" disabled>
                    Select an active staff member…
                  </option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName} ({s.primaryRole})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
                <Button variant="ghost" onClick={() => setAssignTarget(null)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  icon="check"
                  onClick={handleSaveAssign}
                  disabled={!selectedDriverId || isSubmitting}
                >
                  {isSubmitting ? 'Saving…' : 'Save Driver'}
                </Button>
              </div>
            </div>
          </Modal>
        )}

        {/* Modal: Confirm Delivered */}
        {deliverTarget && (
          <Modal
            isOpen={true}
            onClose={() => setDeliverTarget(null)}
            title={`Confirm Delivery · ${deliverTarget.bookingNo}`}
          >
            <div style={{ padding: 16 }}>
              <p style={{ margin: '0 0 16px', color: 'var(--text2)', fontSize: 14 }}>
                Record the recipient who accepted delivery of the equipment.
              </p>

              {modalError && (
                <div role="alert" style={{ ...cardStyle, color: 'var(--danger-text)', padding: 12, marginBottom: 16 }}>
                  {modalError}
                </div>
              )}

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                  Recipient Name *
                </label>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="e.g. Anil Gurung (Production Manager)"
                  style={{
                    width: '100%',
                    minHeight: 44,
                    padding: '8px 12px',
                    borderRadius: 'var(--r-btn, 8px)',
                    border: '1px solid var(--border)',
                    background: 'var(--card)',
                    color: 'var(--text)',
                    fontSize: 14,
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                  Delivery Note (Optional)
                </label>
                <textarea
                  value={deliveryNote}
                  onChange={(e) => setDeliveryNote(e.target.value)}
                  placeholder="e.g. Handed over intact on set."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--r-btn, 8px)',
                    border: '1px solid var(--border)',
                    background: 'var(--card)',
                    color: 'var(--text)',
                    fontSize: 14,
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
                <Button variant="ghost" onClick={() => setDeliverTarget(null)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  icon="check"
                  onClick={handleConfirmDeliver}
                  disabled={!recipientName.trim() || isSubmitting}
                >
                  {isSubmitting ? 'Confirming…' : 'Confirm Delivery'}
                </Button>
              </div>
            </div>
          </Modal>
        )}

        {/* Modal: Report Failed Delivery */}
        {failTarget && (
          <Modal
            isOpen={true}
            onClose={() => setFailTarget(null)}
            title={`Report Delivery Issue · ${failTarget.bookingNo}`}
          >
            <div style={{ padding: 16 }}>
              <p style={{ margin: '0 0 16px', color: 'var(--text2)', fontSize: 14 }}>
                Explain why this delivery trip could not be completed (minimum 10 characters).
              </p>

              {modalError && (
                <div role="alert" style={{ ...cardStyle, color: 'var(--danger-text)', padding: 12, marginBottom: 16 }}>
                  {modalError}
                </div>
              )}

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                  Reason for Failure *
                </label>
                <textarea
                  value={failReason}
                  onChange={(e) => setFailReason(e.target.value)}
                  placeholder="e.g. Location unreachable due to road blockage; client requested reschedule."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--r-btn, 8px)',
                    border: '1px solid var(--border)',
                    background: 'var(--card)',
                    color: 'var(--text)',
                    fontSize: 14,
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
                <Button variant="ghost" onClick={() => setFailTarget(null)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  icon="alert_circle"
                  onClick={handleConfirmFail}
                  disabled={failReason.trim().length < 10 || isSubmitting}
                >
                  {isSubmitting ? 'Recording…' : 'Record Failure'}
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </PageBody>
    </PageShell>
  )
}
