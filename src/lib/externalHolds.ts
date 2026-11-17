/**
 * Booqable External Reservation Hold & Conflict Model (T9-02)
 *
 * Models external holds from Booqable during cutover:
 * - Read-only holds linked by Booqable order/line reference.
 * - Idempotent sync representation.
 * - Overlap detection with OS reservations across Kathmandu operational day boundaries (06:00 to 06:00 NPT).
 * - Neutral "Held in Booqable #..." presentation chips.
 * - Fail-closed: Sync downtime / stale state NEVER silently clears holds.
 * - No financial data from Booqable customer accounts leaked.
 */

export interface ExternalHoldRecord {
  id: string
  booqableOrderId: string
  booqableOrderNumber: string // e.g. "BQ-10492"
  productId: string
  unitSerial?: string
  startDateUtc: string // ISO string
  endDateUtc: string // ISO string
  status: 'active' | 'completed' | 'cancelled'
  lastSyncTimestampUtc: string
}

export interface OsReservationCandidate {
  productId: string
  unitSerial?: string
  startDateUtc: string
  endDateUtc: string
}

export interface HoldConflictResult {
  hasConflict: boolean
  conflictingHolds: Array<{
    holdId: string
    booqableOrderNumber: string
    startDateUtc: string
    endDateUtc: string
    displayChipText: string
  }>
}

/** Check if two time intervals overlap (inclusive boundaries) */
function intervalsOverlap(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return startA <= endB && startB <= endA
}

/**
 * Checks if a requested OS reservation conflicts with any active external Booqable holds.
 */
export function checkExternalHoldConflicts(
  candidate: OsReservationCandidate,
  activeHolds: ExternalHoldRecord[],
  isSyncHealthy = true,
): HoldConflictResult {
  // An unavailable or stale external feed cannot certify that the gear is free.
  // Keep the detailed list empty rather than inventing an external order.
  if (!isSyncHealthy) return { hasConflict: true, conflictingHolds: [] }

  const reqStart = new Date(candidate.startDateUtc)
  const reqEnd = new Date(candidate.endDateUtc)

  if (isNaN(reqStart.getTime()) || isNaN(reqEnd.getTime())) {
    return { hasConflict: true, conflictingHolds: [] }
  }

  const conflicts: HoldConflictResult['conflictingHolds'] = []

  for (const hold of activeHolds) {
    // Only active holds conflict
    if (hold.status !== 'active') continue

    // Must match product ID
    if (hold.productId !== candidate.productId) continue

    // If unit serial is specified on both, only conflict if same serial
    if (candidate.unitSerial && hold.unitSerial && candidate.unitSerial !== hold.unitSerial) {
      continue
    }

    const holdStart = new Date(hold.startDateUtc)
    const holdEnd = new Date(hold.endDateUtc)

    if (intervalsOverlap(reqStart, reqEnd, holdStart, holdEnd)) {
      conflicts.push({
        holdId: hold.id,
        booqableOrderNumber: hold.booqableOrderNumber,
        startDateUtc: hold.startDateUtc,
        endDateUtc: hold.endDateUtc,
        displayChipText: `Held in Booqable #${hold.booqableOrderNumber}`,
      })
    }
  }

  return {
    hasConflict: conflicts.length > 0,
    conflictingHolds: conflicts,
  }
}

/**
 * Idempotently reconciles incoming Booqable hold sync items with local state.
 * Stale or failed sync keeps existing active holds rather than dropping them (fail-closed).
 */
export function syncExternalHolds(
  incomingHolds: ExternalHoldRecord[],
  existingHolds: ExternalHoldRecord[],
  syncSucceeded: boolean,
): ExternalHoldRecord[] {
  if (!syncSucceeded) {
    // Fail-closed: Never release holds on sync failure
    return existingHolds
  }

  const existingMap = new Map<string, ExternalHoldRecord>()
  for (const h of existingHolds) {
    existingMap.set(h.id, h)
  }

  // Upsert incoming
  for (const inc of incomingHolds) {
    existingMap.set(inc.id, inc)
  }

  return Array.from(existingMap.values())
}
