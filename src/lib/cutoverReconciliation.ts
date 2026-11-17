/**
 * Booqable Cutover & Import Reconciliation Engine (T9-01)
 *
 * Implements read-only snapshot reconciliation between Booqable exports
 * (clients, products, bundles, pricing structures, seasonal rules) and
 * Babin Rentals OS records.
 *
 * Enforces:
 * - Deterministic per-row status: new, updated, unchanged, conflict, rejected
 * - Entity counts and validation warnings
 * - Safe dry-run execution: zero writes to staging or hosted database
 * - Integer paisa money comparisons for quoting (20-item quote test vectors)
 */

import { rupees, type Paisa } from './money'

export type CutoverEntityType =
  | 'client'
  | 'product'
  | 'bundle'
  | 'pricing_structure'
  | 'seasonal_rule'

export const CUTOVER_ENTITIES: CutoverEntityType[] = [
  'client',
  'product',
  'bundle',
  'pricing_structure',
  'seasonal_rule',
]

export type CutoverRowStatus =
  | 'new'
  | 'updated'
  | 'unchanged'
  | 'conflict'
  | 'rejected'
  | 'os_only'

export interface BooqableRawRow {
  entity: CutoverEntityType
  externalId: string
  fields: Record<string, unknown>
}

export interface OsEntityRecord {
  entity: CutoverEntityType
  externalId: string
  localId?: string
  fields: Record<string, unknown>
}

export interface ReconciledRowResult {
  entity: CutoverEntityType
  externalId: string
  status: CutoverRowStatus
  reason?: string
  changedFields?: string[]
  booqableData?: Record<string, unknown>
  osData?: Record<string, unknown>
}

export interface CutoverSummaryReport {
  counts: Record<CutoverEntityType, {
    new: number
    updated: number
    unchanged: number
    conflict: number
    rejected: number
    os_only: number
    totalSource: number
  }>
  totalRowsProcessed: number
  hasConflicts: boolean
  hasRejections: boolean
  rows: ReconciledRowResult[]
  reconciliationWarnings: string[]
}

/** Deep strict equality helper for JSON-serializable structures */
export function areFieldsEquivalent(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false

  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!areFieldsEquivalent(a[i], b[i])) return false
    }
    return true
  }

  const keysA = Object.keys(a as Record<string, unknown>).sort()
  const keysB = Object.keys(b as Record<string, unknown>).sort()
  if (keysA.length !== keysB.length) return false

  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i]!
    if (key !== keysB[i]!) return false
    if (!areFieldsEquivalent((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
      return false
    }
  }

  return true
}

/**
 * Validates and reconciles raw Booqable export rows against existing OS records.
 * Pure function: strictly read-only, never mutates databases or states.
 */
export function reconcileBooqableCutover(
  sourceRows: BooqableRawRow[],
  osRecords: OsEntityRecord[] = [],
): CutoverSummaryReport {
  const counts = Object.fromEntries(
    CUTOVER_ENTITIES.map((e) => [
      e,
      { new: 0, updated: 0, unchanged: 0, conflict: 0, rejected: 0, os_only: 0, totalSource: 0 },
    ])
  ) as CutoverSummaryReport['counts']

  const warnings: string[] = []
  const rows: ReconciledRowResult[] = []

  // 1. Index OS records by [entity, externalId]
  const osIndex = new Map<string, OsEntityRecord[]>()
  for (const osRec of osRecords) {
    if (!osRec || !osRec.externalId) continue
    const key = `${osRec.entity}:${osRec.externalId.trim()}`
    const existing = osIndex.get(key) ?? []
    existing.push(osRec)
    osIndex.set(key, existing)
  }

  // 2. Index Booqable source rows to detect intra-file duplicate IDs (conflicts)
  const sourceIndex = new Map<string, BooqableRawRow[]>()
  for (const [idx, raw] of sourceRows.entries()) {
    if (!raw || typeof raw !== 'object') {
      warnings.push(`Row ${idx + 1}: Malformed row skipped.`)
      continue
    }

    if (!CUTOVER_ENTITIES.includes(raw.entity)) {
      counts.product.rejected++
      rows.push({
        entity: 'product',
        externalId: String(raw.externalId ?? `unknown-${idx}`),
        status: 'rejected',
        reason: `Unsupported entity type '${String(raw.entity)}'.`,
      })
      continue
    }

    counts[raw.entity].totalSource++

    const trimmedId = typeof raw.externalId === 'string' ? raw.externalId.trim() : ''
    if (!trimmedId) {
      counts[raw.entity].rejected++
      rows.push({
        entity: raw.entity,
        externalId: `row-${idx + 1}`,
        status: 'rejected',
        reason: 'Missing or empty externalId.',
        booqableData: raw.fields,
      })
      continue
    }

    const key = `${raw.entity}:${trimmedId}`
    const existing = sourceIndex.get(key) ?? []
    existing.push(raw)
    sourceIndex.set(key, existing)
  }

  // 3. Process Booqable records
  const visitedKeys = new Set<string>()

  for (const [key, sourceMatches] of sourceIndex.entries()) {
    visitedKeys.add(key)
    const [entity, externalId] = key.split(':') as [CutoverEntityType, string]
    const osMatches = osIndex.get(key) ?? []

    // Duplicate in source -> conflict
    if (sourceMatches.length > 1) {
      counts[entity].conflict += sourceMatches.length
      warnings.push(`Duplicate source externalId '${externalId}' found across ${sourceMatches.length} rows for entity '${entity}'.`)
      for (const sm of sourceMatches) {
        rows.push({
          entity,
          externalId,
          status: 'conflict',
          reason: `Duplicate source external ID '${externalId}' within ${entity}.`,
          booqableData: sm.fields,
        })
      }
      continue
    }

    // Duplicate in OS -> conflict
    if (osMatches.length > 1) {
      counts[entity].conflict++
      warnings.push(`Multiple OS records map to externalId '${externalId}' for entity '${entity}'.`)
      rows.push({
        entity,
        externalId,
        status: 'conflict',
        reason: `Multiple existing OS records map to Booqable ID '${externalId}'.`,
        booqableData: sourceMatches[0]!.fields,
      })
      continue
    }

    const sourceItem = sourceMatches[0]!
    // Validate required fields per entity
    const validationError = validateEntityFields(entity, sourceItem.fields)
    if (validationError) {
      counts[entity].rejected++
      rows.push({
        entity,
        externalId,
        status: 'rejected',
        reason: validationError,
        booqableData: sourceItem.fields,
      })
      continue
    }

    if (osMatches.length === 0) {
      // Not in OS yet -> new
      counts[entity].new++
      rows.push({
        entity,
        externalId,
        status: 'new',
        booqableData: sourceItem.fields,
      })
    } else {
      // Present in both -> unchanged or updated
      const osItem = osMatches[0]!
      const isUnchanged = areFieldsEquivalent(sourceItem.fields, osItem.fields)
      if (isUnchanged) {
        counts[entity].unchanged++
        rows.push({
          entity,
          externalId,
          status: 'unchanged',
          booqableData: sourceItem.fields,
          osData: osItem.fields,
        })
      } else {
        const changedFields = findChangedFieldKeys(sourceItem.fields, osItem.fields)
        counts[entity].updated++
        rows.push({
          entity,
          externalId,
          status: 'updated',
          changedFields,
          booqableData: sourceItem.fields,
          osData: osItem.fields,
        })
      }
    }
  }

  // 4. Check OS-only records
  for (const [key, osMatches] of osIndex.entries()) {
    if (!visitedKeys.has(key)) {
      const [entity, externalId] = key.split(':') as [CutoverEntityType, string]
      counts[entity].os_only += osMatches.length
      for (const om of osMatches) {
        rows.push({
          entity,
          externalId,
          status: 'os_only',
          osData: om.fields,
        })
      }
    }
  }

  let totalConflicts = 0
  let totalRejections = 0
  for (const e of CUTOVER_ENTITIES) {
    totalConflicts += counts[e].conflict
    totalRejections += counts[e].rejected
  }

  return {
    counts,
    totalRowsProcessed: rows.length,
    hasConflicts: totalConflicts > 0,
    hasRejections: totalRejections > 0,
    rows,
    reconciliationWarnings: warnings,
  }
}

/** Field validation rules for dry run */
function validateEntityFields(entity: CutoverEntityType, fields: Record<string, unknown>): string | null {
  if (!fields || typeof fields !== 'object') {
    return 'Fields payload must be a non-null object.'
  }

  switch (entity) {
    case 'client':
      if (!fields.name || typeof fields.name !== 'string' || !fields.name.trim()) {
        return 'Client missing valid name.'
      }
      break
    case 'product':
      if (!fields.name || typeof fields.name !== 'string' || !fields.name.trim()) {
        return 'Product missing valid name.'
      }
      if (fields.dailyRatePaisa !== undefined && typeof fields.dailyRatePaisa !== 'number') {
        return 'Product dailyRatePaisa must be an integer paisa number.'
      }
      break
    case 'bundle':
      if (!fields.name || typeof fields.name !== 'string' || !fields.name.trim()) {
        return 'Bundle missing valid name.'
      }
      if (!Array.isArray(fields.items)) {
        return 'Bundle items must be an array of component references.'
      }
      break
    case 'pricing_structure':
      if (!fields.name || typeof fields.name !== 'string') {
        return 'Pricing structure missing name.'
      }
      break
    case 'seasonal_rule':
      if (!fields.name || !fields.endDate) {
        return 'Seasonal rule requires a name and an explicit endDate.'
      }
      break
  }

  return null
}

function findChangedFieldKeys(source: Record<string, unknown>, os: Record<string, unknown>): string[] {
  const allKeys = Array.from(new Set([...Object.keys(source), ...Object.keys(os)])).sort()
  return allKeys.filter((k) => !areFieldsEquivalent(source[k], os[k]))
}

/**
 * 20-Product 3-Day Pricing Comparison Model (as mandated by T9-01 acceptance)
 * Compares Booqable quote calculations vs Babin Rentals OS whole-rupee / integer-paisa engine.
 */
export interface PricingComparisonVector {
  productId: string
  productName: string
  booqableDailyRateNpr: number
  booqableThreeDayTotalNpr: number
  osDailyRatePaisa: Paisa
  osCalculatedThreeDayTotalPaisa: Paisa
  differencePaisa: number
  isAcceptableRoundingMatch: boolean
}

export function compareThreeDayQuotes(
  items: Array<{ id: string; name: string; dailyRateNpr: number; booqableThreeDayTotalNpr: number }>,
): PricingComparisonVector[] {
  return items.map((item) => {
    // OS rates are stored in integer paisa (1 NPR = 100 Paisa)
    const osDailyPaisa = rupees(item.dailyRateNpr)
    // 3-day calculation under standard rental multiplier (e.g. 3 days base, or discount tier if applicable)
    // Standard 3 days = 3 * daily rate
    const osTotalPaisa = (osDailyPaisa * 3) as Paisa

    const booqableTotalPaisa = rupees(item.booqableThreeDayTotalNpr)
    const diffPaisa = Math.abs(osTotalPaisa - booqableTotalPaisa)

    // Known rounding difference tolerance (<= 1 NPR / 100 Paisa allowed by ruling)
    const isAcceptable = diffPaisa <= 100

    return {
      productId: item.id,
      productName: item.name,
      booqableDailyRateNpr: item.dailyRateNpr,
      booqableThreeDayTotalNpr: item.booqableThreeDayTotalNpr,
      osDailyRatePaisa: osDailyPaisa,
      osCalculatedThreeDayTotalPaisa: osTotalPaisa,
      differencePaisa: diffPaisa,
      isAcceptableRoundingMatch: isAcceptable,
    }
  })
}
