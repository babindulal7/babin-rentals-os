import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import Icon from '../../../components/ui/Icon'
import { restockConsumable } from '../../../actions/inventory/restockConsumable'
import { canViewMoney } from '../../../lib/rbac'
import { newClientUuid } from '../../../lib/supabase'
import { useToast } from '../../../components/ui/Toast'
import type { SystemRole } from '../../../types/database'

export interface RestockConsumableModalProps {
  isOpen: boolean
  onClose: () => void
  productId: string
  productName: string
  currentQuantity: number
  userId: string
  userRole: SystemRole
  onRestocked?: () => void
}

export function RestockConsumableModal({
  isOpen,
  onClose,
  productId,
  productName,
  currentQuantity,
  userId,
  userRole,
  onRestocked,
}: RestockConsumableModalProps) {
  const { showSuccessToast } = useToast()
  const isMoney = canViewMoney(userRole)

  const [qty, setQty] = useState<number>(10)
  const [supplier, setSupplier] = useState<string>('')
  const [cost, setCost] = useState<string>('')
  const [receivedDate, setReceivedDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [clientUuid] = useState<string>(() => newClientUuid())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleQtyChange = (val: number) => {
    if (val < 1) return
    setQty(Math.floor(val))
  }

  const handleSubmit = async () => {
    if (!Number.isSafeInteger(qty) || qty <= 0) {
      setError('Restock quantity must be a positive whole number.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const parsedCost = isMoney && cost.trim() !== '' ? parseFloat(cost) : null
      if (parsedCost !== null && (isNaN(parsedCost) || parsedCost < 0)) {
        setError('Cost must be a positive number or left blank.')
        setSaving(false)
        return
      }

      const result = await restockConsumable(
        {
          productId,
          qty,
          supplier: supplier.trim() || null,
          cost: parsedCost,
          receivedDate: receivedDate || null,
          clientUuid,
        },
        { userId, role: userRole },
      )

      showSuccessToast(
        'Stock Added',
        `${productName}: stock increased from ${result.quantityBefore} to ${result.quantityAfter} (+${qty}).`,
      )
      onRestocked?.()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to record restock.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Add Stock / Restock — ${productName}`}
      subtitle="Append-only restock movement. Quantity will be added to available inventory."
      size="md"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={saving || !Number.isSafeInteger(qty) || qty <= 0}
          >
            {saving ? 'Adding Stock…' : 'Record Restock'}
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
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Icon name="alert_circle" size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Current quantity info */}
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--r-btn, 6px)',
            background: 'var(--card2)',
            border: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 'var(--t-meta, 13px)',
          }}
        >
          <span>Current stock on hand:</span>
          <strong className="figure" style={{ fontSize: 'var(--t-body, 14px)' }}>
            {currentQuantity} units
          </strong>
        </div>

        {/* Quantity added */}
        <div>
          <label
            htmlFor="restock-qty-input"
            style={{ display: 'block', fontSize: 'var(--t-meta, 13px)', fontWeight: 600, marginBottom: 6 }}
          >
            Quantity Received
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button
              variant="secondary"
              type="button"
              onClick={() => handleQtyChange(qty - 1)}
              disabled={saving || qty <= 1}
              style={{ minWidth: 44, minHeight: 44, padding: 0 }}
              aria-label="Decrease quantity"
            >
              −
            </Button>
            <input
              id="restock-qty-input"
              type="number"
              min={1}
              step={1}
              value={qty}
              onChange={(e) => handleQtyChange(parseInt(e.target.value, 10) || 1)}
              disabled={saving}
              style={{
                width: 90,
                textAlign: 'center',
                padding: '8px 12px',
                borderRadius: 'var(--r-btn, 6px)',
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--text)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--t-body, 14px)',
                minHeight: 44,
              }}
            />
            <Button
              variant="secondary"
              type="button"
              onClick={() => handleQtyChange(qty + 1)}
              disabled={saving}
              style={{ minWidth: 44, minHeight: 44, padding: 0 }}
              aria-label="Increase quantity"
            >
              +
            </Button>
            <span style={{ fontSize: 'var(--t-meta, 13px)', color: 'var(--muted)', marginLeft: 8 }}>
              New total will be: <strong className="figure">{currentQuantity + (qty > 0 ? qty : 0)}</strong>
            </span>
          </div>
        </div>

        {/* Supplier */}
        <div>
          <label
            htmlFor="restock-supplier-input"
            style={{ display: 'block', fontSize: 'var(--t-meta, 13px)', fontWeight: 600, marginBottom: 6 }}
          >
            Supplier / Vendor (Optional)
          </label>
          <input
            id="restock-supplier-input"
            type="text"
            placeholder="e.g. Kathmandu Cine Supplies, B&H, Local Hardware"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            disabled={saving}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 'var(--r-btn, 6px)',
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--text)',
              fontSize: 'var(--t-body, 14px)',
              minHeight: 44,
            }}
          />
        </div>

        {/* Received Date */}
        <div>
          <label
            htmlFor="restock-date-input"
            style={{ display: 'block', fontSize: 'var(--t-meta, 13px)', fontWeight: 600, marginBottom: 6 }}
          >
            Received Date
          </label>
          <input
            id="restock-date-input"
            type="date"
            value={receivedDate}
            onChange={(e) => setReceivedDate(e.target.value)}
            disabled={saving}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 'var(--r-btn, 6px)',
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--text)',
              fontSize: 'var(--t-body, 14px)',
              minHeight: 44,
            }}
          />
        </div>

        {/* Law 6: Cost per unit ONLY rendered for non-money-blind roles */}
        {isMoney && (
          <div>
            <label
              htmlFor="restock-cost-input"
              style={{ display: 'block', fontSize: 'var(--t-meta, 13px)', fontWeight: 600, marginBottom: 6 }}
            >
              Cost Per Unit (Rs. · Optional)
            </label>
            <input
              id="restock-cost-input"
              type="number"
              min={0}
              step="0.01"
              placeholder="e.g. 450.00"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              disabled={saving}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 'var(--r-btn, 6px)',
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--text)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--t-body, 14px)',
                minHeight: 44,
              }}
            />
          </div>
        )}
      </div>
    </Modal>
  )
}
