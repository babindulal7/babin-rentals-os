import React from 'react'
import type { ClientUser } from '../lib/clientAuthApi'

export const STANDARD_RENTAL_HOURS = [
  { value: '06:00', label: '06:00 AM (Rental Day Start)' },
  { value: '07:00', label: '07:00 AM' },
  { value: '08:00', label: '08:00 AM' },
  { value: '09:00', label: '09:00 AM' },
  { value: '10:00', label: '10:00 AM' },
  { value: '11:00', label: '11:00 AM' },
  { value: '12:00', label: '12:00 PM' },
  { value: '13:00', label: '01:00 PM' },
  { value: '14:00', label: '02:00 PM' },
  { value: '15:00', label: '03:00 PM' },
  { value: '16:00', label: '04:00 PM' },
  { value: '17:00', label: '05:00 PM' },
  { value: '18:00', label: '06:00 PM' },
  { value: '19:00', label: '07:00 PM' },
  { value: '20:00', label: '08:00 PM' },
  { value: '21:00', label: '09:00 PM' },
] as const

interface BookingHeaderProps {
  startDate: string
  endDate: string
  onStartDateChange: (val: string) => void
  onEndDateChange: (val: string) => void
  startTime?: string | undefined
  endTime?: string | undefined
  onStartTimeChange?: ((val: string) => void) | undefined
  onEndTimeChange?: ((val: string) => void) | undefined
  cartCount: number
  onOpenCart: () => void
  user?: ClientUser | null | undefined
  profileName?: string | null | undefined
  onOpenAuth?: (() => void) | undefined
  onOpenProfile?: (() => void) | undefined
  onOpenMyBookings?: (() => void) | undefined
}

export const BookingHeader: React.FC<BookingHeaderProps> = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  startTime,
  endTime,
  onStartTimeChange,
  onEndTimeChange,
  cartCount,
  onOpenCart,
  user,
  profileName,
  onOpenAuth,
  onOpenProfile,
  onOpenMyBookings,
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
              <div className="date-time-inputs">
                <input
                  id="pickup-date-input"
                  type="date"
                  className="date-input"
                  value={startDate}
                  onChange={(e) => onStartDateChange(e.target.value)}
                  aria-label="Rental pickup date"
                />
                <select
                  id="pickup-time-input"
                  className="date-time-select"
                  value={startTime || '06:00'}
                  onChange={(e) => onStartTimeChange?.(e.target.value)}
                  aria-label="Rental pickup time"
                >
                  {STANDARD_RENTAL_HOURS.map((t) => (
                    <option key={`pickup-${t.value}`} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <span className="date-range-arrow" aria-hidden="true">→</span>

            <div className="date-input-group">
              <label htmlFor="return-date-input" className="date-input-label">
                Return (06:00 NPT)
              </label>
              <div className="date-time-inputs">
                <input
                  id="return-date-input"
                  type="date"
                  className="date-input"
                  value={endDate}
                  onChange={(e) => onEndDateChange(e.target.value)}
                  aria-label="Rental return date"
                />
                <select
                  id="return-time-input"
                  className="date-time-select"
                  value={endTime || '06:00'}
                  onChange={(e) => onEndTimeChange?.(e.target.value)}
                  aria-label="Rental return time"
                >
                  {STANDARD_RENTAL_HOURS.map((t) => (
                    <option key={`return-${t.value}`} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="booking-header-actions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {user ? (
              <>
                <button
                  type="button"
                  className="cart-button"
                  onClick={onOpenMyBookings}
                  style={{ background: 'var(--bg-surface)' }}
                  aria-label="View my rental bookings and invoices"
                >
                  <span aria-hidden="true">📋</span>
                  <span>My Bookings</span>
                </button>
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
              </>
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
