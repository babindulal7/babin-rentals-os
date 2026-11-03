import { describe, expect, it } from 'vitest'
import { evidenceStageForCategory } from '../evidenceStage'

describe('T2-18 evidence category to operation stage', () => {
  it.each([
    ['Packing', 'Packing'],
    ['Return', 'Return'],
    ['Inspection', 'Inspection'],
    ['Damage', 'Damage'],
    ['Cleaning', 'Cleaning'],
    ['Maintenance', 'Maintenance'],
    ['Warehouse', 'Warehouse'],
    ['Client Documents', 'Client documents'],
  ] as const)('%s maps to %s', (category, stage) => {
    expect(evidenceStageForCategory(category, null)).toBe(stage)
  })

  it.each([
    ['Client Pickup', 'Pickup'],
    ['Customer Pickup', 'Pickup'],
    ['Third Party', 'Pickup'],
    ['Babin Delivery', 'Delivery'],
    ['Courier', 'Delivery'],
  ] as const)('maps %s to %s', (method, stage) => {
    expect(evidenceStageForCategory('Pickup / Delivery', method)).toBe(stage)
  })

  it('refuses unknown delivery type rather than defaulting to Packing', () => {
    expect(() => evidenceStageForCategory('Pickup / Delivery', null)).toThrow('could not be verified. Photo was not saved.')
    expect(() => evidenceStageForCategory('Pickup / Delivery', 'Delivery')).toThrow('could not be verified. Photo was not saved.')
  })

  it.each(['Marketing', 'Others'] as const)('refuses unsupported %s without a false stage', (category) => {
    expect(() => evidenceStageForCategory(category, null)).toThrow('Photo was not saved')
  })
})
