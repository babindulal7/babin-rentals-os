import { describe, expect, it } from 'vitest'
import { nextRequirement } from '../nextRequirement'

describe('nextRequirement', () => {
  it('is null when nothing is unmet', () => {
    expect(nextRequirement([])).toBeNull()
  })
  it('names the first unmet requirement', () => {
    expect(nextRequirement(['Evidence photo taken for this booking'])).toBe('Evidence photo taken for this booking')
  })
  it('counts the ones that follow', () => {
    expect(nextRequirement(['Receiver Verified', 'Payment Verified', 'Signatures Complete'])).toBe('Receiver Verified (+2 more)')
  })
})
