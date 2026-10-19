/**
 * Floor Scan Storage Adapter & Scan Event Queue
 *
 * Persists active warehouse floor scanning sessions (Packing, Handover & Return/Inspection)
 * in storage and queues non-custodial scan events into Dexie IndexedDB outbox.
 *
 * Enforces:
 *  - Technicians never lose scanned serials or inspection notes across tab disconnects.
 *  - Non-custodial barcode scan events are queued offline via Dexie with client_uuid idempotency keys.
 *  - Custodial stage transitions remain fail-closed online RPCs (Law 1, Rule R-40).
 */

import { enqueueMutation, drainQueue } from './offlineQueue'
import { newClientUuid, IS_MOCK } from './supabase'

export type FloorVerb = 'pack' | 'return' | 'handover'

export interface FloorScanRecord<T> {
  bookingId: string
  verb: FloorVerb
  savedAt: string
  payload: T
}

const STORAGE_PREFIX = 'babin-rentals:floor-scan'

// In-memory fallback if localStorage is restricted (e.g. private browsing or sandbox)
const memoryStore = new Map<string, string>()

function storageKey(verb: FloorVerb, bookingId: string): string {
  return `${STORAGE_PREFIX}:${verb}:${bookingId}`
}

function getStorageItem(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key)
    }
  } catch {
    // Local storage access blocked or unavailable
  }
  return memoryStore.get(key) ?? null
}

function setStorageItem(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value)
      return
    }
  } catch {
    // Quota exceeded or storage unavailable
  }
  memoryStore.set(key, value)
}

function removeStorageItem(key: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key)
      return
    }
  } catch {
    // Storage unavailable
  }
  memoryStore.delete(key)
}

/**
 * Saves the in-progress floor scanning payload for a booking.
 */
export function saveFloorScan<T>(verb: FloorVerb, bookingId: string, payload: T): void {
  if (!bookingId) return
  const record: FloorScanRecord<T> = {
    bookingId,
    verb,
    savedAt: new Date().toISOString(),
    payload,
  }
  try {
    setStorageItem(storageKey(verb, bookingId), JSON.stringify(record))
  } catch {
    // Ignore serialization issues
  }
}

/**
 * Loads any persisted in-progress floor scan for a booking.
 * Returns null if no valid record exists.
 */
export function loadFloorScan<T>(verb: FloorVerb, bookingId: string): FloorScanRecord<T> | null {
  if (!bookingId) return null
  const raw = getStorageItem(storageKey(verb, bookingId))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as FloorScanRecord<T>
    if (parsed && parsed.bookingId === bookingId && parsed.verb === verb && parsed.payload !== undefined) {
      return parsed
    }
  } catch {
    // Corrupted record
  }
  return null
}

/**
 * Clears the persisted scanning session when completed or explicitly discarded.
 */
export function clearFloorScan(verb: FloorVerb, bookingId: string): void {
  if (!bookingId) return
  removeStorageItem(storageKey(verb, bookingId))
}

export interface FloorScanEventParams {
  bookingId?: string | null | undefined
  context: 'packing' | 'handover' | 'return' | 'reset' | 'lookup' | 'stock_check'
  code: string
  codeType?: 'barcode' | 'qr_code' | 'manual_entry' | 'rfid' | 'Barcode 1D' | 'QR' | 'Manual entry' | undefined
  result?:
    | 'accepted'
    | 'rejected'
    | 'warning'
    | 'override'
    | 'Accepted'
    | 'Duplicate'
    | 'Wrong job'
    | 'Not expected here'
    | 'Blocked'
    | 'Unknown code'
    | undefined
  resultReason?: string | null | undefined
  resolvedUnitId?: string | null | undefined
  sessionId?: string | null | undefined
  deviceId?: string | undefined
  userId?: string | undefined
}

/**
 * Records a non-custodial scan event into the Dexie offline queue (Law 8).
 * Replays automatically via drainQueue() when network connectivity is present.
 */
export async function recordFloorScanEvent(params: FloorScanEventParams): Promise<boolean> {
  const clientUuid = newClientUuid()

  // Canonical code_type matching scan_code_type enum (0001_enums.sql)
  let codeType: 'QR' | 'Barcode 1D' | 'Manual entry' = 'Barcode 1D'
  if (params.codeType === 'QR' || params.codeType === 'qr_code') {
    codeType = 'QR'
  } else if (params.codeType === 'Manual entry' || params.codeType === 'manual_entry') {
    codeType = 'Manual entry'
  } else {
    codeType = 'Barcode 1D'
  }

  // Canonical result matching scan_result enum (0001_enums.sql)
  let result: 'Accepted' | 'Duplicate' | 'Wrong job' | 'Not expected here' | 'Blocked' | 'Unknown code' = 'Accepted'
  if (params.result === 'Duplicate' || params.result === 'warning') {
    result = 'Duplicate'
  } else if (params.result === 'Wrong job') {
    result = 'Wrong job'
  } else if (params.result === 'Not expected here' || params.result === 'rejected') {
    result = 'Not expected here'
  } else if (params.result === 'Blocked') {
    result = 'Blocked'
  } else if (params.result === 'Unknown code') {
    result = 'Unknown code'
  } else {
    result = 'Accepted'
  }

  // Schema constraint: scan_events_lookup_carries_no_job
  // check (context not in ('lookup', 'stock_check') or (session_id is null and booking_id is null))
  const isNoJobContext = params.context === 'lookup' || params.context === 'stock_check'
  const bookingId = isNoJobContext ? null : (params.bookingId ?? null)

  // Schema constraint: scan_events_session_only_where_a_session_exists
  // check (context in ('packing', 'handover', 'return') or session_id is null)
  const isSessionContext = params.context === 'packing' || params.context === 'handover' || params.context === 'return'
  const sessionId = isSessionContext ? (params.sessionId ?? null) : null

  const userId = params.userId ?? '00000000-0000-4000-8000-000000000001'

  const payload = {
    client_uuid: clientUuid,
    context: params.context,
    booking_id: bookingId,
    session_id: sessionId,
    code: params.code,
    code_type: codeType,
    resolved_unit_id: params.resolvedUnitId ?? null,
    result,
    result_reason: params.resultReason ?? null,
    scanned_at: new Date().toISOString(),
    queued_offline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
    device_id: params.deviceId ?? (typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 50) : 'device-web'),
    created_by: userId,
  }

  try {
    const enqueued = await enqueueMutation('scan_events', 'insert', payload, clientUuid)
    if (typeof navigator !== 'undefined' && navigator.onLine && !IS_MOCK) {
      void drainQueue().catch(() => {})
    }
    return enqueued
  } catch (err) {
    console.warn('[FloorScanStorage] Non-critical: could not queue scan event', err)
    return false
  }
}
