/**
 * src/booking/components/ClientAuthModal.tsx
 *
 * Passwordless Email OTP Authentication Modal for Client Portal (T7-03).
 */

import React, { useState } from 'react'
import {
  type ClientUser,
  requestClientOtp,
  verifyClientOtp,
} from '../lib/clientAuthApi'

interface ClientAuthModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (user: ClientUser) => void
}

export const ClientAuthModal: React.FC<ClientAuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [step, setStep] = useState<'email' | 'otp'>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)

  if (!isOpen) return null

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await requestClientOtp(email)
      setInfoMessage(res.message)
      setStep('otp')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send login code.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const user = await verifyClientOtp(email, otp)
      onSuccess(user)
      handleClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid verification code.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setStep('email')
    setEmail('')
    setOtp('')
    setError(null)
    setInfoMessage(null)
    setLoading(false)
    onClose()
  }

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="client-auth-title"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') handleClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <div className="modal-content" style={{ maxWidth: 440, padding: 28 }}>
        <button
          type="button"
          className="modal-close"
          onClick={handleClose}
          aria-label="Close sign in modal"
        >
          ×
        </button>

        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'rgba(234, 179, 8, 0.15)',
              color: 'var(--accent-gold)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.4rem',
              marginBottom: 12,
            }}
          >
            👤
          </div>
          <h2 id="client-auth-title" style={{ fontSize: '1.35rem', fontWeight: 800 }}>
            {step === 'email' ? 'Client Sign In' : 'Enter Verification Code'}
          </h2>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginTop: 4 }}>
            {step === 'email'
              ? 'Enter your email to receive a secure login code. No password needed.'
              : `We sent a 6-digit login code to ${email}`}
          </p>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid var(--rose-border)',
              color: 'var(--rose-text)',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        {infoMessage && step === 'otp' && (
          <div
            role="status"
            style={{
              background: 'rgba(234, 179, 8, 0.1)',
              border: '1px solid rgba(234, 179, 8, 0.3)',
              color: 'var(--accent-gold)',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
              marginBottom: 16,
            }}
          >
            {infoMessage}
          </div>
        )}

        {step === 'email' ? (
          <form onSubmit={handleRequestOtp} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-group">
              <label htmlFor="auth-email-input" className="form-label">
                Email Address
              </label>
              <input
                id="auth-email-input"
                type="email"
                required
                className="form-input"
                placeholder="producer@cinema.np"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                autoFocus
              />
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={loading || !email.trim()}
              style={{ width: '100%', minHeight: 48, marginTop: 4 }}
            >
              {loading ? 'Sending Code…' : 'Send Verification Code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-group">
              <label htmlFor="auth-otp-input" className="form-label">
                6-Digit Verification Code
              </label>
              <input
                id="auth-otp-input"
                type="text"
                pattern="[0-9a-zA-Z]{6}"
                maxLength={6}
                required
                className="form-input"
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value.trim())}
                disabled={loading}
                autoFocus
                style={{
                  letterSpacing: '0.3em',
                  textAlign: 'center',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '1.25rem',
                }}
              />
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={loading || otp.length < 6}
              style={{ width: '100%', minHeight: 48, marginTop: 4 }}
            >
              {loading ? 'Verifying…' : 'Verify & Sign In'}
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <button
                type="button"
                onClick={() => {
                  setStep('email')
                  setError(null)
                  setInfoMessage(null)
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  padding: 4,
                  textDecoration: 'underline',
                }}
              >
                Change email
              </button>

              <button
                type="button"
                onClick={handleRequestOtp}
                disabled={loading}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-gold)',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  padding: 4,
                }}
              >
                Resend code
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
