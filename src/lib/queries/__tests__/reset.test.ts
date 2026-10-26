import { describe, it, expect } from 'vitest'
import {
  getCleaningQueueSummary,
  getNextReservationsForUnits,
  isNeededNext,
  formatPickupClockTime,
  SHARED_CLEAN_TASKS,
  DAMAGE_TYPES,
  SEVERITIES,
  PROBLEM_ROUTE,
  QUEUE_FILTERS,
} from '../reset'

describe('reset queries', () => {
  it('re-exports canonical reset checklist tasks and problem routes', () => {
    expect(SHARED_CLEAN_TASKS.length).toBeGreaterThan(0)
    expect(DAMAGE_TYPES.length).toBeGreaterThan(0)
    expect(SEVERITIES.length).toBeGreaterThan(0)
    expect(QUEUE_FILTERS.length).toBeGreaterThan(0)
    expect(PROBLEM_ROUTE['Missing Item']).toBeDefined()
  })

  it('queries cleaning queue summary with non-negative counts', async () => {
    const summary = await getCleaningQueueSummary()
    expect(summary.total).toBeGreaterThanOrEqual(0)
    expect(summary.inCleaning).toBeGreaterThanOrEqual(0)
    expect(summary.inQc).toBeGreaterThanOrEqual(0)
    expect(summary.ready).toBeGreaterThanOrEqual(0)
  })

  describe('isNeededNext (Ruling D5)', () => {
    const now = Date.parse('2026-10-26T10:00:00.000Z')

    it('identifies pickup within threshold hours as needed next', () => {
      // 3 hours in future
      const pickup3h = new Date(now + 3 * 3600 * 1000).toISOString()
      const res3h = isNeededNext(pickup3h, 4, now)
      expect(res3h.needed).toBe(true)
      expect(res3h.diffHours).toBeCloseTo(3, 2)
    })

    it('does not flag pickup beyond threshold hours', () => {
      // 5 hours in future
      const pickup5h = new Date(now + 5 * 3600 * 1000).toISOString()
      const res5h = isNeededNext(pickup5h, 4, now)
      expect(res5h.needed).toBe(false)
      expect(res5h.diffHours).toBeCloseTo(5, 2)

      // Changing threshold to 6 hours makes it needed next
      const res5hWith6hThreshold = isNeededNext(pickup5h, 6, now)
      expect(res5hWith6hThreshold.needed).toBe(true)
    })

    it('handles imminent past pickup within 30 minutes grace and rejects older past pickups', () => {
      // 10 minutes ago
      const pickup10mPast = new Date(now - 10 * 60 * 1000).toISOString()
      expect(isNeededNext(pickup10mPast, 4, now).needed).toBe(true)

      // 40 minutes ago
      const pickup40mPast = new Date(now - 40 * 60 * 1000).toISOString()
      expect(isNeededNext(pickup40mPast, 4, now).needed).toBe(false)
    })

    it('gracefully handles invalid date string', () => {
      const res = isNeededNext('invalid-date', 4, now)
      expect(res.needed).toBe(false)
      expect(res.diffHours).toBe(Infinity)
    })
  })

  describe('formatPickupClockTime', () => {
    it('formats ISO timestamp to Asia/Kathmandu HH:mm clock time', () => {
      // 04:45 UTC + 05:45 = 10:30 Asia/Kathmandu
      const timeStr = formatPickupClockTime('2026-10-26T04:45:00.000Z')
      expect(timeStr).toBe('10:30')
    })

    it('returns empty string for invalid dates', () => {
      expect(formatPickupClockTime('invalid-date')).toBe('')
    })
  })

  describe('getNextReservationsForUnits', () => {
    it('returns empty object when assetIds is empty', async () => {
      const res = await getNextReservationsForUnits([])
      expect(res).toEqual({})
    })
  })
})
