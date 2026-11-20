import React from 'react'
import type { CatalogueItem } from '../lib/catalogueApi'
import { formatMoney, type Paisa } from '@/lib/money'
import { trackStoreEvent } from '@/lib/storeAnalytics'

export interface CartLine {
  item: CatalogueItem
  quantity: number
}

interface CartDrawerProps {
  isOpen: boolean
  onClose: () => void
  items: CartLine[]
  startDate: string
  endDate: string
  onUpdateQty: (itemId: string, delta: number) => void
  onRemoveItem: (itemId: string) => void
  onClearCart: () => void
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  items,
  startDate,
  endDate,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
}) => {
  if (!isOpen) return null

  // Calculate rental days (minimum 1 day)
  let rentalDays = 1
  if (startDate && endDate) {
    const s = new Date(startDate).getTime()
    const e = new Date(endDate).getTime()
    if (e > s) {
      rentalDays = Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)))
    }
  }

  // Calculate totals in integer paisa
  const subtotalPaisa = items.reduce((acc, line) => {
    return acc + line.item.daily_rate_paisa * line.quantity * rentalDays
  }, 0)

  // 13% VAT in Nepal
  const vatPaisa = Math.round(subtotalPaisa * 0.13)
  const totalPaisa = subtotalPaisa + vatPaisa

  return (
    <div
      className="cart-drawer-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cart-drawer-title"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="cart-drawer">
        <div className="cart-header">
          <div>
            <h2 id="cart-drawer-title" style={{ fontSize: '1.2rem', fontWeight: 700 }}>
              Booking Request Cart
            </h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {startDate && endDate ? `${startDate} to ${endDate} (${rentalDays} day${rentalDays > 1 ? 's' : ''})` : 'Dates not chosen'}
            </span>
          </div>
          <button
            type="button"
            className="modal-close"
            style={{ position: 'static' }}
            onClick={onClose}
            aria-label="Close cart drawer"
          >
            ×
          </button>
        </div>

        <div className="cart-items">
          {items.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px 10px' }}>
              <p style={{ fontSize: '1.1rem', marginBottom: 8 }}>Your request cart is empty.</p>
              <span style={{ fontSize: '0.85rem' }}>Select gear from the catalogue to request a booking.</span>
            </div>
          ) : (
            items.map((line) => (
              <div key={line.item.id} className="cart-item">
                <div style={{ flex: 1, marginRight: 12 }}>
                  <strong style={{ display: 'block', fontSize: '0.95rem', color: 'var(--text-main)', marginBottom: 2 }}>
                    {line.item.name}
                  </strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {formatMoney(line.item.daily_rate_paisa as Paisa)} / day
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => onUpdateQty(line.item.id, -1)}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-main)',
                      cursor: 'pointer',
                      fontWeight: 700,
                    }}
                    aria-label={`Decrease quantity of ${line.item.name}`}
                  >
                    -
                  </button>
                  <span style={{ fontFamily: 'var(--font-mono)', minWidth: 20, textAlign: 'center', fontWeight: 700 }}>
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => onUpdateQty(line.item.id, 1)}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-main)',
                      cursor: 'pointer',
                      fontWeight: 700,
                    }}
                    aria-label={`Increase quantity of ${line.item.name}`}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveItem(line.item.id)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--rose-text)',
                      cursor: 'pointer',
                      marginLeft: 6,
                      fontSize: '1.1rem',
                      padding: 4,
                    }}
                    aria-label={`Remove ${line.item.name} from request`}
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {items.length > 0 && (
          <div className="cart-footer">
            <div className="cart-summary-row">
              <span>Rental Period</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{rentalDays} day{rentalDays > 1 ? 's' : ''}</span>
            </div>
            <div className="cart-summary-row">
              <span>Subtotal</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{formatMoney(subtotalPaisa as Paisa)}</span>
            </div>
            <div className="cart-summary-row">
              <span>Government VAT (13%)</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{formatMoney(vatPaisa as Paisa)}</span>
            </div>
            <div className="cart-total-row">
              <span>Estimated Total</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)' }}>
                {formatMoney(totalPaisa as Paisa)}
              </span>
            </div>

            <button
              type="button"
              className="btn-primary"
              style={{ width: '100%', minHeight: 48, fontSize: '1rem' }}
              onClick={() => {
                trackStoreEvent({
                  event: 'request_sent',
                  valueNpr: Math.round(totalPaisa / 100),
                })
                alert('Request saved! Our rental team confirms availability and issues pro forma within 1 hour.')
                onClearCart()
                onClose()
              }}
            >
              Submit Booking Request
            </button>

            <p className="cart-disclaimer">
              Submitting a request holds no equipment. Babin Rentals staff confirm availability and identity requirements within 1 hour.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
