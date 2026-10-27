import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from '../../components/ui/Modal'
import { Badge } from '../../components/ui/Badge'
import Icon from '../../components/ui/Icon'
import { useViewport } from '../../lib/device'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { formatMoney } from '../../lib/money'
import { formatAdDateTime, formatBsOrAd } from '../../lib/bs'
import { formatDueCountdown } from '../../lib/itemCountdown'
import type { ItemCardData } from '../../lib/queries/inventory'
import { INV_TONE, CONDITION_TONE } from '../../lib/queries/inventory'

export interface ItemCardSheetProps {
  isOpen: boolean
  onClose: () => void
  item: ItemCardData | null
  loading?: boolean
  error?: string | null
}

export function ItemCardSheet({
  isOpen,
  onClose,
  item,
  loading = false,
  error = null,
}: ItemCardSheetProps) {
  const viewport = useViewport()
  const phone = viewport === 'phone'
  const canViewMoney = useCanViewMoney()

  // Real-time live countdown for due-back time (W91)
  const [countdown, setCountdown] = useState<{ isOverdue: boolean; text: string } | null>(() => {
    if (item?.custody?.returnAt) {
      const cd = formatDueCountdown(item.custody.returnAt)
      return { isOverdue: cd.isOverdue, text: cd.text }
    }
    if (item?.custody?.countdownText) {
      return { isOverdue: !!item.custody.isOverdue, text: item.custody.countdownText }
    }
    return null
  })

  useEffect(() => {
    if (item?.custody?.returnAt) {
      const update = () => {
        const cd = formatDueCountdown(item.custody?.returnAt)
        setCountdown({ isOverdue: cd.isOverdue, text: cd.text })
      }

      update()
      const timer = setInterval(update, 30_000)
      return () => clearInterval(timer)
    } else if (item?.custody?.countdownText) {
      setCountdown({ isOverdue: !!item.custody.isOverdue, text: item.custody.countdownText })
    } else {
      setCountdown(null)
    }
  }, [item?.custody?.returnAt, item?.custody?.countdownText, item?.custody?.isOverdue])

  if (!isOpen) return null

  const footerNode = (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        width: '100%',
      }}
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {item && (
          <Link
            to={`/inventory/${item.productId}${item.unitId ? `?unit=${item.unitId}` : ''}`}
            onClick={onClose}
            style={{
              minHeight: 44,
              padding: '0 14px',
              borderRadius: 'var(--r-sm)',
              background: 'var(--card2)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              fontSize: 'var(--t-meta)',
              fontWeight: 600,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Icon name="box" size={14} />
            <span>Full Inventory Record</span>
          </Link>
        )}
        {item?.custody?.bookingId && (
          <Link
            to={`/rentals/${item.custody.bookingId}`}
            onClick={onClose}
            style={{
              minHeight: 44,
              padding: '0 14px',
              borderRadius: 'var(--r-sm)',
              background: 'var(--st-primary-bg)',
              color: 'var(--st-primary-fg)',
              fontSize: 'var(--t-meta)',
              fontWeight: 600,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Icon name="checklist" size={14} />
            <span>View Booking #{item.custody.bookingNo}</span>
          </Link>
        )}
      </div>

      <button
        type="button"
        onClick={onClose}
        style={{
          minHeight: 44,
          minWidth: 80,
          padding: '0 16px',
          borderRadius: 'var(--r-sm)',
          background: 'var(--btn-primary-bg)',
          color: 'var(--btn-primary-fg)',
          border: 'none',
          fontSize: 'var(--t-ui)',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Done
      </button>
    </div>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      sheet={phone}
      size="md"
      title={item ? `${item.brand ? `${item.brand} ` : ''}${item.model || item.name}` : 'Item Card'}
      subtitle={
        item ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            <span
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontWeight: 600,
                color: 'var(--text)',
                background: 'var(--card2)',
                padding: '2px 6px',
                borderRadius: 4,
                border: '1px solid var(--border)',
                fontSize: 'var(--t-meta)',
              }}
            >
              {item.assetTag || item.assetCode}
            </span>
            {item.serialNo && (
              <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', fontFamily: 'var(--font-mono, monospace)' }}>
                SN: {item.serialNo}
              </span>
            )}
            <Badge tone={INV_TONE[item.status]} label={item.status} size="sm" />
            <Badge tone={CONDITION_TONE[item.condition]} label={item.condition} size="sm" />
          </span>
        ) : undefined
      }
      footer={footerNode}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {loading && (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 'var(--t-meta)' }}>
            Loading item card…
          </div>
        )}

        {error && (
          <div
            style={{
              padding: 12,
              borderRadius: 'var(--r-sm)',
              background: 'var(--st-danger-bg)',
              color: 'var(--st-danger-fg)',
              fontSize: 'var(--t-ui)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Icon name="alert_triangle" size={16} />
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && item && (
          <>
            {/* 1. Who has it now (W91) */}
            <div
              style={{
                borderRadius: 'var(--r-card)',
                border: `1.5px solid ${item.custody ? 'var(--st-primary-bg)' : 'var(--border)'}`,
                background: item.custody ? 'var(--card)' : 'var(--card2)',
                padding: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="user" size={14} />
                  <span>Who Has It Now (W91)</span>
                </div>
                {item.custody && countdown && (
                  <div
                    style={{
                      padding: '4px 10px',
                      borderRadius: 'var(--r-sm)',
                      background: countdown.isOverdue ? 'var(--st-danger-bg)' : 'var(--st-primary-bg)',
                      color: countdown.isOverdue ? 'var(--st-danger-fg)' : 'var(--st-primary-fg)',
                      fontWeight: 700,
                      fontSize: 'var(--t-meta)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Icon name={countdown.isOverdue ? 'alert_triangle' : 'clock'} size={12} />
                    <span>{countdown.text}</span>
                  </div>
                )}
              </div>

              {item.custody ? (
                <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : '1fr 1fr', gap: 10, alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
                      {item.custody.clientName}
                    </div>
                    {item.custody.clientPhone && (
                      <a
                        href={`tel:${item.custody.clientPhone}`}
                        style={{
                          fontSize: 'var(--t-meta)',
                          color: 'var(--accent)',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          minHeight: 28,
                        }}
                      >
                        <Icon name="phone" size={12} />
                        <span>{item.custody.clientPhone}</span>
                      </a>
                    )}
                  </div>

                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div>
                      Booking:{' '}
                      <Link to={`/rentals/${item.custody.bookingId}`} onClick={onClose} style={{ fontWeight: 700, color: 'var(--accent)', textDecoration: 'none' }}>
                        #{item.custody.bookingNo}
                      </Link>{' '}
                      ({item.custody.stage})
                    </div>
                    <div>
                      Due Back: <strong style={{ color: 'var(--text)' }}>{formatAdDateTime(item.custody.returnAt)}</strong>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      BS: {formatBsOrAd(new Date(item.custody.returnAt))}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 'var(--t-ui)', color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="checklist" size={16} style={{ color: 'var(--st-in-fg)' }} />
                  <span>
                    In Shop · {item.status === 'In Stock' ? 'Available for rent' : `Status: ${item.status}`}
                  </span>
                </div>
              )}
            </div>

            {/* 2. Shop Location & Next Booking in 2-col or stacked */}
            <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : '1fr 1fr', gap: 10 }}>
              {/* Location */}
              <div
                style={{
                  padding: 12,
                  borderRadius: 'var(--r-sm)',
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="home" size={12} />
                  <span>Location in Shop</span>
                </div>
                <div style={{ fontSize: 'var(--t-ui)', fontWeight: 600, color: 'var(--text)' }}>
                  {item.location?.formatted || 'Shop floor — no shelf assigned'}
                </div>
              </div>

              {/* Next Booking */}
              <div
                style={{
                  padding: 12,
                  borderRadius: 'var(--r-sm)',
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="calendar" size={12} />
                  <span>Next Booking</span>
                </div>
                {item.nextBooking ? (
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
                    <Link to={`/rentals/${item.nextBooking.bookingId}`} onClick={onClose} style={{ fontWeight: 700, color: 'var(--accent)', textDecoration: 'none' }}>
                      #{item.nextBooking.bookingNo}
                    </Link>{' '}
                    · {item.nextBooking.clientName}
                    <div style={{ color: 'var(--muted)', fontSize: '11px', marginTop: 2 }}>
                      {formatAdDateTime(item.nextBooking.pickupAt)} ({item.nextBooking.relativeText})
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                    No upcoming bookings scheduled
                  </div>
                )}
              </div>
            </div>

            {/* 3. Last Reset & Open Damage */}
            <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : '1fr 1fr', gap: 10 }}>
              {/* Last Reset */}
              <div
                style={{
                  padding: 12,
                  borderRadius: 'var(--r-sm)',
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="refresh" size={12} />
                  <span>Last Reset</span>
                </div>
                {item.lastReset ? (
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
                    <div>{item.lastReset.summary}</div>
                    <div style={{ color: 'var(--muted)', fontSize: '11px', marginTop: 2 }}>
                      {formatAdDateTime(item.lastReset.completedAt)}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                    No reset on record
                  </div>
                )}
              </div>

              {/* Open Damage */}
              <div
                style={{
                  padding: 12,
                  borderRadius: 'var(--r-sm)',
                  background: item.openDamage.hasDamage ? 'var(--st-danger-bg)' : 'var(--card)',
                  border: `1px solid ${item.openDamage.hasDamage ? 'transparent' : 'var(--border)'}`,
                  color: item.openDamage.hasDamage ? 'var(--st-danger-fg)' : 'inherit',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: item.openDamage.hasDamage ? 'var(--st-danger-fg)' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Icon name={item.openDamage.hasDamage ? 'alert_triangle' : 'checklist'} size={12} />
                  <span>Damage Status</span>
                </div>
                {item.openDamage.hasDamage ? (
                  <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600 }}>
                    <div>{item.openDamage.description || item.openDamage.damageType || 'Open damage recorded'}</div>
                    {item.openDamage.severity && (
                      <div style={{ fontSize: '11px', opacity: 0.9 }}>
                        Severity: {item.openDamage.severity}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                    ✓ No open damage (Condition: {item.condition})
                  </div>
                )}
              </div>
            </div>

            {/* 4. Financials — Gated by canViewMoney (Law 6) */}
            {canViewMoney && item.financials && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--r-sm)',
                  background: 'var(--card2)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', fontWeight: 600 }}>
                  Financial Rates (Staff Only)
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 'var(--t-ui)' }}>
                  {item.financials.dailyRate !== null && (
                    <span>
                      Daily:{' '}
                      <strong style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--text)' }}>
                        {formatMoney(item.financials.dailyRate)}
                      </strong>
                    </span>
                  )}
                  {item.financials.replacementValue !== null && (
                    <span>
                      Replacement:{' '}
                      <strong style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--text)' }}>
                        {formatMoney(item.financials.replacementValue)}
                      </strong>
                    </span>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
