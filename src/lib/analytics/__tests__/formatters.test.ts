import { describe, it, expect } from 'vitest'
import { formatCompactRupees, formatNumericValue } from '../formatters'
import { rupees } from '../../money'

describe('analytics formatters', () => {
  describe('formatCompactRupees', () => {
    it('formats small amounts with standard integer rupee grouping', () => {
      expect(formatCompactRupees(rupees(4500))).toBe('Rs 4,500')
      expect(formatCompactRupees(rupees(99999))).toBe('Rs 99,999')
    })

    it('formats lakh amounts into L notation', () => {
      expect(formatCompactRupees(rupees(100000))).toBe('Rs 1 L')
      expect(formatCompactRupees(rupees(1250000))).toBe('Rs 12.5 L')
      expect(formatCompactRupees(rupees(9950000))).toBe('Rs 99.5 L')
    })

    it('formats crore amounts into Cr notation', () => {
      expect(formatCompactRupees(rupees(10000000))).toBe('Rs 1 Cr')
      expect(formatCompactRupees(rupees(16000000))).toBe('Rs 1.60 Cr')
      expect(formatCompactRupees(rupees(165000000))).toBe('Rs 16.5 Cr')
    })

    it('preserves negative signs correctly in compact formatting', () => {
      expect(formatCompactRupees(rupees(-1250000))).toBe('-Rs 12.5 L')
      expect(formatCompactRupees(rupees(-16000000))).toBe('-Rs 1.60 Cr')
    })
  })

  describe('formatNumericValue', () => {
    it('handles null values as unavailable', () => {
      const res = formatNumericValue(null)
      expect(res.compact).toBe('—')
      expect(res.exact).toBe('Unavailable')
    })

    it('formats money providing both compact and full exact rupee string', () => {
      const res = formatNumericValue({ kind: 'money', paisa: rupees(16000000), currency: 'NPR' })
      expect(res.compact).toBe('Rs 1.60 Cr')
      expect(res.exact).toBe('Rs 1,60,00,000')
    })

    it('formats count using South Asian digit formatting', () => {
      const res = formatNumericValue({ kind: 'count', value: 12500 })
      expect(res.compact).toBe('12,500')
      expect(res.exact).toBe('12,500')
    })

    it('formats percent with decimals', () => {
      const res = formatNumericValue({ kind: 'percent', value: 24.567 })
      expect(res.compact).toBe('24.6%')
      expect(res.exact).toBe('24.57%')
    })

    it('formats duration with unit', () => {
      const res = formatNumericValue({ kind: 'duration', value: 5, unit: 'days' })
      expect(res.compact).toBe('5 days')
      expect(res.exact).toBe('5 days')
    })
  })
})
