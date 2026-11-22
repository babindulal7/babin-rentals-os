import { describe, expect, it } from 'vitest'
import { rentalDaysInclusive, resolveCompleteAvailability } from '../lib/publicAvailabilitySafety'

const ids = ['camera-a', 'camera-b']
const days = ['2026-11-24', '2026-11-25']
const allRows = [
  { product_id: 'camera-a', day: '2026-11-24', available: true },
  { product_id: 'camera-a', day: '2026-11-25', available: true },
  { product_id: 'camera-b', day: '2026-11-24', available: true },
  { product_id: 'camera-b', day: '2026-11-25', available: false },
]

describe('Public booking availability: fail closed', () => {
  it('requires a complete, all-true calendar matrix before claiming availability', () => {
    const result = resolveCompleteAvailability(ids, days, allRows)
    expect(result.get('camera-a')).toBe(true)
    expect(result.get('camera-b')).toBe(false)
  })

  it('does not interpret missing days as available stock', () => {
    expect(() => resolveCompleteAvailability(ids, days, allRows.slice(0, 3))).toThrow(/incomplete/i)
  })

  it('does not interpret missing products as available stock', () => {
    expect(() => resolveCompleteAvailability(ids, days, allRows.slice(0, 2))).toThrow(/incomplete/i)
  })

  it('rejects duplicate product/day responses rather than guessing', () => {
    expect(() => resolveCompleteAvailability(ids, days, [...allRows, allRows[0]!])).toThrow(/incomplete/i)
  })

  it('rejects anomalous product IDs, dates and non-boolean stock status', () => {
    expect(() => resolveCompleteAvailability(ids, days,
      [...allRows, { product_id: 'unpublished', day: days[0]!, available: true }])).toThrow(/incomplete/i)
    expect(() => resolveCompleteAvailability(ids, days,
      [...allRows, { product_id: ids[0]!, day: '2099-01-01', available: true }])).toThrow(/incomplete/i)
    expect(() => resolveCompleteAvailability(ids, days,
      [...allRows.slice(0, 3), { product_id: ids[1]!, day: days[1]!, available: 'yes' as unknown as boolean }])).toThrow(/incomplete/i)
  })

  it('honors inclusive 06:00-rental-day dates and leap years', () => {
    expect(rentalDaysInclusive('2028-02-28', '2028-03-01')).toEqual([
      '2028-02-28', '2028-02-29', '2028-03-01',
    ])
    expect(rentalDaysInclusive('2026-11-24', '2026-11-24')).toEqual(['2026-11-24'])
  })

  it('rejects malformed, backwards and overlong dates', () => {
    for (const [from, to] of [
      ['2026-02-30', '2026-03-01'],
      ['2026-11-30', '2026-11-29'],
      ['2026-11-24', '2027-02-25'],
      ['2026/11/24', '2026-11-25'],
    ]) {
      expect(() => rentalDaysInclusive(from, to)).toThrow()
    }
  })

  it('accepts the maximum 60-day span (61 inclusive calendar dates)', () => {
    expect(rentalDaysInclusive('2026-11-01', '2026-12-31')).toHaveLength(61)
  })
})
