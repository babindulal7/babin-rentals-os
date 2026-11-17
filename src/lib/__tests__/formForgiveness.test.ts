import { describe, expect, it } from 'vitest'
import {
  isValidSanitizedPhone,
  sanitizeBatchSerials,
  sanitizeEmail,
  sanitizeMoneyInput,
  sanitizePan,
  sanitizePhone,
  sanitizeSerial,
} from '../formForgiveness'

describe('formForgiveness (Usability Principle 8)', () => {
  describe('sanitizePhone', () => {
    it('handles clean 10-digit Nepali mobile numbers', () => {
      expect(sanitizePhone('9801234567')).toBe('9801234567')
      expect(sanitizePhone('9741234567')).toBe('9741234567')
    })

    it('strips spaces and hyphens', () => {
      expect(sanitizePhone('980 123 4567')).toBe('9801234567')
      expect(sanitizePhone('980-123-4567')).toBe('9801234567')
      expect(sanitizePhone('98-012-34-567')).toBe('9801234567')
    })

    it('strips +977 or 977 country code prefix', () => {
      expect(sanitizePhone('+9779801234567')).toBe('9801234567')
      expect(sanitizePhone('+977 980 123 4567')).toBe('9801234567')
      expect(sanitizePhone('+977-980-123-4567')).toBe('9801234567')
      expect(sanitizePhone('9779801234567')).toBe('9801234567')
    })

    it('strips leading 0 for domestic mobile numbers', () => {
      expect(sanitizePhone('09801234567')).toBe('9801234567')
      expect(sanitizePhone('09741234567')).toBe('9741234567')
    })

    it('validates correctly with isValidSanitizedPhone', () => {
      expect(isValidSanitizedPhone('+977 980-123-4567')).toBe(true)
      expect(isValidSanitizedPhone('09801234567')).toBe(true)
      expect(isValidSanitizedPhone('9801234567')).toBe(true)
      expect(isValidSanitizedPhone('980123')).toBe(false)
      expect(isValidSanitizedPhone('9601234567')).toBe(false) // 96 is not Nepali mobile (only 97/98)
    })
  })

  describe('sanitizePan', () => {
    it('cleans formatted PAN/VAT inputs', () => {
      expect(sanitizePan('600123456')).toBe('600123456')
      expect(sanitizePan('600-123-456')).toBe('600123456')
      expect(sanitizePan('600 123 456')).toBe('600123456')
      expect(sanitizePan('  600.123.456  ')).toBe('600123456')
    })
  })

  describe('sanitizeMoneyInput', () => {
    it('strips commas in lakh and western groupings', () => {
      expect(sanitizeMoneyInput('1,50,000')).toBe('150000')
      expect(sanitizeMoneyInput('150,000')).toBe('150000')
      expect(sanitizeMoneyInput('1,00,00,000')).toBe('10000000')
    })

    it('strips currency symbols and prefixes', () => {
      expect(sanitizeMoneyInput('Rs 25,000')).toBe('25000')
      expect(sanitizeMoneyInput('Rs. 25,000')).toBe('25000')
      expect(sanitizeMoneyInput('rs 500')).toBe('500')
      expect(sanitizeMoneyInput('NPR 1,200')).toBe('1200')
      expect(sanitizeMoneyInput('रु 5,000')).toBe('5000')
      expect(sanitizeMoneyInput('रू 10,000')).toBe('10000')
    })

    it('preserves decimals', () => {
      expect(sanitizeMoneyInput('Rs. 1,500.50')).toBe('1500.50')
      expect(sanitizeMoneyInput('  123.45  ')).toBe('123.45')
    })
  })

  describe('sanitizeSerial & sanitizeBatchSerials', () => {
    it('trims whitespace and removes control characters', () => {
      expect(sanitizeSerial('  SN-10294-A  ')).toBe('SN-10294-A')
      expect(sanitizeSerial('SN  FX6   01')).toBe('SN FX6 01')
    })

    it('splits batch serials by newlines, commas, or semicolons', () => {
      const input = `
        SN-001, SN-002; SN-003
        SN-004
        SN-005
      `
      expect(sanitizeBatchSerials(input)).toEqual([
        'SN-001',
        'SN-002',
        'SN-003',
        'SN-004',
        'SN-005',
      ])
    })
  })

  describe('sanitizeEmail', () => {
    it('trims whitespace and converts to lowercase', () => {
      expect(sanitizeEmail('  Info@Example.Com  ')).toBe('info@example.com')
    })
  })
})
