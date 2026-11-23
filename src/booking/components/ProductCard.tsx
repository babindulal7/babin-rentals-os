import React from 'react'
import type { CatalogueItem } from '../lib/catalogueApi'
import { getPublicPhotoUrl } from '../lib/catalogueApi'
import { formatMoney, type Paisa } from '@/lib/money'

interface ProductCardProps {
  item: CatalogueItem
  hasDates: boolean
  isAvailable?: boolean | undefined
  onViewDetails: (item: CatalogueItem) => void
  onAddToCart: (item: CatalogueItem) => void
}

export const ProductCard: React.FC<ProductCardProps> = ({
  item,
  hasDates,
  isAvailable,
  onViewDetails,
  onAddToCart,
}) => {
  const photoUrl = getPublicPhotoUrl(item.photo_paths[0])
  const formattedRate = formatMoney(item.daily_rate_paisa as Paisa)

  let badgeClass = 'dates-needed'
  let badgeText = 'Select dates'
  if (hasDates) {
    if (isAvailable === true) {
      badgeClass = 'available'
      badgeText = 'Available'
    } else if (isAvailable === false) {
      badgeClass = 'unavailable'
      badgeText = 'Unavailable'
    } else {
      badgeText = 'Checking availability'
    }
  }

  return (
    <article className="product-card" aria-label={item.name}>
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
      </div>

      <div className="product-info">
        <span className="product-category">{item.category_name}</span>
        <h2 className="product-title">{item.name}</h2>
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
            aria-label={`View specs and details for ${item.name}`}
          >
            Details
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => onAddToCart(item)}
            disabled={!hasDates || isAvailable !== true}
            aria-label={`Add ${item.name} to booking request`}
          >
            Add to Request
          </button>
        </div>
      </div>
    </article>
  )
}
