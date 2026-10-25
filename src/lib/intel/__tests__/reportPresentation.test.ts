import { describe, expect, it } from 'vitest'
import {
  formatReportAxisValue,
  precedingReportWindow,
  averageReportAmount,
  reportMoneyChange,
  hasRevenueActivity,
} from '../reportPresentation'
import type { Paisa } from '../../money'

describe('reportPresentation', () => {
  describe('formatReportAxisValue', () => {
    it('handles count units directly with integer rounding', () => {
      expect(formatReportAxisValue(12.4, 'count')).toBe('12')
      expect(formatReportAxisValue(12.6, 'count')).toBe('13')
      expect(formatReportAxisValue(0, 'count')).toBe('0')
    })

    it('formats paisa values converted to rupees with concise Nepali denominations', () => {
      // 10,000,000 paisa = Rs 1,00,000 = 1 Lakh (not 1 Crore!)
      expect(formatReportAxisValue(10_000_000, 'paisa')).toBe('Rs 1L')

      // 50,000,000 paisa = Rs 5,00,000 = 5 Lakh
      expect(formatReportAxisValue(50_000_000, 'paisa')).toBe('Rs 5L')

      // 1,000,000,000 paisa = Rs 1,00,00,000 = 1 Crore
      expect(formatReportAxisValue(1_000_000_000, 'paisa')).toBe('Rs 1Cr')

      // 250,000 paisa = Rs 2,500 = 2.5k
      expect(formatReportAxisValue(250_000, 'paisa')).toBe('Rs 2.5k')

      // 50,000 paisa = Rs 500 (< 1k, uses formatMoney)
      expect(formatReportAxisValue(50_000, 'paisa')).toBe('Rs 500')

      // 0 paisa
      expect(formatReportAxisValue(0, 'paisa')).toBe('Rs 0')
      expect(formatReportAxisValue(-10_000_000, 'paisa')).toBe('-Rs 1L')
    })

    it('handles non-finite values safely', () => {
      expect(formatReportAxisValue(NaN, 'paisa')).toBe('—')
      expect(formatReportAxisValue(Infinity, 'count')).toBe('—')
    })
  })

  describe('precedingReportWindow', () => {
    it('calculates the exact preceding date window of identical duration', () => {
      const window = precedingReportWindow('2026-10-01', '2026-10-31')
      expect(window.toAd).toBe('2026-09-30')
      expect(window.fromAd).toBe('2026-08-31')
    })
    it('preserves a one-day leap-year window and refuses rolled-over civil dates', () => {
      expect(precedingReportWindow('2024-03-01', '2024-03-01')).toEqual({ fromAd: '2024-02-29', toAd: '2024-02-29' })
      expect(() => precedingReportWindow('2026-02-30', '2026-03-02')).toThrow('Invalid comparison window')
      expect(() => precedingReportWindow('2026-10-31', '2026-10-01')).toThrow('Invalid comparison window')
    })
  })

  describe('averageReportAmount', () => {
    it('computes integer-rounded average paisa safely', () => {
      expect(averageReportAmount(10_000 as Paisa, 3)).toBe(3333)
      expect(averageReportAmount(0 as Paisa, 0)).toBe(0)
    })
  })

  describe('reportMoneyChange', () => {
    it('computes formatted change with polarity indicator', () => {
      const positive = reportMoneyChange(100_000 as Paisa, 80_000 as Paisa)
      expect(positive.value).toBe('+Rs 200')
      expect(positive.isPositive).toBe(true)

      const negative = reportMoneyChange(50_000 as Paisa, 80_000 as Paisa)
      expect(negative.value).toBe('-Rs 300')
      expect(negative.isPositive).toBe(false)
    })
  })

  it('treats a void or credit mismatch as report activity even without issued sales', () => {
    const empty = { issuedCount: 0, creditReconciliation: { voidedInvoiceCount: 0, creditNoteCount: 0, paidVoidMismatchCount: 0, activeInvoiceCreditNoteCount: 0 } }
    expect(hasRevenueActivity(empty)).toBe(false)
    expect(hasRevenueActivity({ ...empty, creditReconciliation: { ...empty.creditReconciliation, voidedInvoiceCount: 1 } })).toBe(true)
    expect(hasRevenueActivity({ ...empty, creditReconciliation: { ...empty.creditReconciliation, paidVoidMismatchCount: 1 } })).toBe(true)
  })
})
