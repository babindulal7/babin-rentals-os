import React from 'react'
import type { ClientUser } from '../lib/clientAuthApi'

interface BookingHeaderProps {
  startDate: string
  endDate: string
  onStartDateChange: (val: string) => void
  onEndDateChange: (val: string) => void
  cartCount: number
  onOpenCart: () => void
  user?: ClientUser | null | undefined
  profileName?: string | null | undefined
  onOpenAuth?: (() => void) | undefined
  onOpenProfile?: (() => void) | undefined
}

export const BookingHeader: React.FC<BookingHeaderProps> = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  cartCount,
  onOpenCart,
  user,
  profileName,
  onOpenAuth,
  onOpenProfile,
}) => {
  return (
    <header className="booking-header" role="banner">
      <div className="booking-container">
        <div className="booking-header-inner">
          <a href="/booking.html" className="brand-badge" aria-label="Babin Rentals home">
            <div className="brand-logo" aria-hidden="true">B</div>
            <div>
              <div className="brand-title">Babin Rentals</div>
              <div className="brand-subtitle">Cinema Gear · Kathmandu</div>
            </div>
          </a>

          <div className="date-selector-bar" role="search" aria-label="Rental date range selection">
            <div className="date-input-group">
              <label htmlFor="pickup-date-input" className="date-input-label">
                Pickup (06:00 NPT)
              </label>
              <input
                id="pickup-date-input"
                type="date"
                className="date-input"
                value={startDate}
                onChange={(e) => onStartDateChange(e.target.value)}
                aria-label="Rental pickup date"
              />
            </div>

            <span style={{ color: 'var(--text-subtle)' }} aria-hidden="true">→</span>

            <div className="date-input-group">
              <label htmlFor="return-date-input" className="date-input-label">
                Return (06:00 NPT)
              </label>
              <input
                id="return-date-input"
                type="date"
                className="date-input"
                value={endDate}
                onChange={(e) => onEndDateChange(e.target.value)}
                aria-label="Rental return date"
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {user ? (
              <button
                type="button"
                className="cart-button"
                onClick={onOpenProfile}
                style={{ background: 'var(--bg-surface)' }}
                aria-label={`Open client account profile for ${profileName || user.email}`}
              >
                <span aria-hidden="true">👤</span>
                <span style={{ maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {profileName || user.email.split('@')[0]}
                </span>
              </button>
            ) : (
              <button
                type="button"
                className="cart-button"
                onClick={onOpenAuth}
                style={{ background: 'var(--bg-surface)' }}
                aria-label="Sign in to client portal"
              >
                <span aria-hidden="true">👤</span>
                <span>Sign In</span>
              </button>
            )}

            <button
              type="button"
              className="cart-button"
              onClick={onOpenCart}
              aria-label={`View booking request cart, ${cartCount} items selected`}
            >
              <span aria-hidden="true">🛒</span>
              <span>Cart</span>
              {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
