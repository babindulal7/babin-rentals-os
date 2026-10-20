/**
 * # Today Dashboard Query Layer
 *
 * Re-exports timeline calculations, status mapping, and alert definitions
 * for the Today Dashboard (`modules/today/Today.tsx`).
 */

export * from '../../data/today'
import { dayStartMinutesFrom, operationalDayOf } from '../operationalDay'
import { getSetting } from '../settingsStore'

/** Quick floor filters use the configured shift; picked dates stay explicit. */
export function operationalTodayAd(now: Date = new Date()): string {
  return operationalDayOf(now.toISOString(), dayStartMinutesFrom(getSetting('operationalDayStart')))
}
