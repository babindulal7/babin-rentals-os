import { describe, it, expect } from 'vitest'
import { resolveMonthlyPackPeriod } from '../monthlyPack'

describe('monthlyPack', () => {
  it('resolves AD month boundaries accurately including leap-year February', () => {
    const feb2024 = resolveMonthlyPackPeriod('AD', 2024, 2)
    expect(feb2024.startAd).toBe('2024-02-01')
    expect(feb2024.endAd).toBe('2024-02-29')
    expect(feb2024.monthSlug).toBe('ad_2024_02')
  })

  it('resolves BS month boundaries within supported table bounds', () => {
    const baishakh2083 = resolveMonthlyPackPeriod('BS', 2083, 1)
    expect(baishakh2083.calendar).toBe('BS')
    expect(baishakh2083.monthSlug).toBe('bs_2083_01')
    expect(baishakh2083.startBs).toMatch(/^2083-01-01/)
  })

  it('throws on invalid month or out-of-bounds BS year', () => {
    expect(() => resolveMonthlyPackPeriod('AD', 2026, 13)).toThrow(/Invalid month/i)
    expect(() => resolveMonthlyPackPeriod('BS', 2099, 1)).toThrow(/outside supported table bounds/i)
  })
})
