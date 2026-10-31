/**
 * src/modules/operations/SendToRiderModal.tsx
 *
 * Modal for staff to generate, copy, share, and revoke One-Time Rider Links (T4-08, W49).
 */

import { useState, useEffect, useCallback } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Page'
import Icon from '../../components/ui/Icon'
import { useAuth } from '../../lib/auth'
import { useToast } from '../../components/ui/Toast'
import {
  createRiderLink,
  revokeRiderLink,
  getJobRiderLinks,
  type DeliveryJobLinkRecord,
} from '../../lib/queries/riderLink'

interface SendToRiderModalProps {
  isOpen: boolean
  onClose: () => void
  jobId: string
  bookingNo: string
  clientName?: string
  destination?: string
}

export function SendToRiderModal({
  isOpen,
  onClose,
  jobId,
  bookingNo,
  clientName,
  destination,
}: SendToRiderModalProps) {
  const { user } = useAuth()
  const { showSuccessToast } = useToast()

  const [riderName, setRiderName] = useState('')
  const [riderPhone, setRiderPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatedLink, setGeneratedLink] = useState<{ url: string; rawToken: string; expiresAt: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [activeLinks, setActiveLinks] = useState<DeliveryJobLinkRecord[]>([])
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const loadLinks = useCallback(async () => {
    if (!jobId) return
    try {
      const rows = await getJobRiderLinks(jobId)
      setActiveLinks(rows)
    } catch {
      // Ignore
    }
  }, [jobId])

  useEffect(() => {
    if (isOpen) {
      void loadLinks()
      setGeneratedLink(null)
      setError(null)
      setRiderName('')
      setRiderPhone('')
    }
  }, [isOpen, loadLinks])

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!riderName.trim() || !riderPhone.trim()) {
      setError('Please provide both rider name and phone number.')
      return
    }

    try {
      setLoading(true)
      setError(null)
      const res = await createRiderLink(jobId, riderName, riderPhone, user?.role)
      setGeneratedLink({
        url: res.linkUrl,
        rawToken: res.rawToken,
        expiresAt: res.expiresAt,
      })
      showSuccessToast('Rider link created successfully.')
      await loadLinks()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not create rider link.')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!generatedLink) return
    try {
      await navigator.clipboard.writeText(generatedLink.url)
      setCopied(true)
      showSuccessToast('Link copied to clipboard!')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy link to clipboard.')
    }
  }

  const handleRevoke = async (linkId: string) => {
    if (!confirm('Are you sure you want to revoke this rider link? The rider will no longer be able to use it.')) {
      return
    }

    try {
      setRevokingId(linkId)
      await revokeRiderLink(linkId, user?.role)
      showSuccessToast('Rider link revoked.')
      await loadLinks()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Could not revoke link.')
    } finally {
      setRevokingId(null)
    }
  }

  const cleanPhoneForWhatsApp = (phone: string) => {
    let p = phone.replace(/[^0-9]/g, '')
    if (p.length === 10) p = `977${p}`
    return p
  }

  const whatsappShareUrl = generatedLink
    ? `https://wa.me/${cleanPhoneForWhatsApp(riderPhone)}?text=${encodeURIComponent(
        `Namaste ${riderName}, here is your delivery job link for booking ${bookingNo} from Babin Rentals: ${generatedLink.url}\n\nPlease tap to see pickup & drop details, and confirm delivery upon handover.`
      )}`
    : ''

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Send Delivery Job to Hired Rider">
      <div style={{ padding: '0 4px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Job summary info */}
        <div style={{ padding: 12, backgroundColor: 'var(--surface-2)', borderRadius: 8, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: 'var(--muted)' }}>Booking:</span>
            <span style={{ fontWeight: 600 }}>{bookingNo}</span>
          </div>
          {clientName && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: 'var(--muted)' }}>Client:</span>
              <span style={{ fontWeight: 600 }}>{clientName}</span>
            </div>
          )}
          {destination && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)' }}>Drop Destination:</span>
              <span style={{ fontWeight: 600 }}>{destination}</span>
            </div>
          )}
        </div>

        {error && (
          <div style={{ padding: 10, backgroundColor: 'var(--st-danger-bg)', color: 'var(--st-danger-fg)', borderRadius: 8, fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Generate Form */}
        {!generatedLink ? (
          <form onSubmit={handleGenerate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                Rider Full Name <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Ramesh Thapa"
                value={riderName}
                onChange={(e) => setRiderName(e.target.value)}
                required
                style={{
                  width: '100%',
                  minHeight: 44,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg)',
                  color: 'var(--text)',
                  fontSize: 14,
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                Rider Mobile Phone <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                type="tel"
                placeholder="e.g. 98XXXXXXXX"
                value={riderPhone}
                onChange={(e) => setRiderPhone(e.target.value)}
                required
                style={{
                  width: '100%',
                  minHeight: 44,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg)',
                  color: 'var(--text)',
                  fontSize: 14,
                }}
              />
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                Used to share via WhatsApp/SMS. Rider does not require a staff login account.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={loading} icon="external_link">
                {loading ? 'Generating Link…' : 'Generate Rider Link'}
              </Button>
            </div>
          </form>
        ) : (
          /* Link Share Screen */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: 14, backgroundColor: 'var(--st-progress-bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', marginBottom: 6 }}>
                ONE-TIME RIDER LINK GENERATED (VALID 24H)
              </div>
              <div style={{ fontSize: 13, wordBreak: 'break-all', fontFamily: 'monospace', padding: 8, backgroundColor: 'var(--card)', borderRadius: 6, border: '1px solid var(--border)' }}>
                {generatedLink.url}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Button
                type="button"
                variant="primary"
                icon={copied ? 'check' : 'copy'}
                onClick={handleCopy}
                style={{ flex: 1, minHeight: 44 }}
              >
                {copied ? 'Copied!' : 'Copy Link'}
              </Button>

              <a
                href={whatsappShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  flex: 1,
                  minHeight: 44,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '8px 16px',
                  backgroundColor: '#25D366',
                  color: '#ffffff',
                  borderRadius: 8,
                  textDecoration: 'none',
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                <Icon name="message" size={20} />
                <span>WhatsApp</span>
              </a>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <Button type="button" variant="outline" onClick={() => setGeneratedLink(null)}>
                Generate Another
              </Button>
            </div>
          </div>
        )}

        {/* Existing Active Links */}
        {activeLinks.length > 0 && (
          <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', margin: '0 0 10px', textTransform: 'uppercase' }}>
              Existing Rider Links for this Job
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activeLinks.map((l) => (
                <div
                  key={l.id}
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    backgroundColor: 'var(--surface-2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: 12,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{l.rider_name} ({l.rider_phone})</div>
                    <div style={{ color: 'var(--muted)', fontSize: 11 }}>
                      {l.completed_at ? 'Delivered' : l.revoked_at ? 'Revoked' : l.is_active ? 'Active' : 'Expired'}
                    </div>
                  </div>

                  {l.is_active && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleRevoke(l.id)}
                      disabled={revokingId === l.id}
                    >
                      {revokingId === l.id ? 'Revoking…' : 'Revoke'}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
