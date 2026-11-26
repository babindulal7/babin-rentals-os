/**
 * `clientDisplay.ts` — the "not set" readings for credit and membership.
 *
 * Pure functions, so nothing is mocked. Each assertion pins an absence: a limit
 * that was never recorded is said in words rather than as Rs 0, and a client
 * with no membership row is never shown as a tier.
 */
import { describe, expect, it } from 'vitest'
import { rupees } from '../../../lib/money'
import { creditLimitLabel, membershipLabel } from '../clientDisplay'

describe('creditLimitLabel', () => {
  it('says Not set when no limit is recorded, rather than Rs 0', () => {
    expect(creditLimitLabel(rupees(0))).toBe('Not set')
  })

  it('prints a recorded limit with lakh grouping', () => {
    expect(creditLimitLabel(rupees(500_000))).toBe('Rs 5,00,000')
  })
})

describe('membershipLabel', () => {
  it('names the tier the view holds', () => {
    expect(membershipLabel({ membershipLevel: 'Elite' })).toBe('Elite')
  })

  it('says No membership when the view holds no membership row', () => {
    expect(membershipLabel({ membershipLevel: null })).toBe('No membership')
  })

  it('shows a dash when the reading was not carried on the record, rather than guessing', () => {
    expect(membershipLabel({})).toBe('—')
  })
})
