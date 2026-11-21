/** Date-first public booking defaults follow Nepal calendar days, not UTC/browser locale. */
const nepalParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Kathmandu',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * The date input is labelled 06:00 NPT. Build calendar dates in Kathmandu even
 * when a visitor is in another time zone or the UTC day differs from Nepal's.
 * The UTC Date below is a calendar-arithmetic anchor, not the rental timestamp.
 */
export function getDefaultRentalDates(now: Date = new Date()): { startDate: string; endDate: string } {
  const parts = nepalParts.formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((item) => item.type === type)?.value
    if (!value) throw new Error('Kathmandu calendar date unavailable: ' + type)
    return Number(value)
  }
  const day = new Date(Date.UTC(part('year'), part('month') - 1, part('day')))
  const addDays = (days: number): string => {
    const date = new Date(day.getTime())
    date.setUTCDate(date.getUTCDate() + days)
    return date.toISOString().slice(0, 10)
  }
  return { startDate: addDays(1), endDate: addDays(3) }
}
