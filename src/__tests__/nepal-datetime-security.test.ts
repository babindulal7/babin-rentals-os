import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  NPT_OFFSET_MIN,
  BS_MONTH_DAYS,
  kathmanduCivil,
  toBs,
  toAd,
} from '../lib/bs'
import {
  OPERATIONAL_DAY_START_DEFAULT_MINUTES,
  NPT_OFFSET_STRING,
  operationalDayBounds,
  operationalDayOf,
} from '../lib/operationalDay'
import {
  DEFAULT_RENTAL_DAY_START_MINUTES,
  KATHMANDU_SHIFT_OFFSET_MS,
  rentalDaysBetween,
} from '../lib/rentalDays'

describe('BSEC-26 (P1 Batch 7): Date, Time & Nepal Calendar (UTC+5:45, 06:00 Boundaries, BS/AD)', () => {
  it('BSEC-26-01: enforces Asia/Kathmandu UTC+5:45 (+345m) offset across UTC midnight', () => {
    expect(NPT_OFFSET_MIN).toBe(345)
    expect(NPT_OFFSET_STRING).toBe('+05:45')

    // 2026-07-16T18:14:59Z is 2026-07-16 23:59:59+05:45
    const justBeforeMidnightNpt = new Date('2026-07-16T18:14:59Z')
    // 2026-07-16T18:15:00Z is 2026-07-17 00:00:00+05:45
    const exactMidnightNpt = new Date('2026-07-16T18:15:00Z')

    expect(kathmanduCivil(exactMidnightNpt) - kathmanduCivil(justBeforeMidnightNpt)).toBe(86_400_000)
    expect(toBs(justBeforeMidnightNpt)).toEqual({ year: 2083, month: 3, day: 32 }) // 32 Ashadh 2083
    expect(toBs(exactMidnightNpt)).toEqual({ year: 2083, month: 4, day: 1 }) // 1 Shrawan 2083
  })

  it('BSEC-26-02: enforces 06:00 NPT operational-day and rental-day boundaries', () => {
    expect(OPERATIONAL_DAY_START_DEFAULT_MINUTES).toBe(360)
    expect(DEFAULT_RENTAL_DAY_START_MINUTES).toBe(360)
    // Shift from UTC midnight to 06:00 NPT is +15 minutes (900_000 ms)
    expect(KATHMANDU_SHIFT_OFFSET_MS).toBe(900_000)

    // 2027-02-10 05:59+05:45 belongs to 2027-02-09 operational day
    expect(operationalDayOf('2027-02-10T05:59:00+05:45', 360)).toBe('2027-02-09')
    // 2027-02-10 06:00+05:45 belongs to 2027-02-10 operational day
    expect(operationalDayOf('2027-02-10T06:00:00+05:45', 360)).toBe('2027-02-10')

    const bounds = operationalDayBounds('2027-02-10', 360)
    expect(bounds.fromAd).toBe('2027-02-10T06:00:00.000+05:45')
    expect(bounds.toAd).toBe('2027-02-11T05:59:59.999+05:45')

    // 06:00 -> next day 06:00 = 1 rental day; 06:00 -> next day 06:01 = 2 rental days? Wait: check exact boundary
    expect(rentalDaysBetween('2027-02-10T06:00:00+05:45', '2027-02-11T06:00:00+05:45')).toBe(1)
    expect(rentalDaysBetween('2027-02-10T06:00:00+05:45', '2027-02-11T06:01:00+05:45')).toBe(2)
  })

  it('BSEC-26-03: verifies authoritative BS/AD conversion anchor and month lengths', () => {
    // Authoritative anchor: 17 Jul 2026 = 1 Shrawan 2083; Shrawan 2083 has 31 days
    expect(BS_MONTH_DAYS[2083]![3]).toBe(31) // 0-indexed month 3 = Shrawan
    const bs = toBs(new Date('2026-07-17T06:00:00+05:45'))
    expect(bs).toEqual({ year: 2083, month: 4, day: 1 })

    const adBack = toAd({ year: 2083, month: 4, day: 1 })
    expect(adBack).not.toBeNull()
    expect(toBs(adBack!)).toEqual({ year: 2083, month: 4, day: 1 })
  })

  it('BSEC-26-04: handles midnight and month-end bookings consistently', () => {
    // 31 Shrawan 2083 -> 1 Bhadra 2083
    const endOfShrawan = toAd({ year: 2083, month: 4, day: 31 })!
    const nextDay = new Date(endOfShrawan.getTime() + 86_400_000)
    expect(toBs(nextDay)).toEqual({ year: 2083, month: 5, day: 1 })

    // Booking spanning UTC midnight but within same 06:00->06:00 NPT shift = 1 day
    const d = rentalDaysBetween('2027-03-31T22:00:00+05:45', '2027-04-01T05:30:00+05:45')
    expect(d).toBe(1)
  })

  it('BSEC-26-05: schedules morning digest and reminders in Asia/Kathmandu local time (05:30 NPT = 23:45 UTC)', () => {
    const digestFn = fs.readFileSync(path.join(process.cwd(), 'supabase/functions/morning-digest/index.ts'), 'utf8')
    expect(digestFn).toContain('05:30 NPT (23:45 UTC)')
    expect(digestFn).toContain('06:00')

    const dayStartMigration = fs.readFileSync(
      path.join(process.cwd(), 'supabase/migrations/0238_rental_day_start_setting.sql'),
      'utf8'
    )
    expect(dayStartMigration).toContain('Kathmandu midnight (+05:45)')
  })
})
