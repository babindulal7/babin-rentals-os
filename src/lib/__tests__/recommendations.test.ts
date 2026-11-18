import { describe, it, expect } from 'vitest'
import {
  computeProductRecommendations,
  type ProductCatalogMeta,
  type BookingHistoryLine,
  type StaffRecommendationPin,
} from '../recommendations'

describe('T7-12 Product Recommendations Engine', () => {
  const catalog = new Map<string, ProductCatalogMeta>([
    ['cam-1', { id: 'cam-1', name: 'Sony FX3', isOwnProduct: true, isRetired: false, isArchived: false, showOnline: true, dailyRatePaisa: 500000 }],
    ['acc-1', { id: 'acc-1', name: 'V-Mount Battery 98Wh', isOwnProduct: true, isRetired: false, isArchived: false, showOnline: true, dailyRatePaisa: 50000 }],
    ['acc-2', { id: 'acc-2', name: 'Sony 24-70mm GM II', isOwnProduct: true, isRetired: false, isArchived: false, showOnline: true, dailyRatePaisa: 250000 }],
    ['acc-3', { id: 'acc-3', name: 'CFexpress Type A 160GB', isOwnProduct: true, isRetired: false, isArchived: false, showOnline: true, dailyRatePaisa: 30000 }],
    ['acc-4', { id: 'acc-4', name: 'Rode Wireless Pro Mic', isOwnProduct: true, isRetired: false, isArchived: false, showOnline: true, dailyRatePaisa: 80000 }],
    ['acc-5', { id: 'acc-5', name: 'SmallRig Top Handle', isOwnProduct: true, isRetired: false, isArchived: false, showOnline: true, dailyRatePaisa: 15000 }],
    ['acc-6', { id: 'acc-6', name: 'HDMI Ultra Thin Cable', isOwnProduct: true, isRetired: false, isArchived: false, showOnline: true, dailyRatePaisa: 5000 }],
    ['acc-7', { id: 'acc-7', name: 'Matte Box Mini', isOwnProduct: true, isRetired: false, isArchived: false, showOnline: true, dailyRatePaisa: 20000 }],
    ['acc-retired', { id: 'acc-retired', name: 'Old Dead Battery', isOwnProduct: true, isRetired: true, isArchived: false, showOnline: true }],
    ['acc-offline', { id: 'acc-offline', name: 'Internal Rigging', isOwnProduct: true, isRetired: false, isArchived: false, showOnline: false }],
    ['acc-third-party', { id: 'acc-third-party', name: 'Sub-rented Tripod', isOwnProduct: false, isRetired: false, isArchived: false, showOnline: true }],
  ])

  const now = new Date('2026-11-17T12:00:00Z')

  const bookingLines: BookingHistoryLine[] = [
    // Booking 1 (6 months ago): cam-1 + acc-1, acc-2, acc-3
    { bookingId: 'b-1', bookingDate: '2026-05-01T10:00:00Z', productId: 'cam-1' },
    { bookingId: 'b-1', bookingDate: '2026-05-01T10:00:00Z', productId: 'acc-1' },
    { bookingId: 'b-1', bookingDate: '2026-05-01T10:00:00Z', productId: 'acc-2' },
    { bookingId: 'b-1', bookingDate: '2026-05-01T10:00:00Z', productId: 'acc-3' },

    // Booking 2 (3 months ago): cam-1 + acc-1, acc-2, acc-4, acc-5, acc-6, acc-7
    { bookingId: 'b-2', bookingDate: '2026-08-01T10:00:00Z', productId: 'cam-1' },
    { bookingId: 'b-2', bookingDate: '2026-08-01T10:00:00Z', productId: 'acc-1' },
    { bookingId: 'b-2', bookingDate: '2026-08-01T10:00:00Z', productId: 'acc-2' },
    { bookingId: 'b-2', bookingDate: '2026-08-01T10:00:00Z', productId: 'acc-4' },
    { bookingId: 'b-2', bookingDate: '2026-08-01T10:00:00Z', productId: 'acc-5' },
    { bookingId: 'b-2', bookingDate: '2026-08-01T10:00:00Z', productId: 'acc-6' },
    { bookingId: 'b-2', bookingDate: '2026-08-01T10:00:00Z', productId: 'acc-7' },

    // Booking 3 (2 years ago - outside 12-month window): cam-1 + acc-retired
    { bookingId: 'b-old', bookingDate: '2024-01-01T10:00:00Z', productId: 'cam-1' },
    { bookingId: 'b-old', bookingDate: '2024-01-01T10:00:00Z', productId: 'acc-retired' },
  ]

  it('selects up to 6 co-rented items ordered deterministically by frequency', () => {
    const results = computeProductRecommendations({
      targetProductId: 'cam-1',
      catalog,
      bookingLines,
      asOfDate: now,
    })

    expect(results.length).toBeLessThanOrEqual(6)
    expect(results.length).toBe(6)

    // acc-1 and acc-2 appeared twice; others appeared once
    expect(['acc-1', 'acc-2']).toContain(results[0]?.productId)
    expect(['acc-1', 'acc-2']).toContain(results[1]?.productId)

    // Cannot recommend target itself
    expect(results.map((r) => r.productId)).not.toContain('cam-1')
    // Excludes retired, third party
    expect(results.map((r) => r.productId)).not.toContain('acc-retired')
    expect(results.map((r) => r.productId)).not.toContain('acc-third-party')
  })

  it('preserves staff pinned items over automatic choices', () => {
    const staffPins: StaffRecommendationPin[] = [
      { productId: 'cam-1', recommendedProductId: 'acc-7', position: 1, isPinned: true },
    ]

    const results = computeProductRecommendations({
      targetProductId: 'cam-1',
      catalog,
      bookingLines,
      staffPins,
      asOfDate: now,
    })

    expect(results[0]?.productId).toBe('acc-7')
    expect(results[0]?.source).toBe('staff')
    expect(results[0]?.position).toBe(1)
  })

  it('filters out non-online items in public view', () => {
    const linesWithOffline: BookingHistoryLine[] = [
      ...bookingLines,
      { bookingId: 'b-offline', bookingDate: '2026-10-01T10:00:00Z', productId: 'cam-1' },
      { bookingId: 'b-offline', bookingDate: '2026-10-01T10:00:00Z', productId: 'acc-offline' },
    ]

    const publicResults = computeProductRecommendations({
      targetProductId: 'cam-1',
      catalog,
      bookingLines: linesWithOffline,
      asOfDate: now,
      isPublicView: true,
    })

    expect(publicResults.map((r) => r.productId)).not.toContain('acc-offline')
  })

  it('masks dailyRatePaisa for money-blind roles (canViewMoney: false)', () => {
    const results = computeProductRecommendations({
      targetProductId: 'cam-1',
      catalog,
      bookingLines,
      asOfDate: now,
      canViewMoney: false,
    })

    for (const item of results) {
      expect(item.dailyRatePaisa).toBeUndefined()
    }
  })
})
