import { describe, expect, it } from 'vitest'
import {
  formatReportAxisValue,
  precedingReportWindow,
  averageReportAmount,
  reportMoneyChange,
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
})
