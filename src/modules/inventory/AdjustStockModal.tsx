import { useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { adjustStock } from '../../actions/inventory/adjustStock'
import { useAuth } from '../../lib/auth'
import { formatGateError } from '../../lib/gates'
import { newClientUuid } from '../../lib/supabase'
import { useToast } from '../../components/ui/Toast'

export function AdjustStockModal({
  productId,
  productName,
  currentQuantity,
  onClose,
  onAdjusted,
}: {
  productId: string
  productName: string
  currentQuantity: number
  onClose: () => void
  onAdjusted: () => void
}) {
  const { user } = useAuth()
  const { showSuccessToast } = useToast()
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('')
  const [clientUuid] = useState(newClientUuid)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const quantityDelta = Number(delta)
  const isValidDelta = Number.isSafeInteger(quantityDelta) && quantityDelta !== 0
  const projectedQuantity = currentQuantity + (isValidDelta ? quantityDelta : 0)
  const isReasonValid = reason.trim().length >= 10

  const submit = async () => {
    if (!isValidDelta) {
      setError('Enter a non-zero whole number, with + to add or − to remove stock.')
      return
    }
    if (projectedQuantity < 0) {
      setError(`Adjustment of ${quantityDelta} would take stock below zero (current: ${currentQuantity}).`)
      return
    }
    if (!isReasonValid) {
      setError('Adjustment requires an explanation of at least ten characters.')
      return
    }
    if (!user) {
      setError('Sign in before adjusting stock.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const result = await adjustStock(
        { productId, delta: quantityDelta, reason: reason.trim(), clientUuid },
        { userId: user.id, role: user.role }
      )
      showSuccessToast(
        'Stock adjusted',
        `${productName}: stock changed from ${result.quantityBefore} to ${result.quantityAfter} (${quantityDelta > 0 ? `+${quantityDelta}` : quantityDelta}).`
      )
      onAdjusted()
      onClose()
    } catch (cause: unknown) {
      setError(formatGateError(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Adjust Stock — ${productName}`}
      subtitle={`Audited quantity correction for non-serialized inventory.`}
      size="md"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            disabled={saving || !isValidDelta || !isReasonValid || projectedQuantity < 0}
          >
            {saving ? 'Adjusting…' : 'Record Adjustment'}
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
              border: '1px solid var(--danger)',
              borderRadius: 'var(--r-btn, 8px)',
              background: 'var(--st-danger-bg)',
              color: 'var(--st-danger-fg)',
              fontSize: 'var(--t-meta, 13px)',
            }}
          >
            {error}
          </div>
        )}

        {/* Stock Ledger Projection Box */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
            padding: '14px 16px',
            background: 'var(--card2)',
            borderRadius: 'var(--r-card, 8px)',
            border: '1px solid var(--border)',
            textAlign: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>
              Current Stock
            </div>
            <div className="figure" style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text)' }}>
              {currentQuantity}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>
              Change (Delta)
            </div>
            <div
              className="figure"
              style={{
                fontSize: '1.4rem',
                fontWeight: 700,
                color: isValidDelta ? (quantityDelta > 0 ? 'var(--success-text)' : 'var(--danger-text)') : 'var(--muted)',
              }}
            >
              {isValidDelta ? (quantityDelta > 0 ? `+${quantityDelta}` : String(quantityDelta)) : '—'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>
              New Projected
            </div>
            <div
              className="figure"
              style={{
                fontSize: '1.4rem',
                fontWeight: 700,
                color: projectedQuantity < 0 ? 'var(--danger-text)' : 'var(--link)',
              }}
            >
              {isValidDelta ? projectedQuantity : currentQuantity}
            </div>
          </div>
        </div>

        <label style={{ display: 'grid', gap: 6, color: 'var(--text)', fontWeight: 600, fontSize: 'var(--t-meta, 13px)' }}>
          Quantity Change (+ to add, − to deduct) <span style={{ color: 'var(--danger)' }}>*</span>
          <input
            type="number"
            inputMode="numeric"
            step="1"
            value={delta}
            onChange={(event) => setDelta(event.target.value)}
            placeholder="e.g. +5 or -2"
            disabled={saving}
            style={{
              minHeight: 44,
              padding: '0 12px',
              borderRadius: 'var(--r-btn, 8px)',
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--text)',
            }}
          />
        </label>

        <label style={{ display: 'grid', gap: 6, color: 'var(--text)', fontWeight: 600, fontSize: 'var(--t-meta, 13px)' }}>
          Mandatory Audit Reason (10 chars minimum) <span style={{ color: 'var(--danger)' }}>*</span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            placeholder="Explain what changed, supplier restock reference, or physical inventory count discrepancy"
            disabled={saving}
            style={{
              minHeight: 80,
              padding: '10px 12px',
              borderRadius: 'var(--r-btn, 8px)',
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--text)',
              resize: 'vertical',
            }}
          />
          <span style={{ fontSize: '11px', color: reason.trim().length >= 10 ? 'var(--success-text)' : 'var(--muted)' }}>
            {reason.trim().length} / 10 characters minimum
          </span>
        </label>
      </div>
    </Modal>
  )
}
