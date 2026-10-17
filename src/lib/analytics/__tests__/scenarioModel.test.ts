import { describe, it, expect } from 'vitest'
import { scenarioRevenueNpr, generateScenarioCurves } from '../scenarioModel'

describe('scenarioModel', () => {
  it('calculates compound annual growth correctly for 1 year', () => {
    // 10,000,000 at 20% for 1 year = 12,000,000
    const res = scenarioRevenueNpr({
      baselineAnnualNpr: 10_000_000,
      baseYear: 2026,
      targetYear: 2027,
      growthPercent: 20,
    })
    expect(res).toBe(12_000_000)
  })

  it('calculates compound growth for multi-year horizons (5 years)', () => {
    // 10,000,000 at 10% for 5 years = 10,000,000 * (1.1)^5 = 16,105,100
    const res = scenarioRevenueNpr({
      baselineAnnualNpr: 10_000_000,
      baseYear: 2026,
      targetYear: 2031,
      growthPercent: 10,
    })
    expect(res).toBe(16_105_100)
  })

  it('handles negative growth (contraction)', () => {
    // 10,000,000 at -10% for 1 year = 9,000,000
    const res = scenarioRevenueNpr({
      baselineAnnualNpr: 10_000_000,
      baseYear: 2026,
      targetYear: 2027,
      growthPercent: -10,
    })
    expect(res).toBe(9_000_000)
  })

  it('validates bounds and throws on negative baseline or invalid horizon', () => {
    expect(() =>
      scenarioRevenueNpr({
        baselineAnnualNpr: -1,
        baseYear: 2026,
        targetYear: 2027,
        growthPercent: 10,
      }),
    ).toThrow('Invalid baseline')

    expect(() =>
      scenarioRevenueNpr({
        baselineAnnualNpr: 1000,
        baseYear: 2026,
        targetYear: 2033, // 7 years > 5 years limit
        growthPercent: 10,
      }),
    ).toThrow('Invalid scenario period')

    expect(() =>
      scenarioRevenueNpr({
        baselineAnnualNpr: 1000,
        baseYear: 2026,
        targetYear: 2027,
        growthPercent: 400, // > 300%
      }),
    ).toThrow('Growth assumption is outside allowed range')
  })

  it('generates multi-year comparative curves accurately', () => {
    const curves = generateScenarioCurves(10_000_000, 2026, 3, {
      Conservative: 10,
      Aggressive: 30,
    })

    expect(curves).toHaveLength(4) // 2026, 2027, 2028, 2029
    expect(curves[0]?.values['Conservative']).toBe(10_000_000)
    expect(curves[0]?.values['Aggressive']).toBe(10_000_000)
    expect(curves[1]?.values['Conservative']).toBe(11_000_000)
    expect(curves[1]?.values['Aggressive']).toBe(13_000_000)
  })
})
