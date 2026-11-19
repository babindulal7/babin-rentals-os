import { useState, useEffect, useMemo, useId } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import Icon from '../../../components/ui/Icon'
import { rupees, formatMoney, type Paisa } from '../../../lib/money'
import { createCounterSale } from '../../../actions/rentals/createCounterSale'
import { useAuth } from '../../../lib/auth'
import { canViewMoney } from '../../../lib/rbac'
import { supabase } from '../../../lib/supabase'

export interface CounterSaleModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (result: { bookingId: string; bookingNo: string; invoiceId: string; totalAmount: number | null }) => void
}

interface ConsumableProduct {
  id: string
  name: string
  total_quantity: number
  rental_price?: number | null
  daily_rate?: number | null
}

interface ClientOption {
  id: string
  name: string
}

interface SelectedLine {
  productId: string
  qty: number
}

export function CounterSaleModal({
  isOpen,
  onClose,
  onSuccess,
}: CounterSaleModalProps) {
  const { user } = useAuth()
  const canSeeMoney = user?.role ? canViewMoney(user.role) : false

  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [clients, setClients] = useState<ClientOption[]>([])
  const [products, setProducts] = useState<ConsumableProduct[]>([])

  const [selectedClientId, setSelectedClientId] = useState<string>('')
  const [lines, setLines] = useState<SelectedLine[]>([])
  const [notes, setNotes] = useState<string>('')

  const clientSelectId = useId()
  const notesId = useId()

  useEffect(() => {
    if (!isOpen) {
      setSelectedClientId('')
      setLines([])
      setNotes('')
      setError(null)
      return
    }

    let active = true
    setLoading(true)
    setError(null)

    Promise.all([
      supabase.from('clients').select('id, name').order('name').limit(100),
      supabase
        .from('products')
        .select('id, name, total_quantity, rental_price, daily_rate')
        .eq('tracking_mode', 'Consumable')
        .eq('is_active', true)
        .gt('total_quantity', 0)
        .order('name'),
    ])
      .then(([clientsRes, prodsRes]) => {
        if (!active) return
        if (clientsRes.data) {
          setClients(clientsRes.data)
          const firstClient = clientsRes.data[0]
          if (firstClient) {
            setSelectedClientId((prev) => prev || firstClient.id)
          }
        }
        if (prodsRes.data) {
          const prods = prodsRes.data as ConsumableProduct[]
          setProducts(prods)
          const firstProd = prods[0]
          if (firstProd) {
            setLines([{ productId: firstProd.id, qty: 1 }])
          }
        }
      })
      .catch((err: unknown) => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Failed to load counter sale data')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [isOpen])

  const productMap = useMemo(() => {
    const map = new Map<string, ConsumableProduct>()
    for (const p of products) {
      map.set(p.id, p)
    }
    return map
  }, [products])

  const handleAddLine = () => {
    if (products.length === 0) return
    const unused = products.find((p) => !lines.some((l) => l.productId === p.id))
    const nextProd = unused ?? products[0]
    if (!nextProd) return
    setLines((prev) => [...prev, { productId: nextProd.id, qty: 1 }])
  }

  const handleRemoveLine = (idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleProductChange = (idx: number, productId: string) => {
    setLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, productId, qty: 1 } : l))
    )
  }

  const handleQtyChange = (idx: number, rawQty: number) => {
    const line = lines[idx]
    if (!line) return
    const prod = productMap.get(line.productId)
    const maxQty = prod ? prod.total_quantity : 999
    const safeQty = Math.max(1, Math.min(maxQty, Math.floor(rawQty) || 1))
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, qty: safeQty } : l)))
  }

  const totalAmountPaisa = useMemo<Paisa>(() => {
    if (!canSeeMoney) return rupees(0)
    let sum = 0
    for (const line of lines) {
      const prod = productMap.get(line.productId)
      const rate = prod?.daily_rate ?? prod?.rental_price ?? 0
      sum += Number(rate) * line.qty
    }
    return rupees(sum)
  }, [canSeeMoney, lines, productMap])

  const handleSubmit = async () => {
    if (!selectedClientId) {
      setError('Please select a client for this sale.')
      return
    }
    if (lines.length === 0) {
      setError('Please add at least one consumable item.')
      return
    }
    for (const line of lines) {
      const prod = productMap.get(line.productId)
      if (!prod) {
        setError('One or more selected items are invalid.')
        return
      }
      if (line.qty > prod.total_quantity) {
        setError(`Quantity for ${prod.name} exceeds available stock (${prod.total_quantity}).`)
        return
      }
    }

    setSubmitting(true)
    setError(null)

    try {
      if (!user) throw new Error('User session required.')
      const result = await createCounterSale(
        {
          clientId: selectedClientId,
          notes: notes.trim() || null,
          lines: lines.map((l) => ({
            productId: l.productId,
            qty: l.qty,
          })),
        },
        {
          userId: user.id,
          role: user.role,
        }
      )

      onSuccess?.({
        bookingId: result.bookingId,
        bookingNo: result.bookingNo,
        invoiceId: result.invoiceId,
        totalAmount: result.totalAmount,
      })
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to complete counter sale.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Counter Sale (Instant Desk Purchase)"
      size="md"
    >
      <div className="space-y-4 text-sm" style={{ color: 'var(--text)' }}>
        {error && (
          <div
            role="alert"
            className="p-3 rounded text-sm flex items-center gap-2"
            style={{
              background: 'var(--red-tint, rgba(239, 68, 68, 0.1))',
              color: 'var(--red, #ef4444)',
              border: '1px solid var(--red-border, rgba(239, 68, 68, 0.2))',
            }}
          >
            <Icon name="alert_triangle" size={16} />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="py-8 text-center text-secondary">
            Loading consumables and client list…
          </div>
        ) : (
          <>
            <div>
              <label
                htmlFor={clientSelectId}
                className="block text-xs font-semibold mb-1"
                style={{ color: 'var(--text-muted)' }}
              >
                Client
              </label>
              <select
                id={clientSelectId}
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="w-full px-3 py-2 rounded border text-sm"
                style={{
                  background: 'var(--card)',
                  borderColor: 'var(--border)',
                  color: 'var(--text)',
                }}
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                  Consumable Items
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddLine}
                  disabled={products.length === 0}
                >
                  <Icon name="plus" size={14} className="mr-1" />
                  Add Item
                </Button>
              </div>

              {lines.length === 0 ? (
                <div className="p-4 text-center rounded border border-dashed text-xs text-muted">
                  No items added. Click &quot;Add Item&quot; to pick a consumable.
                </div>
              ) : (
                <div className="space-y-2">
                  {lines.map((line, idx) => {
                    const prod = productMap.get(line.productId)
                    const maxStock = prod ? prod.total_quantity : 1
                    const rate = prod?.daily_rate ?? prod?.rental_price ?? 0

                    return (
                      <div
                        key={idx}
                        className="flex items-center gap-2 p-2 rounded border"
                        style={{ background: 'var(--card2)', borderColor: 'var(--border)' }}
                      >
                        <select
                          value={line.productId}
                          onChange={(e) => handleProductChange(idx, e.target.value)}
                          className="flex-1 px-2 py-1.5 rounded border text-sm"
                          style={{
                            background: 'var(--card)',
                            borderColor: 'var(--border)',
                            color: 'var(--text)',
                          }}
                        >
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.total_quantity} in stock)
                            </option>
                          ))}
                        </select>

                        <div className="flex items-center gap-1">
                          <label className="text-xs text-muted">Qty:</label>
                          <input
                            type="number"
                            min={1}
                            max={maxStock}
                            value={line.qty}
                            onChange={(e) => handleQtyChange(idx, parseInt(e.target.value, 10) || 1)}
                            className="w-16 px-2 py-1.5 rounded border text-sm text-center"
                            style={{
                              background: 'var(--card)',
                              borderColor: 'var(--border)',
                              color: 'var(--text)',
                            }}
                          />
                        </div>

                        {canSeeMoney && (
                          <div className="w-24 text-right text-xs font-mono font-medium">
                            {formatMoney(rupees(Number(rate) * line.qty))}
                          </div>
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveLine(idx)}
                          aria-label="Remove item"
                        >
                          <Icon name="x" size={14} />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {canSeeMoney && (
              <div
                className="flex items-center justify-between p-3 rounded"
                style={{ background: 'var(--card2)', border: '1px solid var(--border)' }}
              >
                <span className="font-semibold text-sm">Estimated Total (NPR):</span>
                <span className="font-mono text-base font-bold" style={{ color: 'var(--accent)' }}>
                  {formatMoney(totalAmountPaisa)}
                </span>
              </div>
            )}

            <div>
              <label
                htmlFor={notesId}
                className="block text-xs font-semibold mb-1"
                style={{ color: 'var(--text-muted)' }}
              >
                Notes (Optional)
              </label>
              <input
                id={notesId}
                type="text"
                placeholder="Walk-in purchase notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 rounded border text-sm"
                style={{
                  background: 'var(--card)',
                  borderColor: 'var(--border)',
                  color: 'var(--text)',
                }}
              />
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={submitting || loading || lines.length === 0}
          >
            {submitting ? 'Completing Sale…' : 'Complete Counter Sale'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
