/**
 * CSV bundle (kit-style products) import — Booqable adoption
 * B4, B45: kit-style products that are bundles (18 Aug).
 *
 * Pages collect input; this engine decides what can be saved. Modeled on
 * lib/productImport.ts and lib/clientImport.ts.
 *
 * BQ-407: "catalog import with a mandatory, fully-rendered dry-run":
 *   - surface the parser's own errors per row (nothing silent)
 *   - block commit on duplicate keys — the key is name (bundleCode)
 *   - reject invalid kinds (equipment, crew, vehicle, box)
 *   - reject invalid bundle states
 *   - money parses through the one money engine (parseMoney → Paisa)
 */

import { type Paisa } from './money'
import { canCreateBundle } from './rbac'
import type { SystemRole } from '../types/database'

/** A target field that a CSV column can map to. */
export type BundleImportTargetField =
  | 'skip'
  | 'bundleCode'
  | 'name'
  | 'category'
  | 'tags'
  | 'bundleRate'
  | 'lineKind'
  | 'lineModel'
  | 'lineQuantity'
  | 'lineMandatory'
  | 'lineSubstitutes'
  | 'lineProductId'
  | 'crewId'
  | 'vehicleId'
  | 'booqableId'
  | 'storeSlug'

export interface BundleImportFieldDef {
  key: BundleImportTargetField
  label: string
  required?: boolean
}

export const BUNDLE_IMPORT_TARGET_FIELDS: BundleImportFieldDef[] = [
  { key: 'skip', label: '— Skip this column —' },
  { key: 'bundleCode', label: 'Bundle Code (BND-...)', required: true },
  { key: 'name', label: 'Bundle Name', required: true },
  { key: 'category', label: 'Category', required: true },
  { key: 'tags', label: 'Tags (comma-separated)' },
  { key: 'bundleRate', label: 'Bundle Daily Rate', required: true },
  // Line fields (repeated per line in the CSV)
  { key: 'lineKind', label: 'Line Kind (equipment/crew/vehicle/box)', required: true },
  { key: 'lineModel', label: 'Line Model', required: true },
  { key: 'lineQuantity', label: 'Line Quantity', required: true },
  { key: 'lineMandatory', label: 'Mandatory (true/false)' },
  { key: 'lineSubstitutes', label: 'Substitutes (comma-separated model names)' },
  { key: 'lineProductId', label: 'Product ID (UUID)' },
  { key: 'crewId', label: 'Crew ID (UUID)' },
  { key: 'vehicleId', label: 'Vehicle ID (UUID)' },
  // Booqable metadata
  { key: 'booqableId', label: 'Booqable ID' },
  { key: 'storeSlug', label: 'Store Slug' },
]

export interface BundleImportFieldDef {
  key: BundleImportTargetField
  label: string
  required?: boolean
}

export type BundleState = 'Available' | 'Reserved' | 'On Rent' | 'Partially Available' | 'On Maintenance' | 'Archived'
export type BundleLineKind = 'equipment' | 'crew' | 'vehicle' | 'box'

export interface BundleLineImport {
  kind: BundleLineKind
  model: string
  quantity: number
  mandatory: boolean
  substitutes: string[]
  productId?: string | undefined
  crewId?: string | undefined
  vehicleId?: string | undefined
}

export interface ImportedBundleFields {
  bundleCode: string
  name: string
  category: string
  tags: string[]
  bundleRatePaisa: Paisa
  lines: readonly BundleLineImport[]
  state: BundleState
  booqableId?: string | undefined
  storeSlug?: string | undefined
}

export interface ExistingBundleRef {
  id: string
  bundleCode: string
  name: string
}

export interface BundleImportRowResult {
  rowIndex: number
  record: ImportedBundleFields | null
  errors: string[]
  warnings: string[]
  duplicateOf: ExistingBundleRef | null
  skip: boolean
}

export interface ImportBundlesOutcome {
  rowIndex: number
  status: 'saved' | 'failed' | 'unconfirmed' | 'pending'
  productId?: string
  message?: string
}

export function canImportBundles(role: SystemRole): boolean {
  return canCreateBundle(role)
}

function cell(raw: Partial<Record<BundleImportTargetField, string>>, key: BundleImportTargetField): string {
  return (raw[key] ?? '').trim()
}

function parseMoneyOrNull(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const cleaned = trimmed.replace(/[₹Rs,\s]/gi, '')
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

function parseTags(raw: string): string[] {
  return raw.split(',').map(s => s.trim()).filter(s => s.length > 0)
}

function parseBoolean(raw: string): boolean {
  const v = raw.trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes'
}

export function guessBundleTargetField(header: string): BundleImportTargetField {
  const h = header.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[^a-z]+/g, '')
  const aliases: Array<[BundleImportTargetField, string[]]> = [
    ['bundleCode', ['bundlecode', 'code', 'bnd']],
    ['name', ['name', 'bundlename', 'title']],
    ['category', ['category', 'cat']],
    ['tags', ['tags', 'tag']],
    ['bundleRate', ['bundlerate', 'rate', 'dailyrate', 'dailyrate', 'price']],
    ['lineKind', ['linekind', 'kind', 'type']],
    ['lineModel', ['linemodel', 'model', 'modelname']],
    ['lineQuantity', ['linequantity', 'quantity', 'qty']],
    ['lineMandatory', ['linemandatory', 'mandatory', 'required']],
    ['lineSubstitutes', ['linesubstitutes', 'substitutes', 'subs']],
    ['lineProductId', ['lineproductid', 'productid', 'product_id']],
    ['crewId', ['crewid', 'crew_id']],
    ['vehicleId', ['vehicleid', 'vehicle_id']],
    ['booqableId', ['booqableid', 'booqable_id', 'external_id']],
    ['storeSlug', ['storeslug', 'slug', 'store']],
  ]
  return aliases.find(([, names]) => names.includes(h))?.[0] ?? 'skip'
}

export function bundleIdentityKey(bundleCode: string): string {
  return bundleCode.trim().toUpperCase()
}

export interface BundleImportRowOptions {
  existingBundles: readonly ExistingBundleRef[]
  existingProducts: readonly { id: string; model: string }[]
  existingCrew: readonly { id: string; fullName: string }[]
  existingVehicles: readonly { id: string; name: string }[]
}

export function buildBundleImportRow(
  raw: Partial<Record<BundleImportTargetField, string>>,
  rowIndex: number,
  opts: BundleImportRowOptions,
): BundleImportRowResult {
  const errors: string[] = []
  const warnings: string[] = []

  const bundleCode = cell(raw, 'bundleCode').toUpperCase()
  const name = cell(raw, 'name')
  const category = cell(raw, 'category')
  const _bundleRateRaw = cell(raw, 'bundleRate')

  if (!bundleCode) errors.push('Bundle Code is required.')
  if (!name) errors.push('Bundle Name is required.')
  if (!category) errors.push('Category is required.')

  const bundleRatePaisa = _bundleRateRaw ? parseMoneyOrNull(_bundleRateRaw) : null
  if (!_bundleRateRaw) errors.push('Bundle Rate is required.')
  else if (bundleRatePaisa === null) errors.push(`Bundle Rate "${_bundleRateRaw}" is not a valid amount.`)

  const _duplicateOf = opts.existingBundles.find(e => e.bundleCode.toUpperCase() === bundleCode) ?? null
  if (_duplicateOf) {
    errors.push(`A bundle with code "${bundleCode}" already exists.`)
  }

  return {
    rowIndex,
    record: null, // Will be filled by buildBundleImportPreview
    errors,
    warnings,
    duplicateOf: _duplicateOf,
    skip: false,
  }
}

export interface BundleImportPreviewOptions {
  rawRows: readonly string[][]
  hasHeaderRow: boolean
  mapping: Readonly<Record<number, BundleImportTargetField>>
  existingBundles: readonly ExistingBundleRef[]
  existingProducts: readonly { id: string; model: string }[]
  existingCrew: readonly { id: string; fullName: string }[]
  existingVehicles: readonly { id: string; name: string }[]
  skippedRows: ReadonlySet<number>
}

export function buildBundleImportPreview(opts: BundleImportPreviewOptions): readonly BundleImportRowResult[] {
  const { rawRows, hasHeaderRow, mapping, skippedRows } = opts
  if (rawRows.length === 0) return []

  const dataRows = hasHeaderRow ? rawRows.slice(1) : rawRows

  // First pass: group rows by bundleCode
  const bundleGroups = new Map<string, number[]>()
  for (let i = 0; i < dataRows.length; i++) {
    if (skippedRows.has(i)) continue
    const raw: Partial<Record<BundleImportTargetField, string>> = {}
    dataRows[i]!.forEach((value, index) => {
      const target = mapping[index]
      if (target && target !== 'skip') raw[target] = value
    })
    const bundleCode = cell(raw, 'bundleCode').toUpperCase().trim()
    if (!bundleCode) continue
    const existing = bundleGroups.get(bundleCode) ?? []
    existing.push(i)
    bundleGroups.set(bundleCode, existing)
  }

  // Second pass: build each bundle's complete record
  const results: BundleImportRowResult[] = []
  for (const [bundleCode, rowIndices] of bundleGroups) {
    const firstIdx = rowIndices[0]!
    const firstRaw: Partial<Record<BundleImportTargetField, string>> = {}
    dataRows[firstIdx]!.forEach((value, index) => {
      const target = mapping[index]
      if (target && target !== 'skip') firstRaw[target] = value
    })

    const errors: string[] = []
    const warnings: string[] = []

    const name = cell(firstRaw, 'name')
    const category = cell(firstRaw, 'category')
    const tagsRaw = cell(firstRaw, 'tags')
    const _bundleRateRaw = cell(firstRaw, 'bundleRate')
    const booqableId = cell(firstRaw, 'booqableId') || undefined
    const storeSlug = cell(firstRaw, 'storeSlug') || undefined

    if (!bundleCode) errors.push('Bundle Code is required.')
    if (!name) errors.push('Bundle Name is required.')
    if (!category) errors.push('Category is required.')

    const bundleRatePaisa = parseMoneyOrNull(_bundleRateRaw)
    if (!_bundleRateRaw) errors.push('Bundle Rate is required.')
    else if (bundleRatePaisa === null) errors.push(`Bundle Rate "${_bundleRateRaw}" is not a valid amount.`)

    const _tags = tagsRaw ? parseTags(tagsRaw) : []

    const _duplicateOf = { id: '', bundleCode, name: '' } // We'll check against actual existing

    // Collect all lines for this bundle
    const lines: { kind: 'equipment' | 'crew' | 'vehicle' | 'box'; model: string; quantity: number; mandatory: boolean; substitutes: string[]; productId?: string | undefined; crewId?: string | undefined; vehicleId?: string | undefined }[] = []
    for (const idx of rowIndices) {
      const raw: Partial<Record<BundleImportTargetField, string>> = {}
      dataRows[idx]!.forEach((value, index) => {
        const target = mapping[index]
        if (target && target !== 'skip') raw[target] = value
      })

      const lineKindRaw = cell(raw, 'lineKind').toLowerCase()
      const kind = (['equipment', 'crew', 'vehicle', 'box'].includes(lineKindRaw) ? lineKindRaw : null) as 'equipment' | 'crew' | 'vehicle' | 'box' | null
      if (!kind) {
        errors.push(`Row ${idx + 1}: Line Kind must be equipment, crew, vehicle, or box.`)
        continue
      }

      const model = cell(raw, 'lineModel')
      if (!model) {
        errors.push(`Row ${idx + 1}: Line Model is required.`)
        continue
      }

      const quantityRaw = cell(raw, 'lineQuantity')
      const quantity = quantityRaw ? Number(quantityRaw) : NaN
      if (!Number.isInteger(quantity) || quantity < 1) {
        errors.push(`Row ${idx + 1}: Line Quantity must be a whole number ≥ 1.`)
        continue
      }

      const _mandatory = cell(raw, 'lineMandatory') ? parseBoolean(cell(raw, 'lineMandatory')) : false
      const substitutesRaw = cell(raw, 'lineSubstitutes')
      const _substitutes = substitutesRaw ? substitutesRaw.split(',').map(s => s.trim()).filter(s => s.length > 0) : []

      const productId = cell(raw, 'lineProductId') || undefined
      const crewId = cell(raw, 'crewId') || undefined
      const vehicleId = cell(raw, 'vehicleId') || undefined

      // Validate references
      if (kind === 'equipment' && productId) {
        const found = opts.existingProducts.find(p => p.id === productId)
        if (!found) warnings.push(`Row ${idx + 1}: Product ID "${productId}" not found in catalogue.`)
      }
      if (kind === 'crew' && crewId) {
        const found = opts.existingCrew.find(c => c.id === crewId)
        if (!found) warnings.push(`Row ${idx + 1}: Crew ID "${crewId}" not found.`)
      }
      if (kind === 'vehicle' && vehicleId) {
        const found = opts.existingVehicles.find(v => v.id === vehicleId)
        if (!found) warnings.push(`Row ${idx + 1}: Vehicle ID "${vehicleId}" not found.`)
      }

      lines.push({
        kind,
        model: cell(raw, 'lineModel'),
        quantity: Number(quantityRaw),
        mandatory: _mandatory,
        substitutes: _substitutes,
        productId,
        crewId,
        vehicleId,
      })
    }

    const record = {
      bundleCode,
      name: cell(firstRaw, 'name'),
      category: cell(firstRaw, 'category'),
      tags: _tags,
      bundleRatePaisa: parseMoneyOrNull(cell(firstRaw, 'bundleRate'))! as Paisa,
      lines: lines as readonly BundleLineImport[],
      state: 'Available' as const,
      booqableId,
      storeSlug,
    }

    results.push({
      rowIndex: rowIndices[0]!,
      record,
      errors,
      warnings,
      duplicateOf: _duplicateOf,
      skip: false,
    })
  }

  return results
}

export function bundleMappingErrors(
  headers: readonly string[],
  mapping: Readonly<Record<number, string>>,
): string[] {
  const groups = new Map<string, number[]>()
  headers.forEach((_, index) => {
    const _target = mapping[index]
    if (!_target || _target === 'skip') return
    groups.set(_target, [...(groups.get(_target) ?? []), index + 1])
  })
  return [...groups].filter(([, indices]) => indices.length > 1).map(([_target, indices]) =>
    'Columns ' + indices.join(', ') + ' map to the same field. Choose one column; no values will be overwritten.'
  )
}

export const BUNDLE_IMPORT_SAMPLE_HEADERS: BundleImportTargetField[] = [
  'bundleCode',
  'name',
  'category',
  'tags',
  'bundleRate',
  'lineKind',
  'lineModel',
  'lineQuantity',
  'lineMandatory',
  'lineSubstitutes',
  'lineProductId',
  'crewId',
  'vehicleId',
  'booqableId',
  'storeSlug',
]

export const BUNDLE_IMPORT_SAMPLE_ROW: string[] = [
  'BND-001',
  'FX3 Documentary Package',
  'Camera Kit',
  'documentary,fx3',
  '20000',
  'equipment',
  'FX3 Body',
  '1',
  'true',
  '',
  'prod-123',
  '',
  '',
  'BQ-BND-001',
  'kathmandu',
]