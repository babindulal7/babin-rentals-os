import { describe, it, expect } from 'vitest'
import {
  explainCanonicalQuote,
  type CanonicalQuoteSnapshot,
} from '../quoteExplainer'
import { rupees } from '../../money'

describe('Rental Intelligence RI-02: Canonical Quote Explainer Engine', () => {
  const sampleSnapshot: CanonicalQuoteSnapshot = {
    bookingId: 'BK-2026-1123',
    days: 3,
    lineItems: [
      {
        productId: 'BRPI-SONY-FX3A-BODY',
        displayName: 'Sony FX3A Cinema Body',
        quantity: 1,
        unitRatePaisa: rupees(3500),
        lineTotalPaisa: rupees(10500),
      },
      {
        productId: 'BRPI-NISI-ATHENA-SET',
        displayName: 'NiSi Athena Cine Prime Set (PL/E)',
        quantity: 1,
        unitRatePaisa: rupees(4000),
        lineTotalPaisa: rupees(12000),
      },
    ],
    equipmentSubtotalPaisa: rupees(22500),
    discountPercent: 5.0,
    discountAmountPaisa: rupees(1125),
    discountReason: 'Loyalty customer discount',
    discountApprover: 'Manager (Santosh)',
    taxRatePercent: 13,
    taxAmountPaisa: rupees(2779), // (22500 - 1125) * 0.13 = 2778.75 -> 2779
    totalRentalPaisa: rupees(24154),
    depositPaisa: rupees(50000),
    advancePaidPaisa: rupees(15000), // > 50% of 24154
    outstandingPaisa: rupees(9154),
    currency: 'NPR',
    calculatedAtIso: '2026-11-23T12:00:00Z',
  }

  it('explains transparent canonical totals with exact integer paisa arithmetic (RI-A13)', () => {
    const result = explainCanonicalQuote(sampleSnapshot, 'Owner')
    expect(result.isMoneyMasked).toBe(false)
    expect(result.durationDays).toBe(3)
    expect(result.equipmentSubtotalFormatted).toBe('Rs 22,500')
    expect(result.discountFormatted).toBe('Rs 1,125')
    expect(result.vatFormatted).toBe('Rs 2,779')
    expect(result.totalRentalFormatted).toBe('Rs 24,154')
    expect(result.advanceThresholdMet).toBe(true)
    expect(result.outstandingBalanceFormatted).toBe('Rs 9,154')
    expect(result.evidenceState).toBe('supported')
  })

  it('enforces Law 5 Security Deposit Liability separation (RI-A14)', () => {
    const result = explainCanonicalQuote(sampleSnapshot, 'Manager')
    expect(result.depositLiabilityFormatted).toBe('Rs 50,000')

    const depositAdv = result.advices.find((a) => a.id.includes('deposit-law5'))
    expect(depositAdv).toBeDefined()
    expect(depositAdv?.explanation).toContain('SECURITY DEPOSIT (Law 5)')
    expect(depositAdv?.explanation).toContain('strictly segregated from operational rental revenue')
  })

  it('flags unapproved discounts >10% under Law 10 (RI-A15)', () => {
    const unapprovedDiscountSnapshot: CanonicalQuoteSnapshot = {
      ...sampleSnapshot,
      discountPercent: 15.0,
      discountAmountPaisa: rupees(3375),
      discountReason: 'Quick deal', // < 10 chars
      discountApprover: undefined, // No approver
    }

    const result = explainCanonicalQuote(unapprovedDiscountSnapshot, 'Coordinator')
    expect(result.isDiscountCompliant).toBe(false)
    expect(result.evidenceState).toBe('needs_verification')

    const discountAdv = result.advices.find((a) => a.id.includes('discount-law10'))
    expect(discountAdv).toBeDefined()
    expect(discountAdv?.severity).toBe('urgent')
    expect(discountAdv?.explanation).toContain('WARNING (Law 10)')
  })

  it('passes commercial discount >10% when approved by Owner with documented reason', () => {
    const approvedDiscountSnapshot: CanonicalQuoteSnapshot = {
      ...sampleSnapshot,
      discountPercent: 15.0,
      discountAmountPaisa: rupees(3375),
      discountReason: 'Authorized feature film co-production tier',
      discountApprover: 'Babin Dulal (Owner)',
    }

    const result = explainCanonicalQuote(approvedDiscountSnapshot, 'Owner')
    expect(result.isDiscountCompliant).toBe(true)
    const discountAdv = result.advices.find((a) => a.id.includes('discount-law10'))
    expect(discountAdv).toBeUndefined()
  })

  it('warns when advance payment is below 50% dispatch threshold', () => {
    const lowAdvanceSnapshot: CanonicalQuoteSnapshot = {
      ...sampleSnapshot,
      advancePaidPaisa: rupees(5000), // Below 50% of 24,154 (12,077)
    }

    const result = explainCanonicalQuote(lowAdvanceSnapshot, 'Coordinator')
    expect(result.advanceThresholdMet).toBe(false)

    const advanceAdv = result.advices.find((a) => a.id.includes('advance'))
    expect(advanceAdv).toBeDefined()
    expect(advanceAdv?.severity).toBe('review')
    expect(advanceAdv?.explanation).toContain('ADVANCE UNDER THRESHOLD')
  })

  it('strictly strips all monetary figures for Warehouse role (RI-A16)', () => {
    const result = explainCanonicalQuote(sampleSnapshot, 'Warehouse')
    expect(result.isMoneyMasked).toBe(true)
    expect(result.equipmentSubtotalFormatted).toBeUndefined()
    expect(result.totalRentalFormatted).toBeUndefined()
    expect(result.depositLiabilityFormatted).toBeUndefined()
    expect(result.outstandingBalanceFormatted).toBeUndefined()

    expect(result.summary).not.toContain('Rs')
    expect(result.summary).not.toContain('24,154')

    for (const adv of result.advices) {
      expect(adv.explanation).not.toContain('Rs')
      expect(adv.explanation).not.toContain('24,154')
      expect(adv.explanation).not.toContain('22,500')
    }
  })

  it('strictly strips all monetary figures for Technician and Driver roles (RI-A16)', () => {
    const resultTech = explainCanonicalQuote(sampleSnapshot, 'Technician')
    expect(resultTech.isMoneyMasked).toBe(true)
    expect(resultTech.summary).not.toContain('Rs')

    const resultDriver = explainCanonicalQuote(sampleSnapshot, 'Driver')
    expect(resultDriver.isMoneyMasked).toBe(true)
    expect(resultDriver.summary).not.toContain('Rs')
  })

  it('strips monetary figures on floor surfaces even for Owner role', () => {
    const resultFloor = explainCanonicalQuote(sampleSnapshot, 'Owner', 'floor')
    expect(resultFloor.isMoneyMasked).toBe(true)
    expect(resultFloor.summary).not.toContain('Rs')
    expect(resultFloor.advices[0]?.explanation).toContain('omitted on operational floor surfaces')
  })

  it('fails closed when pricing snapshot is marked stale (RI-A13)', () => {
    const staleSnapshot: CanonicalQuoteSnapshot = {
      ...sampleSnapshot,
      isStale: true,
    }

    const result = explainCanonicalQuote(staleSnapshot, 'Owner')
    expect(result.evidenceState).toBe('needs_verification')
    const staleAdv = result.advices.find((a) => a.id.includes('quote-stale'))
    expect(staleAdv).toBeDefined()
    expect(staleAdv?.explanation).toContain('FINANCIAL SNAPSHOT STALE')
  })
})
