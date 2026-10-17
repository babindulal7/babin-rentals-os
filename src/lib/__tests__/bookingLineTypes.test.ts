import { describe, expect, it } from 'vitest'
import { NON_PACKABLE_LINE_TYPES, isNonPackableLineType } from '../bookingLineTypes'

describe('bookingLineTypes', () => {
  it('recognizes title-case line types', () => {
    expect(NON_PACKABLE_LINE_TYPES.has('Service')).toBe(true)
    expect(NON_PACKABLE_LINE_TYPES.has('Sub-rental')).toBe(true)
    expect(NON_PACKABLE_LINE_TYPES.has('Manual item')).toBe(true)
    expect(isNonPackableLineType('Service')).toBe(true)
    expect(isNonPackableLineType('Sub-rental')).toBe(true)
    expect(isNonPackableLineType('Manual item')).toBe(true)
  })

  it('recognizes snake_case, kebab-case, and lowercase variants', () => {
    expect(NON_PACKABLE_LINE_TYPES.has('service')).toBe(true)
    expect(NON_PACKABLE_LINE_TYPES.has('sub_rental')).toBe(true)
    expect(NON_PACKABLE_LINE_TYPES.has('manual_item')).toBe(true)
    expect(isNonPackableLineType('service')).toBe(true)
    expect(isNonPackableLineType('sub_rental')).toBe(true)
    expect(isNonPackableLineType('sub-rental')).toBe(true)
    expect(isNonPackableLineType('manual_item')).toBe(true)
    expect(isNonPackableLineType(' manual item ')).toBe(true)
  })

  it('rejects inventory/equipment line types', () => {
    expect(NON_PACKABLE_LINE_TYPES.has('Equipment')).toBe(false)
    expect(NON_PACKABLE_LINE_TYPES.has('Item')).toBe(false)
    expect(isNonPackableLineType('Equipment')).toBe(false)
    expect(isNonPackableLineType(null)).toBe(false)
    expect(isNonPackableLineType(undefined)).toBe(false)
    expect(isNonPackableLineType('')).toBe(false)
  })
})
