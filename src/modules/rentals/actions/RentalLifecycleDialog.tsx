import { useRef, useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../../lib/auth'
import { newClientUuid } from '../../../lib/supabase'
import { archiveRental, revertRental } from '../../../actions/rentals/manageRentalLifecycle'
import { rentalRevertTargets, type RevertTarget } from '../../../lib/rentalLifecycle'
import type { SelectedRentalBookingFacts } from '../../../lib/rentalMoreActionsRegistry'

export function RentalLifecycleDialog({ booking, action, onClose, onSuccess }: {
  booking: SelectedRentalBookingFacts; action: 'revert' | 'archive'; onClose: () => void; onSuccess: () => void
}) {
  const { user } = useAuth()
  const targets = rentalRevertTargets(booking)
  const [target, setTarget] = useState<RevertTarget>(targets[0] ?? 'Quote')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef(false)
  // Freeze retries after an uncertain network outcome; never reuse a key for changed data.
  const request = useRef<{ bookingId: string; reason: string; clientUuid: string; targetStage?: RevertTarget } | null>(null)
  const submit = async () => {
    if (pending.current || !user) return
    pending.current = true
    setBusy(true)
    setError(null)
    request.current ??= { bookingId: booking.id, reason: reason.trim(), clientUuid: newClientUuid(),
      ...(action === 'revert' ? { targetStage: target } : {}) }
    try {
      await (action === 'archive' ? archiveRental : revertRental)(request.current, { userId: user.id, role: user.role })
      onSuccess()
      onClose()
    } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { pending.current = false; setBusy(false) }
  }
  return <Modal isOpen onClose={busy ? () => {} : onClose} title={action === 'archive' ? 'Archive booking' : 'Revert booking stage'}>
    <div style={{ display: 'grid', gap: 16 }}>
      <p>{action === 'archive'
        ? 'Hide this Closed or Cancelled booking from the default rental list. It remains searchable and its history is kept.'
        : 'Only available before handover. Packing history is kept. Returning to Quote releases equipment reservations.'}</p>
      {action === 'revert' && <label>Return to
        <select aria-label="Return to stage" value={target} disabled={busy || Boolean(request.current)}
          onChange={e => setTarget(e.target.value as RevertTarget)} style={{ width: '100%', minHeight: 44 }}>
          {targets.map(stage => <option key={stage} value={stage}>{stage}</option>)}
        </select>
      </label>}
      <label>Reason (at least 10 characters)
        <textarea aria-label="Lifecycle change reason" value={reason} disabled={busy || Boolean(request.current)}
          onChange={e => setReason(e.target.value)} rows={3} style={{ width: '100%' }} />
      </label>
      {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button variant="secondary" disabled={busy} onClick={onClose}>Back</Button>
        <Button loading={busy} disabled={!user || busy || reason.trim().length < 10} onClick={() => { void submit() }}>
          {request.current && error ? 'Retry change' : action === 'archive' ? 'Archive booking' : 'Confirm revert'}
        </Button>
      </div>
    </div>
  </Modal>
}
