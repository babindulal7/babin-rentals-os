import { describe, expect, it } from 'vitest'
import { rentalPresetReturnDate } from '../rentalDatePreset'
import { rentalDaysBetween } from '../rentalDays'

describe('UI-06 presets use the billing engine without changing entered times', () => {
  it.each(['05:59', '06:00', '09:00', '18:00'])('matches durations with pickup %s across the 06:00 boundary', pickupTime => {
    for (const returnTime of ['05:59', '06:00', '18:00']) {
      for (const days of [1, 2, 3, 7]) {
        const date = rentalPresetReturnDate('2026-10-19', days, pickupTime, returnTime)
        if (date) expect(rentalDaysBetween(`2026-10-19T${pickupTime}:00+05:45`, `${date}T${returnTime}:00+05:45`)).toBe(days)
        else {
          expect(['05:59/05:59', '05:59/18:00', '18:00/18:00']).toContain(`${pickupTime}/${returnTime}`)
          expect(days).toBe(1)
        }
      }
    }
  })
  it('offers a one-day hire ending exactly at the next 06:00', () => {
    expect(rentalPresetReturnDate('2026-10-19', 1, '09:00', '06:00')).toBe('2026-10-20')
  })
  it('refuses impossible or malformed durations', () => {
    expect(rentalPresetReturnDate('2026-10-19', 1, '05:00', '18:00')).toBeNull()
    expect(rentalPresetReturnDate('bad date', 1)).toBeNull()
    expect(rentalPresetReturnDate('2026-10-19', 0)).toBeNull()
  })
})
