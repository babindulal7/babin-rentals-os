import React, { useEffect, useState } from 'react'
import { useSearchParams, useParams, Link } from 'react-router-dom'
import { fetchPaymentLinkDetails, type PaymentLinkDetails } from './payApi'
import { OnlinePaymentModal } from './OnlinePaymentModal'
import { formatMoney, type Paisa } from '../../lib/money'
import Icon from '../../components/ui/Icon'
import { initStoreAnalyticsScripts, trackStoreEvent } from '../../lib/storeAnalytics'

export const PaymentLinkPage: React.FC = () => {
  const [searchParams] = useSearchParams()
  const { token: pathToken } = useParams<{ token?: string }>()
  const token = searchParams.get('token') || pathToken || ''

  const [loading, setLoading] = useState(true)
  const [details, setDetails] = useState<PaymentLinkDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showPayModal, setShowPayModal] = useState(false)
  const [paymentSettled, setPaymentSettled] = useState(false)

  // Initialize store analytics and dispatch page view without leaking tokens (T7-16)
  useEffect(() => {
    initStoreAnalyticsScripts(false)
    trackStoreEvent({
      event: 'page_view',
      pagePath: '/pay/link',
    })
  }, [])

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
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
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
              Thank you! The balance for booking <strong>{details?.booking_no || 'your rental'}</strong> has already been received and recorded in our system.
            </p>
            <div
              style={{
                background: 'var(--surface-sunken, #0f172a)',
                padding: '12px 16px',
                borderRadius: 8,
                fontSize: '0.85rem',
                color: 'var(--muted, #94a3b8)',
              }}
            >
              If you have questions about equipment handover or your schedule, please contact our operations desk.
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
                {formatMoney(details.amount_paisa as Paisa)}
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

            {/* Pay Button */}
            <button
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
            </button>
          </div>
        )}
      </main>

      {/* Online Payment Modal */}
      {showPayModal && details && (
        <OnlinePaymentModal
          isOpen={showPayModal}
          onClose={() => setShowPayModal(false)}
          bookingId={details.booking_id}
          token={token}
          onPaymentSuccess={() => {
            setShowPayModal(false)
            setPaymentSettled(true)
            trackStoreEvent({
              event: 'payment_done',
              valueNpr: typeof details.amount_paisa === 'number' ? Math.round(details.amount_paisa / 100) : 0,
            })
          }}
        />
      )}

      {/* Footer */}
      <footer style={{ marginTop: 'auto', paddingTop: 'var(--sp-xl, 24px)', textAlign: 'center', fontSize: '0.75rem', color: 'var(--muted, #64748b)' }}>
        <p style={{ margin: '0 0 4px', fontSize: '0.7rem', color: 'var(--muted, #64748b)' }}>
          This portal uses Google Analytics 4 and Meta Pixel for anonymous measurement. No identifying customer data is tracked.
        </p>
        © 2026 Babin Rentals. Payments are processed securely via licensed payment systems in Nepal.
      </footer>
    </div>
  )
}
export default PaymentLinkPage
