import React, { useState, useEffect } from 'react'
import { initOnlinePayment, verifyOnlinePayment, type PayInitResponse } from './payApi'
import { formatMoney, type Paisa } from '../../lib/money'

export interface OnlinePaymentModalProps {
  isOpen: boolean
  onClose: () => void
  bookingRequestId?: string | undefined
  bookingId?: string | undefined
  clientUuid?: string | undefined
  onPaymentSuccess?: ((result: { intentId: string; paymentNo?: string | undefined; amountPaisa: number }) => void) | undefined
}

export const OnlinePaymentModal: React.FC<OnlinePaymentModalProps> = ({
  isOpen,
  onClose,
  bookingRequestId,
  bookingId,
  clientUuid,
  onPaymentSuccess,
}) => {
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [initData, setInitData] = useState<PayInitResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successResult, setSuccessResult] = useState<{
    intentId: string
    paymentNo?: string | undefined
    amountPaisa: number
  } | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setInitData(null)
      setError(null)
      setSuccessResult(null)
      setVerifying(false)
      return
    }

    let isMounted = true
    setLoading(true)
    setError(null)

    initOnlinePayment({
      clientUuid,
      bookingRequestId,
      bookingId,
      provider: 'fonepay',
    })
      .then((data) => {
        if (isMounted) {
          setInitData(data)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to initialize payment.')
          setLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [isOpen, clientUuid, bookingRequestId, bookingId])

  const handleSimulatePayment = async () => {
    if (!initData) return
    setVerifying(true)
    setError(null)

    try {
      const mockTxnRef = `FP-${Date.now().toString().slice(-6)}`
      const verifyRes = await verifyOnlinePayment({
        intentId: initData.intent_id,
        providerRef: mockTxnRef,
        uid: mockTxnRef,
        responseCode: 'successful',
      })

      if (verifyRes.success) {
        const result = {
          intentId: initData.intent_id,
          paymentNo: verifyRes.payment_no,
          amountPaisa: initData.amount_paisa,
        }
        setSuccessResult(result)
        onPaymentSuccess?.(result)
      } else {
        setError(verifyRes.error || 'Payment verification failed.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.')
    } finally {
      setVerifying(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          background: 'var(--bg-surface, #1e1e24)',
          border: '1px solid var(--border-subtle, #333)',
          borderRadius: 'var(--radius-lg, 12px)',
          width: '100%',
          maxWidth: 440,
          color: 'var(--text-main, #f3f4f6)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle, #333)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1.2rem' }}>💳</span>
            <strong style={{ fontSize: '1.1rem' }}>Online Payment — Fonepay</strong>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted, #9ca3af)',
              fontSize: '1.4rem',
              cursor: 'pointer',
              minWidth: 44,
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 20 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontSize: '2rem', marginBottom: 12 }}>⏳</div>
              <p style={{ color: 'var(--text-muted, #9ca3af)', fontSize: '0.9rem' }}>
                Calculating authoritative advance and creating payment intent...
              </p>
            </div>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div
                style={{
                  background: 'rgba(244, 63, 94, 0.15)',
                  color: 'var(--rose-text, #f43f5e)',
                  padding: 14,
                  borderRadius: 'var(--radius-md, 8px)',
                  marginBottom: 16,
                  fontSize: '0.88rem',
                }}
              >
                {error}
              </div>
              <button
                type="button"
                className="btn-primary"
                onClick={onClose}
                style={{ minHeight: 44, width: '100%' }}
              >
                Close
              </button>
            </div>
          ) : successResult ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: '3rem', color: 'var(--green-text, #22c55e)', marginBottom: 8 }}>✓</div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 8px 0' }}>
                Payment Received!
              </h3>
              <p style={{ color: 'var(--text-muted, #9ca3af)', fontSize: '0.88rem', margin: '0 0 16px 0' }}>
                Your payment of {formatMoney(successResult.amountPaisa as Paisa)} has been verified server-to-server.
              </p>
              {successResult.paymentNo && (
                <div
                  style={{
                    background: 'rgba(34, 197, 94, 0.1)',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    padding: 10,
                    borderRadius: 6,
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: '0.9rem',
                    color: 'var(--green-text, #22c55e)',
                    marginBottom: 16,
                  }}
                >
                  Receipt #{successResult.paymentNo}
                </div>
              )}
              <button
                type="button"
                className="btn-primary"
                onClick={onClose}
                style={{ minHeight: 44, width: '100%' }}
              >
                Done
              </button>
            </div>
          ) : initData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Amount Box */}
              <div
                style={{
                  background: 'rgba(234, 179, 8, 0.08)',
                  border: '1px solid rgba(234, 179, 8, 0.25)',
                  padding: 14,
                  borderRadius: 'var(--radius-md, 8px)',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted, #9ca3af)', marginBottom: 4 }}>
                  Rental Advance Payable Now:
                </div>
                <div
                  style={{
                    fontSize: '1.8rem',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono, monospace)',
                    color: 'var(--accent-gold, #eab308)',
                  }}
                >
                  {formatMoney(initData.amount_paisa as Paisa)}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted, #9ca3af)', marginTop: 4 }}>
                  Authoritative advance calculated from booking lines
                </div>
              </div>

              {/* O-3 Notice */}
              <div
                style={{
                  background: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  padding: 10,
                  borderRadius: 6,
                  fontSize: '0.8rem',
                  color: 'var(--blue-text, #93c5fd)',
                }}
              >
                ℹ <strong>Security Deposit Policy (O-3):</strong> Online payments strictly cover rental advance only.
                Any required security deposit is taken at physical gear handover.
              </div>

              {/* QR Code Simulation Area */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: 16,
                  background: '#fff',
                  borderRadius: 8,
                  color: '#111',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 8, color: '#b91c1c' }}>
                  Fonepay Merchant QR
                </div>
                {/* SVG QR Code Placeholder */}
                <svg width="140" height="140" viewBox="0 0 100 100" style={{ margin: '8px 0' }}>
                  <rect width="100" height="100" fill="#ffffff" />
                  <rect x="10" y="10" width="24" height="24" fill="#111" />
                  <rect x="14" y="14" width="16" height="16" fill="#fff" />
                  <rect x="18" y="18" width="8" height="8" fill="#111" />

                  <rect x="66" y="10" width="24" height="24" fill="#111" />
                  <rect x="70" y="14" width="16" height="16" fill="#fff" />
                  <rect x="74" y="18" width="8" height="8" fill="#111" />

                  <rect x="10" y="66" width="24" height="24" fill="#111" />
                  <rect x="14" y="70" width="16" height="16" fill="#fff" />
                  <rect x="18" y="74" width="8" height="8" fill="#111" />

                  <rect x="42" y="10" width="8" height="16" fill="#111" />
                  <rect x="54" y="18" width="8" height="16" fill="#111" />
                  <rect x="42" y="42" width="16" height="16" fill="#b91c1c" />
                  <rect x="66" y="42" width="16" height="8" fill="#111" />
                  <rect x="10" y="42" width="8" height="16" fill="#111" />
                  <rect x="42" y="66" width="8" height="24" fill="#111" />
                  <rect x="66" y="66" width="24" height="8" fill="#111" />
                  <rect x="74" y="82" width="16" height="8" fill="#111" />
                </svg>
                <div style={{ fontSize: '0.78rem', color: '#666', textAlign: 'center' }}>
                  Merchant: <strong>MDULAL (Babin Rentals)</strong>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <a
                  href={initData.payment_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--accent-gold, #eab308)',
                    color: '#000',
                    fontWeight: 600,
                    borderRadius: 6,
                    textDecoration: 'none',
                    minHeight: 44,
                    fontSize: '0.9rem',
                  }}
                >
                  Pay via Fonepay Hosted Page ↗
                </a>

                {/* Synthetic settlement controls are for the explicit mock app only.
                    A configured checkout must never expose browser-forced success. */}
                {import.meta.env.VITE_DATA_SOURCE === 'mock' && (
                <button
                  type="button"
                  onClick={handleSimulatePayment}
                  disabled={verifying}
                  style={{
                    minHeight: 44,
                    background: 'var(--bg-elevated, #2a2a32)',
                    border: '1px solid var(--border-subtle, #444)',
                    borderRadius: 6,
                    color: 'var(--text-main, #f3f4f6)',
                    cursor: verifying ? 'not-allowed' : 'pointer',
                    fontSize: '0.85rem',
                  }}
                >
                  {verifying ? 'Verifying with bank server-to-server...' : 'Simulate Successful Payment (Sandbox)'}
                </button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
