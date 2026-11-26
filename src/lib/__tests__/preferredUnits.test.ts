import { describe, expect, it } from 'vitest'
import { assignPreferredUnits } from '../preferredUnits'
import type { UnitCandidate, UnitHold } from '../availability'

const unit = (id: string, over: Partial<UnitCandidate> = {}): UnitCandidate => ({
  unitId: id,
  assetTag: `TAG-${id}`,
  serialNo: null,
  productId: 'prod-1',
  state: 'Available',
  retiredAt: null,
  ...over,
})

const window = { fromAd: '2026-11-20T04:00:00Z', toAd: '2026-11-22T04:00:00Z' }
const base = {
  window,
  holds: [] as UnitHold[],
  disqualifyingStates: new Set(['Maintenance', 'Missing', 'Retired']),
  bounds: 'half-open' as const,
  label: 'ARRI Alexa Mini',
}

describe('assignPreferredUnits', () => {
  it('assigns the exact preferred unit when it is free, not the least-used one', () => {
    const out = assignPreferredUnits({ ...base, preferredIds: ['u2'], candidates: [unit('u1'), unit('u2')] })
    expect(out).toEqual({ assigned: ['u2'], refusals: [] })
  })

  it('refuses — never swaps — when the preferred unit is held by another booking', () => {
    const hold: UnitHold = { unitId: 'u2', bookingId: 'b9', bookingNo: 'BK-204', window }
    const out = assignPreferredUnits({ ...base, preferredIds: ['u2'], holds: [hold], candidates: [unit('u1'), unit('u2')] })
    expect(out.assigned).toEqual([])
    expect(out.refusals).toHaveLength(1)
    expect(out.refusals[0]).toContain('TAG-u2')
    expect(out.refusals[0]).toContain('BK-204')
  })

  it('refuses a preferred unit that is in a disqualifying state', () => {
    const out = assignPreferredUnits({
      ...base,
      preferredIds: ['u1'],
      candidates: [unit('u1', { state: 'Maintenance' })],
    })
    expect(out.assigned).toEqual([])
    expect(out.refusals[0]).toContain('Maintenance')
  })

  it('refuses a preferred unit that is not a unit of this product', () => {
    const out = assignPreferredUnits({ ...base, preferredIds: ['ghost'], candidates: [unit('u1')] })
    expect(out.assigned).toEqual([])
    expect(out.refusals[0]).toContain('ARRI Alexa Mini')
  })

  it('handles several preferred units, assigning the free ones and refusing the rest', () => {
    const hold: UnitHold = { unitId: 'u3', bookingId: 'b9', bookingNo: 'BK-7', window }
    const out = assignPreferredUnits({
      ...base,
      preferredIds: ['u2', 'u3'],
      holds: [hold],
      candidates: [unit('u1'), unit('u2'), unit('u3')],
    })
    expect(out.assigned).toEqual(['u2'])
    expect(out.refusals).toHaveLength(1)
  })

  it('returns nothing when there is no preference', () => {
    expect(assignPreferredUnits({ ...base, preferredIds: [], candidates: [unit('u1')] })).toEqual({ assigned: [], refusals: [] })
  })
})
