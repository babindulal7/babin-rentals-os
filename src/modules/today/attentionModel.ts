import type { BookingStatus, JobName } from '../../lib/workflow'
import type { BookingListRow } from '../../lib/queries/bookings'

export type AttentionKind =
  | 'overdue_return'
  | 'late_pickup_booked'
  | 'late_pickup_packed'

export type AttentionSeverity = 'critical' | 'high'

export interface AttentionTask {
  /** Unique, stable identifier: `${kind}:${bookingId}`. Never an array index. */
  key: string
  bookingId: string
  bookingNo: string
  stage: BookingStatus
  kind: AttentionKind
  severity: AttentionSeverity
  dueAtAd: string
  job: JobName
  label: string
  detail: string
  clientName?: string
  deliveryType?: string
}

/**
 * Format relative / short descriptive delay without financial or fabricated data.
 */
function formatTimeContext(instantIso: string, nowIso: string): string {
  const diffMs = Date.parse(nowIso) - Date.parse(instantIso)
  if (Number.isNaN(diffMs)) return instantIso

  const mins = Math.floor(diffMs / 60_000)
  if (mins < 60) {
    return `${Math.max(1, mins)}m overdue`
  }
  const hours = Math.floor(mins / 60)
  if (hours < 24) {
    return `${hours}h overdue`
  }
  const days = Math.floor(hours / 24)
  return `${days}d overdue`
}

/**
 * Pure derivation layer: extracts actionable operational tasks from authoritative
 * overdue return and late pickup query rows.
 *
 * Sorting:
 * 1. Critical severity before High severity
 * 2. Earlier dueAtAd before later dueAtAd (longest overdue first)
 * 3. Stable tie-break by bookingNo
 */
export function deriveAttentionTasks(
  overdueRows: readonly BookingListRow[],
  latePickupRows: readonly BookingListRow[],
  nowAd: string = new Date().toISOString(),
): AttentionTask[] {
  const taskMap = new Map<string, AttentionTask>()

  // 1. Process Overdue Returns (Critical)
  for (const row of overdueRows) {
    if (!row || !row.id || !row.bookingNo) continue
    // Overdue returns must be in 'On Rent' stage and not yet marked returned
    if (row.stage !== 'On Rent') continue
    if (row.actualReturnAtAd) continue

    const key = `overdue_return:${row.id}`
    const timeLabel = formatTimeContext(row.returnAtAd, nowAd)
    taskMap.set(key, {
      key,
      bookingId: row.id,
      bookingNo: row.bookingNo,
      stage: 'On Rent',
      kind: 'overdue_return',
      severity: 'critical',
      dueAtAd: row.returnAtAd,
      job: 'Return',
      label: 'Overdue Return',
      detail: `Due ${timeLabel}`,
      clientName: row.clientName,
      deliveryType: row.deliveryType,
    })
  }

  // 2. Process Late Pickups (High)
  for (const row of latePickupRows) {
    if (!row || !row.id || !row.bookingNo) continue
    // Only Booked or Packed stages are pending pickup dispatch
    if (row.stage !== 'Booked' && row.stage !== 'Packed') continue

    const isBooked = row.stage === 'Booked'
    const kind: AttentionKind = isBooked ? 'late_pickup_booked' : 'late_pickup_packed'
    const key = `${kind}:${row.id}`
    const timeLabel = formatTimeContext(row.pickupAtAd, nowAd)

    taskMap.set(key, {
      key,
      bookingId: row.id,
      bookingNo: row.bookingNo,
      stage: row.stage as BookingStatus,
      kind,
      severity: 'high',
      dueAtAd: row.pickupAtAd,
      job: isBooked ? 'Pack' : 'Handover',
      label: isBooked ? 'Late Pickup · Needs Packing' : 'Late Pickup · Awaiting Handover',
      detail: `Scheduled ${timeLabel}`,
      clientName: row.clientName,
      deliveryType: row.deliveryType,
    })
  }

  const tasks = Array.from(taskMap.values())

  // Sort: Critical before High, then oldest dueAtAd first, tie-break by bookingNo
  return tasks.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === 'critical' ? -1 : 1
    }
    const timeA = Date.parse(a.dueAtAd) || 0
    const timeB = Date.parse(b.dueAtAd) || 0
    if (timeA !== timeB) {
      return timeA - timeB
    }
    return a.bookingNo.localeCompare(b.bookingNo)
  })
}
