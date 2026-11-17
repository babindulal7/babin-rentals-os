import { supabase } from '../supabase'
import { parseTstzRange } from './availability'
import {
  SHARED_CLEAN_TASKS,
  DAMAGE_TYPES,
  SEVERITIES,
  PROBLEM_ROUTE,
  QUEUE_FILTERS,
  inferCategoryFromName,
  cleanTasksForCategory,
  resetTasksForCategory,
  allTasksForCategory,
  type QueueState,
  type ProblemState,
  type Category,
} from '../../data/reset'

export {
  SHARED_CLEAN_TASKS,
  DAMAGE_TYPES,
  SEVERITIES,
  PROBLEM_ROUTE,
  QUEUE_FILTERS,
  inferCategoryFromName,
  cleanTasksForCategory,
  resetTasksForCategory,
  allTasksForCategory,
}

export type { QueueState, ProblemState, Category }

export interface CleaningQueueSummary {
  total: number
  inCleaning: number
  inQc: number
  ready: number
}

/**
 * Loads current cleaning queue counts from PostgreSQL database.
 */
export async function getCleaningQueueSummary(): Promise<CleaningQueueSummary> {
  try {
    const { data, error } = await supabase
      .from('cleaning_queue_entries')
      .select('state')

    if (error || !data) {
      return { total: 0, inCleaning: 0, inQc: 0, ready: 0 }
    }

    let inCleaning = 0
    let inQc = 0
    let ready = 0

    for (const row of data) {
      if (row.state === 'Cleaning') inCleaning++
      else if (row.state === 'QC') inQc++
      else if (row.state === 'Ready') ready++
    }

    return {
      total: data.length,
      inCleaning,
      inQc,
      ready,
    }
  } catch {
    return { total: 0, inCleaning: 0, inQc: 0, ready: 0 }
  }
}

export interface NextReservationInfo {
  pickupAt: string
  bookingNo: string
}

/**
 * Loads upcoming reservations for unit asset IDs (excluding a current booking ID).
 * Used by Reset Workspace to identify units that are "Needed next" (Ruling D5).
 */
export async function getNextReservationsForUnits(
  assetIds: string[],
  currentBookingId?: string | null,
): Promise<Record<string, NextReservationInfo>> {
  if (assetIds.length === 0) return {}

  let query = supabase
    .from('inventory_reservations')
    .select('asset_id, period, bookings ( id, booking_no, pickup_at )', { count: 'exact' })
    .is('released_at', null)
    .in('asset_id', assetIds)

  if (currentBookingId) {
    query = query.neq('booking_id', currentBookingId)
  }

  // A failed or truncated read is UNKNOWN, not "there are no urgent pickups".
  // Fail visibly so floor staff cannot treat a partial queue as an empty one.
  const { data, error, count } = await query
  if (error) throw new Error(`Upcoming reservation check failed: ${error.message}`)
  if (!data) throw new Error('Upcoming reservation check returned no data.')
  if (typeof count === 'number' && count > data.length) {
    throw new Error(`Upcoming reservation check was incomplete (${data.length} of ${count} rows).`)
  }

  const result: Record<string, NextReservationInfo> = {}
  const staleBefore = Date.now() - 30 * 60_000

  for (const row of data) {
    if (!row.asset_id) continue
    const bookingData = row.bookings as { id?: string; booking_no?: string; pickup_at?: string } | null
    const parsedRange = typeof row.period === 'string' ? parseTstzRange(row.period) : null
    const pickupAt = bookingData?.pickup_at ?? parsedRange?.fromAd
    if (!pickupAt) continue
    const pickupTime = Date.parse(pickupAt)
    // A long-expired reservation should not hide a later valid pickup.
    if (!Number.isFinite(pickupTime) || pickupTime < staleBefore) continue

    const existing = result[row.asset_id]
    if (!existing || pickupTime < Date.parse(existing.pickupAt)) {
      result[row.asset_id] = {
        pickupAt,
        bookingNo: bookingData?.booking_no ?? '',
      }
    }
  }

  return result
}

/**
 * Evaluates whether a reservation pickup is "needed next" according to Ruling D5:
 * Within the specified threshold window (default 4 hours from Settings ▸ Operations).
 */
export function isNeededNext(
  pickupAtIso: string,
  thresholdHours: number = 4,
  nowMs: number = Date.now(),
): { needed: boolean; diffHours: number } {
  const pickupMs = Date.parse(pickupAtIso)
  if (Number.isNaN(pickupMs)) return { needed: false, diffHours: Infinity }
  const diffMs = pickupMs - nowMs
  const diffHours = diffMs / (1000 * 60 * 60)
  // Needed next when pickup is due in the future within the threshold window,
  // or imminently within 30 minutes in the past.
  const needed = diffMs >= -30 * 60 * 1000 && diffHours <= thresholdHours
  return { needed, diffHours }
}

/**
 * Formats clock time in Asia/Kathmandu time zone: e.g. "10:30".
 */
export function formatPickupClockTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kathmandu',
  })
}
