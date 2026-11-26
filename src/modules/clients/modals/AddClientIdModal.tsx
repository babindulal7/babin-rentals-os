import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import Icon from '../../../components/ui/Icon'
import { useAuth } from '../../../lib/auth'
import type { ActionContext } from '../../../actions/core'
import { recordIdDocument } from '../../../actions/clients/recordIdDocument'
import { uploadEvidencePhoto } from '../../../lib/evidenceStorage'
import type { ClientIdDocumentType } from '../../../types/database'

function actionCtx(user: { id: string; role: ActionContext['role'] } | null | undefined): ActionContext | undefined {
  return user ? { userId: user.id, role: user.role } : undefined
}

export interface AddClientIdModalProps {
  isOpen: boolean
  onClose: () => void
  clientId: string
  clientName: string
  bookingId?: string | undefined
  onSuccess: (doc: { id: string; idType: ClientIdDocumentType; idNumber: string }) => void
}

const ID_TYPE_OPTIONS: Array<{ value: ClientIdDocumentType; label: string }> = [
  { value: 'citizenship_card', label: 'Citizenship Card (नेपाली नागरिकता)' },
  { value: 'passport', label: 'Passport (राहदानी)' },
  { value: 'driving_licence', label: 'Driving Licence (सवारी चालक अनुमतिपत्र)' },
  { value: 'pan_card', label: 'PAN Card' },
  { value: 'voter_id', label: 'Voter ID (मतदाता परिचयपत्र)' },
  { value: 'other', label: 'Other Government ID' },
]

export function AddClientIdModal({
  isOpen,
  onClose,
  clientId,
  clientName,
  bookingId,
  onSuccess,
}: AddClientIdModalProps) {
  const { user } = useAuth()
  const [idType, setIdType] = useState<ClientIdDocumentType>('citizenship_card')
  const [idNumber, setIdNumber] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [notes, setNotes] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    const reader = new FileReader()
    reader.onload = (event) => {
      setPhotoPreview(typeof event.target?.result === 'string' ? event.target.result : null)
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = async () => {
    if (!idNumber.trim()) {
      setError('ID document number is required.')
      return
    }

    const ctx = actionCtx(user)
    if (!ctx) {
      setError('You must be signed in to record an ID document.')
      return
    }

    try {
      setSubmitting(true)
      setError(null)

      let evidenceFileId: string | null = null
      if (photoFile && bookingId && user?.id) {
        try {
          const uploaded = await uploadEvidencePhoto({
            file: photoFile,
            filename: photoFile.name,
            category: 'Client Documents',
            reference: { bookingId, operationStage: 'Pickup' },
            userId: user.id,
          })
          evidenceFileId = uploaded.id
        } catch (uploadErr) {
          console.warn('ID photo upload deferred or failed:', uploadErr)
        }
      }

      const res = await recordIdDocument(
        {
          clientId,
          idType,
          idNumber: idNumber.trim(),
          evidenceFileId,
          expiryDate: idType === 'citizenship_card' ? null : (expiryDate.trim() || null),
          notes: notes.trim() || undefined,
        },
        ctx,
      )

      onSuccess({
        id: res.documentId,
        idType: res.idType,
        idNumber: idNumber.trim(),
      })
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!submitting) onClose()
      }}
      title="Record Client ID on File"
      subtitle={`Client: ${clientName} (W50, W51)`}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-sm)' }}>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={submitting || !idNumber.trim()}
          >
            {submitting ? 'Saving ID…' : 'Save ID on File'}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.45 }}>
          A client needs one government ID on file before their first rental (Ruling W50).
          It is stored once and reused across all subsequent rentals (Ruling W51).
        </p>

        {error && (
          <div
            role="alert"
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--r-sm)',
              background: 'color-mix(in srgb, var(--danger) 10%, var(--card))',
              border: '1px solid var(--danger)',
              color: 'var(--danger-text)',
              fontSize: 'var(--t-meta)',
            }}
          >
            {error}
          </div>
        )}

        <div>
          <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            ID Document Type <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <Select
            value={idType}
            onChange={(e) => setIdType(e.target.value as ClientIdDocumentType)}
            disabled={submitting}
            options={ID_TYPE_OPTIONS}
          />
        </div>

        <div>
          <label htmlFor="client-id-number" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            Document Number <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <Input
            id="client-id-number"
            aria-label="ID Document Number"
            type="text"
            placeholder="e.g. 27-01-79-12345 or Passport/DL number"
            value={idNumber}
            onChange={(e) => setIdNumber(e.target.value)}
            disabled={submitting}
          />
          <p style={{ margin: '4px 0 0', fontSize: 'var(--t-caption)', color: 'var(--muted)' }}>
            Masked for Warehouse, Technician and Driver roles; visible to Manager+ only.
          </p>
        </div>

        {idType !== 'citizenship_card' ? (
          <div>
            <label htmlFor="client-id-expiry" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
              Expiry Date
            </label>
            <Input
              id="client-id-expiry"
              aria-label="Expiry Date"
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              disabled={submitting}
            />
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-caption)', color: 'var(--muted)' }}>
            <Icon name="check" size={14} style={{ color: 'var(--success-text)' }} />
            <span>Citizenship cards in Nepal do not expire — no expiry required (Ruling W51).</span>
          </div>
        )}

        <div>
          <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            ID Document Photo (Camera / Scan)
          </label>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              minHeight: 44,
              padding: '8px 14px',
              borderRadius: 'var(--r-sm)',
              border: '1px dashed var(--border)',
              background: 'var(--card2)',
              color: 'var(--text)',
              fontSize: 'var(--t-meta)',
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            <Icon name="camera" size={18} />
            <span>{photoFile ? photoFile.name : 'Take Photo or Choose File…'}</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoSelect}
              disabled={submitting}
              style={{ display: 'none' }}
            />
          </label>
          {photoPreview && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <img
                src={photoPreview}
                alt="ID Document preview"
                style={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 'var(--r-xs)', border: '1px solid var(--border)' }}
              />
              <span style={{ fontSize: 'var(--t-caption)', color: 'var(--success-text)' }}>Photo selected</span>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="client-id-notes" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            Notes (Optional)
          </label>
          <Input
            id="client-id-notes"
            aria-label="Notes"
            type="text"
            placeholder="e.g. Verified with original physical card"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={submitting}
          />
        </div>
      </div>
    </Modal>
  )
}
