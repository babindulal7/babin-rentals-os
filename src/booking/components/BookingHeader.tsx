import React from 'react'

interface BookingHeaderProps {
  startDate: string
  endDate: string
  onStartDateChange: (val: string) => void
  onEndDateChange: (val: string) => void
  cartCount: number
  onOpenCart: () => void
}

export const BookingHeader: React.FC<BookingHeaderProps> = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  cartCount,
  onOpenCart,
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
    </header>
  )
}
