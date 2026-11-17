import { describe, expect, it } from 'vitest'
import { findSimilarFreeEquipment, SUBRENTAL_PARTNERS } from '../availability'

describe('findSimilarFreeEquipment algorithm (T3-13)', () => {
  const target = {
    name: 'Sony FE 24-70mm f/2.8 GM',
    category: 'Lenses',
    productKey: 'prod-sony-24-70',
    brand: 'Sony',
    kind: 'equipment' as const,
  }

  const pool = [
    {
      name: 'Sony FE 24-70mm f/2.8 GM',
      category: 'Lenses',
      productKey: 'prod-sony-24-70',
      brand: 'Sony',
      kind: 'equipment' as const,
      freeCount: 0,
      autoPick: null,
    },
    {
      name: 'Sigma 24-70mm f/2.8 Art for Sony E',
      category: 'Lenses',
      productKey: 'prod-sigma-24-70',
      brand: 'Sigma',
      kind: 'equipment' as const,
      freeCount: 2,
      autoPick: { id: 'sig-1' },
    },
    {
      name: 'Sony FE 70-200mm f/2.8 GM OSS II',
      category: 'Lenses',
      productKey: 'prod-sony-70-200',
      brand: 'Sony',
      kind: 'equipment' as const,
      freeCount: 1,
      autoPick: { id: 'sony-70-200-1' },
    },
    {
      name: 'Canon RF 24-70mm f/2.8L IS USM',
      category: 'Lenses',
      productKey: 'prod-canon-24-70',
      brand: 'Canon',
      kind: 'equipment' as const,
      freeCount: 0, // Booked out!
      autoPick: null,
    },
    {
      name: 'Sony FX3 Cinema Camera',
      category: 'Cameras', // Different category!
      productKey: 'prod-sony-fx3',
      brand: 'Sony',
      kind: 'equipment' as const,
      freeCount: 3,
      autoPick: { id: 'fx3-1' },
    },
  ]

  it('filters out target item itself, different categories, and unavailable items', () => {
    const results = findSimilarFreeEquipment(target, pool)
    expect(results).toHaveLength(2)
    // Both returned items are in Lenses category and have freeCount > 0
    expect(results.map((r) => r.productKey)).toEqual(['prod-sony-70-200', 'prod-sigma-24-70'])
  })

  it('ranks items matching brand higher when category matches', () => {
    const results = findSimilarFreeEquipment(target, pool)
    // Sony 70-200 matches category + brand bonus (score: 100 + 25 + 10 + token tiebreak)
    // Sigma matches category + token bonus ('24-70')
    expect(results[0]?.name).toBe('Sony FE 70-200mm f/2.8 GM OSS II')
  })

  it('respects the limit option', () => {
    const results = findSimilarFreeEquipment(target, pool, { limit: 1 })
    expect(results).toHaveLength(1)
    expect(results[0]?.name).toBe('Sony FE 70-200mm f/2.8 GM OSS II')
  })

  it('respects excludeKeys option', () => {
    const exclude = new Set(['prod-sony-70-200'])
    const results = findSimilarFreeEquipment(target, pool, { excludeKeys: exclude })
    expect(results).toHaveLength(1)
    expect(results[0]?.productKey).toBe('prod-sigma-24-70')
  })

  it('returns empty array when no free items match category', () => {
    const cameraTarget = {
      name: 'RED V-Raptor 8K',
      category: 'Cinema Cameras',
      productKey: 'prod-red-raptor',
      brand: 'RED',
      kind: 'equipment' as const,
    }
    const results = findSimilarFreeEquipment(cameraTarget, pool)
    expect(results).toEqual([])
  })

  it('contains Kathmandu-based sub-rental partners per spec', () => {
    expect(SUBRENTAL_PARTNERS).toContain('GearHouse KTM')
    expect(SUBRENTAL_PARTNERS).toContain('Kathmandu Cinema Works')
    expect(SUBRENTAL_PARTNERS).toContain('Everest Cine Rentals')
    expect(SUBRENTAL_PARTNERS).toContain('Pokhara Film Gear')
    expect(SUBRENTAL_PARTNERS).toContain('Shine Pictures')
  })
})
