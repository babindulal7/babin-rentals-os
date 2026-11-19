import React, { useEffect, useState } from 'react'
import type { CatalogueItem } from '../lib/catalogueApi'
import { getPublicPhotoUrl } from '../lib/catalogueApi'
import { formatMoney, type Paisa } from '@/lib/money'

interface ProductDetailModalProps {
  item: CatalogueItem | null
  hasDates: boolean
  isAvailable?: boolean | undefined
  siblingOptions?: CatalogueItem[]
  availabilityMap?: Map<string, boolean>
  onClose: () => void
  onAddToCart: (item: CatalogueItem) => void
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  item,
  hasDates,
  isAvailable,
  siblingOptions = [],
  availabilityMap,
  onClose,
  onAddToCart,
}) => {
  const [activeItem, setActiveItem] = useState<CatalogueItem | null>(item)

  useEffect(() => {
    setActiveItem(item)
  }, [item])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!activeItem) return null

  const photoUrl = getPublicPhotoUrl(activeItem.photo_paths[0])
  const dailyRate = formatMoney(activeItem.daily_rate_paisa as Paisa)
  const weeklyRate = activeItem.weekly_rate_paisa ? formatMoney(activeItem.weekly_rate_paisa as Paisa) : null
  const monthlyRate = activeItem.monthly_rate_paisa ? formatMoney(activeItem.monthly_rate_paisa as Paisa) : null

  // Live availability for currently active option
  const activeIsAvailable = availabilityMap
    ? availabilityMap.get(activeItem.id) ?? isAvailable
    : isAvailable

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
            <img src={photoUrl} alt={activeItem.name} className="product-image" />
          ) : (
            <div className="product-image-placeholder" aria-hidden="true">
              {activeItem.kind === 'bundle' ? 'Package Deal' : 'Babin Rentals Cinema'}
            </div>
          )}
        </div>

        <span className="product-category">{activeItem.category_name}</span>
        <h2 id="modal-title" className="product-title" style={{ fontSize: '1.4rem' }}>
          {activeItem.family_name || activeItem.name}
        </h2>

        {/* Option Picker for Product Families (B2, T7-13) */}
        {siblingOptions.length > 1 && (
          <div className="product-option-picker" style={{ margin: '14px 0 18px' }}>
            <span
              style={{
                fontSize: '0.85rem',
                fontWeight: 600,
                color: 'var(--text-muted)',
                display: 'block',
                marginBottom: 8,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Select {activeItem.option_dimension || 'Option'}:
            </span>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {siblingOptions.map((opt) => {
                const isSelected = opt.id === activeItem.id
                const optAvail = availabilityMap?.get(opt.id)
                return (
                  <button
                    key={opt.id}
                    type="button"
                    className={`option-chip ${isSelected ? 'active' : ''}`}
                    onClick={() => setActiveItem(opt)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 'var(--radius-sm)',
                      border: isSelected ? '2px solid var(--accent-gold)' : '1px solid var(--border-subtle)',
                      background: isSelected ? 'var(--bg-surface-elevated)' : 'var(--bg-main)',
                      color: 'var(--text-main)',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      fontWeight: isSelected ? 600 : 400,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span>{opt.option_label || opt.name}</span>
                    {hasDates && (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          padding: '2px 6px',
                          borderRadius: 4,
                          background:
                            optAvail === false ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                          color: optAvail === false ? 'var(--status-red)' : 'var(--status-green)',
                        }}
                      >
                        {optAvail === false ? 'Unavailable' : 'Available'}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', margin: '12px 0 20px', lineHeight: 1.6 }}>
          {activeItem.description}
        </p>

        {activeItem.kind === 'bundle' && activeItem.bundle_contents.length > 0 && (
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: 8 }}>
              Package Includes:
            </h3>
            <div className="bundle-items-list">
              {activeItem.bundle_contents.map((component, idx) => (
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
              onAddToCart(activeItem)
              onClose()
            }}
            disabled={hasDates && activeIsAvailable === false}
            style={{ maxWidth: 220 }}
          >
            Add to Request
          </button>
        </div>
      </div>
    </div>
  )
}
