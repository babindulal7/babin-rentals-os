import React from 'react'
import type { CatalogueItem } from '../lib/catalogueApi'
import { getPublicPhotoUrl } from '../lib/catalogueApi'
import { formatMoney, type Paisa } from '@/lib/money'

interface ProductCardProps {
  item: CatalogueItem
  hasDates: boolean
  isAvailable?: boolean | undefined
  optionCount?: number | undefined
  onViewDetails: (item: CatalogueItem) => void
  onAddToCart: (item: CatalogueItem) => void
}

export const ProductCard: React.FC<ProductCardProps> = ({
  item,
  hasDates,
  isAvailable,
  optionCount,
  onViewDetails,
  onAddToCart,
}) => {
  const photoUrl = getPublicPhotoUrl(item.photo_paths[0])
  const formattedRate = formatMoney(item.daily_rate_paisa as Paisa)

  let badgeClass = 'dates-needed'
  let badgeText = 'Select dates'
  if (hasDates) {
    if (isAvailable) {
      badgeClass = 'available'
      badgeText = 'Available'
    } else {
      badgeClass = 'unavailable'
      badgeText = 'Unavailable'
    }
  }

  const hasMultipleOptions = Boolean(optionCount && optionCount > 1)

  return (
    <article className="product-card" aria-label={item.family_name || item.name}>
      <div className="product-image-container">
        {photoUrl ? (
          <img src={photoUrl} alt={item.name} className="product-image" loading="lazy" />
        ) : (
          <div className="product-image-placeholder" aria-hidden="true">
            {item.kind === 'bundle' ? 'Package Deal' : 'Babin Rentals Cinema'}
          </div>
        )}
        <span className={`availability-badge ${badgeClass}`} role="status">
          {badgeText}
        </span>
        {hasMultipleOptions && (
          <span
            style={{
              position: 'absolute',
              bottom: 8,
              left: 8,
              background: 'rgba(15, 23, 42, 0.85)',
              color: 'var(--accent-gold, #facc15)',
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm, 4px)',
              fontSize: '0.75rem',
              fontWeight: 600,
              border: '1px solid rgba(250, 204, 21, 0.3)',
            }}
          >
            {optionCount} {item.option_dimension || 'Options'}
          </span>
        )}
      </div>

      <div className="product-info">
        <span className="product-category">{item.category_name}</span>
        <h2 className="product-title">{item.family_name || item.name}</h2>
        <p className="product-description">{item.description}</p>

        <div className="product-pricing">
          <span className="price-main">{formattedRate}</span>
          <span className="price-period">/ day + VAT</span>
        </div>

        <div className="product-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onViewDetails(item)}
            aria-label={`View specs and options for ${item.family_name || item.name}`}
          >
            {hasMultipleOptions ? 'Choose Option' : 'Details'}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              if (hasMultipleOptions) {
                onViewDetails(item)
              } else {
                onAddToCart(item)
              }
            }}
            disabled={hasDates && isAvailable === false}
            aria-label={`Add ${item.name} to booking request`}
          >
            {hasMultipleOptions ? 'Select Option' : 'Add to Request'}
          </button>
        </div>
      </div>
    </article>
  )
}
