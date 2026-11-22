/**
 * Validate the complete anonymous availability RPC result before exposing an
 * "Available" badge. The RPC returns one product/day row for every requested
 * (published) ID and each 06:00–06:00 rental day, inclusive of both dates.
 *
 * This module is pure so failure conditions can be tested without Supabase.
 */
export interface PublicDayAvailability {
  readonly product_id: string
  readonly day: string
  readonly available: boolean
}

export function rentalDaysInclusive(fromDate: string, toDate: string): string[] {
  const parse = (s: string): number => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('Choose a valid rental date range.')
    const value = new Date(s + 'T00:00:00.000Z').getTime()
    if (!Number.isFinite(value) || new Date(value).toISOString().slice(0, 10) !== s) {
      throw new Error('Choose a valid rental date range.')
    }
    return value
  }
  const start = parse(fromDate)
  const end = parse(toDate)
  const span = Math.round((end - start) / 86_400_000)
  if (span < 0 || span > 60) {
    throw new Error('Choose a rental range of 1 to 61 calendar dates.')
  }
  return Array.from({ length: span + 1 }, (_, i) =>
    new Date(start + i * 86_400_000).toISOString().slice(0, 10))
}

export function resolveCompleteAvailability(
  productIds: readonly string[],
  dates: readonly string[],
  rows: readonly PublicDayAvailability[],
): Map<string, boolean> {
  const ids = new Set(productIds)
  const days = new Set(dates)
  const byId = new Map<string, Map<string, boolean>>()
  for (const id of ids) byId.set(id, new Map())

  for (const row of rows) {
    if (!ids.has(row.product_id) || !days.has(row.day) || typeof row.available !== 'boolean') {
      throw new Error('Availability response incomplete. Please retry.')
    }
    const dayMap = byId.get(row.product_id)
    if (!dayMap || dayMap.has(row.day)) {
      throw new Error('Availability response incomplete. Please retry.')
    }
    dayMap.set(row.day, row.available)
  }

  const result = new Map<string, boolean>()
  for (const [id, dayMap] of byId) {
    if (dayMap.size !== dates.length) {
      throw new Error('Availability response incomplete. Please retry.')
    }
    result.set(id, dates.every((day) => dayMap.get(day) === true))
  }
  return result
}
