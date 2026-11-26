import { describe, expect, it } from 'vitest'
import { isValidPan, PAN_RE, PAN_REJECTION, sanitizePan } from '../pan'

describe('pan helpers', () => {
  it('accepts exact 9-digit PAN/VAT strings and rejects everything else', () => {
    expect(PAN_RE.test('600123456')).toBe(true)
    expect(isValidPan(' 600123456 ')).toBe(true)
    expect(isValidPan('60012345')).toBe(false)
    expect(isValidPan('6001234567')).toBe(false)
    expect(isValidPan('600-123-456')).toBe(false)
    expect(isValidPan('60012345X')).toBe(false)
    expect(isValidPan('')).toBe(false)
  })

  it('normalises formatted copy-pasted PAN strings via sanitizePan', () => {
    expect(sanitizePan('600-123-456')).toBe('600123456')
    expect(sanitizePan('600 123 456')).toBe('600123456')
    expect(isValidPan(sanitizePan('600.123.456'))).toBe(true)
  })

  it('keeps the exact shared rejection wording', () => {
    expect(PAN_REJECTION).toBe('PAN/VAT must be exactly nine digits.')
  })
})
