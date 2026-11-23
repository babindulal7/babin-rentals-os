import React, { useEffect, useState } from 'react'
import type { CatalogueItem } from '../lib/catalogueApi'
import { getPublicPhotoUrl } from '../lib/catalogueApi'
import type { FamilyOptionChoice } from '../lib/familyOptions'
import { formatMoney, type Paisa } from '@/lib/money'

interface ProductDetailModalProps {
  item: CatalogueItem | null
  hasDates: boolean
  isAvailable?: boolean | undefined
  onClose: () => void
  onAddToCart: (item: CatalogueItem) => void
  /** T7-13: the options a shopper may choose between for this product (empty when standalone). */
  familyChoices?: readonly FamilyOptionChoice[]
  /** T7-13: availability per product for the chosen dates, used for each option. */
  availabilityById?: ReadonlyMap<string, boolean>
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  item: requestedItem,
  hasDates,
  isAvailable,
  onClose,
  onAddToCart,
  familyChoices = [],
  availabilityById,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // The shopper's pick is kept per product, and cleared when they open a different product.
  const [chosenId, setChosenId] = useState<string | null>(null)
  useEffect(() => {
    setChosenId(null)
  }, [requestedItem?.id])

  if (!requestedItem) return null

  const pickable = familyChoices.length >= 2
  const item: CatalogueItem =
    familyChoices.find((choice) => choice.item.id === chosenId)?.item ?? requestedItem
  const availableFor = (productId: string): boolean | undefined =>
    availabilityById?.get(productId) ?? isAvailable
  const chosenAvailable = availableFor(item.id)

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

        {pickable && (
          <fieldset
            style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '12px 16px', margin: '0 0 16px' }}
          >
            <legend style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', padding: '0 4px' }}>
              Choose an option
            </legend>
            {familyChoices.map((choice) => {
              const optionAvailable = availableFor(choice.item.id)
              const unavailable = hasDates && optionAvailable === false
              return (
                <label
                  key={choice.item.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', cursor: unavailable ? 'not-allowed' : 'pointer' }}
                >
                  <input
                    type="radio"
                    name={`family-option-${requestedItem.id}`}
                    value={choice.item.id}
                    checked={item.id === choice.item.id}
                    disabled={unavailable}
                    onChange={() => setChosenId(choice.item.id)}
                  />
                  <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{choice.optionLabel}</span>
                  <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>
                    {formatMoney(choice.item.daily_rate_paisa as Paisa)} / day
                  </span>
                  {unavailable && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Not available on these dates</span>
                  )}
                </label>
              )
            })}
          </fieldset>
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
            disabled={!hasDates || chosenAvailable !== true}
            style={{ maxWidth: 220 }}
          >
            Add to Request
          </button>
        </div>
      </div>
    </div>
  )
}
