import { describe, it, expect } from 'vitest'
import { AUDIT_RULES } from '../audit'

describe('Audit rules — money is written the way the app writes it', () => {
  it('states the High Value Booking threshold as Rs 1,00,000, with lakh grouping', () => {
    const rule = AUDIT_RULES.find((r) => r.name === 'High Value Booking')
    expect(rule?.condition).toBe('Amount > Rs 1,00,000')
  })

  it('writes no NPR figure in any rule condition', () => {
    for (const rule of AUDIT_RULES) {
      expect(rule.condition, rule.name).not.toMatch(/NPR/)
    }
  })
})
