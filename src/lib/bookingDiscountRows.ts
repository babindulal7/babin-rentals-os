import type { CreateRentalDiscount } from '../actions/rentals/createRental'
import type { AppliedDiscountBreakdown } from './pricingPipeline'

/** Convert the *applied*, capped quotation into typed, auditable booking rows.
 * No synthetic Manual row: preserve coupon_id, membership and Women DoP.
 * Caller owns client UUIDs so retrying one press retains stable idempotency keys.
 */
export function bookingDiscountRows(
  breakdown: AppliedDiscountBreakdown,
  manualReason = '',
  authorizedByNote = '',
): Array<Omit<CreateRentalDiscount, 'clientUuid'>> {
  if (breakdown.validationErrors.length) {
    throw new Error(breakdown.validationErrors.join(' '))
  }

  const applied = breakdown.sources.filter((s) => s.applied && (s.effectivePercent ?? 0) > 0)
  const hasExclusiveStudent = applied.some((s) => ['Student', 'College', 'Named-client rates'].includes(s.discountSource ?? ''))
  if (hasExclusiveStudent && applied.length > 1) {
    throw new Error('Student, College and named-client discount benefits cannot be combined with other discounts.')
  }
  const appliedTotal = applied.reduce((sum, s) => sum + (s.effectivePercent ?? 0), 0)
  if (Math.abs(appliedTotal - breakdown.appliedPercent) > 0.001) {
    throw new Error('The applied discount rows do not add up to the quoted discount. Nothing was written.')
  }

  const textReason = [manualReason.trim(), authorizedByNote.trim() ? `Authorized by: ${authorizedByNote.trim()}` : ''].filter(Boolean).join(' · ')
  return applied.map((source) => {
    if (!source.discountSource) {
      throw new Error(`Discount source is missing for ${source.name}. Nothing was written.`)
    }
    if (source.discountSource === 'Coupon' && !source.couponId) {
      throw new Error('The applied promo code has no database coupon ID. Reapply a verified code before confirming.')
    }
    return {
      discountSource: source.discountSource,
      percent: source.effectivePercent ?? 0,
      reason: source.discountSource === 'Manual' ? (textReason || source.name) : source.name,
      approverId: null,
      ...(source.discountSource === 'Coupon' ? { couponId: source.couponId } : {}),
    }
  })
}
