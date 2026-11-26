import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import Icon from '../../../components/ui/Icon'
import { type BookingAtRiskRow } from '../../../lib/queries/atRisk'
import { resolveAtRisk } from '../../../actions/rentals/resolveAtRisk'
import { SUBRENTAL_PARTNERS } from '../../../lib/availability'
import { useAuth } from '../../../lib/auth'

export interface ResolveAtRiskModalProps {
  isOpen: boolean
  onClose: () => void
  atRisk: BookingAtRiskRow
  clientName?: string | undefined
  clientPhone?: string | undefined
  clientEmail?: string | undefined
  onResolved?: () => void
}

export function ResolveAtRiskModal({
  isOpen,
  onClose,
  atRisk,
  clientName = 'Client',
  clientPhone,
  clientEmail,
  onResolved,
}: ResolveAtRiskModalProps) {
  const { user } = useAuth()
  const contactInfo = [clientPhone, clientEmail].filter(Boolean).join(' · ')
  const [selectedResolution, setSelectedResolution] = useState<
    'sub_rent' | 'similar_item' | 'refund' | 'credit' | 'client_change'
  >('similar_item')

  // Sub-rent options
  const [partner, setPartner] = useState<string>(SUBRENTAL_PARTNERS[0] ?? 'GearHouse KTM')
  const [supplierRate, setSupplierRate] = useState('2500')

  // Credit / refund options
  const [creditAmount, setCreditAmount] = useState('3500')

  // Notes
  const [notes, setNotes] = useState('Assigned alternative unit for booking.')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDraft, setShowDraft] = useState(false)

  // WhatsApp / Email draft text
  const draftMessage = `Namaste ${clientName},\nRegarding your booking #${atRisk.booking_no} for ${atRisk.product_name || 'equipment'}: due to an unexpected shoot extension from another client, we have prepared an immediate solution (alternative premium gear or covered sub-rental) with zero additional charge to ensure your shoot is uninterrupted. Please let us know if you have any questions.\n— Babin Rentals`

  const handleCopyDraft = async () => {
    try {
      await navigator.clipboard.writeText(draftMessage)
      alert('Draft message copied to clipboard!')
    } catch {
      // fallback
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setIsSubmitting(true)
    setError(null)

    try {
      let resolutionNote = notes
      if (selectedResolution === 'sub_rent') {
        resolutionNote = `Sub-rented from ${partner} at Rs ${supplierRate}. ${notes}`
      } else if (selectedResolution === 'credit') {
        resolutionNote = `Account credit of Rs ${creditAmount} credited to client. ${notes}`
      } else if (selectedResolution === 'refund') {
        resolutionNote = `Full refund requested. ${notes}`
      }

      await resolveAtRisk(
        {
          atRiskId: atRisk.id,
          resolution: selectedResolution,
          notes: resolutionNote,
          creditAmount: selectedResolution === 'credit' ? Number(creditAmount) : undefined,
        },
        { userId: user.id, role: user.role },
      )

      onResolved?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve at-risk item.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Resolve At-Risk: Booking #${atRisk.booking_no}`}
      size="lg"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <Button
            variant="ghost"
            type="button"
            onClick={() => setShowDraft(!showDraft)}
            style={{ fontSize: 'var(--t-meta)', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Icon name="mail" size={16} />
            {showDraft ? 'Hide Draft Message' : 'Draft Client WhatsApp / Email'}
          </Button>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button variant="primary" type="button" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Resolving…' : 'Apply Resolution & Unblock Pack'}
            </Button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--r-btn)',
              background: 'var(--danger-bg)',
              color: 'var(--danger)',
              border: '1px solid var(--danger-border)',
              fontSize: 'var(--t-meta)',
            }}
          >
            {error}
          </div>
        )}

        {/* Warning Banner */}
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 'var(--r-btn)',
            background: 'var(--warning-bg)',
            border: '1px solid var(--warning-border)',
            color: 'var(--text)',
            fontSize: 'var(--t-meta)',
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          <Icon name="alert_triangle" size={18} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong>Booking flagged At Risk:</strong> Equipment clash on{' '}
            <strong>{atRisk.product_name || 'gear'}</strong>{' '}
            {atRisk.clashing_booking_no ? `(Booking #${atRisk.clashing_booking_no})` : ''}.
            <div style={{ fontSize: 'var(--t-fine, 12px)', color: 'var(--muted)', marginTop: 2 }}>
              An at-risk booking cannot reach Pack until covered or resolved. Choose a resolution path below.
            </div>
          </div>
        </div>

        {/* O-2 Resolution Choice */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
            Resolution Step
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
            <button
              type="button"
              onClick={() => setSelectedResolution('similar_item')}
              style={{
                padding: '10px 12px',
                borderRadius: 'var(--r-btn)',
                border: selectedResolution === 'similar_item' ? '2px solid var(--primary)' : '1px solid var(--border)',
                background: selectedResolution === 'similar_item' ? 'var(--card2)' : 'var(--card)',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
                1. Similar Free Item
              </div>
              <div style={{ fontSize: 'var(--t-fine, 12px)', color: 'var(--muted)', marginTop: 2 }}>
                Swap with available same-category gear (free)
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedResolution('sub_rent')}
              style={{
                padding: '10px 12px',
                borderRadius: 'var(--r-btn)',
                border: selectedResolution === 'sub_rent' ? '2px solid var(--primary)' : '1px solid var(--border)',
                background: selectedResolution === 'sub_rent' ? 'var(--card2)' : 'var(--card)',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
                2. Sub-rent from Partner
              </div>
              <div style={{ fontSize: 'var(--t-fine, 12px)', color: 'var(--muted)', marginTop: 2 }}>
                Cover from external partner
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedResolution('credit')}
              style={{
                padding: '10px 12px',
                borderRadius: 'var(--r-btn)',
                border: selectedResolution === 'credit' ? '2px solid var(--primary)' : '1px solid var(--border)',
                background: selectedResolution === 'credit' ? 'var(--card2)' : 'var(--card)',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
                3. Keep as Account Credit
              </div>
              <div style={{ fontSize: 'var(--t-fine, 12px)', color: 'var(--muted)', marginTop: 2 }}>
                Client's choice: credit balance for next rental
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedResolution('refund')}
              style={{
                padding: '10px 12px',
                borderRadius: 'var(--r-btn)',
                border: selectedResolution === 'refund' ? '2px solid var(--primary)' : '1px solid var(--border)',
                background: selectedResolution === 'refund' ? 'var(--card2)' : 'var(--card)',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
                4. Full Refund
              </div>
              <div style={{ fontSize: 'var(--t-fine, 12px)', color: 'var(--muted)', marginTop: 2 }}>
                Refund reversal row via payment_reversals
              </div>
            </button>
          </div>
        </div>

        {/* Resolution details based on choice */}
        {selectedResolution === 'sub_rent' && (
          <div style={{ display: 'flex', gap: 12, padding: 12, background: 'var(--card2)', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 'var(--t-fine, 12px)', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                Sub-rental Partner
              </label>
              <select
                value={partner}
                onChange={(e) => setPartner(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)' }}
              >
                {SUBRENTAL_PARTNERS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ width: 140 }}>
              <label style={{ fontSize: 'var(--t-fine, 12px)', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                Supplier Rate (Rs)
              </label>
              <input
                type="number"
                value={supplierRate}
                onChange={(e) => setSupplierRate(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)' }}
              />
            </div>
          </div>
        )}

        {selectedResolution === 'credit' && (
          <div style={{ padding: 12, background: 'var(--card2)', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)' }}>
            <label style={{ fontSize: 'var(--t-fine, 12px)', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
              Account Credit Amount (NPR)
            </label>
            <input
              type="number"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
              style={{ width: '100%', maxWidth: 200, padding: '8px 10px', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)' }}
            />
          </div>
        )}

        {/* Resolution Notes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Resolution Notes
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--r-btn)',
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--text)',
              fontSize: 'var(--t-meta)',
            }}
          />
        </div>

        {/* WhatsApp / Email Draft Section */}
        {showDraft && (
          <div style={{ padding: 14, background: 'var(--card2)', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
                Client Notification Draft{contactInfo ? ` (${contactInfo})` : ''}
              </span>
              <Button variant="ghost" size="sm" type="button" onClick={handleCopyDraft}>
                Copy to Clipboard
              </Button>
            </div>
            <textarea
              readOnly
              rows={4}
              value={draftMessage}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 'var(--r-btn)',
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--text)',
                fontSize: 'var(--t-fine, 12px)',
                fontFamily: 'monospace',
              }}
            />
          </div>
        )}
      </form>
    </Modal>
  )
}
