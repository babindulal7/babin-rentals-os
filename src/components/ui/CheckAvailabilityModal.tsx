import { useEffect, useState, useTransition } from 'react'
import { Modal } from './Modal'
import { CalendarPopover } from './DateField'
import { formatAd } from '../../lib/bs'
import { formatMoney, rupees } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import Icon from './Icon'
import {
  fetchProductAvailabilityDetail,
  searchItemForAvailability,
  type ProductAvailabilityDetail,
} from '../../lib/queries/productAvailability'
import { listInventory } from '../../lib/queries/inventory'

export interface CheckAvailabilityProductOption {
  id: string
  name: string
  totalQuantity?: number | undefined
  dailyRate?: number | undefined
  description?: string | undefined
}

export interface CheckAvailabilityModalProps {
  open: boolean
  onClose: () => void
  productTitle?: string
  productRate?: string
  productDescription?: string
  stockOnHand?: number
  initialQuantity?: number
  initialRange?: { from: string; to: string }
  availability?: Record<string, number>
  onApplyRange?: (range: { from: string; to: string }, quantity: number) => void
  products?: CheckAvailabilityProductOption[]
  selectedProductId?: string
  onProductChange?: (productId: string) => void
}

/**
 * Check Availability Modal — reproduces the Booqable product availability
 * inspection popover with quantity selection, color-coded per-day stock badges,
 * continuous range selection, next free date calculation, and "who has it now"
 * custody breakdown (T3-22, T2-14, W91).
 */
export function CheckAvailabilityModal({
  open,
  onClose,
  productTitle,
  productRate,
  productDescription,
  stockOnHand,
  initialQuantity = 1,
  initialRange,
  availability: propAvailability,
  onApplyRange,
  products: propProducts,
  selectedProductId,
  onProductChange,
}: CheckAvailabilityModalProps) {
  const canViewMoney = useCanViewMoney()
  const [range, setRange] = useState<{ from: string; to: string }>(initialRange ?? { from: '', to: '' })
  const [qty, setQty] = useState<number>(initialQuantity)
  const [selectedId, setSelectedId] = useState<string>(selectedProductId ?? (propProducts?.[0]?.id ?? ''))
  const [searchTerm, setSearchTerm] = useState('')
  const [autoLoadedProducts, setAutoLoadedProducts] = useState<CheckAvailabilityProductOption[]>([])
  const [detail, setDetail] = useState<ProductAvailabilityDetail | null>(null)
  const [, setLoadingDetail] = useState(false)
  const [, startTransition] = useTransition()

  // Load default product list if none was provided
  useEffect(() => {
    if (!open) return
    if (propProducts && propProducts.length > 0) return

    let cancelled = false
    void (async () => {
      try {
        const inv = await listInventory({ page: { index: 0, size: 50 }, withMoney: canViewMoney })
        if (cancelled) return
        const mapped = inv.rows.map((r) => ({
          id: r.id,
          name: r.name,
          totalQuantity: r.totalQuantity,
          dailyRate: r.dailyRate ?? undefined,
          description: r.brand ? `${r.brand} ${r.model ?? ''}`.trim() : undefined,
        }))
        setAutoLoadedProducts(mapped)
        if (!selectedId && mapped.length > 0) {
          setSelectedId(mapped[0]!.id)
        }
      } catch {
        // Fallback: search-only
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, propProducts, canViewMoney, selectedId])

  // Sync selectedId with prop if it changes
  useEffect(() => {
    if (selectedProductId) {
      setSelectedId(selectedProductId)
    }
  }, [selectedProductId])

  const effectiveProducts = (propProducts && propProducts.length > 0) ? propProducts : autoLoadedProducts
  const activeProduct = effectiveProducts.find((p) => p.id === (selectedId || selectedProductId))

  // Fetch full live availability details (free units, 60-day calendar, next free date, who has it now)
  useEffect(() => {
    if (!open) return
    const targetId = selectedId || selectedProductId || effectiveProducts[0]?.id
    if (!targetId) return

    let cancelled = false
    setLoadingDetail(true)

    const window = range.from && range.to ? {
      fromAd: range.from.includes('T') ? range.from : `${range.from}T00:15:00Z`,
      toAd: range.to.includes('T') ? range.to : `${range.to}T00:15:00Z`,
    } : undefined

    void (async () => {
      try {
        const res = await fetchProductAvailabilityDetail(targetId, window, { withMoney: canViewMoney })
        if (!cancelled) {
          setDetail(res)
        }
      } catch {
        if (!cancelled) setDetail(null)
      } finally {
        if (!cancelled) setLoadingDetail(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, selectedId, selectedProductId, effectiveProducts, range.from, range.to, canViewMoney])

  // Search/scan input handler
  const handleSearchOrScan = async (query: string) => {
    setSearchTerm(query)
    const trimmed = query.trim()
    if (!trimmed) return

    try {
      const results = await searchItemForAvailability(trimmed)
      if (results && results.length > 0) {
        const top = results[0]!
        startTransition(() => {
          setSelectedId(top.id)
          onProductChange?.(top.id)
        })
      }
    } catch {
      // Continue without interrupting input
    }
  }

  if (!open) return null

  const resolvedProductName = productTitle || detail?.productName || activeProduct?.name
  const resolvedRate = productRate || (canViewMoney
    ? (detail?.dailyRate ? `${formatMoney(rupees(detail.dailyRate))} / day` : (activeProduct?.dailyRate ? `${formatMoney(rupees(activeProduct.dailyRate))} / day` : undefined))
    : undefined)
  const resolvedDesc = productDescription || detail?.productDescription || activeProduct?.description
  const resolvedStock = stockOnHand !== undefined ? stockOnHand : (detail?.unitsFree ?? activeProduct?.totalQuantity)
  const resolvedTotalStock = detail?.unitsOwned ?? activeProduct?.totalQuantity
  const effectiveAvailability = propAvailability ?? detail?.dailyAvailability

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Check availability"
      size="md"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Type or scan input (W91, T3-22) */}
        <div>
          <label
            htmlFor="check-avail-search-input"
            style={{ display: 'block', fontSize: 'var(--t-meta, 12px)', fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}
          >
            Type or scan an item
          </label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span style={{ position: 'absolute', left: 12, color: 'var(--muted)', display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
              <Icon name="search" size={15} />
            </span>
            <input
              id="check-avail-search-input"
              type="search"
              value={searchTerm}
              onChange={(e) => void handleSearchOrScan(e.target.value)}
              placeholder="Type name, serial, asset tag or scan barcode…"
              style={{
                width: '100%',
                padding: '8px 12px 8px 36px',
                borderRadius: 'var(--r-sm)',
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--text)',
                fontSize: 'var(--t-meta, 13px)',
                fontFamily: 'inherit',
                minHeight: 44,
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Product selector dropdown if products list available */}
        {effectiveProducts && effectiveProducts.length > 0 && (
          <div>
            <label
              htmlFor="check-avail-product-select"
              style={{ display: 'block', fontSize: 'var(--t-meta, 12px)', fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}
            >
              Select product
            </label>
            <select
              id="check-avail-product-select"
              value={selectedId}
              onChange={(e) => {
                const val = e.target.value
                setSelectedId(val)
                onProductChange?.(val)
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 'var(--r-sm)',
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--text)',
                fontSize: 'var(--t-meta, 13px)',
                fontFamily: 'inherit',
                minHeight: 44,
              }}
            >
              {effectiveProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.totalQuantity !== undefined ? `(${p.totalQuantity} total)` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Product meta header & Next Free Date */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {resolvedProductName && (
            <h4 style={{ margin: '0 0 2px', fontSize: 'var(--t-ui, 16px)', fontWeight: 700, color: 'var(--text)' }}>
              {resolvedProductName}
            </h4>
          )}
          {resolvedRate && (
            <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
              {resolvedRate}
            </div>
          )}
          {resolvedDesc && (
            <p style={{ margin: '0 0 6px', fontSize: 'var(--t-meta, 13px)', color: 'var(--text2)', lineHeight: 1.5 }}>
              {resolvedDesc}
            </p>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            {resolvedStock !== undefined && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '4px 10px',
                  borderRadius: 'var(--r-full, 9999px)',
                  background: (resolvedStock >= qty) ? 'var(--badge-success-bg, rgba(72, 187, 120, 0.15))' : 'var(--badge-danger-bg, rgba(229, 62, 62, 0.15))',
                  color: (resolvedStock >= qty) ? 'var(--success-text, #22543d)' : 'var(--danger-text, #9b2c2c)',
                  fontSize: 'var(--t-meta, 12px)',
                  fontWeight: 700,
                }}
              >
                {resolvedTotalStock !== undefined && resolvedTotalStock !== resolvedStock
                  ? `${resolvedStock} of ${resolvedTotalStock} available`
                  : `${resolvedStock} available`}
              </span>
            )}

            {/* Next Free Date badge (T3-22) */}
            {detail?.nextFreeDate?.date && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 10px',
                  borderRadius: 'var(--r-full, 9999px)',
                  background: detail.nextFreeDate.isAvailableNow ? 'var(--surface-2)' : 'rgba(232, 118, 45, 0.15)',
                  color: detail.nextFreeDate.isAvailableNow ? 'var(--text2)' : 'var(--warn-text)',
                  fontSize: 'var(--t-meta, 12px)',
                  fontWeight: 600,
                }}
              >
                <Icon name="calendar" size={13} />
                <span>
                  Next free: {detail.nextFreeDate.isAvailableNow ? 'Today (Available now)' : `${detail.nextFreeDate.date} (${detail.nextFreeDate.relativeDays}d)`}
                </span>
              </span>
            )}

            {detail?.heldBy && detail.heldBy.length > 0 && (
              <span style={{ fontSize: 'var(--t-meta, 12px)', color: 'var(--muted)' }}>
                Held by {detail.heldBy.join(', ')}
              </span>
            )}
          </div>
        </div>

        {/* Embedded Calendar Popover with full height document flow */}
        <div style={{ width: '100%' }}>
          <CalendarPopover
            title="Check availability"
            range={range}
            onSelectRange={setRange}
            quantity={qty}
            onQuantityChange={setQty}
            showQuantity={true}
            availability={effectiveAvailability}
            onDismiss={onClose}
            clearable={true}
            embedded={true}
            showHeader={false}
          />
        </div>

        {/* Who has it now (T3-22, T2-14) */}
        {detail && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <div style={{ fontSize: 'var(--t-meta, 12px)', fontWeight: 700, color: 'var(--text2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Who has it now
            </div>
            {detail.whoHasItNow && detail.whoHasItNow.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {detail.whoHasItNow.map((custody, idx) => (
                  <div
                    key={`${custody.bookingId}-${idx}`}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 'var(--r-sm)',
                      background: 'var(--card2)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: 'var(--t-meta, 12px)',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontWeight: 700, color: 'var(--text)' }}>
                          {custody.clientName}
                        </span>
                        <a
                          href={`/rentals/${custody.bookingId}`}
                          style={{
                            color: 'var(--primary-text)',
                            textDecoration: 'none',
                            fontWeight: 600,
                          }}
                        >
                          #{custody.bookingNo}
                        </a>
                        <span
                          style={{
                            padding: '1px 5px',
                            borderRadius: 4,
                            fontSize: '10px',
                            fontWeight: 600,
                            background: 'var(--surface-2)',
                            color: 'var(--text2)',
                          }}
                        >
                          {custody.stage}
                        </span>
                      </div>
                      <div style={{ color: 'var(--muted)', display: 'flex', gap: 8, fontSize: '11px' }}>
                        {custody.unitAssetTag && <span>Tag: {custody.unitAssetTag}</span>}
                        {custody.unitSerial && <span>SN: {custody.unitSerial}</span>}
                        {custody.qty !== undefined && <span>Qty: {custody.qty}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span
                        style={{
                          fontWeight: 700,
                          color: custody.isOverdue ? 'var(--danger-text)' : 'var(--warn-text)',
                        }}
                      >
                        {custody.countdownText}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 'var(--t-meta, 13px)', color: 'var(--success-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="check" size={15} />
                <span>All units currently In Stock in warehouse</span>
              </div>
            )}
          </div>
        )}

        {/* Selected range feedback */}
        {range.from && range.to && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--r-sm)',
              background: 'var(--card2)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 'var(--t-meta, 13px)',
            }}
          >
            <div>
              <span style={{ color: 'var(--muted)', marginRight: 6 }}>Selected:</span>
              <span style={{ fontWeight: 700, color: 'var(--text)' }}>
                {range.from === range.to
                  ? formatAd(new Date(range.from))
                  : `${formatAd(new Date(range.from))} → ${formatAd(new Date(range.to))}`}
              </span>
            </div>
            {onApplyRange && (
              <button
                type="button"
                className="press"
                onClick={() => {
                  onApplyRange(range, qty)
                  onClose()
                }}
                style={{
                  padding: '6px 14px',
                  borderRadius: 'var(--r-sm)',
                  border: 'none',
                  background: 'var(--btn-primary-bg, #3182ce)',
                  color: 'var(--btn-primary-fg, #ffffff)',
                  fontSize: 'var(--t-meta, 13px)',
                  fontWeight: 700,
                  cursor: 'pointer',
                  minHeight: 44,
                }}
              >
                Apply Range
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
