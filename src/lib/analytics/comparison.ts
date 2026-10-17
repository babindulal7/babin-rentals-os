import type { Delta } from './contracts'

/**
 * Compares current and previous metric periods purely and safely.
 * Handles zero previous baseline, nulls, and negative values.
 */
export function comparePeriods(
  current: number | null | undefined,
  previous: number | null | undefined,
  invertGood = false,
): Delta {
  if (
    current === null ||
    current === undefined ||
    previous === null ||
    previous === undefined ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous)
  ) {
    return { kind: 'unavailable', reason: 'A complete comparable period is required' }
  }

  if (previous === 0) {
    if (current === 0) {
      return { kind: 'changed', absolute: 0, percentage: 0, isGood: true }
    }
    return { kind: 'new', current }
  }

  const absolute = current - previous
  const percentage = (absolute / Math.abs(previous)) * 100
  const isUp = absolute >= 0
  const isGood = invertGood ? !isUp : isUp

  return {
    kind: 'changed',
    absolute,
    percentage,
    isGood,
  }
}
