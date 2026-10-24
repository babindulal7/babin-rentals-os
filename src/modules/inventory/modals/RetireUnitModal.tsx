import { useState, useRef } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import { retireEquipmentUnit } from '../../../actions/inventory/manageStock'
import { useAuth } from '../../../lib/auth'
import { useToast } from '../../../components/ui/Toast'
import Icon from '../../../components/ui/Icon'
import { newClientUuid } from '../../../lib/supabase'

export interface RetireUnitModalProps {
  isOpen: boolean
  unit: {
    id: string
    assetTag: string
    serialNo?: string | null | undefined
    state: string
  }
  productName: string
  onClose: () => void
  onRetired: () => void
}

const RETIREMENT_CATEGORIES = [
  'Written off',
  'Sold',
  'Disposed',
  'Lost (approved)',
  'Replaced',
  'Duplicate intake error',
] as const

const ACTIVE_HOLD_STATES = ['On Rent', 'Reserved', 'Packed', 'Returning', 'Inspection', 'Cleaning', 'Maintenance']

export function RetireUnitModal({
  isOpen,
  unit,
  productName,
  onClose,
  onRetired,
}: RetireUnitModalProps) {
  const { user } = useAuth()
  const { showSuccessToast } = useToast()
  const [category, setCategory] = useState<string>(RETIREMENT_CATEGORIES[0])
  const [notes, setNotes] = useState('')
  const [confirmTag, setConfirmTag] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submissionKeyRef = useRef<{ fingerprint: string; key: string } | null>(null)

  const isBlocked = ACTIVE_HOLD_STATES.includes(unit.state)
  const fullReason = `${category}: ${notes.trim()}`
  const reasonValid = fullReason.length >= 10 && notes.trim().length >= 4
  const tagConfirmed = confirmTag.trim() === unit.assetTag

  const handleSubmit = async () => {
    if (!user) {
      setError('Please sign in to retire equipment.')
      return
    }
    if (isBlocked) {
      setError(
        `Unit ${unit.assetTag} is currently in '${unit.state}' state and cannot be retired safely. Resolve active operational holds first.`
      )
      return
    }
    if (!tagConfirmed) {
      setError(`Type the exact asset tag ${unit.assetTag} to confirm retirement.`)
      return
    }
    if (!reasonValid) {
      setError('A detailed explanation of at least 10 characters is required.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const fingerprint = JSON.stringify({ unitId: unit.id, reason: fullReason })
      if (!submissionKeyRef.current || submissionKeyRef.current.fingerprint !== fingerprint) {
        submissionKeyRef.current = { fingerprint, key: newClientUuid() }
      }

      await retireEquipmentUnit(
        { unitId: unit.id, reason: fullReason, clientUuid: submissionKeyRef.current.key },
        { userId: user.id, role: user.role }
      )
      submissionKeyRef.current = null

      showSuccessToast(
        'Unit retired',
        `Asset ${unit.assetTag} (${productName}) has been retired and removed from active fleet inventory.`
      )
      onRetired()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Retire Unit — ${unit.assetTag}`}
      subtitle={`Permanently remove unit from active fleet. Historical records, serial numbers, and past bookings remain preserved.`}
      size="md"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleSubmit}
            disabled={saving || isBlocked || !tagConfirmed || !reasonValid}
          >
            {saving ? 'Retiring…' : 'Confirm Unit Retirement'}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'grid', gap: 'var(--sp-md, 16px)' }}>
        {isBlocked ? (
          <div
            role="alert"
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--r-btn, 8px)',
              background: 'color-mix(in srgb, var(--danger, #ef4444) 15%, var(--card))',
              border: '1px solid var(--danger)',
              color: 'var(--danger-text, #ef4444)',
              fontSize: 'var(--t-meta, 13px)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
            }}
          >
            <Icon name="alert_triangle" size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>Retirement Refused (Active Custody Hold):</strong>
              <p style={{ margin: '4px 0 0' }}>
                Unit <strong>{unit.assetTag}</strong> is currently marked <strong>{unit.state}</strong>. Units
                currently on rent, reserved, packed, returning, or undergoing cleaning/maintenance cannot be retired.
                Complete or resolve active booking movements before retiring.
              </p>
            </div>
          </div>
        ) : null}

        {error && (
          <div
            role="alert"
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--r-btn, 8px)',
              background: 'color-mix(in srgb, var(--danger, #ef4444) 15%, var(--card))',
              border: '1px solid var(--danger)',
              color: 'var(--danger-text, #ef4444)',
              fontSize: 'var(--t-meta, 13px)',
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            padding: 12,
            background: 'var(--card2)',
            borderRadius: 'var(--r-card, 8px)',
            border: '1px solid var(--border)',
            fontSize: 'var(--t-meta, 13px)',
            color: 'var(--text2)',
          }}
        >
          <div>
            <strong>Product:</strong> {productName}
          </div>
          <div>
            <strong>Asset Tag:</strong> {unit.assetTag}
          </div>
          {unit.serialNo && (
            <div>
              <strong>Serial Number:</strong> {unit.serialNo}
            </div>
          )}
          <div>
            <strong>Current State:</strong> {unit.state}
          </div>
        </div>

        {/* Reason category */}
        <label style={{ display: 'grid', gap: 6, fontWeight: 600, fontSize: 'var(--t-meta, 13px)' }}>
          Retirement Reason Category *
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={saving || isBlocked}
            style={{
              minHeight: 44,
              padding: '0 12px',
              borderRadius: 'var(--r-input, 8px)',
              border: '1px solid var(--border)',
              background: 'var(--card2)',
              color: 'var(--text)',
            }}
          >
            {RETIREMENT_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </label>

        {/* Reason detail note */}
        <label style={{ display: 'grid', gap: 6, fontWeight: 600, fontSize: 'var(--t-meta, 13px)' }}>
          Detailed Justification *
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Explain why this unit is being taken out of service (minimum 10 characters total)"
            disabled={saving || isBlocked}
            style={{
              minHeight: 80,
              padding: '10px 12px',
              borderRadius: 'var(--r-input, 8px)',
              border: '1px solid var(--border)',
              background: 'var(--card2)',
              color: 'var(--text)',
              resize: 'vertical',
            }}
          />
          <span style={{ fontSize: 'var(--t-th, 12px)', color: 'var(--muted)' }}>
            Recorded reason: {fullReason} ({fullReason.length} chars)
          </span>
        </label>

        {/* Confirmation by typing asset tag */}
        <label style={{ display: 'grid', gap: 6, fontWeight: 600, fontSize: 'var(--t-meta, 13px)' }}>
          Confirm Asset Tag *
          <input
            type="text"
            value={confirmTag}
            onChange={(e) => setConfirmTag(e.target.value)}
            placeholder={`Type "${unit.assetTag}" to confirm`}
            disabled={saving || isBlocked}
            style={{
              minHeight: 44,
              padding: '0 12px',
              borderRadius: 'var(--r-input, 8px)',
              border: '1px solid var(--border)',
              background: 'var(--card2)',
              color: 'var(--text)',
            }}
          />
        </label>
      </div>
    </Modal>
  )
}
