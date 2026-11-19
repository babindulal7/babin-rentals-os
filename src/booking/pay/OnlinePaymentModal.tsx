import React, { useState, useEffect } from 'react'
import {
  initOnlinePayment,
  verifyOnlinePayment,
  fetchOnlinePaymentProviders,
  type PayInitResponse,
  type PaymentProvider,
  type OnlinePaymentProviderInfo,
} from './payApi'
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
  const [providers, setProviders] = useState<OnlinePaymentProviderInfo[]>([])
  const [selectedProvider, setSelectedProvider] = useState<PaymentProvider>('fonepay')
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [initData, setInitData] = useState<PayInitResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successResult, setSuccessResult] = useState<{
    intentId: string
    paymentNo?: string | undefined
    amountPaisa: number
  } | null>(null)

  // 1. Fetch enabled providers on open
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

    fetchOnlinePaymentProviders()
      .then((allProviders) => {
        if (!isMounted) return
        const active = allProviders.filter((p) => p.enabled)
        setProviders(active)

        if (active.length === 0) {
          setError('Online payment methods are currently disabled or undergoing maintenance.')
          setLoading(false)
          return
        }

        const initial = active[0]?.provider || 'fonepay'
        setSelectedProvider(initial)

        return initOnlinePayment({
          clientUuid,
          bookingRequestId,
          bookingId,
          provider: initial,
        })
      })
      .then((data) => {
        if (isMounted && data) {
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

  // Handle provider switch by user
  const handleSelectProvider = async (provider: PaymentProvider) => {
    if (provider === selectedProvider || loading || verifying) return
    setSelectedProvider(provider)
    setLoading(true)
    setError(null)

    try {
      const data = await initOnlinePayment({
        clientUuid,
        bookingRequestId,
        bookingId,
        provider,
      })
      setInitData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch payment provider.')
    } finally {
      setLoading(false)
    }
  }

  const handleSimulatePayment = async () => {
    if (!initData) return
    setVerifying(true)
    setError(null)

    try {
      const prefix = selectedProvider === 'esewa' ? 'ESEWA' : selectedProvider === 'khalti' ? 'KH' : 'FP'
      const mockTxnRef = `${prefix}-${Date.now().toString().slice(-6)}`
      const verifyRes = await verifyOnlinePayment({
        intentId: initData.intent_id,
        provider: selectedProvider,
        providerRef: mockTxnRef,
        uid: mockTxnRef,
        pidx: selectedProvider === 'khalti' ? mockTxnRef : undefined,
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
          maxWidth: 460,
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
            <strong style={{ fontSize: '1.1rem' }}>Online Payment</strong>
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
          {/* Provider Selection Tabs (only shown if at least 1 provider available) */}
          {providers.length > 1 && !successResult && (
            <div
              style={{
                display: 'flex',
                gap: 8,
                marginBottom: 16,
                background: 'var(--bg-elevated, #2a2a32)',
                padding: 4,
                borderRadius: 8,
              }}
            >
              {providers.map((p) => {
                const isSelected = p.provider === selectedProvider
                return (
                  <button
                    key={p.provider}
                    type="button"
                    onClick={() => handleSelectProvider(p.provider)}
                    disabled={loading || verifying}
                    style={{
                      flex: 1,
                      minHeight: 44,
                      border: 'none',
                      borderRadius: 6,
                      background: isSelected ? 'var(--accent-gold, #eab308)' : 'transparent',
                      color: isSelected ? '#000' : 'var(--text-main, #f3f4f6)',
                      fontWeight: isSelected ? 700 : 500,
                      cursor: loading || verifying ? 'not-allowed' : 'pointer',
                      fontSize: '0.88rem',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                    }}
                  >
                    <span>{p.name}</span>
                  </button>
                )
              })}
            </div>
          )}

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

              {/* Deposit Policy Notice */}
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
                ℹ <strong>Security Deposit Policy:</strong> Online payments strictly cover rental advance only.
                Any required security deposit is taken at physical gear handover.
              </div>

              {/* Provider-Specific Visual Display */}
              {selectedProvider === 'fonepay' && (
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
                  {/* SVG QR Code */}
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
              )}

              {selectedProvider === 'esewa' && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: 20,
                    background: 'rgba(65, 161, 36, 0.08)',
                    border: '1px solid rgba(65, 161, 36, 0.3)',
                    borderRadius: 8,
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: '50%',
                      background: '#41a124',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.4rem',
                      fontWeight: 800,
                      marginBottom: 10,
                    }}
                  >
                    e
                  </div>
                  <strong style={{ fontSize: '1.05rem', color: 'var(--text-main, #f3f4f6)', marginBottom: 4 }}>
                    eSewa Mobile Wallet
                  </strong>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted, #9ca3af)', margin: 0 }}>
                    Fast checkout via eSewa ePAY v2. Complete your payment securely with your wallet.
                  </p>
                </div>
              )}

              {selectedProvider === 'khalti' && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: 20,
                    background: 'rgba(92, 45, 145, 0.08)',
                    border: '1px solid rgba(92, 45, 145, 0.3)',
                    borderRadius: 8,
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: '50%',
                      background: '#5c2d91',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.4rem',
                      fontWeight: 800,
                      marginBottom: 10,
                    }}
                  >
                    K
                  </div>
                  <strong style={{ fontSize: '1.05rem', color: 'var(--text-main, #f3f4f6)', marginBottom: 4 }}>
                    Khalti Digital Wallet
                  </strong>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted, #9ca3af)', margin: 0 }}>
                    Direct checkout via Khalti ePayment v2. Pay using Khalti balance or mobile banking.
                  </p>
                </div>
              )}

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
                    background:
                      selectedProvider === 'esewa'
                        ? '#41a124'
                        : selectedProvider === 'khalti'
                        ? '#5c2d91'
                        : 'var(--accent-gold, #eab308)',
                    color: selectedProvider === 'khalti' || selectedProvider === 'esewa' ? '#fff' : '#000',
                    fontWeight: 600,
                    borderRadius: 6,
                    textDecoration: 'none',
                    minHeight: 44,
                    fontSize: '0.9rem',
                  }}
                >
                  {selectedProvider === 'esewa'
                    ? 'Pay via eSewa ↗'
                    : selectedProvider === 'khalti'
                    ? 'Pay via Khalti ↗'
                    : 'Pay via Fonepay Hosted Page ↗'}
                </a>

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
                  {verifying
                    ? 'Verifying with payment server...'
                    : `Simulate Successful ${selectedProvider.toUpperCase()} Payment`}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
