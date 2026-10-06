import { supabase } from '../supabase'
import { rupees, type Paisa } from '../money'
import type { PromoCodeDefinition } from '../pricingPipeline'

/**
 * Promo codes come from the `coupons` table only — never from a constant in
 * code (RULING 2026-10-07: the hardcoded NEPALFILM/MONSOON26/… table was demo
 * data on the production path; Babin's real codes live in the database).
 *
 * `lookupPromo` returns a definition or a reason. A failed read is a reason
 * ("could not verify"), never an invented discount.
 */

export type PromoLookup =
  | { ok: true; promo: PromoCodeDefinition }
  | { ok: false; reason: string }

interface CouponRow {
  code: string
  description: string | null
  discount_percent: number | string
  min_booking_amount: number | string | null
  valid_from: string
  valid_until: string
  max_redemptions: number | null
  current_redemptions: number
  is_active: boolean
}

/** Definitions the booking was validated against, keyed by upper-case code. */
const applied = new Map<string, PromoCodeDefinition>()

export function toPromoDefinition(row: CouponRow): PromoCodeDefinition {
  const min = Number(row.min_booking_amount ?? 0)
  return {
    code: row.code.toUpperCase(),
    discountPercent: Number(row.discount_percent),
    active: row.is_active,
    ...(row.description ? { description: row.description } : {}),
    validFrom: row.valid_from,
    validTo: row.valid_until,
    ...(min > 0 ? { minSpendPaisa: rupees(min) as Paisa } : {}),
  }
}

export async function lookupPromo(rawCode: string): Promise<PromoLookup> {
  const code = rawCode.trim().toUpperCase()
  if (!code) return { ok: false, reason: 'Enter a promo code.' }
  const { data, error } = await supabase
    .from('coupons')
    .select(
      'code, description, discount_percent, min_booking_amount, valid_from, valid_until, max_redemptions, current_redemptions, is_active',
    )
    .eq('code', code)
    .maybeSingle()
  if (error) return { ok: false, reason: 'Could not verify the promo code. Try again.' }
  if (!data) return { ok: false, reason: `Promo code "${code}" is invalid or expired.` }
  const row = data as unknown as CouponRow
  if (row.max_redemptions != null && row.current_redemptions >= row.max_redemptions) {
    return { ok: false, reason: `Promo code "${code}" has reached its redemption limit.` }
  }
  const promo = toPromoDefinition(row)
  applied.set(promo.code, promo)
  return { ok: true, promo }
}

/** The definition `lookupPromo` validated for this code, or null. */
export function appliedPromo(code: string | null | undefined): PromoCodeDefinition | null {
  return code ? (applied.get(code.toUpperCase()) ?? null) : null
}
