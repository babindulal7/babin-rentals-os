import { useEffect, useMemo, useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import Icon from '../../components/ui/Icon'
import { supabase, newClientUuid } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { canViewMoney } from '../../lib/rbac'
import { formatMoney, type Paisa } from '../../lib/money'
import { createCounterSale } from '../../actions/sales/createCounterSale'
import { useToast } from '../../components/ui/Toast'
import type { SystemRole } from '../../types/database'

export interface ConsumableItem {
  id: string
  name: string
  assetCode: string
  unitSalePrice: Paisa | null
  totalQuantity: number
}

export interface SelectedSaleItem {
  product: ConsumableItem
  qty: number
}

export interface CounterSaleModalProps {
  isOpen: boolean
  onClose: () => void
  userId?: string | undefined
  userRole?: SystemRole | undefined
  onSuccess?: (() => void) | undefined
  onSaleCreated?: ((result: { bookingId: string; bookingNo: string; invoiceId?: string | undefined }) => void) | undefined
}

export function CounterSaleModal({
  isOpen,
  onClose,
  userId,
  userRole,
  onSuccess,
  onSaleCreated,
}: CounterSaleModalProps) {
  const auth = useAuth()
  const effectiveUserId = userId ?? auth.user?.id ?? '00000000-0000-0000-0000-000000000001'
  const effectiveUserRole = userRole ?? (auth.user?.role as SystemRole | undefined) ?? 'Owner'
  const { showSuccessToast } = useToast()
  const isMoney = canViewMoney(effectiveUserRole)

  const [products, setProducts] = useState<ConsumableItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdResult, setCreatedResult] = useState<{
    bookingId: string
    bookingNo: string
    invoiceId?: string | undefined
    totalAmountPaisa?: number | undefined
  } | null>(null)

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
    let active = true
    setLoading(true)
    setError(null)
    setCreatedResult(null)
    setSelectedItems({})

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

        const rows: ConsumableItem[] = (data ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          assetCode: p.asset_code ?? '',
          unitSalePrice:
            p.unit_sale_price != null ? (Math.round(Number(p.unit_sale_price) * 100) as Paisa) : null,
          totalQuantity: Number(p.total_quantity ?? 0),
        }))

        setProducts(rows)
      } catch (e: unknown) {
        if (!active) return
        setError(e instanceof Error ? e.message : 'Could not load consumable products.')
      } finally {
        if (active) setLoading(false)
      }
    })()

    return () => {
      active = false
    }
  }, [isOpen])

  const setItemQty = (productId: string, qty: number) => {
    setSelectedItems((prev) => {
      const next = { ...prev }
      if (qty <= 0) {
        delete next[productId]
      } else {
        next[productId] = qty
      }
      return next
    })
  }

  const selectedCount = Object.values(selectedItems).reduce((sum, q) => sum + q, 0)

  const totalPaisa = useMemo(() => {
    if (!isMoney) return null
    let sum = 0
    for (const [pId, qty] of Object.entries(selectedItems)) {
      const prod = products.find((p) => p.id === pId)
      if (prod && prod.unitSalePrice != null) {
        sum += prod.unitSalePrice * qty
      }
    }
    // With standard 13% VAT
    return Math.round(sum * 1.13) as Paisa
  }, [isMoney, selectedItems, products])

  const handleSubmit = async () => {
    const lines = Object.entries(selectedItems)
      .filter(([_, qty]) => qty > 0)
      .map(([productId, qty]) => ({ productId, qty }))

    if (lines.length === 0) {
      setError('Select at least one consumable item to sell.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const res = await createCounterSale(
        {
          clientUuid,
          lines,
        },
        { userId: effectiveUserId, role: effectiveUserRole }
      )

      showSuccessToast(
        'Counter Sale Created',
        `Sale ${res.bookingNo} created (${lines.length} items). Stock updated.`
      )

      setCreatedResult({
        bookingId: res.bookingId,
        bookingNo: res.bookingNo,
        invoiceId: res.invoiceId,
        totalAmountPaisa: res.totalAmountPaisa,
      })

      onSaleCreated?.({
        bookingId: res.bookingId,
        bookingNo: res.bookingNo,
        invoiceId: res.invoiceId,
      })
      onSuccess?.()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create counter sale.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Counter Sale"
      subtitle="Walk-in consumable sale (instant stock deduction, draft invoice)"
      size="lg"
      footer={
        createdResult ? (
          <div className="flex w-full items-center justify-end gap-2">
            <Button variant="secondary" onClick={onClose} style={{ minHeight: '44px' }}>
              Done
            </Button>
          </div>
        ) : (
          <div className="flex w-full items-center justify-between gap-4">
            <div className="text-sm">
              <span className="font-semibold text-gray-700 dark:text-gray-200">
                {selectedCount} item{selectedCount === 1 ? '' : 's'} selected
              </span>
              {isMoney && totalPaisa != null && selectedCount > 0 && (
                <span className="ml-3 font-mono font-bold text-gray-900 dark:text-white">
                  Total: {formatMoney(totalPaisa)} (incl. VAT)
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={onClose} disabled={submitting} style={{ minHeight: '44px' }}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => void handleSubmit()}
                disabled={submitting || selectedCount === 0 || loading}
                loading={submitting}
                style={{ minHeight: '56px' }}
                icon={<Icon name="package" size={20} />}
              >
                Complete Counter Sale
              </Button>
            </div>
          </div>
        )
      }
    >
      <div className="space-y-4">
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
          >
            <Icon name="alert_triangle" size={18} className="mt-0.5 shrink-0 text-red-600" />
            <div className="flex-1">{error}</div>
          </div>
        )}

        {createdResult ? (
          <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
            <div className="flex items-center gap-2 font-semibold">
              <Icon name="check" size={20} className="text-emerald-600 dark:text-emerald-400" />
              <span>Counter Sale {createdResult.bookingNo} Recorded</span>
            </div>
            <p className="text-sm text-emerald-800 dark:text-emerald-300">
              Stock has been deducted immediately. Hand over the items to the walk-in client.
              {isMoney ? (
                <> Draft invoice created. Collect payment at the desk to finalize and number the invoice.</>
              ) : (
                <> Floor handover complete. Payment will be processed at the front desk.</>
              )}
            </p>
          </div>
        ) : (
          <>
            <div>
              <label
                htmlFor="counter-sale-search"
                className="block text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
              >
                Search Consumables
              </label>
              <div className="relative mt-1">
                <input
                  id="counter-sale-search"
                  type="text"
                  placeholder="Filter by name or code (e.g. Battery, Tape)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  style={{ minHeight: '44px' }}
                />
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center p-8 text-sm text-gray-500">
                <Icon name="refresh" size={18} className="mr-2 animate-spin" />
                Loading consumable catalogue...
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700">
                No active consumables found matching your search.
              </div>
            ) : (
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {filteredProducts.map((p) => {
                  const qty = selectedItems[p.id] ?? 0
                  const isOutOfStock = p.totalQuantity <= 0

                  return (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                        qty > 0
                          ? 'border-blue-300 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20'
                          : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {p.name}
                          </span>
                          <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
                            {p.assetCode}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                          <span>Stock: {p.totalQuantity} available</span>
                          {isMoney && p.unitSalePrice != null && (
                            <span className="font-mono text-gray-700 dark:text-gray-300">
                              Unit: {formatMoney(p.unitSalePrice)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {qty > 0 && (
                          <button
                            type="button"
                            onClick={() => setItemQty(p.id, qty - 1)}
                            className="flex h-11 w-11 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                            aria-label={`Decrease quantity of ${p.name}`}
                          >
                            <Icon name="minus" size={16} />
                          </button>
                        )}
                        {qty > 0 && (
                          <span className="w-8 text-center font-mono text-sm font-bold text-gray-900 dark:text-white">
                            {qty}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setItemQty(p.id, qty + 1)}
                          disabled={isOutOfStock || qty >= p.totalQuantity}
                          className="flex h-11 min-w-[44px] items-center justify-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                          aria-label={`Add or increase quantity of ${p.name}`}
                        >
                          <Icon name="plus" size={16} className={qty > 0 ? '' : 'mr-1'} />
                          {qty === 0 && 'Add'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
