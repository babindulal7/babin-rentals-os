import React, { useEffect } from 'react'
import type { CatalogueItem } from '../lib/catalogueApi'
import { getPublicPhotoUrl } from '../lib/catalogueApi'
import { formatMoney, type Paisa } from '@/lib/money'

interface ProductDetailModalProps {
  item: CatalogueItem | null
  hasDates: boolean
  isAvailable?: boolean | undefined
  onClose: () => void
  onAddToCart: (item: CatalogueItem) => void
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  item,
  hasDates,
  isAvailable,
  onClose,
  onAddToCart,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!item) return null

  const photoUrl = getPublicPhotoUrl(item.photo_paths[0])
  const dailyRate = formatMoney(item.daily_rate_paisa as Paisa)
  const weeklyRate = item.weekly_rate_paisa ? formatMoney(item.weekly_rate_paisa as Paisa) : null
  const monthlyRate = item.monthly_rate_paisa ? formatMoney(item.monthly_rate_paisa as Paisa) : null

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal-content">
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Close product details dialog"
        >
          ×
        </button>

        <div className="product-image-container" style={{ borderRadius: 'var(--radius-md)', marginBottom: 20 }}>
          {photoUrl ? (
            <img src={photoUrl} alt={item.name} className="product-image" />
          ) : (
            <div className="product-image-placeholder" aria-hidden="true">
              {item.kind === 'bundle' ? 'Package Deal' : 'Babin Rentals Cinema'}
            </div>
          )}
        </div>

        <span className="product-category">{item.category_name}</span>
        <h2 id="modal-title" className="product-title" style={{ fontSize: '1.4rem' }}>
          {item.name}
        </h2>

        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', margin: '12px 0 20px', lineHeight: 1.6 }}>
          {item.description}
        </p>

        {item.kind === 'bundle' && item.bundle_contents.length > 0 && (
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: 8 }}>
              Package Includes:
            </h3>
            <div className="bundle-items-list">
              {item.bundle_contents.map((component, idx) => (
                <div key={idx} className="bundle-item-row">
                  <span style={{ color: 'var(--text-main)' }}>{component.name}</span>
                  <span style={{ color: 'var(--accent-gold)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                    ×{component.qty}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ background: 'var(--bg-main)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', margin: '20px 0' }}>
          <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8, letterSpacing: '0.05em' }}>
            Published Rental Rates (Exclusive of 13% VAT)
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', display: 'block' }}>Daily Rate</span>
              <strong style={{ fontSize: '1.2rem', fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>{dailyRate}</strong>
            </div>
            {weeklyRate && (
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', display: 'block' }}>Weekly Rate</span>
                <strong style={{ fontSize: '1.2rem', fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>{weeklyRate}</strong>
              </div>
            )}
            {monthlyRate && (
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', display: 'block' }}>Monthly Rate</span>
                <strong style={{ fontSize: '1.2rem', fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>{monthlyRate}</strong>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 }}>
          <button type="button" className="btn-secondary" onClick={onClose} style={{ maxWidth: 140 }}>
            Back
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              onAddToCart(item)
              onClose()
            }}
            disabled={!hasDates || isAvailable !== true}
            style={{ maxWidth: 220 }}
          >
            Add to Request
          </button>
        </div>
      </div>
    </div>
  )
}
