import { supabase } from '../supabase'
import { rupees, type Paisa } from '../money'
import { completeReportRead, linesValue, readLineValues, rowsOf, type ReportFilterOptions } from './reportSupport'

/**
 * Promotions & Discounts — coupons, redemptions, discount sources and bundles.
 *
 * RULING 2026-10-16 (R-P6-STATES, Law 16): this read counted coupons,
 * redemptions and bundles (with `|| 842`-style seed fallbacks), summed a
 * `booking_discounts.discount_amount` column that does not exist, and the page
 * rendered `data/promotionsReports` on every path. It now returns:
 *
 *   - per coupon: redemptions in the period and discount given — `coupon_redemptions`
 *   - revenue on bookings that redeemed a coupon — priced lines (`booking_lines_v`)
 *   - discounts by source (count and average percent) — `booking_discounts`
 *   - bundle lines booked and their value — `booking_lines_v.bundle_id`
 *
 * Throws on failure; a period with no promotion activity is empty.
 * Revert = restore the seed re-exports and the `catch`.
 */

export interface CouponPerformanceRow {
  couponId: string
  code: string
  discountPercent: number | null
  isActive: boolean
  redemptions: number
  discountGiven: Paisa
  bookingRevenue: Paisa
}

export interface DiscountSourceRow {
  source: string
  count: number
  averagePercent: number | null
}

export interface BundleUsageRow {
  bundleId: string
  name: string
  bookings: number
  revenue: Paisa
}

export interface PromotionsReportsSummary {
  couponCount: number
  activeCoupons: number
  redemptionCount: number
  discountsGiven: Paisa
  /** Value of the priced lines on bookings that redeemed a coupon in the period. */
  promotionRevenue: Paisa
  /** Revenue ÷ discount given; null when no discount was given. */
  returnOnPromotion: number | null
  coupons: CouponPerformanceRow[]
  discountSources: DiscountSourceRow[]
  bundles: BundleUsageRow[]
}

export async function getPromotionsReportsSummary(options?: ReportFilterOptions): Promise<PromotionsReportsSummary> {
  let redemptionsQ = supabase.from('coupon_redemptions').select('id, coupon_id, booking_id, discount_amount, redeemed_at')
  let discountsQ = supabase.from('booking_discounts').select('id, discount_source, percent, applied_at')
  let bookingsQ = supabase.from('bookings').select('id').is('cancelled_at', null)
  if (options?.from) {
    redemptionsQ = redemptionsQ.gte('redeemed_at', options.from)
    discountsQ = discountsQ.gte('applied_at', options.from)
    bookingsQ = bookingsQ.gte('pickup_at', options.from)
  }
  if (options?.to) {
    redemptionsQ = redemptionsQ.lte('redeemed_at', options.to)
    discountsQ = discountsQ.lte('applied_at', options.to)
    bookingsQ = bookingsQ.lte('pickup_at', options.to)
  }
  if (options?.branchId) {
    discountsQ = discountsQ.eq('branch_id', options.branchId)
    bookingsQ = bookingsQ.eq('branch_id', options.branchId)
  }

  const [couponsRes, redemptionsRes, discountsRes, bundlesRes, bookingsRes, lineMap] = await Promise.all([
    completeReportRead(supabase.from('coupons').select('id, code, discount_percent, is_active'), 'Coupons read failed'),
    completeReportRead(redemptionsQ, 'Coupon redemptions read failed'),
    completeReportRead(discountsQ, 'Booking discounts read failed'),
    completeReportRead(supabase.from('bundles').select('id, name'), 'Bundles read failed'),
    completeReportRead(bookingsQ, 'Bookings read failed'),
    readLineValues(),
  ])
  const coupons = rowsOf<{ id: string; code: string; discount_percent: number | string | null; is_active: boolean | null }>(couponsRes, 'Coupons read failed')
  const redemptions = rowsOf<{ coupon_id: string; booking_id: string; discount_amount: number | string | null }>(redemptionsRes, 'Coupon redemptions read failed')
  const discounts = rowsOf<{ discount_source: string | null; percent: number | string | null }>(discountsRes, 'Booking discounts read failed')
  const bundles = rowsOf<{ id: string; name: string | null }>(bundlesRes, 'Bundles read failed')
  const bookings = rowsOf<{ id: string }>(bookingsRes, 'Bookings read failed')

  const perCoupon = new Map<string, { n: number; discount: number; revenue: number }>()
  let discountsGiven = 0
  let promotionRevenue = 0
  for (const r of redemptions) {
    const d = rupees(Number(r.discount_amount ?? 0) || 0)
    const rev = linesValue(lineMap.get(r.booking_id))
    const acc = perCoupon.get(r.coupon_id) ?? { n: 0, discount: 0, revenue: 0 }
    acc.n++
    acc.discount += d
    acc.revenue += rev
    perCoupon.set(r.coupon_id, acc)
    discountsGiven += d
    promotionRevenue += rev
  }

  const sourceMap = new Map<string, { count: number; pctSum: number; pctN: number }>()
  for (const d of discounts) {
    const source = d.discount_source?.trim() || 'Not set'
    const acc = sourceMap.get(source) ?? { count: 0, pctSum: 0, pctN: 0 }
    acc.count++
    if (d.percent != null && d.percent !== '') {
      acc.pctSum += Number(d.percent) || 0
      acc.pctN++
    }
    sourceMap.set(source, acc)
  }

  const bundleName = new Map(bundles.map((b) => [b.id, b.name?.trim() || '—']))
  const perBundle = new Map<string, { bookings: Set<string>; revenue: number }>()
  for (const b of bookings) {
    for (const l of lineMap.get(b.id) ?? []) {
      if (!l.bundle_id) continue
      const acc = perBundle.get(l.bundle_id) ?? { bookings: new Set<string>(), revenue: 0 }
      acc.bookings.add(b.id)
      acc.revenue += linesValue([l])
      perBundle.set(l.bundle_id, acc)
    }
  }

  return {
    couponCount: coupons.length,
    activeCoupons: coupons.filter((c) => c.is_active !== false).length,
    redemptionCount: redemptions.length,
    discountsGiven: discountsGiven as Paisa,
    promotionRevenue: promotionRevenue as Paisa,
    returnOnPromotion: discountsGiven > 0 ? Number((promotionRevenue / discountsGiven).toFixed(1)) : null,
    coupons: coupons
      .map((c) => {
        const acc = perCoupon.get(c.id)
        return {
          couponId: c.id,
          code: c.code,
          discountPercent: c.discount_percent == null || c.discount_percent === '' ? null : Number(c.discount_percent),
          isActive: c.is_active !== false,
          redemptions: acc?.n ?? 0,
          discountGiven: (acc?.discount ?? 0) as Paisa,
          bookingRevenue: (acc?.revenue ?? 0) as Paisa,
        }
      })
      .sort((a, b) => b.redemptions - a.redemptions || a.code.localeCompare(b.code)),
    discountSources: [...sourceMap.entries()]
      .map(([source, v]) => ({ source, count: v.count, averagePercent: v.pctN > 0 ? Number((v.pctSum / v.pctN).toFixed(1)) : null }))
      .sort((a, b) => b.count - a.count),
    bundles: [...perBundle.entries()]
      .map(([id, v]) => ({ bundleId: id, name: bundleName.get(id) ?? '—', bookings: v.bookings.size, revenue: v.revenue as Paisa }))
      .sort((a, b) => b.revenue - a.revenue || b.bookings - a.bookings),
  }
}
