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

/**
 * Clears all in-progress floor scan records (for logout / device purge).
 */
export function clearAllFloorScans(): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const keysToRemove: string[] = []
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i)
        if (key && key.startsWith(STORAGE_PREFIX)) {
          keysToRemove.push(key)
        }
      }
      for (const key of keysToRemove) {
        window.localStorage.removeItem(key)
      }
    }
  } catch {
    // Storage access blocked
  }
  memoryStore.clear()
}

export interface FloorScanEventParams {
  bookingId: string
  context: 'packing' | 'handover' | 'return' | 'lookup' | 'stock_check'
  code: string
  codeType?: 'barcode' | 'qr_code' | 'manual_entry' | 'rfid'
  result?: 'accepted' | 'rejected' | 'warning' | 'override'
  resultReason?: string | null
  resolvedUnitId?: string | null
  sessionId?: string | null
  deviceId?: string
}

/**
 * Records a non-custodial scan event into the Dexie offline queue (Law 8).
 * Replays automatically via drainQueue() when network connectivity is present.
 */
export async function recordFloorScanEvent(params: FloorScanEventParams): Promise<boolean> {
  const clientUuid = newClientUuid()
  const payload = {
    client_uuid: clientUuid,
    context: params.context,
    booking_id: params.bookingId,
    session_id: params.sessionId ?? null,
    code: params.code,
    code_type: params.codeType ?? 'barcode',
    resolved_unit_id: params.resolvedUnitId ?? null,
    result: params.result ?? 'accepted',
    result_reason: params.resultReason ?? null,
    scanned_at: new Date().toISOString(),
    queued_offline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
    device_id: params.deviceId ?? (typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 50) : 'device-web'),
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
