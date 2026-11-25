import React, { useEffect, useState } from 'react'
import { useSearchParams, useParams, Link } from 'react-router-dom'
import { fetchPaymentLinkDetails, type PaymentLinkDetails } from './payApi'
import { OnlinePaymentModal } from './OnlinePaymentModal'
import { formatMoney, type Paisa } from '../../lib/money'
import Icon from '../../components/ui/Icon'

export const PaymentLinkPage: React.FC = () => {
  const isMock = import.meta.env.VITE_DATA_SOURCE === 'mock'
  const [searchParams] = useSearchParams()
  const { token: pathToken } = useParams<{ token?: string }>()
  const token = searchParams.get('token') || pathToken || ''

  const [loading, setLoading] = useState(true)
  const [details, setDetails] = useState<PaymentLinkDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showPayModal, setShowPayModal] = useState(false)
  const [paymentSettled, setPaymentSettled] = useState(false)
  const [paymentChoice, setPaymentChoice] = useState<'advance' | 'full'>('advance')
  const [paidAmount, setPaidAmount] = useState<number | null>(null)

  const hasOptions = typeof details?.total_amount_paisa === 'number' && typeof details?.advance_due_paisa === 'number'
  const payableAmount = hasOptions
    ? (paymentChoice === 'advance' ? details.advance_due_paisa! : details.total_amount_paisa!)
    : (details?.amount_paisa ?? 0)

  useEffect(() => {
    let isMounted = true
    if (!token) {
      setLoading(false)
      setError('Missing payment link token. Please check the URL provided by Babin Rentals.')
      return
    }

    setLoading(true)
    setError(null)

    fetchPaymentLinkDetails(token)
      .then((res) => {
        if (!isMounted) return
        setDetails(res)
        if (!res.valid) {
          if (res.reason === 'expired') {
            setError('This payment link expired after 48 hours. Please request a new link from Babin Rentals.')
          } else if (res.reason === 'already_paid') {
            setPaymentSettled(true)
          } else {
            setError('This payment link is invalid or no longer active.')
          }
        }
      })
      .catch((err) => {
        if (!isMounted) return
        setError(err instanceof Error ? err.message : 'Failed to retrieve payment link details.')
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [token])

  const formatDate = (iso?: string) => {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    } catch {
      return iso
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg, #0f172a)',
        color: 'var(--text, #f8fafc)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 'var(--sp-xl, 24px) var(--sp-md, 16px)',
        fontFamily: 'var(--font-sans, system-ui, -apple-system, sans-serif)',
      }}
    >
      {/* Brand Header */}
      <header style={{ marginBottom: 'var(--sp-xl, 24px)', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'var(--brand-primary, #6366f1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
            }}
          >
            <Icon name="camera" size={20} />
          </div>
          <span style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
            Babin Rentals
          </span>
        </div>
        <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--muted, #94a3b8)' }}>
          Secure Online Payment Portal
        </p>
      </header>

      {/* Main Container */}
      <main
        style={{
          width: '100%',
          maxWidth: 480,
          background: 'var(--card, #1e293b)',
          borderRadius: 'var(--r-card, 12px)',
          border: '1px solid var(--border, #334155)',
          padding: 'var(--sp-lg, 20px)',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.3)',
        }}
      >
        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted, #94a3b8)' }}>
            <Icon name="clock" size={32} style={{ animation: 'spin 1.5s linear infinite', margin: '0 auto 12px' }} />
            <div>Loading payment link information…</div>
          </div>
        ) : paymentSettled || (details && !details.valid && details.reason === 'already_paid') ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'rgba(34, 197, 94, 0.15)',
                color: '#22c55e',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              <Icon name="check" size={28} />
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 8px' }}>
              Payment Already Settled
            </h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--muted, #94a3b8)', margin: '0 0 20px', lineHeight: 1.5 }}>
              Thank you! Payment for booking <strong>{details?.booking_no || 'your rental'}</strong> has been received and verified.
            </p>

            {/* Official Payment Receipt Card */}
            <div
              style={{
                background: 'var(--surface-sunken, #0f172a)',
                border: '1px solid var(--border, #334155)',
                borderRadius: 8,
                padding: '16px',
                textAlign: 'left',
                marginBottom: 20,
              }}
            >
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="check" size={18} /> Official Payment Receipt
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.85rem' }}>
                <div><span style={{ color: 'var(--muted, #94a3b8)' }}>Booking:</span> <strong>{details?.booking_no}</strong></div>
                {details?.project_name && <div><span style={{ color: 'var(--muted, #94a3b8)' }}>Project:</span> <strong>{details.project_name}</strong></div>}
                <div><span style={{ color: 'var(--muted, #94a3b8)' }}>Amount Received:</span> <strong style={{ color: '#22c55e' }}>{formatMoney((paidAmount ?? details?.amount_paisa ?? 0) as Paisa)}</strong></div>
                <div><span style={{ color: 'var(--muted, #94a3b8)' }}>Status:</span> <strong style={{ color: '#22c55e' }}>Verified</strong></div>
              </div>
              <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => window.print()}
                  style={{
                    flex: 1,
                    minHeight: 38,
                    borderRadius: 6,
                    background: 'var(--card, #1e293b)',
                    color: 'var(--text, #f8fafc)',
                    border: '1px solid var(--border, #334155)',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <Icon name="download" size={15} /> Download Receipt (PDF)
                </button>
                <Link
                  to="/booking#/my-bookings"
                  style={{
                    flex: 1,
                    minHeight: 38,
                    borderRadius: 6,
                    background: 'var(--brand-primary, #6366f1)',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <Icon name="external_link" size={15} /> My Bookings Portal
                </Link>
              </div>
            </div>

            {/* Boudha Warehouse Pickup Instructions & Checklist */}
            <div
              style={{
                background: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                borderRadius: 8,
                padding: '14px 16px',
                textAlign: 'left',
                fontSize: '0.85rem',
                color: 'var(--text, #f8fafc)',
              }}
            >
              <h4 style={{ fontSize: '0.9rem', fontWeight: 700, margin: '0 0 8px', color: '#60a5fa' }}>
                Boudha Warehouse Pickup Instructions &amp; Checklist
              </h4>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6, color: 'var(--muted, #94a3b8)' }}>
                <li><strong>Original Government Photo ID:</strong> Citizenship, Passport, or Driving License must be presented at counter.</li>
                <li><strong>Digital Reference:</strong> Show booking #{details?.booking_no} and receipt confirmation on your mobile.</li>
                <li><strong>Security Deposit:</strong> Refundable deposit / pre-authorization handled at checkout counter before gear release.</li>
                <li><strong>Inspection:</strong> Allow 15 minutes with our technician for optical and functional verification.</li>
              </ul>
            </div>
          </div>
        ) : error || !details || !details.valid ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              <Icon name="alert_triangle" size={28} />
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 8px' }}>
              {details?.reason === 'expired' ? 'Payment Link Expired' : 'Unable to Load Payment'}
            </h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--muted, #94a3b8)', margin: '0 0 24px', lineHeight: 1.5 }}>
              {error || 'The requested payment link is not valid.'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <a
                href="tel:+9779841000000"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 44,
                  padding: '0 16px',
                  borderRadius: 8,
                  background: 'var(--brand-primary, #6366f1)',
                  color: '#ffffff',
                  fontWeight: 600,
                  textDecoration: 'none',
                  fontSize: '0.9rem',
                }}
              >
                <Icon name="phone" size={16} style={{ marginRight: 6 }} />
                Call Babin Rentals
              </a>
              <Link
                to="/"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 44,
                  padding: '0 16px',
                  borderRadius: 8,
                  background: 'transparent',
                  color: 'var(--muted, #94a3b8)',
                  textDecoration: 'none',
                  fontSize: '0.9rem',
                }}
              >
                Return to Home
              </Link>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Booking Descriptor */}
            <div
              style={{
                background: 'var(--surface-sunken, #0f172a)',
                padding: '14px 16px',
                borderRadius: 8,
                border: '1px solid var(--border, #334155)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--muted, #94a3b8)' }}>
                  Booking Reference
                </span>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, fontFamily: 'var(--font-mono, monospace)', color: 'var(--text, #f8fafc)' }}>
                  {details.booking_no}
                </span>
              </div>
              {details.project_name && (
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text, #f8fafc)', marginBottom: 4 }}>
                  {details.project_name}
                </div>
              )}
              <div style={{ fontSize: '0.8rem', color: 'var(--muted, #94a3b8)' }}>
                Client: <strong>{details.client_name_masked || 'Client'}</strong> · {details.items_count || 1} items
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--muted, #94a3b8)', marginTop: 4 }}>
                Period: {formatDate(details.pickup_at)} → {formatDate(details.return_at)}
              </div>
            </div>

            {/* Payment Option Toggle (50% Advance vs 100% Full) */}
            {hasOptions && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setPaymentChoice('advance')}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: `1.5px solid ${paymentChoice === 'advance' ? 'var(--brand-primary, #6366f1)' : 'var(--border, #334155)'}`,
                    background: paymentChoice === 'advance' ? 'rgba(99, 102, 241, 0.15)' : 'var(--surface-sunken, #0f172a)',
                    color: paymentChoice === 'advance' ? '#ffffff' : 'var(--muted, #94a3b8)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                  }}
                >
                  <span>50% Advance Deposit</span>
                  <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Hold Reservation</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentChoice('full')}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: `1.5px solid ${paymentChoice === 'full' ? 'var(--brand-primary, #6366f1)' : 'var(--border, #334155)'}`,
                    background: paymentChoice === 'full' ? 'rgba(99, 102, 241, 0.15)' : 'var(--surface-sunken, #0f172a)',
                    color: paymentChoice === 'full' ? '#ffffff' : 'var(--muted, #94a3b8)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                  }}
                >
                  <span>100% Full Payment</span>
                  <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Complete Settlement</span>
                </button>
              </div>
            )}

            {/* Authoritative Amount Due */}
            <div
              style={{
                padding: '16px',
                borderRadius: 8,
                background: 'rgba(99, 102, 241, 0.08)',
                border: '1px solid rgba(99, 102, 241, 0.25)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--muted, #94a3b8)', marginBottom: 4 }}>
                Amount Payable (Server Authoritative)
              </div>
              <div
                style={{
                  fontSize: '2rem',
                  fontWeight: 800,
                  fontFamily: 'var(--font-mono, monospace)',
                  color: 'var(--text, #f8fafc)',
                }}
              >
                {formatMoney(payableAmount as Paisa)}
              </div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  marginTop: 6,
                  padding: '2px 8px',
                  borderRadius: 12,
                  background: 'rgba(234, 179, 8, 0.15)',
                  color: '#eab308',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                }}
              >
                <Icon name="clock" size={12} />
                Valid for 48 Hours
              </div>
            </div>

            {/* Security Deposit Disclaimer (O-3, B38) */}
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
                padding: '10px 12px',
                borderRadius: 8,
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                fontSize: '0.8rem',
                color: 'var(--muted, #94a3b8)',
                lineHeight: 1.4,
              }}
            >
              <Icon name="info" size={16} style={{ flexShrink: 0, marginTop: 1, color: '#3b82f6' }} />
              <div>
                <strong style={{ color: 'var(--text, #f8fafc)' }}>Security Deposit Note:</strong> Equipment security deposits are never charged through online payment links. Deposits are held separately at gear pickup.
              </div>
            </div>

            {/* Hosted checkout is on safety hold; only local mock mode may open it. */}
            {isMock ? <button
              type="button"
              onClick={() => setShowPayModal(true)}
              style={{
                width: '100%',
                minHeight: 48,
                borderRadius: 8,
                background: 'var(--brand-primary, #6366f1)',
                color: '#ffffff',
                border: 'none',
                fontWeight: 700,
                fontSize: '1rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)',
                transition: 'opacity 0.15s ease',
              }}
            >
              <Icon name="card" size={18} />
              Pay Now with Fonepay / eSewa / Khalti
            </button> : <p role="status">Online payment is temporarily unavailable. Contact Babin Rentals for payment instructions.</p>}
          </div>
        )}
      </main>

      {/* Online Payment Modal */}
      {isMock && showPayModal && details && (
        <OnlinePaymentModal
          isOpen={showPayModal}
          onClose={() => setShowPayModal(false)}
          bookingId={details.booking_id}
          token={token}
          amountPaisa={payableAmount}
          onPaymentSuccess={() => {
            setShowPayModal(false)
            setPaidAmount(payableAmount)
            setPaymentSettled(true)
          }}
        />
      )}

      {/* Footer */}
      <footer style={{ marginTop: 'auto', paddingTop: 'var(--sp-xl, 24px)', textAlign: 'center', fontSize: '0.75rem', color: 'var(--muted, #64748b)' }}>
        © 2026 Babin Rentals. {isMock ? 'Local payment simulation.' : 'Contact Babin Rentals for payment instructions.'}
      </footer>
    </div>
  )
}
export default PaymentLinkPage
