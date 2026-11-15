import { describe, it, expect } from 'vitest'
import {
  calculateOptionACancellationFee,
  suggestCancellationFee,
  type CancellationFeeTier,
} from '../queries/cancellationFeeTiers'
import { rupees } from '../money'

describe('calculateOptionACancellationFee (Ruling 2 Nov 2026, Option A)', () => {
  // Test case from Ruling 2026-11-02-OWNER.md line 41:
  // "5 × Rs 3,500 = Rs 17,500 rental: cancel 72 h out → Rs 0; 36 h → Rs 8,750;
  //  12 h → max(Rs 3,500, Rs 8,750) = Rs 8,750. A 2-day booking 36 h out → Rs 0;
  //  cancelled 12 h out → one rental day's charge."
  const subtotalPaisa = rupees(17500)
  const oneDayChargePaisa = rupees(3500)
  const fiveDays = 5

  it('calculates Free cancellation when more than 48 hours out (>2 days duration)', () => {
    const res = calculateOptionACancellationFee({
      hoursUntilStart: 72,
      rentalDays: fiveDays,
      rentalSubtotalBeforeVatPaisa: subtotalPaisa,
      oneDayChargePaisa,
    })

    expect(res.isFree).toBe(true)
    expect(res.suggestedFeePaisa).toBe(0)
    expect(res.tierDescription).toContain('>48 hours')
  })

  it('calculates 50% subtotal when between 24 and 48 hours out (>2 days duration)', () => {
    const res = calculateOptionACancellationFee({
      hoursUntilStart: 36,
      rentalDays: fiveDays,
      rentalSubtotalBeforeVatPaisa: subtotalPaisa,
      oneDayChargePaisa,
    })

    expect(res.isFree).toBe(false)
    expect(res.suggestedFeePaisa).toBe(rupees(8750))
    expect(res.feeRateDescription).toContain('50%')
  })

  it('calculates higher of 1 day or 50% subtotal when within final 24 hours (>2 days duration)', () => {
    const res = calculateOptionACancellationFee({
      hoursUntilStart: 12,
      rentalDays: fiveDays,
      rentalSubtotalBeforeVatPaisa: subtotalPaisa,
      oneDayChargePaisa,
    })

    expect(res.isFree).toBe(false)
    expect(res.suggestedFeePaisa).toBe(rupees(8750)) // max(3500, 8750) = 8750
  })

  it('calculates Free cancellation for a 2-day booking 36 hours out (1–2 days duration)', () => {
    const twoDaysSubtotal = rupees(7000)
    const res = calculateOptionACancellationFee({
      hoursUntilStart: 36,
      rentalDays: 2,
      rentalSubtotalBeforeVatPaisa: twoDaysSubtotal,
      oneDayChargePaisa,
    })

    expect(res.isFree).toBe(true)
    expect(res.suggestedFeePaisa).toBe(0)
  })

  it('calculates one day charge for a 2-day booking cancelled 12 hours out (final 24 hours)', () => {
    const twoDaysSubtotal = rupees(7000)
    const res = calculateOptionACancellationFee({
      hoursUntilStart: 12,
      rentalDays: 2,
      rentalSubtotalBeforeVatPaisa: twoDaysSubtotal,
      oneDayChargePaisa,
    })

    expect(res.isFree).toBe(false)
    expect(res.suggestedFeePaisa).toBe(rupees(3500))
  })

  it('calculates customer refund when paid advance exceeds the cancellation fee', () => {
    const advancePaisa = rupees(10000)
    const res = calculateOptionACancellationFee({
      hoursUntilStart: 36,
      rentalDays: fiveDays,
      rentalSubtotalBeforeVatPaisa: subtotalPaisa,
      oneDayChargePaisa,
      paidAdvancePaisa: advancePaisa,
    })

    expect(res.suggestedFeePaisa).toBe(rupees(8750))
    expect(res.refundPaisa).toBe(rupees(1250)) // 10000 - 8750 = 1250
    expect(res.remainingOwedPaisa).toBe(0)
  })

  it('suggestCancellationFee returns correct legacy tier percentage or null', async () => {
    const tiers: CancellationFeeTier[] = [
      { id: '1', noticeHours: 48, feePercent: 25, retiredAt: null, createdAt: '' },
      { id: '2', noticeHours: 24, feePercent: 50, retiredAt: null, createdAt: '' },
    ]

    expect(await suggestCancellationFee(72, tiers)).toBe(25)
    expect(await suggestCancellationFee(30, tiers)).toBe(50)
    expect(await suggestCancellationFee(10, tiers)).toBe(null)
    expect(await suggestCancellationFee(10, [])).toBe(null)
  })
})
