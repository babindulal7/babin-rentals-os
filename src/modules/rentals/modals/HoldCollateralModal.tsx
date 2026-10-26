import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { useAuth } from '../../../lib/auth'
import type { ActionContext } from '../../../actions/core'
import { receiveCollateral } from '../../../actions/rentals/receiveCollateral'
import type { CollateralType } from '../../../types/database'

function actionCtx(user: { id: string; role: ActionContext['role'] } | null | undefined): ActionContext | undefined {
  return user ? { userId: user.id, role: user.role } : undefined
}

export interface HoldCollateralModalProps {
  isOpen: boolean
  onClose: () => void
  bookingId: string
  bookingNo: string
  onSuccess: (collateral: { id: string; collateralType: CollateralType; documentNumber: string }) => void
}

const COLLATERAL_OPTIONS = [
  { value: 'citizenship_card', label: 'Citizenship Card' },
  { value: 'passport', label: 'Passport' },
  { value: 'driving_licence', label: 'Driving Licence' },
  { value: 'other', label: 'Other Document' },
]

export function HoldCollateralModal({
  isOpen,
  onClose,
  bookingId,
  bookingNo,
  onSuccess,
}: HoldCollateralModalProps) {
  const { user } = useAuth()
  const [collateralType, setCollateralType] = useState<CollateralType>('citizenship_card')
  const [documentNumber, setDocumentNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!documentNumber.trim()) {
      setError('Document number is required.')
      return
    }

    const ctx = actionCtx(user)
    if (!ctx) {
      setError('You must be signed in to record collateral.')
      return
    }

    try {
      setSubmitting(true)
      setError(null)
      const res = await receiveCollateral(
        {
          bookingId,
          collateralType,
          documentNumber: documentNumber.trim(),
          notes: notes.trim() || undefined,
        },
        ctx,
      )

      onSuccess({
        id: res.collateralId,
        collateralType: res.collateralType,
        documentNumber: documentNumber.trim(),
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
      title="Hold ID Card as Deposit Collateral"
      subtitle={`Booking ${bookingNo}`}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-sm)' }}>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={submitting || !documentNumber.trim()}
          >
            {submitting ? 'Recording…' : 'Record Collateral'}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
          An ID card (citizenship card, passport, driving licence) can be held as deposit collateral
          in lieu of a cash deposit (Ruling D1). Collateral is non-monetary and is kept apart from
          revenue and totals.
        </p>

        <Select
          label="Document Type"
          value={collateralType}
          onChange={(e) => setCollateralType(e.target.value as CollateralType)}
          options={COLLATERAL_OPTIONS}
        />

        <Input
          label="Document Number"
          value={documentNumber}
          onChange={(e) => {
            setDocumentNumber(e.target.value)
            if (error) setError(null)
          }}
          placeholder="e.g. 27-01-78-12345 or PA0987654"
          error={error}
        />

        <Input
          label="Notes (Optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Card held in office locker #3"
        />
      </div>
    </Modal>
  )
}
