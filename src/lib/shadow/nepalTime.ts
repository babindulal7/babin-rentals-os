/**
 * BABIN RENTALS OS — NEPAL OPERATING DAY CALCULATIONS
 *
 * Implements the canonical 06:00–06:00 Nepal Local Operating Day rule.
 * Nepal Time is UTC+05:45 with no daylight saving time (DST).
 * An operating day begins at 06:00:00 Nepal time and concludes at 05:59:59.999
 * the following calendar morning.
 */

export const NEPAL_UTC_OFFSET_MINUTES = 345 // 5 hours 45 minutes = 345 minutes
export const NEPAL_DAY_BOUNDARY_HOUR = 6 // 06:00 AM Nepal Time

export interface NepalTimeComponents {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  operatingDateString: string // YYYY-MM-DD
}

/**
 * Converts any UTC date or ISO string to Nepal Local Time components
 * and determines its canonical 06:00 operating day.
 */
export function getNepalTimeComponents(dateInput: Date | string): NepalTimeComponents {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date supplied to getNepalTimeComponents: ${String(dateInput)}`)
  }

  // Calculate milliseconds in Nepal (+05:45 = +345 minutes)
  const nepalMs = d.getTime() + NEPAL_UTC_OFFSET_MINUTES * 60 * 1000
  const nepalDate = new Date(nepalMs)

  const year = nepalDate.getUTCFullYear()
  const month = nepalDate.getUTCMonth() + 1
  const day = nepalDate.getUTCDate()
  const hour = nepalDate.getUTCHours()
  const minute = nepalDate.getUTCMinutes()
  const second = nepalDate.getUTCSeconds()

  // Operating day rule: If before 06:00 AM, the operating day is the previous calendar day
  let opYear = year
  let opMonth = month
  let opDay = day

  if (hour < NEPAL_DAY_BOUNDARY_HOUR) {
    // Subtract 1 calendar day
    const prevDayDate = new Date(Date.UTC(year, month - 1, day - 1))
    opYear = prevDayDate.getUTCFullYear()
    opMonth = prevDayDate.getUTCMonth() + 1
    opDay = prevDayDate.getUTCDate()
  }

  const pad = (n: number) => String(n).padStart(2, '0')
  const operatingDateString = `${opYear}-${pad(opMonth)}-${pad(opDay)}`

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    operatingDateString,
  }
}

/**
 * Returns a Date object shifted into Nepal Local Time (+05:45).
 */
export function toNepalDate(dateInput: Date | string): Date {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
  return new Date(d.getTime() + NEPAL_UTC_OFFSET_MINUTES * 60 * 1000)
}

/**
 * Formats a Date or ISO string into an ISO string with +05:45 timezone offset.
 */
export function formatNepalTimeISO(dateInput: Date | string): string {
  const comp = getNepalTimeComponents(dateInput)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${comp.year}-${pad(comp.month)}-${pad(comp.day)}T${pad(comp.hour)}:${pad(comp.minute)}:${pad(comp.second)}+05:45`
}

/**
 * Returns the bounds (dayLabel) for the 06:00 to 06:00 Nepal operating cycle.
 */
export function getNepalOperatingDayBounds(dateInput: Date | string): {
  dayLabel: string
  nepalHour: number
} {
  const comp = getNepalTimeComponents(dateInput)
  return {
    dayLabel: comp.operatingDateString,
    nepalHour: comp.hour,
  }
}

/**
 * Determines whether a given return or pickup date is due on the current operating day.
 */
export function isDueInCurrentNepalOperatingDay(
  targetDateISO: string,
  currentReferenceISO: string
): boolean {
  const target = getNepalTimeComponents(targetDateISO)
  const ref = getNepalTimeComponents(currentReferenceISO)
  return target.operatingDateString === ref.operatingDateString
}
