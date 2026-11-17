import { useEffect, useMemo, useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import Icon from '../../../components/ui/Icon'
import { supabase, newClientUuid } from '../../../lib/supabase'
import { canViewMoney } from '../../../lib/rbac'
import { formatMoney, type Paisa } from '../../../lib/money'
import { addConsumableLine } from '../../../actions/rentals/addConsumableLine'
import { useToast } from '../../../components/ui/Toast'
import type { SystemRole } from '../../../types/database'

export interface ConsumableProductOption {
  id: string
  name: string
  assetCode: string
  unitSalePrice: Paisa | null
  totalQuantity: number
}

export interface AddConsumableModalProps {
  isOpen: boolean
  onClose: () => void
  bookingId: string
  userId: string
  userRole: SystemRole
  onAdded?: () => void
  defaultNote?: string
}

export function AddConsumableModal({
  isOpen,
  onClose,
  bookingId,
  userId,
  userRole,
  onAdded,
  defaultNote,
}: AddConsumableModalProps) {
  const { showSuccessToast } = useToast()
  const isMoney = canViewMoney(userRole)

  const [products, setProducts] = useState<ConsumableProductOption[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [selectedProductId, setSelectedProductId] = useState<string>('')
  const [qty, setQty] = useState<number>(1)
  const [note, setNote] = useState<string>(() => defaultNote ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Law 8: Idempotency client UUID preserved across retry attempts for the same action
  const [clientUuid] = useState<string>(() => newClientUuid())

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return products
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.assetCode.toLowerCase().includes(q)
    )
  }, [products, searchQuery])

  useEffect(() => {
    if (!isOpen) return
    if (defaultNote !== undefined) {
      setNote(defaultNote)
    }
    let active = true
    setLoadingProducts(true)
    setError(null)

    void (async () => {
      try {
        const { data, error: err } = await supabase
          .from('products_v')
          .select('id, name, asset_code, unit_sale_price, total_quantity')
          .eq('tracking_mode', 'Consumable')
          .eq('is_active', true)
          .order('name')

        if (!active) return
        if (err) throw err

        const rows: ConsumableProductOption[] = (data ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          assetCode: p.asset_code ?? '',
          unitSalePrice: p.unit_sale_price != null ? (Math.round(Number(p.unit_sale_price) * 100) as Paisa) : null,
          totalQuantity: Number(p.total_quantity ?? 0),
        }))

        setProducts(rows)
        if (rows.length > 0) {
          setSelectedProductId((prev) => (prev ? prev : (rows[0]?.id ?? '')))
        }
      } catch (e: unknown) {
        if (!active) return
        setError(e instanceof Error ? e.message : 'Could not load consumable products.')
      } finally {
        if (active) setLoadingProducts(false)
      }
    })()

    return () => {
      active = false
    }
  }, [isOpen, defaultNote])

  const selectedProduct = products.find((p) => p.id === selectedProductId)

  const handleQtyChange = (val: number) => {
    if (val < 1) return
    setQty(Math.floor(val))
  }

  const handleSubmit = async () => {
    if (!selectedProductId) {
      setError('Select a consumable product to add.')
      return
    }
    if (qty < 1) {
      setError('Quantity must be at least 1.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const result = await addConsumableLine(
        {
          bookingId,
          productId: selectedProductId,
          qty,
          lineNote: note.trim() || null,
          clientUuid,
        },
        { userId, role: userRole },
      )

      showSuccessToast(
        'Consumable added',
        `Added ${qty} × ${result.productName || selectedProduct?.name || 'item'} to this booking.`,
      )
      onAdded?.()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to add consumable line.')
    } finally {
      setSubmitting(false)
    }
  }

  const unitPricePaisa = selectedProduct?.unitSalePrice ?? null
  const lineTotalPaisa = unitPricePaisa != null ? ((unitPricePaisa * qty) as Paisa) : null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Consumable to Booking"
      subtitle="Sale item charged once per unit (qty × unit price, not multiplied by rental days)"
      size="md"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={submitting || loadingProducts || !selectedProductId || qty < 1}
          >
            {submitting ? 'Adding…' : 'Add Consumable'}
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

        {/* Product selector & search */}
        <div>
          <label
            htmlFor="consumable-search-input"
            style={{ display: 'block', fontSize: 'var(--t-meta, 13px)', fontWeight: 600, marginBottom: 6 }}
          >
            Consumable Item
          </label>
          {loadingProducts ? (
            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>Loading consumable items…</div>
          ) : products.length === 0 ? (
            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--warn-text)' }}>
              No active consumable products found in inventory.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              <input
                id="consumable-search-input"
                type="search"
                placeholder="Search by name or code (e.g. tape, battery)…"
                value={searchQuery}
                onChange={(e) => {
                  const q = e.target.value
                  setSearchQuery(q)
                  const filtered = products.filter(
                    (p) =>
                      p.name.toLowerCase().includes(q.toLowerCase()) ||
                      p.assetCode.toLowerCase().includes(q.toLowerCase())
                  )
                  if (filtered.length > 0 && !filtered.some((p) => p.id === selectedProductId)) {
                    setSelectedProductId(filtered[0]?.id ?? '')
                  }
                }}
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 'var(--r-btn, 6px)',
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                  color: 'var(--text)',
                  fontSize: 'var(--t-body, 14px)',
                  minHeight: 40,
                }}
              />
              <select
                id="consumable-product-select"
                aria-label="Select consumable item"
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                disabled={submitting || filteredProducts.length === 0}
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
              >
                {filteredProducts.length === 0 ? (
                  <option value="">No matching consumables found</option>
                ) : (
                  filteredProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.assetCode ? `(${p.assetCode})` : ''} · In stock: {p.totalQuantity}
                      {isMoney && p.unitSalePrice != null ? ` · ${formatMoney(p.unitSalePrice)} / unit` : ''}
                    </option>
                  ))
                )}
              </select>
            </div>
          )}
        </div>

        {/* Quantity control */}
        <div>
          <label
            htmlFor="consumable-qty-input"
            style={{ display: 'block', fontSize: 'var(--t-meta, 13px)', fontWeight: 600, marginBottom: 6 }}
          >
            Quantity
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button
              variant="secondary"
              type="button"
              onClick={() => handleQtyChange(qty - 1)}
              disabled={submitting || qty <= 1}
              style={{ minWidth: 44, minHeight: 44, padding: 0 }}
              aria-label="Decrease quantity"
            >
              −
            </Button>
            <input
              id="consumable-qty-input"
              type="number"
              min={1}
              step={1}
              value={qty}
              onChange={(e) => handleQtyChange(parseInt(e.target.value, 10) || 1)}
              disabled={submitting}
              style={{
                width: 80,
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
              disabled={submitting}
              style={{ minWidth: 44, minHeight: 44, padding: 0 }}
              aria-label="Increase quantity"
            >
              +
            </Button>
            {selectedProduct && (
              <span style={{ fontSize: 'var(--t-meta, 13px)', color: 'var(--muted)', marginLeft: 8 }}>
                Available in stock: <strong className="figure">{selectedProduct.totalQuantity}</strong>
              </span>
            )}
          </div>
        </div>

        {/* Law 6: Pricing summary ONLY visible to non-money-blind roles */}
        {isMoney && unitPricePaisa != null && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--r-btn, 6px)',
              background: 'var(--card2)',
              border: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: 'var(--t-meta, 12px)', color: 'var(--muted)' }}>Pricing (1-time unit sale)</div>
              <div style={{ fontSize: 'var(--t-body, 14px)' }}>
                {qty} × {formatMoney(unitPricePaisa)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 'var(--t-meta, 12px)', color: 'var(--muted)' }}>Line Total</div>
              <div style={{ fontSize: 'var(--t-h3, 16px)', fontWeight: 700, color: 'var(--text)' }}>
                {lineTotalPaisa != null ? formatMoney(lineTotalPaisa) : '—'}
              </div>
            </div>
          </div>
        )}

        {/* Optional note */}
        <div>
          <label
            htmlFor="consumable-note-input"
            style={{ display: 'block', fontSize: 'var(--t-meta, 13px)', fontWeight: 600, marginBottom: 6 }}
          >
            Line Note (Optional)
          </label>
          <input
            id="consumable-note-input"
            type="text"
            placeholder="e.g. Added on set, floor addition, backup roll"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={submitting}
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
      </div>
    </Modal>
  )
}
