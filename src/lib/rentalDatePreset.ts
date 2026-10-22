import { rentalDaysBetween } from './rentalDays'

/** Keep the entered clock times; choose a return date using the billing engine.
 * Some durations cannot fit those times (e.g. 05:00 → 18:00 touches two shifts).
 * Return null for those presets instead of changing a time or the pricing rule.
 */
export function rentalPresetReturnDate(outDate: string, days: number, pickupTime = '09:00', returnTime = '18:00'): string | null {
  if (!Number.isSafeInteger(days) || days < 1) return null
  const pickup = `${outDate}T${pickupTime}:00+05:45`
  if (!Number.isFinite(Date.parse(pickup))) return null
  for (let offset = Math.max(0, days - 2); offset <= days + 1; offset++) {
    const ret = new Date(`${outDate}T00:00:00Z`)
    ret.setUTCDate(ret.getUTCDate() + offset)
    const date = ret.toISOString().slice(0, 10)
    if (rentalDaysBetween(pickup, `${date}T${returnTime}:00+05:45`) === days) return date
  }
  return null
}
