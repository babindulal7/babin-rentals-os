/**
 * Recommended Items Engine (T7-12)
 *
 * Computes up to 6 co-rented recommendations for a product from past 12 months booking history.
 *
 * Rules:
 * - Up to 6 recommended items.
 * - Source: past bookings in the last 12 months.
 * - Own products only (excludes sub-rented or third-party items).
 * - Excludes itself, retired products, and archived products.
 * - Manual staff overrides (pinned/manual) take absolute precedence over auto-generated recommendations.
 * - Deterministic ordering: pinned items by position, followed by auto items sorted by frequency DESC, then product ID ASC.
 * - Public catalogue filtering: only products marked `showOnline: true` are visible publicly.
 * - Role safety: Warehouse/Technician/Driver do not receive pricing data.
 */

export interface ProductCatalogMeta {
  id: string
  name: string
  isOwnProduct: boolean
  isRetired: boolean
  isArchived: boolean
  showOnline: boolean
  dailyRatePaisa?: number // masked for floor roles
}

export interface BookingHistoryLine {
  bookingId: string
  bookingDate: string // ISO string
  productId: string
}

export interface StaffRecommendationPin {
  productId: string
  recommendedProductId: string
  position: number // 1 to 6
  isPinned: boolean
}

export interface RecommendationResultItem {
  productId: string
  name: string
  source: 'staff' | 'auto'
  position: number
  showOnline: boolean
  dailyRatePaisa?: number
}

export interface ComputeRecommendationsParams {
  targetProductId: string
  catalog: Map<string, ProductCatalogMeta>
  bookingLines: BookingHistoryLine[]
  staffPins?: StaffRecommendationPin[]
  asOfDate?: Date
  isPublicView?: boolean
  canViewMoney?: boolean
}

export function computeProductRecommendations(
  params: ComputeRecommendationsParams,
): RecommendationResultItem[] {
  const {
    targetProductId,
    catalog,
    bookingLines,
    staffPins = [],
    asOfDate = new Date(),
    isPublicView = false,
    canViewMoney = true,
  } = params

  const target = catalog.get(targetProductId)
  if (!target) return []

  // 12 months boundary in ms: 365 days
  const twelveMonthsAgo = new Date(asOfDate.getTime() - 365 * 24 * 60 * 60 * 1000)

  // 1. Group booking lines by bookingId within the last 12 months
  const bookingsWithTarget = new Set<string>()
  const bookingToProducts = new Map<string, Set<string>>()

  for (const line of bookingLines) {
    const lineDate = new Date(line.bookingDate)
    if (isNaN(lineDate.getTime()) || lineDate < twelveMonthsAgo || lineDate > asOfDate) {
      continue
    }

    if (!bookingToProducts.has(line.bookingId)) {
      bookingToProducts.set(line.bookingId, new Set())
    }
    bookingToProducts.get(line.bookingId)!.add(line.productId)

    if (line.productId === targetProductId) {
      bookingsWithTarget.add(line.bookingId)
    }
  }

  // 2. Count co-occurrences with targetProductId
  const coOccurrenceCounts = new Map<string, number>()

  for (const bookingId of bookingsWithTarget) {
    const productsInBooking = bookingToProducts.get(bookingId)
    if (!productsInBooking) continue

    for (const prodId of productsInBooking) {
      if (prodId === targetProductId) continue

      const prodMeta = catalog.get(prodId)
      if (!prodMeta) continue
      // Filters: own products only, not retired, not archived
      if (!prodMeta.isOwnProduct || prodMeta.isRetired || prodMeta.isArchived) continue
      if (isPublicView && !prodMeta.showOnline) continue

      coOccurrenceCounts.set(prodId, (coOccurrenceCounts.get(prodId) ?? 0) + 1)
    }
  }

  // 3. Prepare staff pinned recommendations (higher priority)
  const relevantPins = staffPins
    .filter((pin) => pin.productId === targetProductId && pin.isPinned)
    .sort((a, b) => a.position - b.position)

  const finalSlots: Array<RecommendationResultItem | null> = [
    null,
    null,
    null,
    null,
    null,
    null,
  ]
  const chosenProductIds = new Set<string>()

  // Place staff pinned items into slots
  for (const pin of relevantPins) {
    const prodMeta = catalog.get(pin.recommendedProductId)
    if (!prodMeta) continue
    if (!prodMeta.isOwnProduct || prodMeta.isRetired || prodMeta.isArchived) continue
    if (isPublicView && !prodMeta.showOnline) continue
    if (pin.recommendedProductId === targetProductId) continue

    const slotIndex = Math.max(0, Math.min(5, pin.position - 1))
    if (!finalSlots[slotIndex]) {
      finalSlots[slotIndex] = {
        productId: prodMeta.id,
        name: prodMeta.name,
        source: 'staff',
        position: slotIndex + 1,
        showOnline: prodMeta.showOnline,
        ...(canViewMoney && prodMeta.dailyRatePaisa !== undefined
          ? { dailyRatePaisa: prodMeta.dailyRatePaisa }
          : {}),
      }
      chosenProductIds.add(prodMeta.id)
    }
  }

  // 4. Sort auto candidates deterministically: frequency DESC, then ID ASC
  const autoCandidates = Array.from(coOccurrenceCounts.entries())
    .filter(([id]) => !chosenProductIds.has(id))
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1] // higher frequency first
      return a[0].localeCompare(b[0]) // tie-breaker by ID
    })

  // 5. Fill remaining slots with auto candidates
  let autoCandidateIdx = 0
  for (let i = 0; i < 6; i++) {
    if (!finalSlots[i] && autoCandidateIdx < autoCandidates.length) {
      const [candId] = autoCandidates[autoCandidateIdx++]!
      const prodMeta = catalog.get(candId)!

      finalSlots[i] = {
        productId: prodMeta.id,
        name: prodMeta.name,
        source: 'auto',
        position: i + 1,
        showOnline: prodMeta.showOnline,
        ...(canViewMoney && prodMeta.dailyRatePaisa !== undefined
          ? { dailyRatePaisa: prodMeta.dailyRatePaisa }
          : {}),
      }
      chosenProductIds.add(prodMeta.id)
    }
  }

  // Filter out any empty slots (if fewer than 6 available)
  return finalSlots.filter((slot): slot is RecommendationResultItem => slot !== null)
}
