import { describe, it, expect } from 'vitest'
import { comparePeriods } from '../comparison'

describe('analytics comparison', () => {
  it('returns unavailable when either current or previous is null or non-finite', () => {
    expect(comparePeriods(null, 100)).toEqual({
      kind: 'unavailable',
      reason: 'A complete comparable period is required',
    })
    expect(comparePeriods(100, undefined)).toEqual({
      kind: 'unavailable',
      reason: 'A complete comparable period is required',
    })
    expect(comparePeriods(100, NaN)).toEqual({
      kind: 'unavailable',
      reason: 'A complete comparable period is required',
    })
  })

  it('handles zero previous baseline by marking as new', () => {
    expect(comparePeriods(500, 0)).toEqual({
      kind: 'new',
      current: 500,
    })
  })

  it('handles both zero current and previous as zero change', () => {
    expect(comparePeriods(0, 0)).toEqual({
      kind: 'changed',
      absolute: 0,
      percentage: 0,
      isGood: true,
    })
  })

  it('calculates absolute and percentage delta correctly for growth', () => {
    const res = comparePeriods(150, 100)
    expect(res).toEqual({
      kind: 'changed',
      absolute: 50,
      percentage: 50,
      isGood: true,
    })
  })

  it('calculates absolute and percentage delta correctly for decline', () => {
    const res = comparePeriods(80, 100)
    expect(res).toEqual({
      kind: 'changed',
      absolute: -20,
      percentage: -20,
      isGood: false,
    })
  })

  it('respects invertGood for metrics where down is good (e.g. damages/idle cost)', () => {
    const res = comparePeriods(80, 100, true)
    expect(res).toEqual({
      kind: 'changed',
      absolute: -20,
      percentage: -20,
      isGood: true,
    })
  })
})
