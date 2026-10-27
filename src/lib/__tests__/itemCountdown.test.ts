import { describe, it, expect } from 'vitest'
import { formatDueCountdown, formatRelativeUpcoming } from '../itemCountdown'

describe('formatDueCountdown (T2-14)', () => {
  const baseTime = new Date('2026-10-27T12:00:00Z')

  it('formats upcoming due time in hours and minutes', () => {
    // 2 hours 15 minutes in future
    const future = new Date(baseTime.getTime() + (2 * 3600 + 15 * 60) * 1000)
    const result = formatDueCountdown(future, baseTime)
    expect(result.isOverdue).toBe(false)
    expect(result.text).toBe('Due in 2h 15m')
  })

  it('formats upcoming due time in days and hours', () => {
    // 2 days 4 hours in future
    const future = new Date(baseTime.getTime() + (2 * 86400 + 4 * 3600) * 1000)
    const result = formatDueCountdown(future, baseTime)
    expect(result.isOverdue).toBe(false)
    expect(result.text).toBe('Due in 2d 4h')
  })

  it('formats upcoming due time in minutes when less than an hour', () => {
    const future = new Date(baseTime.getTime() + 45 * 60 * 1000)
    const result = formatDueCountdown(future, baseTime)
    expect(result.isOverdue).toBe(false)
    expect(result.text).toBe('Due in 45m')
  })

  it('formats overdue return in hours and minutes', () => {
    // 1 hour 30 minutes in past
    const past = new Date(baseTime.getTime() - (1 * 3600 + 30 * 60) * 1000)
    const result = formatDueCountdown(past, baseTime)
    expect(result.isOverdue).toBe(true)
    expect(result.text).toBe('Overdue by 1h 30m')
  })

  it('formats overdue return in days', () => {
    // 3 days in past
    const past = new Date(baseTime.getTime() - 3 * 86400 * 1000)
    const result = formatDueCountdown(past, baseTime)
    expect(result.isOverdue).toBe(true)
    expect(result.text).toBe('Overdue by 3d')
  })

  it('handles null and invalid dates gracefully', () => {
    expect(formatDueCountdown(null).text).toBe('No due date')
    expect(formatDueCountdown('invalid').text).toBe('Invalid date')
  })
})

describe('formatRelativeUpcoming (T2-14)', () => {
  const baseTime = new Date('2026-10-27T12:00:00Z')

  it('formats relative days for upcoming bookings', () => {
    const future3Days = new Date(baseTime.getTime() + 3 * 86400 * 1000)
    expect(formatRelativeUpcoming(future3Days, baseTime)).toBe('Starts in 3 days')

    const tomorrow = new Date(baseTime.getTime() + 1 * 86400 * 1000)
    expect(formatRelativeUpcoming(tomorrow, baseTime)).toBe('Starts tomorrow')

    const laterToday = new Date(baseTime.getTime() + 4 * 3600 * 1000)
    expect(formatRelativeUpcoming(laterToday, baseTime)).toBe('Starts in 4h')
  })

  it('handles past or invalid dates gracefully', () => {
    const past = new Date(baseTime.getTime() - 1000)
    expect(formatRelativeUpcoming(past, baseTime)).toBe('Starts now')
    expect(formatRelativeUpcoming(null)).toBe('')
  })
})
