import { describe, expect, it } from 'vitest'
import { compactMoneyLabel, countLabel, niceScale, visibleLabelIndexes } from '../chartScale'
import { rupees } from '../../money'

describe('niceScale', () => {
  it('starts money axes at zero and steps in readable rupee amounts', () => {
    const s = niceScale([rupees(120000), rupees(345000), rupees(80000)], { minStep: 100 })
    expect(s.min).toBe(0)
    expect(s.ticks).toEqual([0, rupees(100000), rupees(200000), rupees(300000), rupees(400000)])
    expect(s.max).toBeGreaterThanOrEqual(rupees(345000))
  })

  it('ignores nulls rather than reading them as zero', () => {
    expect(niceScale([null, 40, null], { minStep: 1 }).ticks).toEqual([0, 10, 20, 30, 40])
  })

  it('keeps count axes on whole numbers', () => {
    const s = niceScale([1, 3], { minStep: 1 })
    expect(s.ticks.every(Number.isInteger)).toBe(true)
    expect(s.ticks).toEqual([0, 1, 2, 3])
  })

  it('spans zero for negative values (cash out, reversals)', () => {
    const s = niceScale([-250, 500], { minStep: 1 })
    expect(s.min).toBeLessThanOrEqual(-250)
    expect(s.ticks).toContain(0)
  })

  it('draws one baseline for an all-zero or empty series instead of inventing a spread', () => {
    expect(niceScale([0, 0, 0])).toEqual({ min: 0, max: 1, ticks: [0] })
    expect(niceScale([])).toEqual({ min: 0, max: 1, ticks: [0] })
  })
})

describe('compactMoneyLabel', () => {
  it('uses lakh and crore for labels only', () => {
    expect(compactMoneyLabel(rupees(45000))).toBe('Rs 45,000')
    expect(compactMoneyLabel(rupees(250000))).toBe('Rs 2.5 L')
    expect(compactMoneyLabel(rupees(16000000))).toBe('Rs 1.6 Cr')
    expect(compactMoneyLabel(rupees(59406880))).toBe('Rs 5.94 Cr')
    expect(compactMoneyLabel(rupees(-300000))).toBe('-Rs 3 L')
    expect(compactMoneyLabel(0)).toBe('Rs 0')
  })

  it('formats counts with lakh grouping', () => {
    expect(countLabel(123456)).toBe('1,23,456')
  })
})

describe('visibleLabelIndexes', () => {
  it('prints every label when they fit', () => {
    expect(visibleLabelIndexes(4, 600)).toEqual([0, 1, 2, 3])
  })

  it('thins labels on a narrow screen but always keeps the first and last', () => {
    const idx = visibleLabelIndexes(24, 300)
    expect(idx[0]).toBe(0)
    expect(idx[idx.length - 1]).toBe(23)
    expect(idx.length).toBeLessThanOrEqual(Math.floor(300 / 64))
    for (let i = 1; i < idx.length; i += 1) expect(idx[i]! - idx[i - 1]!).toBeGreaterThanOrEqual(3)
  })

  it('never keeps a label less than one full step before the end-anchored last label', () => {
    for (const [count, width] of [[24, 300], [30, 235], [61, 900], [13, 330]] as const) {
      const idx = visibleLabelIndexes(count, width)
      const fit = Math.max(2, Math.floor(width / 64))
      const step = Math.ceil((count - 1) / (fit - 1))
      if (idx.length > 2) expect(idx[idx.length - 1]! - idx[idx.length - 2]!).toBeGreaterThanOrEqual(step)
    }
  })

  it('handles zero and one point', () => {
    expect(visibleLabelIndexes(0, 300)).toEqual([])
    expect(visibleLabelIndexes(1, 300)).toEqual([0])
  })

  it('money ticks stay on whole rupees even where the 2.5 rung would land between them', () => {
    const { ticks } = niceScale([900], { minStep: 100 })
    expect(ticks.every((t) => t % 100 === 0)).toBe(true)
    expect(ticks.map(compactMoneyLabel)).toEqual(ticks.map((t) => `Rs ${t / 100}`))
  })
})
