import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import { Input } from '../../../components/ui/Input'
import { useAuth } from '../../../lib/auth'
import type { ActionContext } from '../../../actions/core'
import { returnCollateral } from '../../../actions/rentals/returnCollateral'

function actionCtx(user: { id: string; role: ActionContext['role'] } | null | undefined): ActionContext | undefined {
  return user ? { userId: user.id, role: user.role } : undefined
}

export interface ReturnCollateralModalProps {
  isOpen: boolean
  onClose: () => void
  bookingId: string
  bookingNo: string
  collateralId: string
  collateralType: string
  documentNumber: string
  onSuccess: () => void
}

export function ReturnCollateralModal({
  isOpen,
  onClose,
  bookingId,
  bookingNo,
  collateralId,
  collateralType,
  documentNumber,
  onSuccess,
}: ReturnCollateralModalProps) {
  const { user } = useAuth()
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleReturn = async () => {
    const ctx = actionCtx(user)
    if (!ctx) {
      setError('You must be signed in to return collateral.')
      return
    }

    try {
      setSubmitting(true)
      setError(null)
      await returnCollateral(
        {
          bookingId,
          collateralId,
          notes: notes.trim() || undefined,
        },
        ctx,
      )

      onSuccess()
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
      title="Return Client ID Collateral"
      subtitle={`Booking ${bookingNo}`}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-sm)' }}>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleReturn} disabled={submitting}>
            {submitting ? 'Returning…' : 'Confirm Return'}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
          Confirm returning the client's held collateral (
          <strong>
            {collateralType}: {documentNumber}
          </strong>
          ). The booking cannot be closed until all held collateral is returned (gate.close.collateral_held).
        </p>

        <Input
          label="Notes (Optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Handed back to client at return counter"
        />

        {error && (
          <div role="alert" style={{ fontSize: 'var(--t-meta)', color: 'var(--danger-text)' }}>
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}
