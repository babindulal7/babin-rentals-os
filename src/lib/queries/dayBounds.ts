import { kathmanduCivil, NPT_OFFSET_MIN } from '../bs'
import { operationalDayBounds, operationalDayOf } from '../operationalDay'

/** A bare calendar date, `YYYY-MM-DD` — what a date picker emits. */
export const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/** `+05:45`, formatted from `bs.ts`'s `NPT_OFFSET_MIN` rather than typed again. */
export const NPT_OFFSET = `${NPT_OFFSET_MIN < 0 ? '-' : '+'}${String(
  Math.floor(Math.abs(NPT_OFFSET_MIN) / 60),
).padStart(2, '0')}:${String(Math.abs(NPT_OFFSET_MIN) % 60).padStart(2, '0')}`

/**
 * The **Nepal** calendar day (`YYYY-MM-DD`) an argument names.
 *
 *  - `YYYY-MM-DD` is already a Nepal calendar date and is returned untouched.
 *  - A full ISO instant is resolved through `kathmanduCivil`, matching the UI.
 *
 * Throws on invalid inputs rather than producing `NaN-NaN-NaN` downstream.
 */
export function nepalDay(dayAd: string): string {
  if (DATE_ONLY.test(dayAd)) return dayAd

  const t = Date.parse(dayAd)
  if (Number.isNaN(t)) {
    throw new Error(`Expected an AD day (YYYY-MM-DD) or a full ISO instant, got ${JSON.stringify(dayAd)}`)
  }
  return new Date(kathmanduCivil(new Date(t))).toISOString().slice(0, 10)
}

/**
 * The calendar day before a `YYYY-MM-DD`, for strict upper bounds such as
 * `overdueInvoices` (`due_date <= yesterday`).
 */
export function previousDay(dayAd: string): string {
  const t = Date.parse(`${dayAd}T00:00:00.000Z`)
  if (Number.isNaN(t)) {
    throw new Error(`previousDay expected YYYY-MM-DD, got ${JSON.stringify(dayAd)}`)
  }
  return new Date(t - 86_400_000).toISOString().slice(0, 10)
}

/** First instant (`00:00:00.000+05:45`) of the Nepal calendar day. */
export function startOfCalendarDay(dayAd: string): string {
  return `${nepalDay(dayAd)}T00:00:00.000${NPT_OFFSET}`
}

/** Last millisecond (`23:59:59.999+05:45`) of the Nepal calendar day. */
export function endOfCalendarDay(dayAd: string): string {
  return `${nepalDay(dayAd)}T23:59:59.999${NPT_OFFSET}`
}

/**
 * Resolve a `YYYY-MM-DD` or ISO instant to the **operational** day (D4) for the
 * given day-start offset in minutes (default 06:00 NPT = 360).
 */
export function nepalOperationalDay(dayAd: string, startMinutes: number): string {
  if (DATE_ONLY.test(dayAd)) return dayAd

  const t = Date.parse(dayAd)
  if (Number.isNaN(t)) {
    throw new Error(`Expected an AD day (YYYY-MM-DD) or a full ISO instant, got ${JSON.stringify(dayAd)}`)
  }
  return operationalDayOf(dayAd, startMinutes)
}

/** First instant of the operational day (D4) in `+05:45`. */
export function startOfOperationalDay(dayAd: string, startMinutes: number): string {
  return operationalDayBounds(nepalOperationalDay(dayAd, startMinutes), startMinutes).fromAd
}

/** Last millisecond of the operational day (D4) in `+05:45`. */
export function endOfOperationalDay(dayAd: string, startMinutes: number): string {
  return operationalDayBounds(nepalOperationalDay(dayAd, startMinutes), startMinutes).toAd
}
