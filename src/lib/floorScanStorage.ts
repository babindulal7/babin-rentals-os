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
import { syncEngine } from './syncEngine'

export type FloorVerb = 'pack' | 'return' | 'handover' | 'reset'

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
  bookingId?: string | null | undefined
  context: 'packing' | 'handover' | 'return' | 'reset' | 'lookup' | 'stock_check'
  code?: string | undefined
  barcode?: string | undefined
  codeType?: 'barcode' | 'qr_code' | 'manual_entry' | 'rfid' | 'QR' | 'Barcode 1D' | 'Manual entry' | undefined
  result?: 'accepted' | 'rejected' | 'warning' | 'override' | 'Accepted' | 'Duplicate' | 'Wrong job' | 'Not expected here' | 'Blocked' | 'Unknown code' | undefined
  resultReason?: string | null | undefined
  resolvedUnitId?: string | null | undefined
  sessionId?: string | null | undefined
  deviceId?: string | undefined
  actorId?: string | null | undefined
}

function mapCodeType(type?: string): 'QR' | 'Barcode 1D' | 'Manual entry' {
  if (!type) return 'Barcode 1D'
  if (type === 'QR' || type === 'qr_code') return 'QR'
  if (type === 'Manual entry' || type === 'manual_entry') return 'Manual entry'
  return 'Barcode 1D'
}

function mapScanResult(res?: string): 'Accepted' | 'Duplicate' | 'Wrong job' | 'Not expected here' | 'Blocked' | 'Unknown code' {
  if (!res) return 'Accepted'
  if (res === 'Accepted' || res === 'accepted') return 'Accepted'
  if (res === 'Duplicate' || res === 'warning') return 'Duplicate'
  if (res === 'Blocked' || res === 'override') return 'Blocked'
  if (res === 'Wrong job') return 'Wrong job'
  if (res === 'Not expected here') return 'Not expected here'
  if (res === 'Unknown code' || res === 'rejected') return 'Unknown code'
  return 'Accepted'
}

/**
 * Records a non-custodial scan event or checklist tick into the Dexie offline queue (Law 8).
 * Replays automatically via drainQueue() when network connectivity is restored.
 */
export async function recordFloorScanEvent(params: FloorScanEventParams): Promise<boolean> {
  const rawCode = params.code ?? params.barcode ?? ''
  if (!rawCode) {
    return false
  }

  const clientUuid = newClientUuid()
  const isOffline = typeof navigator !== 'undefined' ? !navigator.onLine : false
  const payload = {
    client_uuid: clientUuid,
    context: params.context,
    booking_id: params.bookingId ?? null,
    session_id: params.sessionId ?? null,
    code: rawCode,
    code_type: mapCodeType(params.codeType),
    resolved_unit_id: params.resolvedUnitId ?? null,
    result: mapScanResult(params.result),
    result_reason: params.resultReason ?? null,
    scanned_at: new Date().toISOString(),
    queued_offline: isOffline,
    device_id: params.deviceId ?? (typeof navigator !== 'undefined' && navigator.userAgent ? navigator.userAgent.slice(0, 50) : 'device-web'),
  }

  try {
    const submittingIdentity = params.actorId
      ? { actorId: params.actorId, environment: IS_MOCK ? 'mock' : 'live' }
      : undefined

    const enqueued = await enqueueMutation('scan_events', 'insert', payload, clientUuid, submittingIdentity)

    // Notify syncEngine to refresh badge/counters immediately
    void syncEngine.refreshPendingCount().catch(() => {})

    if (!isOffline && !IS_MOCK) {
      void drainQueue().catch(() => {})
    }
    return enqueued
  } catch (err) {
    console.warn('[FloorScanStorage] Non-critical: could not queue scan event', err)
    return false
  }
}
