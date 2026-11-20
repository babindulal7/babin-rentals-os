import { useState, useEffect, useMemo, useCallback } from 'react'
import './booking.css'
import type { CatalogueItem } from './lib/catalogueApi'
import { fetchPublicCatalogue, checkPublicAvailability } from './lib/catalogueApi'
import {
  type OnlineBookingAwayStatus,
  fetchOnlineBookingAwayStatus,
} from '@/lib/awayMode'
import {
  type LegacyMappingEntry,
  fetchLegacyMappings,
  resolveLegacyBooqableUrl,
} from '@/lib/legacyUrlResolver'
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
import { initStoreAnalyticsScripts, trackStoreEvent } from '@/lib/storeAnalytics'

export default function BookingApp() {
  const getTomorrowString = () => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  }

  const getDayAfterTomorrowString = () => {
    const d = new Date()
    d.setDate(d.getDate() + 3)
    return d.toISOString().slice(0, 10)
  }

  const [startDate, setStartDate] = useState<string>(getTomorrowString)
  const [endDate, setEndDate] = useState<string>(getDayAfterTomorrowString)
  const [activeCategory, setActiveCategory] = useState<string>('All')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [items, setItems] = useState<CatalogueItem[]>([])
  const [availability, setAvailability] = useState<Map<string, boolean>>(new Map())
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
  const [legacyMappings, setLegacyMappings] = useState<LegacyMappingEntry[]>([])
  const [legacyNotice, setLegacyNotice] = useState<string | null>(null)

  // Load online booking away mode status and legacy URL mappings
  useEffect(() => {
    let active = true
    fetchOnlineBookingAwayStatus().then((status) => {
      if (active) setAwayStatus(status)
    })
    fetchLegacyMappings().then((maps) => {
      if (active) setLegacyMappings(maps)
    })
    return () => {
      active = false
    }
  }, [])

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
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)
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

  // Query availability when dates or items change
  useEffect(() => {
    if (!startDate || !endDate || items.length === 0) return

    let cancelled = false
    const productIds = items.map((i) => i.id)

    checkPublicAvailability(productIds, startDate, endDate).then((res) => {
      if (!cancelled) {
        setAvailability(res)
      }
    })

    return () => {
      cancelled = true
    }
  }, [items, startDate, endDate])

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

  // T7-17: Resolve legacy Booqable URLs to canonical items or categories
  useEffect(() => {
    if (typeof window === 'undefined' || items.length === 0) return

    const pathname = window.location.pathname
    // Only resolve if visiting a non-default path or legacy path
    if (
      pathname.startsWith('/products/') ||
      pathname.startsWith('/items/') ||
      pathname.startsWith('/categories/') ||
      pathname.startsWith('/collections/') ||
      pathname.startsWith('/store') ||
      (pathname !== '/' && pathname !== '/catalogue' && pathname !== '/index.html' && pathname !== '/booking.html')
    ) {
      const resolution = resolveLegacyBooqableUrl(
        pathname + window.location.search,
        legacyMappings.length > 0 ? legacyMappings : undefined,
      )

      if (resolution.entityType === 'product' && resolution.resolvedSlug) {
        const slugLower = resolution.resolvedSlug.toLowerCase()
        const matched = items.find(
          (i) =>
            i.slug.toLowerCase() === slugLower ||
            i.id === resolution.resolvedSlug ||
            i.name.toLowerCase().includes(slugLower),
        )
        if (matched) {
          setSelectedItem(matched)
          setLegacyNotice(`Showing ${matched.name} (transferred from old store link)`)
        } else {
          setLegacyNotice('The requested item from the previous store is unavailable or updated. Showing all available gear below.')
        }
      } else if (resolution.entityType === 'category' && resolution.categoryName) {
        const catLower = resolution.categoryName.toLowerCase()
        const matchedCat = categories.find((c) => c.toLowerCase() === catLower)
        if (matchedCat) {
          setActiveCategory(matchedCat)
          setLegacyNotice(`Showing ${matchedCat} category (transferred from old store link)`)
        } else {
          setLegacyNotice('Showing all available gear below.')
        }
      } else if (resolution.isFallback) {
        setLegacyNotice('Welcome to the new Babin Rentals store. Redirected to complete catalogue.')
      }

      // Update browser URL safely without reload
      try {
        window.history.replaceState({}, '', resolution.targetPath + (resolution.sanitizedQuery || ''))
      } catch {
        // Safe fallback in restricted environments
      }
    }
  }, [items, legacyMappings, categories])

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

  // Collapse products belonging to the same family into a single card representation (T7-13)
  const displayItems = useMemo(() => {
    const seenFamilies = new Set<string>()
    return filteredItems.filter((item) => {
      if (!item.family_id) return true
      if (seenFamilies.has(item.family_id)) return false
      seenFamilies.add(item.family_id)
      return true
    })
  }, [filteredItems])

  // Get sibling options when an item in a family is selected
  const siblingOptions = useMemo(() => {
    if (!selectedItem || !selectedItem.family_id) return []
    return items.filter((i) => i.family_id === selectedItem.family_id)
  }, [selectedItem, items])

  // Cart operations
  const handleAddToCart = (item: CatalogueItem) => {
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
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
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

        {legacyNotice && (
          <div
            role="status"
            aria-live="polite"
            style={{
              background: 'rgba(56, 106, 247, 0.12)',
              color: 'var(--primary-text, #93c5fd)',
              padding: '10px 16px',
              borderRadius: 'var(--radius-md)',
              margin: '12px 0',
              fontSize: '0.85rem',
              border: '1px solid rgba(56, 106, 247, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <span>🔗 {legacyNotice}</span>
            <button
              type="button"
              onClick={() => setLegacyNotice(null)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--primary-text, #93c5fd)',
                cursor: 'pointer',
                fontSize: '1.1rem',
                padding: '0 4px',
                lineHeight: 1,
              }}
              aria-label="Dismiss old link notice"
            >
              ×
            </button>
          </div>
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
        {!loading && !error && displayItems.length === 0 && (
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
        {!loading && !error && displayItems.length > 0 && (
          <div className="product-grid">
            {displayItems.map((item) => {
              const familySiblings = item.family_id ? items.filter((i) => i.family_id === item.family_id) : []
              return (
                <ProductCard
                  key={item.id}
                  item={item}
                  hasDates={Boolean(startDate && endDate)}
                  isAvailable={availability.get(item.id)}
                  optionCount={familySiblings.length > 1 ? familySiblings.length : undefined}
                  onViewDetails={handleViewDetails}
                  onAddToCart={handleAddToCart}
                />
              )
            })}
          </div>
        )}
      </main>

      {/* Footer with privacy disclosure (T7-16) */}
      <footer className="booking-footer">
        <div className="booking-container">
          <p className="privacy-disclosure">
            This booking site uses Google Analytics 4 and Meta Pixel to improve user experience and measure store activity. No personal identifying information (names, emails, phone numbers, or booking numbers) is collected or tracked.
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
        isAvailable={selectedItem ? availability.get(selectedItem.id) : undefined}
        siblingOptions={siblingOptions}
        availabilityMap={availability}
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
