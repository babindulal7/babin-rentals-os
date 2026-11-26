import { describe, expect, it } from 'vitest'
import {
  endOfCalendarDay,
  endOfOperationalDay,
  nepalDay,
  nepalOperationalDay,
  previousDay,
  startOfCalendarDay,
  startOfOperationalDay,
} from '../dayBounds'

describe('dayBounds', () => {
  it('computes Nepal calendar-day bounds in +05:45', () => {
    expect(nepalDay('2026-08-12')).toBe('2026-08-12')
    // 19:00 UTC is already 00:45+05:45 the next calendar day in Kathmandu.
    expect(nepalDay('2026-08-12T19:00:00Z')).toBe('2026-08-13')
    expect(previousDay('2026-08-13')).toBe('2026-08-12')
    expect(startOfCalendarDay('2026-08-12T19:00:00Z')).toBe('2026-08-13T00:00:00.000+05:45')
    expect(endOfCalendarDay('2026-08-12')).toBe('2026-08-12T23:59:59.999+05:45')
  })

  it('computes operational-day bounds shifted by day-start minutes (06:00 default = 360)', () => {
    // 05:30 NPT is 23:45 UTC on previous day; belongs to previous operational day.
    expect(nepalOperationalDay('2026-08-12T23:45:00Z', 360)).toBe('2026-08-12')
    expect(startOfOperationalDay('2026-08-12', 360)).toBe('2026-08-12T06:00:00.000+05:45')
    expect(endOfOperationalDay('2026-08-12', 360)).toBe('2026-08-13T05:59:59.999+05:45')
  })

  it('throws on invalid day strings rather than emitting NaN-NaN-NaN', () => {
    expect(() => nepalDay('not-a-day')).toThrow()
    expect(() => previousDay('not-a-day')).toThrow()
    expect(() => nepalOperationalDay('not-a-day', 360)).toThrow()
  })
})
