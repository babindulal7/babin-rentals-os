/**
 * Legacy Local Export (T4-06, Ruling D28, Law 3)
 *
 * Scans browser-local storage and IndexedDB for legacy entries saved only on this device:
 *   - localStorage keys:
 *       - br.productions
 *       - babin_rentals_deliveries_v1
 *       - babin_internal_notes_v1
 *       - br.shiftHandovers
 *       - br.warranties
 *       - babin_coupons_v2
 *   - IndexedDB (BabinOfflineQueue):
 *       - mutations (pending / syncing / failed)
 *       - heldMutations
 *       - conflicts
 *
 * D28: "Export, start fresh: each device exports its old entries to a file for Babin;
 * the shared versions start empty. Nothing is deleted or auto-imported."
 * Law 3: Archive, never delete — the bytes stay intact in the browser.
 */

import { db as outbox } from './offlineQueue'
import { isIndexedDbAvailable } from './localStore'

export const LEGACY_STORAGE_KEYS = [
  'br.productions',
  'babin_rentals_deliveries_v1',
  'babin_internal_notes_v1',
  'br.shiftHandovers',
  'br.warranties',
  'babin_coupons_v2',
] as const

export type LegacyStorageKey = (typeof LEGACY_STORAGE_KEYS)[number]

export const LEGACY_EXPORT_DISMISSED_KEY = 'br.legacyExportDismissed'

export interface LegacyExportSummary {
  totalCount: number
  countsByKey: Record<string, number>
}

export interface LegacyExportBundle {
  exportedAt: string
  device: {
    userAgent: string
    platform: string
  }
  totalCount: number
  summary: Record<string, number>
  data: Record<string, unknown>
  csvText: string
}

/**
 * Checks whether this device has dismissed the export prompt on Today.
 */
export function isLegacyExportDismissed(): boolean {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem(LEGACY_EXPORT_DISMISSED_KEY) === 'true'
}

/**
 * Dismisses the export prompt on Today.
 */
export function dismissLegacyExport(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(LEGACY_EXPORT_DISMISSED_KEY, 'true')
  }
}

/**
 * Resets dismissal so the card shows again if entries exist.
 */
export function resetLegacyExportDismissal(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(LEGACY_EXPORT_DISMISSED_KEY)
  }
}

/**
 * Scans localStorage and IndexedDB and counts legacy entries on this device.
 */
export async function getLegacyLocalEntriesSummary(): Promise<LegacyExportSummary> {
  const countsByKey: Record<string, number> = {}
  let totalCount = 0

  // 1. Scan localStorage keys
  if (typeof localStorage !== 'undefined') {
    for (const key of LEGACY_STORAGE_KEYS) {
      try {
        const raw = localStorage.getItem(key)
        if (raw) {
          const parsed = JSON.parse(raw) as unknown
          if (Array.isArray(parsed)) {
            const count = parsed.length
            countsByKey[key] = count
            totalCount += count
          } else if (parsed && typeof parsed === 'object') {
            countsByKey[key] = 1
            totalCount += 1
          }
        } else {
          countsByKey[key] = 0
        }
      } catch {
        // Non-JSON or corrupt value still counts as 1 entry
        countsByKey[key] = 1
        totalCount += 1
      }
    }
  }

  // 2. Scan IndexedDB offline queue
  let mutationCount = 0
  let heldCount = 0
  let conflictCount = 0

  if (isIndexedDbAvailable()) {
    try {
      if (outbox?.mutations) {
        mutationCount = await outbox.mutations.count()
      }
    } catch {
      // IndexedDB uninitialized or inaccessible
    }

    try {
      if (outbox?.heldMutations) {
        heldCount = await outbox.heldMutations.count()
      }
    } catch {
      // Ignore
    }

    try {
      if (outbox?.conflicts) {
        conflictCount = await outbox.conflicts.count()
      }
    } catch {
      // Ignore
    }
  }

  countsByKey['indexeddb.mutations'] = mutationCount
  countsByKey['indexeddb.heldMutations'] = heldCount
  countsByKey['indexeddb.conflicts'] = conflictCount
  totalCount += (mutationCount + heldCount + conflictCount)

  return {
    totalCount,
    countsByKey,
  }
}

/**
 * Helper to convert an array of record objects to a clean CSV string.
 */
export function recordsToCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows || rows.length === 0) return ''

  // Collect all unique header keys
  const headers = Array.from(new Set(rows.flatMap(r => Object.keys(r))))
  if (headers.length === 0) return ''

  const escapeCell = (val: unknown): string => {
    if (val === null || val === undefined) return ''
    if (typeof val === 'object') {
      return `"${JSON.stringify(val).replace(/"/g, '""')}"`
    }
    const str = String(val)
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const lines = [
    headers.join(','),
    ...rows.map(row => headers.map(h => escapeCell(row[h])).join(',')),
  ]

  return lines.join('\r\n')
}

/**
 * Builds the complete export bundle containing raw data and CSV representations.
 * Crucially, does NOT delete or alter any stored entries (Law 3, D28).
 */
export async function buildLegacyExportBundle(): Promise<LegacyExportBundle> {
  const summary = await getLegacyLocalEntriesSummary()
  const data: Record<string, unknown> = {}
  const csvSections: string[] = []

  // 1. Read localStorage
  if (typeof localStorage !== 'undefined') {
    for (const key of LEGACY_STORAGE_KEYS) {
      try {
        const raw = localStorage.getItem(key)
        if (raw) {
          const parsed = JSON.parse(raw) as unknown
          data[key] = parsed
          if (Array.isArray(parsed) && parsed.length > 0) {
            const sample = parsed[0]
            if (sample && typeof sample === 'object') {
              csvSections.push(`# --- ${key} (${parsed.length} entries) ---\r\n` + recordsToCsv(parsed as Array<Record<string, unknown>>))
            }
          }
        }
      } catch {
        data[key] = localStorage.getItem(key)
      }
    }
  }

  // 2. Read IndexedDB offline work
  if (isIndexedDbAvailable()) {
    try {
      if (outbox?.mutations) {
        const mutations = await outbox.mutations.toArray()
        data['indexeddb.mutations'] = mutations
        if (mutations.length > 0) {
          csvSections.push(`# --- indexeddb.mutations (${mutations.length} entries) ---\r\n` + recordsToCsv(mutations as unknown as Array<Record<string, unknown>>))
        }
      }
    } catch {
      data['indexeddb.mutations'] = []
    }

    try {
      if (outbox?.heldMutations) {
        const held = await outbox.heldMutations.toArray()
        data['indexeddb.heldMutations'] = held
        if (held.length > 0) {
          csvSections.push(`# --- indexeddb.heldMutations (${held.length} entries) ---\r\n` + recordsToCsv(held as unknown as Array<Record<string, unknown>>))
        }
      }
    } catch {
      data['indexeddb.heldMutations'] = []
    }

    try {
      if (outbox?.conflicts) {
        const conflicts = await outbox.conflicts.toArray()
        data['indexeddb.conflicts'] = conflicts
        if (conflicts.length > 0) {
          csvSections.push(`# --- indexeddb.conflicts (${conflicts.length} entries) ---\r\n` + recordsToCsv(conflicts as unknown as Array<Record<string, unknown>>))
        }
      }
    } catch {
      data['indexeddb.conflicts'] = []
    }
  }

  const csvText = csvSections.join('\r\n\r\n')

  return {
    exportedAt: new Date().toISOString(),
    device: {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Node/Unknown',
      platform: typeof navigator !== 'undefined' ? navigator.platform : 'Unknown',
    },
    totalCount: summary.totalCount,
    summary: summary.countsByKey,
    data,
    csvText,
  }
}

/**
 * Triggers a file download in the browser.
 */
function downloadBlob(filename: string, content: string, mimeType: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return

  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Executes export and downloads both JSON and CSV files for Babin.
 * NEVER deletes or alters any entries (Law 3, D28).
 */
export async function downloadLegacyExport(): Promise<LegacyExportBundle> {
  const bundle = await buildLegacyExportBundle()
  const dateStr = new Date().toISOString().slice(0, 10)

  // 1. Download JSON bundle
  const jsonContent = JSON.stringify(bundle, null, 2)
  downloadBlob(`babin-legacy-export-${dateStr}.json`, jsonContent, 'application/json')

  // 2. Download CSV bundle if there are entries
  if (bundle.csvText.trim()) {
    downloadBlob(`babin-legacy-export-${dateStr}.csv`, bundle.csvText, 'text/csv;charset=utf-8')
  }

  return bundle
}
