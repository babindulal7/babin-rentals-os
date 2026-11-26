import { useEffect, useState, useCallback } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import Icon from '../../../components/ui/Icon'
import { formatMoney } from '../../../lib/money'
import type { Paisa } from '../../../lib/money'
import { createBookingPaymentLink } from '../../../booking/pay/payApi'
import { buildWaLink, openWaLink, NO_PHONE_REASON } from '../../../lib/whatsapp'
import { paymentLink as waPaymentLinkTemplate } from '../../../lib/whatsappTemplates'

export interface PaymentLinkModalProps {
  isOpen: boolean
  onClose: () => void
  bookingId: string
  bookingNo: string
  clientName: string
  clientPhone?: string | null
  clientEmail?: string | null
  outstandingPaisa?: Paisa
}

export function PaymentLinkModal({
  isOpen,
  onClose,
  bookingId,
  bookingNo,
  clientName,
  clientPhone,
  clientEmail,
}: PaymentLinkModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linkData, setLinkData] = useState<{
    token: string
    amount_paisa: number
    expires_at: string
  } | null>(null)
  const [copied, setCopied] = useState(false)

  const generateLink = useCallback(async () => {
    if (!bookingId) return
    setLoading(true)
    setError(null)
    setCopied(false)
    try {
      const res = await createBookingPaymentLink(bookingId)
      if (res.success && res.token) {
        setLinkData({
          token: res.token,
          amount_paisa: res.amount_paisa,
          expires_at: res.expires_at,
        })
      } else {
        setError('Could not generate payment link.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate payment link.')
    } finally {
      setLoading(false)
    }
  }, [bookingId])

  useEffect(() => {
    if (isOpen) {
      void generateLink()
    } else {
      setCopied(false)
    }
  }, [isOpen, generateLink])

  const fullUrl = linkData
    ? `${typeof window !== 'undefined' ? window.location.origin : 'https://book.babinrentals.com'}/pay/link?token=${linkData.token}`
    : ''

  const handleCopy = async () => {
    if (!fullUrl) return
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(fullUrl)
      } else {
        const input = document.createElement('input')
        input.value = fullUrl
        document.body.appendChild(input)
        input.select()
        document.execCommand('copy')
        document.body.removeChild(input)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    } catch {
      setError('Could not copy link to clipboard automatically.')
    }
  }

  const handleWhatsApp = () => {
    if (!clientPhone || !linkData) return
    const text = waPaymentLinkTemplate(
      {
        clientName,
        bookingNo,
        amount: linkData.amount_paisa as Paisa,
        paymentUrl: fullUrl,
      },
      {
        businessName: 'Babin Rentals',
        businessPhone: '+977-9841000000',
      }
    )
    const url = buildWaLink(clientPhone, text)
    if (url) {
      openWaLink(url)
    }
  }

  const handleEmail = () => {
    if (!linkData) return
    const subject = encodeURIComponent(`Payment Link for Booking ${bookingNo} — Babin Rentals`)
    const body = encodeURIComponent(
      `Dear ${clientName},\n\nHere is your secure payment link for booking ${bookingNo} for ${formatMoney(linkData.amount_paisa as Paisa)}:\n\n${fullUrl}\n\nThis link expires in 48 hours. You can pay securely with Fonepay, eSewa, or Khalti.\n\nPlease note: Security deposits are handled separately in person at equipment collection.\n\nThank you,\nBabin Rentals Team`
    )
    const emailHref = `mailto:${clientEmail || ''}?subject=${subject}&body=${body}`
    window.open(emailHref, '_blank')
  }

  const expiryFormatted = linkData?.expires_at
    ? new Date(linkData.expires_at).toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : ''

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title={`Payment Link — ${bookingNo}`}
      subtitle="Generate a 48-hour secure online payment link for the client."
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <Button
            variant="ghost"
            onClick={generateLink}
            disabled={loading}
            style={{ minHeight: 44 }}
            title="Creates a new link and invalidates the previous link"
          >
            <Icon name="refresh" size={14} style={{ marginRight: 6 }} />
            Regenerate Link
          </Button>
          <Button variant="secondary" onClick={onClose} style={{ minHeight: 44 }}>
            Close
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        {error && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--r-input)',
              background: 'rgba(239, 68, 68, 0.1)',
              color: 'var(--brand-danger, #ef4444)',
              fontSize: 'var(--t-meta)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Icon name="alert_circle" size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div style={{ padding: 'var(--sp-xl) 0', textAlign: 'center', color: 'var(--muted)' }}>
            Generating secure server-calculated payment link…
          </div>
        ) : linkData ? (
          <>
            {/* Amount & Expiry Summary Card */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 'var(--sp-md)',
                borderRadius: 'var(--r-card)',
                background: 'var(--surface-sunken)',
                border: '1px solid var(--border)',
              }}
            >
              <div>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', fontWeight: 600 }}>
                  Amount Due (Server Authoritative)
                </div>
                <div
                  style={{
                    fontSize: '1.4rem',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text)',
                    marginTop: 2,
                  }}
                >
                  {formatMoney(linkData.amount_paisa as Paisa)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 8px',
                    borderRadius: 'var(--r-badge)',
                    background: 'var(--brand-warn-subtle, rgba(234, 179, 8, 0.15))',
                    color: 'var(--brand-warn, #ca8a04)',
                    fontSize: 'var(--t-th)',
                    fontWeight: 600,
                  }}
                >
                  <Icon name="clock" size={12} />
                  Expires in 48h
                </span>
                <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', marginTop: 4 }}>
                  Valid until {expiryFormatted}
                </div>
              </div>
            </div>

            {/* Notice: Security deposit is excluded */}
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
                fontSize: 'var(--t-meta)',
                color: 'var(--muted)',
                background: 'var(--card2)',
                padding: '8px 12px',
                borderRadius: 'var(--r-input)',
              }}
            >
              <Icon name="info" size={14} style={{ flexShrink: 0, marginTop: 2, color: 'var(--brand-info, #3b82f6)' }} />
              <span>
                <strong>Deposit Policy:</strong> Security deposits are never included in online payment links. They are handled separately at equipment handover.
              </span>
            </div>

            {/* URL Display and Copy */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 'var(--t-meta)',
                  fontWeight: 600,
                  color: 'var(--text)',
                  marginBottom: 6,
                }}
              >
                Shareable Link
              </label>
              <div style={{ display: 'flex', gap: 'var(--sp-xs)', alignItems: 'center' }}>
                <input
                  type="text"
                  readOnly
                  value={fullUrl}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    padding: '0 12px',
                    borderRadius: 'var(--r-input)',
                    border: '1px solid var(--input-border)',
                    background: 'var(--input-bg)',
                    color: 'var(--text)',
                    fontSize: 'var(--t-meta)',
                    fontFamily: 'var(--font-mono)',
                  }}
                />
                <Button
                  variant="secondary"
                  onClick={handleCopy}
                  style={{ minHeight: 44, minWidth: 100, justifyContent: 'center' }}
                >
                  <Icon name={copied ? 'check' : 'copy'} size={14} style={{ marginRight: 4 }} />
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>

            {/* Sharing Options */}
            <div>
              <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
                Share with Client
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-sm)' }}>
                <Button
                  variant="secondary"
                  onClick={handleWhatsApp}
                  disabled={!clientPhone}
                  style={{ minHeight: 44, width: '100%', justifyContent: 'center' }}
                  title={!clientPhone ? NO_PHONE_REASON : 'Send link via WhatsApp'}
                >
                  <Icon name="send" size={16} style={{ marginRight: 6, color: '#25D366' }} />
                  WhatsApp
                </Button>

                <Button
                  variant="secondary"
                  onClick={handleEmail}
                  style={{ minHeight: 44, width: '100%', justifyContent: 'center' }}
                  title="Draft email with payment link"
                >
                  <Icon name="mail" size={16} style={{ marginRight: 6 }} />
                  Email Draft
                </Button>
              </div>
              {!clientPhone && (
                <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', marginTop: 4 }}>
                  No phone number on client record for direct WhatsApp draft.
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ padding: 'var(--sp-md) 0', textAlign: 'center' }}>
            <Button variant="primary" onClick={generateLink} style={{ minHeight: 44 }}>
              Generate Payment Link
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}
