import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import Icon from '../../../components/ui/Icon'
import { newClientUuid } from '../../../lib/supabase'
import { useToast } from '../../../components/ui/Toast'
import { addWaitingChargeLine, checkWaitingCharge, type WaitingChargeResult } from '../../../lib/queries/waitingCharge'

/*
 * RULING 2026-11-19 (S2 row 6): a waiting charge is added after the trip, as its own flat line, typed by
 * Owner, Admin, Manager or Coordinator. Nothing is priced here; the person types minutes and the amount.
 * The database refuses an issued invoice (R-03) and says so; that message is shown here, not hidden.
 */

export interface AddWaitingChargeModalProps {
  isOpen: boolean
  onClose: () => void
  bookingId: string
  onAdded?: (result: WaitingChargeResult) => void
}

const fieldStyle = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 'var(--r-btn, 6px)',
  border: '1px solid var(--border)',
  background: 'var(--card)',
  color: 'var(--text)',
  fontSize: 'var(--t-body, 14px)',
  minHeight: 44,
  boxSizing: 'border-box',
} as const

const labelStyle = { display: 'block', fontSize: 'var(--t-meta, 13px)', fontWeight: 600, marginBottom: 6 } as const

export function AddWaitingChargeModal({ isOpen, onClose, bookingId, onAdded }: AddWaitingChargeModalProps) {
  const { showSuccessToast } = useToast()
  const [minutes, setMinutes] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Law 8: one key for this press, kept across retries so a repeat never adds a second line.
  const [clientUuid] = useState<string>(() => newClientUuid())

  const submit = async () => {
    const checked = checkWaitingCharge(minutes, amount)
    if (!checked.ok) {
      setError(checked.error)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const result = await addWaitingChargeLine(bookingId, clientUuid, {
        minutes: checked.minutes,
        amountPaisa: checked.amountPaisa,
        note,
      })
      showSuccessToast(
        'Waiting charge added',
        result.appendedToDraft
          ? `${checked.minutes} min added to this booking and to its draft invoice.`
          : `${checked.minutes} min added to this booking. It will bill when the invoice is created.`,
      )
      onAdded?.(result)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'The waiting charge was not added.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add waiting charge"
      subtitle="Waiting beyond the included 10 minutes. Added as its own line on this booking."
      size="md"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={submitting}>
            {submitting ? 'Adding…' : 'Add waiting charge'}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'grid', gap: 'var(--sp-md, 16px)' }}>
        {error && (
          <div
            role="alert"
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--r-btn, 6px)',
              background: 'var(--danger-surface, rgba(239, 68, 68, 0.1))',
              color: 'var(--danger-text, #ef4444)',
              fontSize: 'var(--t-meta, 13px)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
            }}
          >
            <Icon name="alert_circle" size={16} />
            <span>{error}</span>
          </div>
        )}
        <div>
          <label htmlFor="waiting-minutes-input" style={labelStyle}>
            Minutes waited
          </label>
          <input
            id="waiting-minutes-input"
            type="text"
            inputMode="numeric"
            placeholder="e.g. 25"
            value={minutes}
            onChange={(e) => {
              setMinutes(e.target.value)
              if (error) setError(null)
            }}
            disabled={submitting}
            style={fieldStyle}
          />
        </div>
        <div>
          <label htmlFor="waiting-amount-input" style={labelStyle}>
            Waiting charge (Rs)
          </label>
          <input
            id="waiting-amount-input"
            type="text"
            inputMode="decimal"
            placeholder="Type the amount"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value)
              if (error) setError(null)
            }}
            disabled={submitting}
            style={fieldStyle}
          />
        </div>
        <div>
          <label htmlFor="waiting-note-input" style={labelStyle}>
            Note (optional)
          </label>
          <input
            id="waiting-note-input"
            type="text"
            placeholder="e.g. Client was not at the venue"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={submitting}
            maxLength={300}
            style={fieldStyle}
          />
        </div>
      </div>
    </Modal>
  )
}
