import { useState, useEffect, useMemo, useCallback } from 'react'
import './booking.css'
import { getDefaultRentalDates } from './lib/kathmanduDateDefaults'
import type { CatalogueItem } from './lib/catalogueApi'
import { fetchPublicCatalogue, checkPublicAvailability } from './lib/catalogueApi'
import {
  type OnlineBookingAwayStatus,
  fetchOnlineBookingAwayStatus,
} from '@/lib/awayMode'
import {
  type ClientUser,
  type OnlineProfile,
  getCurrentClientUser,
  fetchOnlineProfile,
} from './lib/clientAuthApi'
import { BookingHeader } from './components/BookingHeader'
import { CategoryNav } from './components/CategoryNav'
import { ProductCard } from './components/ProductCard'
import { ProductDetailModal } from './components/ProductDetailModal'
import { CartDrawer, type CartLine } from './components/CartDrawer'
import { ClientAuthModal } from './components/ClientAuthModal'
import { ClientProfileModal } from './components/ClientProfileModal'
import { MyBookingsModal } from './account/MyBookingsModal'
import { initStoreAnalyticsScripts, trackStoreEvent } from '../lib/storeAnalytics'

export default function BookingApp() {
  const [initialDates] = useState(getDefaultRentalDates)
  const [startDate, setStartDate] = useState<string>(initialDates.startDate)
  const [endDate, setEndDate] = useState<string>(initialDates.endDate)
  const [activeCategory, setActiveCategory] = useState<string>('All')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [items, setItems] = useState<CatalogueItem[]>([])
  const [availability, setAvailability] = useState<Map<string, boolean>>(new Map())
  const [availabilityPending, setAvailabilityPending] = useState(false)
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)
  const [availabilityRetry, setAvailabilityRetry] = useState(0)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<CatalogueItem | null>(null)
  const [cart, setCart] = useState<CartLine[]>([])
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false)
  const [isOffline, setIsOffline] = useState<boolean>(() => typeof navigator !== 'undefined' && !navigator.onLine)
  const [clientUser, setClientUser] = useState<ClientUser | null>(null)
  const [clientProfile, setClientProfile] = useState<OnlineProfile | null>(null)
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false)
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(false)
  const [isMyBookingsOpen, setIsMyBookingsOpen] = useState<boolean>(false)
  const [awayStatus, setAwayStatus] = useState<OnlineBookingAwayStatus | null>(null)

  const refreshAwayStatus = useCallback(async () => {
    try {
      const status = await fetchOnlineBookingAwayStatus()
      setAwayStatus(status)
      return status
    } catch {
      return null
    }
  }, [])

  // Load online booking away mode status and keep it synchronized:
  // - Re-fetches immediately when a scheduled resumes_at timestamp expires
  // - Re-checks every 60s while away mode is active
  // - Re-checks when the window regains focus or tab becomes visible
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | null = null

    const check = async () => {
      const status = await refreshAwayStatus()
      if (!active || !status) return

      if (status.is_away && status.resume_date) {
        const msUntilResume = new Date(status.resume_date).getTime() - Date.now()
        if (msUntilResume > 0 && msUntilResume < 24 * 60 * 60 * 1000) {
          timer = setTimeout(() => {
            if (active) void check()
          }, msUntilResume + 1000)
        }
      }
    }

    void check()

    const interval = setInterval(() => {
      if (active && awayStatus?.is_away) {
        void check()
      }
    }, 60000)

    const onFocus = () => {
      if (active) void check()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)

    return () => {
      active = false
      if (timer) clearTimeout(timer)
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [refreshAwayStatus, awayStatus?.is_away, awayStatus?.resume_date])

  // Load client auth session and profile
  useEffect(() => {
    let active = true
    getCurrentClientUser().then((u) => {
      if (!active) return
      setClientUser(u)
      if (u) {
        fetchOnlineProfile().then((p) => {
          if (active) setClientProfile(p)
        })
      }
    })
    return () => {
      active = false
    }
  }, [])

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false)
      setAvailability(new Map())
      setAvailabilityRetry((n) => n + 1)
    }
    const handleOffline = () => {
      setIsOffline(true)
      setAvailability(new Map())
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Initialize store analytics and dispatch initial page view (T7-16)
  useEffect(() => {
    initStoreAnalyticsScripts(false)
    trackStoreEvent({
      event: 'page_view',
      pagePath: typeof window !== 'undefined' ? window.location.pathname : '/',
    })
  }, [])

  // Load public catalogue
  const loadCatalogue = useCallback(async () => {
    setLoading(true)
    setError(null)
    setItems([])
    setAvailability(new Map())
    try {
      const data = await fetchPublicCatalogue()
      setItems(data)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load catalogue. Please check your connection.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCatalogue()
  }, [loadCatalogue])

  // Treat unverified/failed/offline stock as UNKNOWN, never as Available.
  // Clear prior date/product results immediately so stale responses cannot be used.
  useEffect(() => {
    let cancelled = false
    setAvailability(new Map())
    setAvailabilityError(null)

    if (!startDate || !endDate || items.length === 0) {
      setAvailabilityPending(false)
      return () => { cancelled = true }
    }
    if (isOffline) {
      setAvailabilityPending(false)
      setAvailabilityError('Availability cannot be checked while offline. Reconnect and retry.')
      return () => { cancelled = true }
    }

    setAvailabilityPending(true)
    void checkPublicAvailability(items.map((i) => i.id), startDate, endDate)
      .then((res) => {
        if (!cancelled) setAvailability(res)
      })
      .catch(() => {
        if (!cancelled) {
          setAvailability(new Map())
          setAvailabilityError('Unable to verify availability right now. Please retry.')
        }
      })
      .finally(() => {
        if (!cancelled) setAvailabilityPending(false)
      })
    return () => { cancelled = true }
  }, [items, startDate, endDate, availabilityRetry, isOffline])

  // Extract unique categories (preserving 'Bundle Deals' order)
  const categories = useMemo(() => {
    const cats = new Set<string>()
    for (const item of items) {
      if (item.category_name && item.category_name !== 'Bundle Deals') {
        cats.add(item.category_name)
      }
    }
    const list = Array.from(cats).sort()
    if (items.some((i) => i.kind === 'bundle')) {
      list.push('Bundle Deals')
    }
    return list
  }, [items])

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesCategory =
        activeCategory === 'All' ||
        (activeCategory === 'Bundle Deals' ? item.kind === 'bundle' : item.category_name === activeCategory)

      const matchesSearch =
        !searchQuery ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase())

      return matchesCategory && matchesSearch
    })
  }, [items, activeCategory, searchQuery])

  // Cart operations
  const handleAddToCart = (item: CatalogueItem) => {
    if (!startDate || !endDate || isOffline || availabilityPending || availabilityError ||
        availability.get(item.id) !== true) return
    trackStoreEvent({
      event: 'add_to_request',
      item: {
        itemId: item.id,
        itemName: item.name,
        ...(item.category_name ? { category: item.category_name } : {}),
        ...(item.daily_rate_paisa ? { valueNpr: Math.round(item.daily_rate_paisa / 100) } : {}),
      },
    })
    setCart((prev) => {
      const existing = prev.find((line) => line.item.id === item.id)
      if (existing) {
        return prev.map((line) =>
          line.item.id === item.id ? { ...line, quantity: line.quantity + 1 } : line,
        )
      }
      return [...prev, { item, quantity: 1 }]
    })
    setIsCartOpen(true)
  }

  const handleViewDetails = (item: CatalogueItem) => {
    setSelectedItem(item)
    trackStoreEvent({
      event: 'view_item',
      item: {
        itemId: item.id,
        itemName: item.name,
        ...(item.category_name ? { category: item.category_name } : {}),
        ...(item.daily_rate_paisa ? { valueNpr: Math.round(item.daily_rate_paisa / 100) } : {}),
      },
    })
  }

  const handleUpdateQty = (itemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((line) => {
          if (line.item.id === itemId) {
            const newQty = line.quantity + delta
            return newQty > 0 ? { ...line, quantity: newQty } : null
          }
          return line
        })
        .filter((l): l is CartLine => l !== null),
    )
  }

  const handleRemoveFromCart = (itemId: string) => {
    setCart((prev) => prev.filter((line) => line.item.id !== itemId))
  }

  const handleClearCart = () => {
    setCart([])
  }

  const totalCartCount = useMemo(() => {
    return cart.reduce((sum, line) => sum + line.quantity, 0)
  }, [cart])

  return (
    <div className="booking-app">
      <BookingHeader
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={(date) => { setStartDate(date); setAvailability(new Map()) }}
        onEndDateChange={(date) => { setEndDate(date); setAvailability(new Map()) }}
        cartCount={totalCartCount}
        onOpenCart={() => setIsCartOpen(true)}
        user={clientUser}
        profileName={clientProfile?.name}
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenProfile={() => setIsProfileOpen(true)}
        onOpenMyBookings={() => setIsMyBookingsOpen(true)}
      />

      <main className="booking-container">
        {awayStatus?.is_away && (
          <div
            role="status"
            aria-live="polite"
            style={{
              background: 'rgba(234, 179, 8, 0.12)',
              color: 'var(--accent-gold, #fef08a)',
              padding: '12px 18px',
              borderRadius: 'var(--radius-md)',
              margin: '16px 0',
              fontSize: '0.9rem',
              border: '1px solid rgba(234, 179, 8, 0.35)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span style={{ fontSize: '1.25rem' }}>⏸</span>
            <div>
              <strong>Online Requests Paused:</strong> {awayStatus.message}
              {awayStatus.resume_date && (
                <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  Resuming online requests on {new Date(awayStatus.resume_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
            </div>
          </div>
        )}
        {isOffline && (
          <div
            role="status"
            style={{
              background: '#451a03',
              color: '#fef3c7',
              padding: '10px 16px',
              borderRadius: 'var(--radius-md)',
              margin: '16px 0',
              fontSize: '0.85rem',
              border: '1px solid #78350f',
            }}
          >
            📡 You are currently offline. Showing cached catalogue rates. Live reservation sync will resume when connection is restored.
          </div>
        )}

        {availabilityError && !loading && !error && (
          <div role="alert" style={{ padding: '12px 18px', margin: '16px 0',
            background: 'rgba(136,19,55,0.2)', color: 'var(--rose-text)',
            border: '1px solid var(--rose-text)', borderRadius: 'var(--radius-md)' }}>
            <span>{availabilityError} Requests are temporarily blocked until the check succeeds.</span>
            {!isOffline && (
              <button type="button" className="btn-secondary"
                style={{ marginLeft: 12, width: 'auto' }}
                onClick={() => setAvailabilityRetry((n) => n + 1)}>Retry availability</button>
            )}
          </div>
        )}
        {availabilityPending && !loading && !error && (
          <p role="status" style={{ color: 'var(--text-muted)', padding: '8px 0' }}>
            Checking live equipment availability…
          </p>
        )}

        {/* Hero & Search bar */}
        <div style={{ padding: '24px 0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-main)' }}>
              Cinema Equipment Catalogue
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Checked, cleaned, and QC verified before every shoot. Select dates above to check real-time availability.
            </p>
          </div>

          <div style={{ position: 'relative', minWidth: 260 }}>
            <input
              type="text"
              placeholder="Search cameras, lenses, lights…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                minHeight: 44,
                padding: '0 16px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-main)',
                fontSize: '0.9rem',
                outline: 'none',
              }}
              aria-label="Search catalogue"
            />
          </div>
        </div>

        {/* Category Navigation */}
        <CategoryNav
          categories={categories}
          activeCategory={activeCategory}
          onSelectCategory={setActiveCategory}
        />

        {/* Screen State 1: Error */}
        {error && (
          <div role="alert" style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--rose-text)' }}>
            <p style={{ fontSize: '1.1rem', marginBottom: 12 }}>{error}</p>
            <button
              type="button"
              className="btn-primary"
              onClick={loadCatalogue}
              style={{ display: 'inline-block', minWidth: 140 }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Screen State 2: Loading skeletons */}
        {loading && !error && (
          <div className="product-grid" aria-busy="true" aria-label="Loading equipment items">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton-card" />
            ))}
          </div>
        )}

        {/* Screen State 3: Empty */}
        {!loading && !error && filteredItems.length === 0 && (
          <div className="empty-state">
            <h3 style={{ fontSize: '1.2rem', marginBottom: 8, color: 'var(--text-main)' }}>Nothing listed yet</h3>
            <p style={{ fontSize: '0.9rem' }}>
              {searchQuery
                ? `No items found matching "${searchQuery}". Try a different keyword.`
                : 'No equipment items are currently published in this category.'}
            </p>
          </div>
        )}

        {/* Screen State 4: Products Grid */}
        {!loading && !error && filteredItems.length > 0 && (
          <div className="product-grid">
            {filteredItems.map((item) => (
              <ProductCard
                key={item.id}
                item={item}
                hasDates={Boolean(startDate && endDate)}
                isAvailable={isOffline || availabilityPending || availabilityError ? undefined : availability.get(item.id)}
                onViewDetails={handleViewDetails}
                onAddToCart={handleAddToCart}
              />
            ))}
          </div>
        )}
      </main>

      {/* Footer with privacy disclosure */}
      <footer className="booking-footer">
        <div className="booking-container">
          <p className="privacy-disclosure">
            This booking site uses Google Analytics and Meta Pixel to improve user experience. No personal identifying information (names, emails, phone numbers) is tracked.
          </p>
          <div className="booking-copyright">
            © {new Date().getFullYear()} Babin Rentals. All rights reserved.
          </div>
        </div>
      </footer>

      {/* Product Detail Modal */}
      <ProductDetailModal
        item={selectedItem}
        hasDates={Boolean(startDate && endDate)}
        isAvailable={!isOffline && !availabilityPending && !availabilityError && selectedItem ? availability.get(selectedItem.id) : undefined}
        onClose={() => setSelectedItem(null)}
        onAddToCart={handleAddToCart}
      />

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cart}
        startDate={startDate}
        endDate={endDate}
        onUpdateQty={handleUpdateQty}
        onRemoveItem={handleRemoveFromCart}
        onClearCart={handleClearCart}
        user={clientUser}
        profile={clientProfile}
        onOpenAuth={() => setIsAuthOpen(true)}
        awayStatus={awayStatus}
        onRefreshAwayStatus={refreshAwayStatus}
        bookingChecksReady={!isOffline && !availabilityPending && !availabilityError &&
          Boolean(startDate && endDate) && cart.length > 0 &&
          cart.every((line) => availability.get(line.item.id) === true)}
      />

      {/* Client Auth Modal */}
      <ClientAuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={(user) => {
          setClientUser(user)
          fetchOnlineProfile().then((p) => {
            setClientProfile(p)
            if (!p) {
              // Open profile setup if profile doesn't exist yet
              setIsProfileOpen(true)
            }
          })
        }}
      />

      {/* Client Profile & KYC Modal */}
      <ClientProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        user={clientUser}
        onSignOut={() => {
          setClientUser(null)
          setClientProfile(null)
        }}
        onProfileUpdated={(updated) => setClientProfile(updated)}
        onOpenMyBookings={() => setIsMyBookingsOpen(true)}
      />

      {/* My Bookings & Invoices Modal (T7-08) */}
      <MyBookingsModal
        isOpen={isMyBookingsOpen}
        onClose={() => setIsMyBookingsOpen(false)}
        user={clientUser}
        onOpenAuth={() => setIsAuthOpen(true)}
      />
    </div>
  )
}
