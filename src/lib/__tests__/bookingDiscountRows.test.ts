import { describe, it, expect } from 'vitest'
import { bookingDiscountRows } from '../bookingDiscountRows'
import type { AppliedDiscountBreakdown } from '../pricingPipeline'
import { rupees } from '../money'

function makeBreakdown(overrides: Partial<AppliedDiscountBreakdown> = {}): AppliedDiscountBreakdown {
  return {
    sources: [],
    rawTotalPercent: 0,
    appliedPercent: 0,
    capped: false,
    discountPaisa: rupees(0),
    validationErrors: [],
    ...overrides,
  }
}

describe('bookingDiscountRows', () => {
  it('returns empty array when no applied discounts exist', () => {
    expect(bookingDiscountRows(makeBreakdown())).toEqual([])
  })

  it('throws when breakdown has validationErrors', () => {
    expect(() =>
      bookingDiscountRows(makeBreakdown({ validationErrors: ['Discount exceeds 100%.'] })),
    ).toThrow('Discount exceeds 100%.')
  })

  it('rejects combining Student/College/Named-client with other discounts', () => {
    const breakdown = makeBreakdown({
      appliedPercent: 25,
      sources: [
        { name: 'Student 15%', percent: 15, applied: true, effectivePercent: 15, discountSource: 'Student' },
        { name: 'Silver 10%', percent: 10, applied: true, effectivePercent: 10, discountSource: 'Membership' },
      ],
    })
    expect(() => bookingDiscountRows(breakdown)).toThrow(/cannot be combined/i)
  })

  it('throws when applied sources do not sum to appliedPercent', () => {
    const breakdown = makeBreakdown({
      appliedPercent: 20,
      sources: [
        { name: 'Manual 10%', percent: 10, applied: true, effectivePercent: 10, discountSource: 'Manual' },
      ],
    })
    expect(() => bookingDiscountRows(breakdown)).toThrow(/do not add up/i)
  })

  it('throws when Coupon source lacks couponId', () => {
    const breakdown = makeBreakdown({
      appliedPercent: 10,
      sources: [
        { name: 'PROMO10', percent: 10, applied: true, effectivePercent: 10, discountSource: 'Coupon' },
      ],
    })
    expect(() => bookingDiscountRows(breakdown)).toThrow(/no database coupon ID/i)
  })

  it('maps Manual, Membership, and Coupon rows with reasons and couponId', () => {
    const breakdown = makeBreakdown({
      appliedPercent: 20,
      sources: [
        { name: 'Manual', percent: 5, applied: true, effectivePercent: 5, discountSource: 'Manual' },
        { name: 'Gold Tier', percent: 10, applied: true, effectivePercent: 10, discountSource: 'Membership' },
        { name: 'SAVE5', percent: 5, applied: true, effectivePercent: 5, discountSource: 'Coupon', couponId: 'cup-1' },
      ],
    })

    const rows = bookingDiscountRows(breakdown, 'Long shoot', 'Babin')
    expect(rows).toEqual([
      {
        discountSource: 'Manual',
        percent: 5,
        reason: 'Long shoot · Authorized by: Babin',
        approverId: null,
      },
      {
        discountSource: 'Membership',
        percent: 10,
        reason: 'Gold Tier',
        approverId: null,
      },
      {
        discountSource: 'Coupon',
        percent: 5,
        reason: 'SAVE5',
        approverId: null,
        couponId: 'cup-1',
      },
    ])
  })
})
