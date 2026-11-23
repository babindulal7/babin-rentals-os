import React, { useState, useEffect } from 'react'
import {
  type CatalogueItem,
  type BookingRequestResult,
  submitBookingRequest,
} from '../lib/catalogueApi'
import type { ClientUser, OnlineProfile } from '../lib/clientAuthApi'
import type { OnlineBookingAwayStatus } from '@/lib/awayMode'
import { formatMoney, type Paisa } from '@/lib/money'
import { rentalDaysBetween } from '@/lib/rentalDays'
import { trackStoreEvent } from '@/lib/storeAnalytics'

export interface CartLine {
  item: CatalogueItem
  quantity: number
}

interface CartDrawerProps {
  isOpen: boolean
  onClose: () => void
  items: CartLine[]
  startDate: string
  endDate: string
  startTime?: string | undefined
  endTime?: string | undefined
  onUpdateQty: (itemId: string, delta: number) => void
  onRemoveItem: (itemId: string) => void
  onClearCart: () => void
  user?: ClientUser | null | undefined
  profile?: OnlineProfile | null | undefined
  onOpenAuth?: (() => void) | undefined
  awayStatus?: OnlineBookingAwayStatus | null | undefined
  onRefreshAwayStatus?: (() => Promise<unknown>) | undefined
  bookingChecksReady: boolean
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  items,
  startDate,
  endDate,
  startTime,
  endTime,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  user,
  profile,
  onOpenAuth,
  awayStatus,
  onRefreshAwayStatus,
  bookingChecksReady,
}) => {
  const [step, setStep] = useState<'cart' | 'checkout' | 'success'>('cart')
  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [projectName, setProjectName] = useState('')
  const [shootLocation, setShootLocation] = useState('')
  const [fulfillmentType, setFulfillmentType] = useState<'pickup' | 'delivery'>('pickup')
  const [deliveryZone, setDeliveryZone] = useState('ring_road')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [confirmedResult, setConfirmedResult] = useState<BookingRequestResult | null>(null)

  // Prefill contact details from signed-in client account
  useEffect(() => {
    if (user?.email && !clientEmail) {
      setClientEmail(user.email)
    }
    if (profile?.name && !clientName) {
      setClientName(profile.name)
    }
    if (profile?.phone && !clientPhone) {
      setClientPhone(profile.phone)
    }
    if (profile?.company && !projectName) {
      setProjectName(profile.company)
    }
  }, [user, profile, clientEmail, clientName, clientPhone, projectName])

  // Re-verify online booking away mode status when cart drawer is opened
  useEffect(() => {
    if (isOpen && onRefreshAwayStatus) {
      void onRefreshAwayStatus()
    }
  }, [isOpen, onRefreshAwayStatus])

  if (!isOpen) return null

  // Calculate rental days according to Kathmandu operational rental day (06:00 boundary)
  const pickupInstant = startDate ? `${startDate}T${startTime || '06:00'}:00+05:45` : null
  const returnInstant = endDate ? `${endDate}T${endTime || '06:00'}:00+05:45` : null
  const rentalDays = Math.max(1, (pickupInstant && returnInstant ? rentalDaysBetween(pickupInstant, returnInstant) : null) ?? 1)

  // Calculate totals in integer paisa
  const subtotalPaisa = items.reduce((acc, line) => {
    return acc + line.item.daily_rate_paisa * line.quantity * rentalDays
  }, 0)

  // 13% VAT in Nepal
  const vatPaisa = Math.round(subtotalPaisa * 0.13)
  const totalPaisa = subtotalPaisa + vatPaisa
  // 50% advance due standard
  const advanceDuePaisa = Math.round(totalPaisa * 0.5)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (onRefreshAwayStatus && awayStatus?.is_away) {
      await onRefreshAwayStatus()
    }

    if (awayStatus?.is_away) {
      setErrorMessage(`Online requests are currently paused: ${awayStatus.message}`)
      return
    }

    if (!bookingChecksReady) {
      setErrorMessage('Equipment availability is not verified for these dates. Please retry the catalogue check.')
      return
    }

    if (!clientName.trim()) {
      setErrorMessage('Please provide your full name.')
      return
    }
    if (!clientEmail.trim() || !clientEmail.includes('@')) {
      setErrorMessage('Please provide a valid email address.')
      return
    }
    if (!clientPhone.trim()) {
      setErrorMessage('Please provide a valid phone number for confirmation.')
      return
    }
    if (!startDate || !endDate) {
      setErrorMessage('Please choose rental start and end dates.')
      return
    }

    setSubmitting(true)
    try {
      const res = await submitBookingRequest({
        client_name: clientName.trim(),
        client_email: clientEmail.trim(),
        client_phone: clientPhone.trim(),
        project_name: projectName.trim() || undefined,
        shoot_location: shootLocation.trim() || undefined,
        start_date: startDate,
        end_date: endDate,
        fulfillment_type: fulfillmentType,
        delivery_zone_id: fulfillmentType === 'delivery' ? deliveryZone : undefined,
        delivery_address: fulfillmentType === 'delivery' ? deliveryAddress.trim() : undefined,
        lines: items.map((line) => ({
          product_id: line.item.kind === 'product' ? line.item.id : undefined,
          bundle_id: line.item.kind === 'bundle' ? line.item.id : undefined,
          quantity: line.quantity,
        })),
      })
      setConfirmedResult(res)
      setStep('success')
      trackStoreEvent({
        event: 'request_sent',
        valueNpr: Math.round(totalPaisa / 100),
      })
      onClearCart()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit request.'
      setErrorMessage(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleResetAndClose = () => {
    setStep('cart')
    setConfirmedResult(null)
    setErrorMessage(null)
    onClose()
  }

  return (
    <div
      className="cart-drawer-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cart-drawer-title"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') handleResetAndClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleResetAndClose()
      }}
    >
      <div className="cart-drawer">
        <div className="cart-header">
          <div>
            <h2 id="cart-drawer-title" style={{ fontSize: '1.2rem', fontWeight: 700 }}>
              {step === 'success' ? 'Request Received' : step === 'checkout' ? 'Request Details' : 'Booking Request Cart'}
            </h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {startDate && endDate ? `${startDate} (${startTime || '06:00'}) → ${endDate} (${endTime || '06:00'}) · ${rentalDays} day${rentalDays > 1 ? 's' : ''}` : 'Dates not chosen'}
            </span>
          </div>
          <button
            type="button"
            className="modal-close"
            style={{ position: 'static' }}
            onClick={handleResetAndClose}
            aria-label="Close cart drawer"
          >
            ×
          </button>
        </div>

        {step === 'success' && confirmedResult ? (
          <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>✓</div>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--accent-gold)' }}>
                Request {confirmedResult.request_number}
              </h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: 8 }}>
                Your online equipment request has been transmitted directly to our rental desk at Boudha.
              </p>
            </div>

            <div style={{ background: 'var(--bg-surface)', padding: 16, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div className="cart-summary-row" style={{ marginBottom: 8 }}>
                <span style={{ color: 'var(--text-muted)' }}>Estimated Total:</span>
                <strong style={{ fontFamily: 'var(--font-mono)' }}>{formatMoney(confirmedResult.total_paisa + confirmedResult.vat_paisa as Paisa)}</strong>
              </div>
              <div className="cart-summary-row">
                <span style={{ color: 'var(--text-muted)' }}>Advance Due on Confirmation (50%):</span>
                <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)' }}>{formatMoney(confirmedResult.advance_due_paisa as Paisa)}</strong>
              </div>
            </div>

            <div style={{ background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.3)', padding: 14, borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
              <strong>1-Hour Response Guarantee:</strong> Our rental coordinators will check physical unit readiness and contact you via phone or email within 1 hour with confirmation and payment options.
            </div>

            <button
              type="button"
              className="btn-primary"
              style={{ width: '100%', minHeight: 48, marginTop: 12 }}
              onClick={handleResetAndClose}
            >
              Done & Return to Catalogue
            </button>
          </div>
        ) : step === 'checkout' ? (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '16px' }}>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {errorMessage && (
                <div style={{ background: 'rgba(244, 63, 94, 0.15)', color: 'var(--rose-text)', padding: 10, borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
                  {errorMessage}
                </div>
              )}

              {awayStatus?.is_away && (
                <div style={{ background: 'rgba(234, 179, 8, 0.15)', color: 'var(--accent-gold, #fef08a)', padding: 10, borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', border: '1px solid rgba(234, 179, 8, 0.3)' }}>
                  ⏸ Online booking requests are currently paused: {awayStatus.message}
                </div>
              )}

              {user ? (
                <div
                  style={{
                    background: 'rgba(34, 197, 94, 0.08)',
                    border: '1px solid rgba(34, 197, 94, 0.25)',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.82rem',
                    color: 'var(--green-text)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>
                    ✓ Signed in as <strong>{profile?.name || user.email}</strong>
                  </span>
                  {profile?.id_doc_path && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      KYC Verified
                    </span>
                  )}
                </div>
              ) : onOpenAuth ? (
                <div
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.82rem',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>Have an existing client account?</span>
                  <button
                    type="button"
                    onClick={onOpenAuth}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-gold)',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    Sign In
                  </button>
                </div>
              ) : null}

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="e.g. Aayush Shrestha"
                  style={{ width: '100%', minHeight: 44, padding: '8px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-main)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="name@example.com"
                  style={{ width: '100%', minHeight: 44, padding: '8px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-main)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>
                  Phone Number *
                </label>
                <input
                  type="tel"
                  required
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="+977-98..."
                  style={{ width: '100%', minHeight: 44, padding: '8px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-main)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>
                  Project / Production Name (Optional)
                </label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. Feature Film, Ad Commercial"
                  style={{ width: '100%', minHeight: 44, padding: '8px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-main)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>
                  Shoot Location (Optional)
                </label>
                <input
                  type="text"
                  value={shootLocation}
                  onChange={(e) => setShootLocation(e.target.value)}
                  placeholder="e.g. Kathmandu Studio, Mustang"
                  style={{ width: '100%', minHeight: 44, padding: '8px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-main)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>
                  Fulfillment Method
                </label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setFulfillmentType('pickup')}
                    style={{
                      flex: 1,
                      minHeight: 44,
                      background: fulfillmentType === 'pickup' ? 'var(--accent-gold)' : 'var(--bg-surface)',
                      color: fulfillmentType === 'pickup' ? '#000' : 'var(--text-main)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Self-Pickup (Boudha)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFulfillmentType('delivery')}
                    style={{
                      flex: 1,
                      minHeight: 44,
                      background: fulfillmentType === 'delivery' ? 'var(--accent-gold)' : 'var(--bg-surface)',
                      color: fulfillmentType === 'delivery' ? '#000' : 'var(--text-main)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Delivery
                  </button>
                </div>
                {fulfillmentType === 'pickup' ? (
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Pickup requires at least 12 hours advance notice before rental start date.
                  </p>
                ) : (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <select
                      value={deliveryZone}
                      onChange={(e) => setDeliveryZone(e.target.value)}
                      style={{ minHeight: 44, padding: '8px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-main)' }}
                    >
                      <option value="ring_road">Inside Ring Road (Kathmandu / Lalitpur)</option>
                      <option value="outer_valley">Outer Valley (Bhaktapur / Valley Suburbs)</option>
                      <option value="outside_valley">Outside Valley (Custom Quote)</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Delivery street address and landmarks"
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      style={{ minHeight: 44, padding: '8px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-main)' }}
                    />
                  </div>
                )}
              </div>
            </div>

            <div style={{ paddingTop: 16, borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => setStep('cart')}
                disabled={submitting}
                style={{
                  flex: 1,
                  minHeight: 48,
                  background: 'var(--bg-surface)',
                  color: 'var(--text-main)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Back to Gear
              </button>
              <button
                type="submit"
                disabled={submitting || !bookingChecksReady || (awayStatus?.is_away ?? false)}
                className="btn-primary"
                style={{
                  flex: 2,
                  minHeight: 48,
                  fontSize: '0.95rem',
                  opacity: (!bookingChecksReady || (awayStatus?.is_away ?? false)) ? 0.65 : 1,
                  cursor: (!bookingChecksReady || (awayStatus?.is_away ?? false)) ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting
                  ? 'Submitting...'
                  : (awayStatus?.is_away ?? false)
                    ? 'Requests Paused'
                    : 'Confirm & Send Request'}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="cart-items">
              {items.length === 0 ? (
                <div className="empty-state" style={{ padding: '40px 10px' }}>
                  <p style={{ fontSize: '1.1rem', marginBottom: 8 }}>Your request cart is empty.</p>
                  <span style={{ fontSize: '0.85rem' }}>Select gear from the catalogue to request a booking.</span>
                </div>
              ) : (
                items.map((line) => (
                  <div key={line.item.id} className="cart-item">
                    <div style={{ flex: 1, marginRight: 12 }}>
                      <strong style={{ display: 'block', fontSize: '0.95rem', color: 'var(--text-main)', marginBottom: 2 }}>
                        {line.item.name}
                      </strong>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {formatMoney(line.item.daily_rate_paisa as Paisa)} / day
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => onUpdateQty(line.item.id, -1)}
                        style={{
                          width: 44,
                          height: 44,
                          minWidth: 44,
                          minHeight: 44,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-main)',
                          cursor: 'pointer',
                          fontWeight: 700,
                          fontSize: '1.1rem',
                        }}
                        aria-label={`Decrease quantity of ${line.item.name}`}
                      >
                        -
                      </button>
                      <span style={{ fontFamily: 'var(--font-mono)', minWidth: 24, textAlign: 'center', fontWeight: 700 }}>
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateQty(line.item.id, 1)}
                        style={{
                          width: 44,
                          height: 44,
                          minWidth: 44,
                          minHeight: 44,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-main)',
                          cursor: 'pointer',
                          fontWeight: 700,
                          fontSize: '1.1rem',
                        }}
                        aria-label={`Increase quantity of ${line.item.name}`}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveItem(line.item.id)}
                        style={{
                          width: 44,
                          height: 44,
                          minWidth: 44,
                          minHeight: 44,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--rose-text)',
                          cursor: 'pointer',
                          marginLeft: 4,
                          fontSize: '1.2rem',
                          borderRadius: 'var(--radius-sm)',
                        }}
                        aria-label={`Remove ${line.item.name} from request`}
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {items.length > 0 && (
              <div className="cart-footer">
                <div className="cart-summary-row" style={{ alignItems: 'flex-start' }}>
                  <span>Rental Period</span>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {rentalDays} day{rentalDays > 1 ? 's' : ''}
                    </div>
                    {startDate && endDate && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                        {startDate} ({startTime || '06:00'}) → {endDate} ({endTime || '06:00'})
                      </div>
                    )}
                  </div>
                </div>
                <div className="cart-summary-row">
                  <span>Subtotal</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{formatMoney(subtotalPaisa as Paisa)}</span>
                </div>
                <div className="cart-summary-row">
                  <span>Government VAT (13%)</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{formatMoney(vatPaisa as Paisa)}</span>
                </div>
                <div className="cart-total-row">
                  <span>Estimated Total</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)' }}>
                    {formatMoney(totalPaisa as Paisa)}
                  </span>
                </div>
                <div className="cart-summary-row" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                  <span>Advance Due on Confirmation (50%)</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{formatMoney(advanceDuePaisa as Paisa)}</span>
                </div>

                <button
                  type="button"
                  className="btn-primary"
                  disabled={!bookingChecksReady || (awayStatus?.is_away ?? false)}
                  style={{
                    width: '100%',
                    minHeight: 48,
                    fontSize: '1rem',
                    opacity: (awayStatus?.is_away ?? false) ? 0.65 : 1,
                    cursor: (awayStatus?.is_away ?? false) ? 'not-allowed' : 'pointer',
                  }}
                  onClick={() => setStep('checkout')}
                >
                  {(awayStatus?.is_away ?? false)
                    ? `Requests Paused — ${awayStatus?.message ?? 'Online requests paused'}`
                    : !bookingChecksReady
                      ? 'Waiting for verified availability'
                      : 'Proceed to Contact & Location'}
                </button>

                <p className="cart-disclaimer">
                  Submitting a request holds no equipment. Babin Rentals staff confirm availability and identity requirements within 1 hour.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
