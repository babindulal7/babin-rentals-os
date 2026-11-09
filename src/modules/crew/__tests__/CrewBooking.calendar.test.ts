import { describe, it, expect } from 'vitest'
import { startOfWeek } from '../CrewBooking'

describe('CrewBooking WeekCalendar — startOfWeek (UX-27)', () => {
  it('starts week on Sunday by default for Nepal civil calendar', () => {
    // 2026-11-06 is a Friday (UTC day = 5)
    const friday = new Date(Date.UTC(2026, 10, 6, 0, 0, 0))
    const sunStart = startOfWeek(friday, 'Sunday')
    expect(sunStart.getUTCDay()).toBe(0) // Sunday
    expect(sunStart.toISOString().slice(0, 10)).toBe('2026-11-01')
  })

  it('correctly calculates week start when today is Sunday', () => {
    const sunday = new Date(Date.UTC(2026, 10, 1, 0, 0, 0))
    const sunStart = startOfWeek(sunday, 'Sunday')
    expect(sunStart.getUTCDay()).toBe(0)
    expect(sunStart.toISOString().slice(0, 10)).toBe('2026-11-01')
  })

  it('correctly calculates week start when today is Saturday', () => {
    const saturday = new Date(Date.UTC(2026, 10, 7, 0, 0, 0))
    const sunStart = startOfWeek(saturday, 'Sunday')
    expect(sunStart.getUTCDay()).toBe(0)
    expect(sunStart.toISOString().slice(0, 10)).toBe('2026-11-01')
  })

  it('supports Monday start when configured', () => {
    const friday = new Date(Date.UTC(2026, 10, 6, 0, 0, 0))
    const monStart = startOfWeek(friday, 'Monday')
    expect(monStart.getUTCDay()).toBe(1) // Monday
    expect(monStart.toISOString().slice(0, 10)).toBe('2026-11-02')
  })

  it('supports Monday start when today is Sunday', () => {
    const sunday = new Date(Date.UTC(2026, 10, 8, 0, 0, 0))
    const monStart = startOfWeek(sunday, 'Monday')
    expect(monStart.getUTCDay()).toBe(1)
    expect(monStart.toISOString().slice(0, 10)).toBe('2026-11-02')
  })
})
