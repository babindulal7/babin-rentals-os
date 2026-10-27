import { roundHalfUp, formatMoney, type Paisa } from './money'
import { getBusinessToday, kathmanduCivil } from './bs'

/**
 * # Canonical Pricing Pipeline — Babin Rentals OS (Task 6)
 *
 * Implements the 13-step canonical calculation pipeline:
 *  1. Equipment subtotal (standalone items)
 *  2. Bundle subtotal (bundle lines)
 *  3. Services subtotal (services & custom manual items)
 *  4. Crew subtotal (day rates * days + overtime + accommodation + meals)
 *  5. Delivery / other fees (delivery charge + fuel charge)
 *  6. Eligible discounts (membership, duration, women DoP/director, promo, manual)
 *  7. Discount stacking cap (25% max cap; Student/College bundle protection)
 *  8. Taxable subtotal (Subtotal - Discount + Taxable transport/fees)
 *  9. VAT (13% or configured rate)
 * 10. Rental total (Taxable + VAT)
 * 11. Security deposit (Liability, NOT revenue, not taxable, not discountable)
 * 12. Advance required (Tiered: <= 5,000 full, <= 10,000 5,000, > 10,000 50%)
 * 13. Grand amount due / booking requirement
 */

export const DISCOUNT_STACKING_CAP_PERCENT = 25
export const DEFAULT_VAT_RATE_PERCENT = 13
export const WOMEN_DOP_DISCOUNT_PERCENT = 5

/** Promotions use the Kathmandu calendar date, not the UTC date of the pickup. */
export function promotionDateAd(instant: Date): string {
  if (!Number.isFinite(instant.getTime())) throw new Error('Invalid promotional booking date')
  return new Date(kathmanduCivil(instant)).toISOString().slice(0, 10)
}

/** Legacy ISO inputs are normalized; date-only AD strings are preserved. */
function normalizePromotionDate(value?: string): string {
  if (!value) return getBusinessToday().toISOString().slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  return promotionDateAd(new Date(value))
}

export interface PromoCodeDefinition {
  code: string
  discountPercent: number
  active: boolean
  description?: string
  validFrom?: string // ISO date
  validTo?: string // ISO date
  applicableCategories?: readonly string[] // If empty, applies to all
  minSpendPaisa?: Paisa
  allowStacking?: boolean
  /** `coupons.id` — carried to booking_discounts.coupon_id. */
  couponId?: string
}

export interface DiscountDetails {
  membershipPercent?: number
  durationPercent?: number
  bundleSavingPercent?: number
  womenDopEligible?: boolean
  promoCode?: PromoCodeDefinition | null
  manualDiscountPercent?: number
  manualDiscountReason?: string | null
  manualDiscountAuthorizedBy?: string | null
  isStudentBundle?: boolean
  isStaffClient?: boolean
  staffDiscountPercent?: number
  staffDiscountRemoved?: boolean
}

/* RULING 2026-10-07: the hard-coded PROMO_CODES demo table is deleted. A code exists only as a
   row in `coupons` (see lib/queries/couponLookup.ts); the pipeline receives the resolved definition. */

export interface PricingPipelineInput {
  equipmentSubtotalPaisa: Paisa
  bundleSubtotalPaisa: Paisa
  subRentalSubtotalPaisa?: Paisa | undefined
  servicesSubtotalPaisa: Paisa
  crewSubtotalPaisa: Paisa
  deliveryChargePaisa: Paisa
  fuelChargePaisa: Paisa
  discounts?: DiscountDetails | undefined
  vatEnabled: boolean
  vatRatePercent?: number | undefined
  // Security deposit
  recommendedDepositPaisa?: Paisa | undefined
  manualDepositOverridePaisa?: Paisa | null | undefined
  depositOverrideReason?: string | null | undefined
  depositAuthorizedBy?: string | null | undefined
  // Booking instant/dates for promo check
  bookingDateAd?: string | undefined
}

export interface AppliedDiscountBreakdown {
  rawTotalPercent: number
  appliedPercent: number
  capped: boolean
  discountPaisa: Paisa
  sources: Array<{
    name: string
    percent: number
    applied: boolean
    /** Database provenance; create_booking must preserve this source. */
    discountSource?: 'Manual' | 'Membership' | 'Coupon' | 'Women-DoP 5%' | 'Student' | 'College' | 'Named-client rates' | 'Staff'
    couponId?: string
    /** Actual percentage after stacking, as stored in booking_discounts. */
    effectivePercent?: number
    exclusionReason?: string
  }>
  validationErrors: string[]
}

export interface SecurityDepositDetails {
  recommendedPaisa: Paisa
  overridden: boolean
  requiredPaisa: Paisa
  overrideReason: string | null
  authorizedBy: string | null
  validationErrors: string[]
}

export interface PricingPipelineResult {
  // Step 1 - 5: Subtotals
  equipmentSubtotalPaisa: Paisa
  bundleSubtotalPaisa: Paisa
  subRentalSubtotalPaisa: Paisa
  servicesSubtotalPaisa: Paisa
  crewSubtotalPaisa: Paisa
  deliverySubtotalPaisa: Paisa
  grossSubtotalPaisa: Paisa

  // Step 6 - 7: Discounts
  discounts: AppliedDiscountBreakdown

  // Step 8: Taxable subtotal
  taxableSubtotalPaisa: Paisa

  // Step 9: VAT
  vatRatePercent: number
  vatPaisa: Paisa

  // Step 10: Rental total
  rentalTotalPaisa: Paisa

  // Step 11: Security deposit (held liability, separate from rental charges)
  securityDeposit: SecurityDepositDetails

  // Step 12: Advance required
  advanceRequiredPaisa: Paisa

  // Step 13: Grand booking requirement
  grandTotalRequirementPaisa: Paisa
}

/** Round paisa half-up to the nearest rupee (multiples of 100 paisa) */
function toWholeRupeePaisa(paisa: number): Paisa {
  return (roundHalfUp(paisa / 100) * 100) as Paisa
}

/**
 * Calculates advance required based on Babin Rentals rules:
 * - Rental total <= NPR 5,000 (500,000 paisa) -> Full advance (100%)
 * - Rental total <= NPR 10,000 (1,000,000 paisa) -> NPR 5,000 (500,000 paisa)
 * - Rental total > NPR 10,000 -> 50% advance
 */
export function calculateAdvanceRequired(rentalTotalPaisa: Paisa): Paisa {
  if (rentalTotalPaisa <= 0) return 0 as Paisa
  const fiveThousand = 500000
  const tenThousand = 1000000

  if (rentalTotalPaisa <= fiveThousand) {
    return rentalTotalPaisa
  }
  if (rentalTotalPaisa <= tenThousand) {
    return toWholeRupeePaisa(Math.min(rentalTotalPaisa, fiveThousand))
  }
  return toWholeRupeePaisa(rentalTotalPaisa * 0.5)
}

/**
 * Evaluates discount rules, stacking exclusions, and 25% stacking cap.
 */
export function evaluateDiscounts(
  discounts: DiscountDetails | undefined,
  grossSubtotalPaisa: Paisa,
  bookingDateAd?: string,
): AppliedDiscountBreakdown {
  if (!discounts) {
    return {
      rawTotalPercent: 0,
      appliedPercent: 0,
      capped: false,
      discountPaisa: 0 as Paisa,
      sources: [],
      validationErrors: [],
    }
  }

  const validationErrors: string[] = []
  const manual = discounts.manualDiscountPercent ?? 0
  if (!Number.isFinite(manual) || manual < 0 || manual > 100) {
    validationErrors.push('Manual discount must be between 0% and 100%.')
  }

  const sources: AppliedDiscountBreakdown['sources'] = []
  const isStudent = Boolean(discounts.isStudentBundle)
  if (isStudent && (discounts.bundleSavingPercent ?? 0) > 0 && (Boolean(discounts.womenDopEligible) || manual > 0)) {
    validationErrors.push('Student bundle discounts are exclusive in the database. Remove the manual/Women DoP addition, or select a different bundle rate.')
  }

  // 1. Student bundle protection:
  // If student bundle is chosen, policy excludes other extra discounts (membership, duration, promo)
  if (isStudent) {
    if (discounts.bundleSavingPercent && discounts.bundleSavingPercent > 0) {
      sources.push({
        name: 'Student Bundle Rate',
        discountSource: 'Student',
        percent: discounts.bundleSavingPercent,
        applied: true,
      })
    }
    if (discounts.membershipPercent && discounts.membershipPercent > 0) {
      sources.push({
        name: 'Membership Discount',
        discountSource: 'Membership',
        percent: discounts.membershipPercent,
        applied: false,
        exclusionReason: 'Student bundles do not stack with membership discounts',
      })
    }
    if (discounts.durationPercent && discounts.durationPercent > 0) {
      sources.push({
        name: 'Duration Discount',
        discountSource: 'Manual',
        percent: discounts.durationPercent,
        applied: false,
        exclusionReason: 'Student bundles do not stack with duration discounts',
      })
    }
    if (discounts.promoCode) {
      sources.push({
        name: `Promo (${discounts.promoCode.code})`,
        percent: discounts.promoCode.discountPercent,
        applied: false,
        exclusionReason: 'Student bundles do not stack with promotional codes',
      })
    }
    // Women DoP and manual discounts cannot stack with exclusive student bundle rates
    if (discounts.womenDopEligible) {
      sources.push({
        name: 'Women DoP / Director Initiative',
        discountSource: 'Women-DoP 5%',
        percent: WOMEN_DOP_DISCOUNT_PERCENT,
        applied: false,
        exclusionReason: 'Student bundles do not stack with Women DoP discount',
      })
    }
    if (discounts.manualDiscountPercent && discounts.manualDiscountPercent > 0) {
      sources.push({
        name: `Manual (${discounts.manualDiscountReason || 'Manual discount'})`,
        discountSource: 'Manual',
        percent: discounts.manualDiscountPercent,
        applied: false,
        exclusionReason: 'Student bundles do not stack with manual discounts',
      })
    }
    if (discounts.isStaffClient) {
      const staffPct = discounts.staffDiscountPercent ?? 20
      sources.push({
        name: `Staff Discount (${staffPct}%)`,
        discountSource: 'Staff',
        percent: staffPct,
        applied: false,
        exclusionReason: 'Student bundles do not stack with staff discounts',
      })
    }
  } else {
    // Normal discount stacking
    if (discounts.isStaffClient) {
      const staffPct = discounts.staffDiscountPercent ?? 20
      if (discounts.staffDiscountRemoved) {
        sources.push({
          name: `Staff Discount (${staffPct}%)`,
          discountSource: 'Staff',
          percent: staffPct,
          applied: false,
          exclusionReason: 'Staff discount removed',
        })
      } else {
        sources.push({
          name: `Staff Discount (${staffPct}%)`,
          discountSource: 'Staff',
          percent: staffPct,
          applied: true,
        })
      }
    }
    if (discounts.membershipPercent && discounts.membershipPercent > 0) {
      sources.push({
        name: 'Membership Discount',
        discountSource: 'Membership',
        percent: discounts.membershipPercent,
        applied: true,
      })
    }
    if (discounts.durationPercent && discounts.durationPercent > 0) {
      sources.push({
        name: 'Duration Discount',
        discountSource: 'Manual',
        percent: discounts.durationPercent,
        applied: true,
      })
    }
    if (discounts.bundleSavingPercent && discounts.bundleSavingPercent > 0) {
      sources.push({
        name: 'Bundle Benefit',
        discountSource: 'Manual',
        percent: discounts.bundleSavingPercent,
        applied: true,
      })
    }
    if (discounts.womenDopEligible) {
      sources.push({
        name: 'Women DoP / Director Initiative',
        discountSource: 'Women-DoP 5%',
        percent: WOMEN_DOP_DISCOUNT_PERCENT,
        applied: true,
      })
    }

    // Promo code validation
    if (discounts.promoCode) {
      const p = discounts.promoCode
      const today = normalizePromotionDate(bookingDateAd)
      let valid = p.active
      let failReason: string | undefined

      if (!valid) {
        failReason = 'Promo code is inactive'
      } else if (p.validFrom && today < p.validFrom) {
        valid = false
        failReason = `Promo code not valid until ${p.validFrom}`
      } else if (p.validTo && today > p.validTo) {
        valid = false
        failReason = `Promo code expired on ${p.validTo}`
      } else if (p.minSpendPaisa && grossSubtotalPaisa < p.minSpendPaisa) {
        valid = false
        failReason = `Minimum spend of ${formatMoney(p.minSpendPaisa)} not met`
      }

      sources.push({
        name: `Promo (${p.code})`,
        discountSource: 'Coupon',
        ...(p.couponId ? { couponId: p.couponId } : {}),
        percent: p.discountPercent,
        applied: valid,
        ...(failReason ? { exclusionReason: failReason } : {}),
      })
    }

    // Manual discount
    if (discounts.manualDiscountPercent && discounts.manualDiscountPercent > 0) {
      sources.push({
        name: `Manual (${discounts.manualDiscountReason || 'Manual discount'})`,
        discountSource: 'Manual',
        percent: discounts.manualDiscountPercent,
        applied: true,
      })
    }
  }

  // Sum applied percentage
  const rawTotalPercent = sources
    .filter((s) => s.applied)
    .reduce((sum, s) => sum + s.percent, 0)

  // Standalone discounts are not stacks. The 25% cap applies when combining
  // multiple benefits; a standalone manual adjustment may be up to 100%.
  const stacking = sources.filter((source) => source.applied && source.percent > 0).length > 1
  const limit = stacking ? DISCOUNT_STACKING_CAP_PERCENT : 100
  const capped = rawTotalPercent > limit
  const appliedPercent = Math.min(limit, Math.max(0, rawTotalPercent))
  let remaining = appliedPercent
  const allocatedSources = sources.map((source) => {
    const effectivePercent = source.applied ? Math.min(Math.max(0, source.percent), remaining) : 0
    remaining = Math.max(0, remaining - effectivePercent)
    return { ...source, effectivePercent }
  })

  const discountPaisa = toWholeRupeePaisa(grossSubtotalPaisa * (appliedPercent / 100))

  return {
    rawTotalPercent,
    appliedPercent,
    capped,
    discountPaisa,
    sources: allocatedSources,
    validationErrors,
  }
}

/**
 * Calculates recommended security deposit:
 * Standard recommendation: 25% of equipment subtotal, or baseline NPR 10,000 (1,000,000 paisa)
 * minimum when equipment is booked, floored at 0.
 */
export function calculateRecommendedDeposit(equipmentSubtotalPaisa: Paisa, bundleSubtotalPaisa: Paisa): Paisa {
  const gearPaisa = equipmentSubtotalPaisa + bundleSubtotalPaisa
  if (gearPaisa <= 0) return 0 as Paisa
  // Baseline 25% of equipment rental value or minimum 10,000 Rs
  const raw = Math.max(1000000, gearPaisa * 0.25)
  return toWholeRupeePaisa(raw)
}

/**
 * Main Canonical Pricing Pipeline
 */
export function calculatePricingPipeline(input: PricingPipelineInput): PricingPipelineResult {
  // 1 - 5: Subtotals
  const equipmentSubtotalPaisa = Math.max(0, input.equipmentSubtotalPaisa) as Paisa
  const bundleSubtotalPaisa = Math.max(0, input.bundleSubtotalPaisa) as Paisa
  const subRentalSubtotalPaisa = Math.max(0, input.subRentalSubtotalPaisa ?? 0) as Paisa
  const servicesSubtotalPaisa = Math.max(0, input.servicesSubtotalPaisa) as Paisa
  const crewSubtotalPaisa = Math.max(0, input.crewSubtotalPaisa) as Paisa
  const deliverySubtotalPaisa = Math.max(0, input.deliveryChargePaisa + input.fuelChargePaisa) as Paisa

  const grossSubtotalPaisa = (
    equipmentSubtotalPaisa +
    bundleSubtotalPaisa +
    subRentalSubtotalPaisa +
    servicesSubtotalPaisa +
    crewSubtotalPaisa +
    deliverySubtotalPaisa
  ) as Paisa

  // 6 - 7: Eligible discounts and 25% cap
  const discounts = evaluateDiscounts(input.discounts, grossSubtotalPaisa, input.bookingDateAd)

  // 8: Taxable subtotal
  const taxableSubtotalPaisa = Math.max(0, grossSubtotalPaisa - discounts.discountPaisa) as Paisa

  // 9: VAT (default 13% if enabled)
  const vatRate = input.vatEnabled ? (input.vatRatePercent ?? DEFAULT_VAT_RATE_PERCENT) : 0
  const vatPaisa = toWholeRupeePaisa(taxableSubtotalPaisa * (vatRate / 100))

  // 10: Rental Total (never includes Security Deposit)
  const rentalTotalPaisa = (taxableSubtotalPaisa + vatPaisa) as Paisa

  // 11: Security Deposit (separate liability, not revenue)
  const recommendedDeposit = input.recommendedDepositPaisa !== undefined
    ? input.recommendedDepositPaisa
    : calculateRecommendedDeposit(equipmentSubtotalPaisa, bundleSubtotalPaisa)

  const overridden = input.manualDepositOverridePaisa !== undefined && input.manualDepositOverridePaisa !== null
  const requiredDepositPaisa = overridden
    ? (Math.max(0, input.manualDepositOverridePaisa!) as Paisa)
    : recommendedDeposit

  const depositValidationErrors: string[] = []
  if (overridden) {
    if (!input.depositOverrideReason || input.depositOverrideReason.trim().length === 0) {
      depositValidationErrors.push('Manual security deposit override requires an explanatory reason.')
    }
    if (!input.depositAuthorizedBy || input.depositAuthorizedBy.trim().length === 0) {
      depositValidationErrors.push('Manual security deposit override requires an authorizing manager.')
    }
  }

  const securityDeposit: SecurityDepositDetails = {
    recommendedPaisa: recommendedDeposit,
    overridden,
    requiredPaisa: requiredDepositPaisa,
    overrideReason: overridden ? input.depositOverrideReason ?? null : null,
    authorizedBy: overridden ? input.depositAuthorizedBy ?? null : null,
    validationErrors: depositValidationErrors,
  }

  // 12: Advance Required
  const advanceRequiredPaisa = calculateAdvanceRequired(rentalTotalPaisa)

  // 13: Grand Total Requirement = Rental Total + Required Security Deposit
  const grandTotalRequirementPaisa = (rentalTotalPaisa + requiredDepositPaisa) as Paisa

  return {
    equipmentSubtotalPaisa,
    bundleSubtotalPaisa,
    subRentalSubtotalPaisa,
    servicesSubtotalPaisa,
    crewSubtotalPaisa,
    deliverySubtotalPaisa,
    grossSubtotalPaisa,
    discounts,
    taxableSubtotalPaisa,
    vatRatePercent: vatRate,
    vatPaisa,
    rentalTotalPaisa,
    securityDeposit,
    advanceRequiredPaisa,
    grandTotalRequirementPaisa,
  }
}
