import type { Paisa } from '../money'
import { supabase } from '../supabase'

/**
 * =============================================================================
 * cancellationFeeTiers.ts — T3-03: Cancellation Fee Policy (Option A)
 *
 * Implements the 2 Nov 2026 Owner-approved Option A policy:
 * - >48h: Free for all durations.
 * - 24–48h: Free for 1–2 days; 50% of equipment rental subtotal for >2 days.
 * - <=24h: 1 day charge for 1–2 days; max(1 day charge, 50% subtotal) for >2 days.
 *
 * Base: Equipment rental subtotal before VAT (Ruling O-13).
 * Advances above the cancellation fee are refunded via reversal rows (Law 4).
 * =============================================================================
 */

export interface CancellationFeeTier {
  id: string
  noticeHours: number
  feePercent: number
  retiredAt: string | null
  createdAt: string
}

export interface CancellationFeeCalculationInput {
  /** Hours remaining until scheduled rental start in Kathmandu context */
  hoursUntilStart: number
  /** Booking duration in rental days */
  rentalDays: number
  /** Equipment rental subtotal before VAT in Paisa */
  rentalSubtotalBeforeVatPaisa: Paisa
  /** Charge for one rental day in Paisa */
  oneDayChargePaisa: Paisa
  /** Paid advance in Paisa (optional) */
  paidAdvancePaisa?: Paisa | null | undefined
}

export interface CancellationFeeCalculationResult {
  tierDescription: string
  feeRateDescription: string
  suggestedFeePaisa: Paisa
  isFree: boolean
  paidAdvancePaisa: Paisa
  refundPaisa: Paisa
  remainingOwedPaisa: Paisa
  feeBaseDescription: string
}

export function calculateOptionACancellationFee(
  input: CancellationFeeCalculationInput,
): CancellationFeeCalculationResult {
  const {
    hoursUntilStart,
    rentalDays,
    rentalSubtotalBeforeVatPaisa,
    oneDayChargePaisa,
    paidAdvancePaisa = 0 as Paisa,
  } = input

  const advance = (paidAdvancePaisa ?? 0) as Paisa
  let tierDescription = ''
  let feeRateDescription = ''
  let suggestedFeePaisa = 0 as Paisa
  let isFree = false

  // Option A rules (Ruling 2026-11-02):
  if (hoursUntilStart > 48) {
    tierDescription = '>48 hours before scheduled start'
    feeRateDescription = 'Free cancellation'
    suggestedFeePaisa = 0 as Paisa
    isFree = true
  } else if (hoursUntilStart > 24) {
    // 24 to 48 hours
    if (rentalDays <= 2) {
      tierDescription = '24–48 hours before start (1–2 rental days duration)'
      feeRateDescription = 'Free cancellation'
      suggestedFeePaisa = 0 as Paisa
      isFree = true
    } else {
      tierDescription = '24–48 hours before start (>2 rental days duration)'
      feeRateDescription = '50% of equipment rental subtotal before VAT'
      suggestedFeePaisa = Math.round(rentalSubtotalBeforeVatPaisa * 0.5) as Paisa
      isFree = false
    }
  } else {
    // <= 24 hours (final 24 hours including exact 24-hour mark)
    if (rentalDays <= 2) {
      tierDescription = 'Final 24 hours before start (1–2 rental days duration)'
      feeRateDescription = 'One rental day charge'
      suggestedFeePaisa = oneDayChargePaisa
      isFree = false
    } else {
      tierDescription = 'Final 24 hours before start (>2 rental days duration)'
      feeRateDescription = 'Higher of 1 rental day charge or 50% of rental subtotal'
      const halfSubtotal = Math.round(rentalSubtotalBeforeVatPaisa * 0.5)
      suggestedFeePaisa = Math.max(oneDayChargePaisa, halfSubtotal) as Paisa
      isFree = false
    }
  }

  let refundPaisa = 0 as Paisa
  let remainingOwedPaisa = 0 as Paisa

  if (advance > 0) {
    if (advance >= suggestedFeePaisa) {
      refundPaisa = (advance - suggestedFeePaisa) as Paisa
      remainingOwedPaisa = 0 as Paisa
    } else {
      refundPaisa = 0 as Paisa
      remainingOwedPaisa = (suggestedFeePaisa - advance) as Paisa
    }
  } else {
    refundPaisa = 0 as Paisa
    remainingOwedPaisa = suggestedFeePaisa
  }

  return {
    tierDescription,
    feeRateDescription,
    suggestedFeePaisa,
    isFree,
    paidAdvancePaisa: advance,
    refundPaisa,
    remainingOwedPaisa,
    feeBaseDescription: 'Equipment rental subtotal before VAT (Ruling O-13)',
  }
}

export async function fetchCancellationFeeTiers(): Promise<CancellationFeeTier[]> {
  const { data, error } = await supabase
    .from('cancellation_fee_tiers')
    .select('id, notice_hours, fee_percent, retired_at, created_at')
    .is('retired_at', null)
    .order('notice_hours', { ascending: false })

  if (error) throw new Error(`Could not read cancellation fee tiers: ${error.message}`)

  return ((data ?? []) as unknown as Array<{
    id: string
    notice_hours: number
    fee_percent: number | string
    retired_at: string | null
    created_at: string
  }>).map((row) => ({
    id: row.id,
    noticeHours: row.notice_hours,
    feePercent: Number(row.fee_percent),
    retiredAt: row.retired_at,
    createdAt: row.created_at,
  }))
}

export async function suggestCancellationFee(
  noticeHours: number,
  tiers: CancellationFeeTier[],
): Promise<number | null> {
  if (tiers.length === 0) return null
  const sorted = [...tiers].sort((a, b) => a.noticeHours - b.noticeHours)
  let best: CancellationFeeTier | null = null
  for (const tier of sorted) {
    if (noticeHours >= tier.noticeHours) {
      if (!best || tier.noticeHours > best.noticeHours) {
        best = tier
      }
    }
  }
  return best ? best.feePercent : null
}
