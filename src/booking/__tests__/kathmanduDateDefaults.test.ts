import { describe, expect, it } from 'vitest'
import { getDefaultRentalDates } from '../lib/kathmanduDateDefaults'

describe('Kathmandu-local public booking date defaults', () => {
  it('does not shift tomorrow back to today in early Nepal morning', () => {
    // 21 Nov, 05:32 NPT; ISO UTC date is still 20 Nov.
    expect(getDefaultRentalDates(new Date('2026-11-20T23:47:00.000Z'))).toEqual({
      startDate: '2026-11-22',
      endDate: '2026-11-24',
    })
  })

  it('uses Kathmandu dates for visitors outside Nepal', () => {
    // Both sides of a UTC date boundary belong to 21 Nov in Kathmandu.
    expect(getDefaultRentalDates(new Date('2026-11-21T01:00:00.000Z'))).toEqual({
      startDate: '2026-11-22',
      endDate: '2026-11-24',
    })
  })

  it('handles month and year rollover without local-time DST arithmetic', () => {
    // 1 Jan 2027, 01:45 NPT.
    expect(getDefaultRentalDates(new Date('2026-12-31T20:00:00.000Z'))).toEqual({
      startDate: '2027-01-02',
      endDate: '2027-01-04',
    })
  })
})
