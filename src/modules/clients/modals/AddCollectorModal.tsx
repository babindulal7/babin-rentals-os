import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import Icon from '../../../components/ui/Icon'
import { useAuth } from '../../../lib/auth'
import type { ActionContext } from '../../../actions/core'
import { createClientCollector } from '../../../actions/clients/manageCollector'
import { uploadEvidencePhoto } from '../../../lib/evidenceStorage'
import type { ClientIdDocumentType } from '../../../types/database'

function actionCtx(user: { id: string; role: ActionContext['role'] } | null | undefined): ActionContext | undefined {
  return user ? { userId: user.id, role: user.role } : undefined
}

export interface AddCollectorModalProps {
  isOpen: boolean
  onClose: () => void
  clientId: string
  clientName: string
  bookingId?: string | undefined
  onSuccess: (collector: { id: string; name: string; phone: string; roleTitle: string | null }) => void
}

const ROLE_OPTIONS = [
  { value: '1st AC', label: '1st AC (Focus Puller)' },
  { value: '2nd AC', label: '2nd AC (Clapper / Loader)' },
  { value: 'Camera Assistant', label: 'Camera Assistant' },
  { value: 'Driver', label: 'Driver / Transportation' },
  { value: 'Production Manager', label: 'Production Manager' },
  { value: 'Assistant', label: 'Production Assistant' },
  { value: 'Director', label: 'Director / DoP' },
  { value: 'Other', label: 'Other Authorized Representative' },
]

const ID_TYPE_OPTIONS: Array<{ value: ClientIdDocumentType; label: string }> = [
  { value: 'citizenship_card', label: 'Citizenship Card' },
  { value: 'driving_licence', label: 'Driving Licence' },
  { value: 'passport', label: 'Passport' },
  { value: 'pan_card', label: 'PAN Card' },
  { value: 'voter_id', label: 'Voter ID' },
  { value: 'other', label: 'Other' },
]

export function AddCollectorModal({
  isOpen,
  onClose,
  clientId,
  clientName,
  bookingId,
  onSuccess,
}: AddCollectorModalProps) {
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [roleTitle, setRoleTitle] = useState('1st AC')
  const [hasId, setHasId] = useState(false)
  const [idType, setIdType] = useState<ClientIdDocumentType>('citizenship_card')
  const [idNumber, setIdNumber] = useState('')
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
    if (!name.trim()) {
      setError('Collector legal full name is required.')
      return
    }
    if (!phone.trim()) {
      setError('Collector phone number is required.')
      return
    }

    const ctx = actionCtx(user)
    if (!ctx) {
      setError('You must be signed in to add an authorized collector.')
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
          console.warn('Collector ID photo upload deferred or failed:', uploadErr)
        }
      }

      const res = await createClientCollector(
        {
          clientId,
          name: name.trim(),
          phone: phone.trim(),
          roleTitle: roleTitle.trim() || null,
          idType: hasId ? idType : null,
          idNumber: hasId && idNumber.trim() ? idNumber.trim() : null,
          evidenceFileId,
        },
        ctx,
      )

      onSuccess({
        id: res.collectorId,
        name: res.name,
        phone: phone.trim(),
        roleTitle: roleTitle.trim() || null,
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
      title="Add Authorized Collector"
      subtitle={`Client: ${clientName} (W28, W34)`}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-sm)' }}>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={submitting || !name.trim() || !phone.trim()}
          >
            {submitting ? 'Adding…' : 'Add Collector'}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.45 }}>
          Save people the client usually sends (assistant, AC, driver). At handover, staff pick the receiver in 1 tap (Rulings W28, W34).
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
          <label htmlFor="collector-name" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            Collector Full Legal Name <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <Input
            id="collector-name"
            aria-label="Collector Full Legal Name"
            type="text"
            placeholder="e.g. Sita Gurung"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
          />
        </div>

        <div>
          <label htmlFor="collector-phone" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            Phone Number <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <Input
            id="collector-phone"
            aria-label="Phone Number"
            type="tel"
            placeholder="e.g. +977 9801234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={submitting}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            Role / Relation to Client
          </label>
          <Select
            value={roleTitle}
            onChange={(e) => setRoleTitle(e.target.value)}
            disabled={submitting}
            options={ROLE_OPTIONS}
          />
        </div>

        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            <input
              type="checkbox"
              checked={hasId}
              onChange={(e) => setHasId(e.target.checked)}
              disabled={submitting}
              style={{ width: 18, height: 18, accentColor: 'var(--primary)' }}
            />
            <span>Record Collector ID / Document</span>
          </label>
        </div>

        {hasId && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', padding: '10px 12px', borderRadius: 'var(--r-sm)', background: 'var(--card2)', border: '1px solid var(--border)' }}>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--t-caption)', fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>
                ID Type
              </label>
              <Select
                value={idType}
                onChange={(e) => setIdType(e.target.value as ClientIdDocumentType)}
                disabled={submitting}
                options={ID_TYPE_OPTIONS}
              />
            </div>
            <div>
              <label htmlFor="collector-id-number" style={{ display: 'block', fontSize: 'var(--t-caption)', fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>
                ID Number
              </label>
              <Input
                id="collector-id-number"
                aria-label="Collector ID Number"
                type="text"
                placeholder="ID document number…"
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>
        )}

        <div>
          <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            Collector ID Photo (Optional)
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
                alt="Collector preview"
                style={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 'var(--r-xs)', border: '1px solid var(--border)' }}
              />
              <span style={{ fontSize: 'var(--t-caption)', color: 'var(--success-text)' }}>Photo selected</span>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
