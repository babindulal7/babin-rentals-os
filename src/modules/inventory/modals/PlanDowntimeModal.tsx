import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import { planDowntime, DOWNTIME_REASONS, type DowntimeReason } from '../../../actions/inventory/planDowntime'
import { useAuth } from '../../../lib/auth'
import { useToast } from '../../../components/ui/Toast'

export interface PlanDowntimeModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  productId: string
  productName: string
  isSerialized: boolean
  units?: Array<{ id: string; assetTag: string }>
  initialUnitId?: string
}

export function PlanDowntimeModal({
  isOpen,
  onClose,
  onSuccess,
  productId,
  productName,
  isSerialized,
  units = [],
  initialUnitId,
}: PlanDowntimeModalProps) {
  const { user } = useAuth()
  const { showSuccessToast } = useToast()
  const [unitId, setUnitId] = useState<string>(initialUnitId ?? (units[0]?.id ?? ''))
  const [qty, setQty] = useState<number>(1)

  // Default dates: tomorrow 09:00 to 3 days later 18:00
  const getDefaultDates = () => {
    const start = new Date()
    start.setDate(start.getDate() + 1)
    start.setHours(9, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 3)
    end.setHours(18, 0, 0, 0)
    return {
      start: start.toISOString().slice(0, 16),
      end: end.toISOString().slice(0, 16),
    }
  }

  const [dateDefaults] = useState(getDefaultDates)
  const [startAt, setStartAt] = useState(dateDefaults.start)
  const [endAt, setEndAt] = useState(dateDefaults.end)
  const [reason, setReason] = useState<DowntimeReason>('Service or calibration')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (isSerialized && !unitId) {
      setErrorMessage('Please select a unit.')
      return
    }

    if (reason === 'Other' && (!notes || notes.trim().length < 3)) {
      setErrorMessage('Please provide a reason note (at least 3 characters).')
      return
    }

    if (!user) {
      setErrorMessage('You must be signed in to plan equipment downtime.')
      return
    }

    setSubmitting(true)
    try {
      const res = await planDowntime(
        {
          productId: isSerialized ? null : productId,
          assetId: isSerialized ? unitId : null,
          qty: isSerialized ? 1 : qty,
          startAt: new Date(startAt).toISOString(),
          endAt: new Date(endAt).toISOString(),
          reason,
          notes: notes.trim() || null,
        },
        { userId: user.id, role: user.role },
      )

      if (res.success) {
        showSuccessToast('Equipment downtime scheduled.')
        onSuccess()
        onClose()
      } else {
        setErrorMessage('Failed to schedule downtime.')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to schedule downtime.'
      setErrorMessage(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Plan Downtime · ${productName}`}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md, 16px)' }}>
        {errorMessage && (
          <div
            role="alert"
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--r-card, 6px)',
              background: 'var(--st-danger-bg, #fef2f2)',
              color: 'var(--danger-text, #991b1b)',
              fontSize: 'var(--t-meta, 13px)',
              fontWeight: 600,
            }}
          >
            {errorMessage}
          </div>
        )}

        {isSerialized ? (
          <div>
            <label style={{ display: 'block', fontSize: 'var(--t-meta, 13px)', fontWeight: 600, marginBottom: 6 }}>
              Select Unit
            </label>
            <select
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              disabled={submitting}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 'var(--r-card, 6px)',
                border: '1px solid var(--border, #d1d5db)',
                background: 'var(--card, #fff)',
                color: 'var(--text, #111827)',
                fontSize: 'var(--t-body, 14px)',
              }}
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  Unit {u.assetTag}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label style={{ display: 'block', fontSize: 'var(--t-meta, 13px)', fontWeight: 600, marginBottom: 6 }}>
              Quantity to Block
            </label>
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
              disabled={submitting}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 'var(--r-card, 6px)',
                border: '1px solid var(--border, #d1d5db)',
                background: 'var(--card, #fff)',
                color: 'var(--text, #111827)',
                fontSize: 'var(--t-body, 14px)',
              }}
            />
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--t-meta, 13px)', fontWeight: 600, marginBottom: 6 }}>
              Start Time
            </label>
            <input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              disabled={submitting}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 'var(--r-card, 6px)',
                border: '1px solid var(--border, #d1d5db)',
                background: 'var(--card, #fff)',
                color: 'var(--text, #111827)',
                fontSize: 'var(--t-body, 14px)',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--t-meta, 13px)', fontWeight: 600, marginBottom: 6 }}>
              End Time
            </label>
            <input
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              disabled={submitting}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 'var(--r-card, 6px)',
                border: '1px solid var(--border, #d1d5db)',
                background: 'var(--card, #fff)',
                color: 'var(--text, #111827)',
                fontSize: 'var(--t-body, 14px)',
              }}
            />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 'var(--t-meta, 13px)', fontWeight: 600, marginBottom: 6 }}>
            Downtime Reason
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {DOWNTIME_REASONS.map((r) => {
              const selected = reason === r
              return (
                <button
                  type="button"
                  key={r}
                  onClick={() => setReason(r)}
                  disabled={submitting}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--r-button, 6px)',
                    border: selected ? '2px solid var(--primary, #2563eb)' : '1px solid var(--border, #d1d5db)',
                    background: selected ? 'var(--primary-subtle, #eff6ff)' : 'var(--card, #fff)',
                    color: selected ? 'var(--primary, #2563eb)' : 'var(--text, #111827)',
                    fontWeight: selected ? 600 : 400,
                    fontSize: 'var(--t-meta, 13px)',
                    cursor: 'pointer',
                  }}
                >
                  {r}
                </button>
              )
            })}
          </div>
        </div>

        {reason === 'Other' && (
          <div>
            <label style={{ display: 'block', fontSize: 'var(--t-meta, 13px)', fontWeight: 600, marginBottom: 6 }}>
              Notes (Required for Other)
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="State the purpose of this downtime..."
              disabled={submitting}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 'var(--r-card, 6px)',
                border: '1px solid var(--border, #d1d5db)',
                background: 'var(--card, #fff)',
                color: 'var(--text, #111827)',
                fontSize: 'var(--t-body, 14px)',
              }}
            />
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={submitting}>
            {submitting ? 'Scheduling...' : 'Schedule Downtime'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
