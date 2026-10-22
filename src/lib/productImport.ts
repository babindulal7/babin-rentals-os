/**
 * CSV product (equipment catalogue) validation and mapping — Booqable adoption
 * BQ-407: "catalog import with a mandatory, fully-rendered dry-run".
 *
 * Pages collect input; this engine decides what can be saved. Modeled line for
 * line on `lib/clientImport.ts` (the clients ImportCenter's engine), with the
 * product-specific rules the scrape pins:
 *
 *   - surface the parser's own errors per row (nothing silent);
 *   - **block commit on duplicate keys** — the key is name + brand + model,
 *     both against the existing catalogue and repeated inside the file;
 *   - **reject invalid enums** — Tracking Mode must be exactly one of
 *     Serialised / Quantity / Consumable, and a Category must resolve against
 *     `inventory_categories` before commit, not at it;
 *   - **on-hand counts are excluded from import** — the `quantity` target is
 *     the quantity being *registered* on a new catalogue row
 *     (`products.total_quantity` at creation, the same thing
 *     `createEquipment` writes); a stock-count column has no mapping target
 *     at all, so it cannot silently land as stock;
 *   - money parses through the one money engine (`parseMoney` → Paisa) and
 *     crosses to rupees exactly once, inside `createEquipment`.
 */
import { parseMoney, type Paisa } from './money'
import { canCreateBundle } from './rbac'
import type { SystemRole } from '../types/database'

/** `products.tracking_mode` (0004:95) — the only three the database accepts. */
export type ProductTrackingMode = 'Serialised' | 'Quantity' | 'Consumable'

export type ProductImportTargetField =
  | 'skip'
  | 'name'
  | 'category'
  | 'brand'
  | 'model'
  | 'tracking'
  | 'quantity'
  | 'serials'
  | 'dailyRate'
  | 'description'
  | 'notes'

export interface ProductImportFieldDef {
  key: ProductImportTargetField
  label: string
  required?: boolean
}

export const PRODUCT_IMPORT_TARGET_FIELDS: ProductImportFieldDef[] = [
  { key: 'skip', label: '— Skip this column —' },
  { key: 'name', label: 'Product Name', required: true },
  { key: 'category', label: 'Category', required: true },
  { key: 'brand', label: 'Brand', required: true },
  { key: 'model', label: 'Model' },
  { key: 'tracking', label: 'Tracking Mode', required: true },
  { key: 'quantity', label: 'Quantity (Quantity / Consumable only)' },
  { key: 'serials', label: 'Serial Numbers (Serialised only, separate with , ; or /)' },
  { key: 'dailyRate', label: 'Daily Rate' },
  { key: 'description', label: 'Description' },
  { key: 'notes', label: 'Internal Notes' },
]

/**
 * Who may import products. The write under every row is `createEquipment`
 * (capability `inventory.create` → Owner/Admin/Manager, `rbac.canCreateBundle`),
 * and RULING 2026-10-13's reasoning for clients transfers wholesale: a bulk
 * import is bulk *creation*, so it takes the creation capability — no widening,
 * no new gate, no invented decision.
 */
export function canImportProducts(role: SystemRole): boolean {
  return canCreateBundle(role)
}

export function guessProductTargetField(header: string): ProductImportTargetField {
  const h = header.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[^a-z]+/g, '')
  const aliases: Array<[ProductImportTargetField, string[]]> = [
    ['name', ['name', 'productname', 'itemname', 'item', 'product', 'title']],
    ['category', ['category', 'categoryname', 'productcategory', 'type']],
    ['brand', ['brand', 'make']],
    ['model', ['model', 'modelno', 'modelnumber']],
    ['tracking', ['tracking', 'trackingmode', 'tracktype']],
    ['quantity', ['quantity', 'qty', 'totalquantity', 'pieces', 'units']],
    ['serials', ['serial', 'serials', 'serialno', 'serialnumber', 'serialnumbers', 'serialnos']],
    ['dailyRate', ['dailyrate', 'rate', 'dayrate', 'dailyrent', 'rentperday', 'dailyprice', 'price']],
    ['description', ['description', 'details']],
    ['notes', ['notes', 'internalnotes', 'remarks']],
    // Deliberately NOT guessed: onhand / stock / stockcount (BQ-407 — an
    // on-hand count is never a total_quantity at creation) and purchase/serial
    // metadata that belongs to units, not catalogue rows.
  ]
  return aliases.find(([, names]) => names.includes(h))?.[0] ?? 'skip'
}

/** What a resolved, valid row becomes — the exact createEquipment vocabulary. */
export interface ImportedProductFields {
  name: string
  /** `inventory_categories.name` — createEquipment resolves it to `category_id`. */
  category: string
  brand: string
  model?: string | undefined
  tracking: ProductTrackingMode
  /** Quantity / Consumable only — `products.total_quantity` at creation. */
  quantity?: number | undefined
  /** Serialised only — one serial per unit row. `[]` for Quantity / Consumable. */
  serials: string[]
  /** Paisa, branded by the money engine. Absent, never zero, when the column is blank (Law 6's shape). */
  dailyRatePaisa?: Paisa | undefined
  description?: string | undefined
  notes?: string | undefined
}

/** The catalogue rows a file row may duplicate — fetched before the dry-run. */
export interface ExistingProductRef {
  id: string
  name: string
  brand: string
  model: string | null
}

export interface ProductImportRowResult {
  rowIndex: number
  record: ImportedProductFields | null
  errors: string[]
  warnings: string[]
  duplicateOf: ExistingProductRef | null
  skip: boolean
}

function cell(raw: Partial<Record<ProductImportTargetField, string>>, key: ProductImportTargetField): string {
  return (raw[key] ?? '').trim()
}

/** Case- and space-insensitive — the duplicate key is a business identity, not a string. */
export function productIdentityKey(name: string, brand: string, model?: string | null | undefined): string {
  return `${name.trim().toLowerCase()}|${brand.trim().toLowerCase()}|${(model ?? '').trim().toLowerCase()}`
}

function splitSerials(raw: string): string[] {
  return raw
    .split(/[,;/]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

export interface ProductImportRowOptions {
  /** Active `inventory_categories.name` values — resolution is part of the dry-run, not the commit. */
  categories: readonly string[]
  /** The existing catalogue, for duplicate blocking. */
  existing: readonly ExistingProductRef[]
}

export function buildProductImportRow(
  raw: Partial<Record<ProductImportTargetField, string>>,
  rowIndex: number,
  opts: ProductImportRowOptions,
): ProductImportRowResult {
  const errors: string[] = []
  const warnings: string[] = []

  const name = cell(raw, 'name')
  const brand = cell(raw, 'brand')
  const category = cell(raw, 'category')
  const model = cell(raw, 'model')
  const trackingRaw = cell(raw, 'tracking')
  const quantityRaw = cell(raw, 'quantity')
  const serialsRaw = cell(raw, 'serials')
  const dailyRateRaw = cell(raw, 'dailyRate')

  if (!name) errors.push('Product Name is required.')
  if (!brand) errors.push('Brand is required.')
  if (!category) {
    errors.push('Category is required.')
  } else if (!opts.categories.find((c) => c.toLowerCase() === category.toLowerCase())) {
    // BQ-407: reject at the dry-run, never at the FK.
    errors.push(`Category "${category}" is not recognized. Create it in Inventory first, or fix the spelling.`)
  }

  const tracking = (['Serialised', 'Quantity', 'Consumable'] as const).find(
    (t) => t.toLowerCase() === trackingRaw.toLowerCase(),
  )
  if (!trackingRaw) errors.push('Tracking Mode is required (Serialised, Quantity or Consumable).')
  else if (!tracking) {
    // BQ-407: invalid enums are rejected, not defaulted.
    errors.push(`Tracking Mode "${trackingRaw}" is not recognized. Use Serialised, Quantity or Consumable.`)
  }

  let quantity: number | undefined
  if (quantityRaw) {
    const n = Number(quantityRaw)
    if (!Number.isInteger(n) || n < 1) errors.push(`Quantity "${quantityRaw}" must be a whole number of 1 or more.`)
    else quantity = n
  }
  const serials = splitSerials(serialsRaw)

  if (tracking === 'Serialised') {
    if (serials.length === 0) errors.push('A Serialised product needs at least one serial number.')
    if (quantity !== undefined) errors.push('A Serialised product takes serial numbers, not a quantity — remove the Quantity mapping for this row.')
    const seen = new Map<string, number>()
    for (const s of serials) {
      const key = s.toLowerCase()
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
    for (const [serial, count] of seen) {
      if (count > 1) errors.push(`Serial "${serial}" appears ${count} times in this row. Each serial is one unit.`)
    }
  } else if (tracking === 'Quantity' || tracking === 'Consumable') {
    if (serials.length > 0) errors.push('Only a Serialised product carries serial numbers — remove the Serial Numbers mapping for this row.')
    if (quantity === undefined) errors.push(`A ${tracking} product needs a Quantity of 1 or more.`)
  }

  let dailyRatePaisa: Paisa | undefined
  if (dailyRateRaw) {
    const paisa = parseMoney(dailyRateRaw)
    if (paisa == null) {
      errors.push(`Daily Rate "${dailyRateRaw}" is not a money amount.`)
    } else {
      dailyRatePaisa = paisa
      if (dailyRatePaisa < 0) errors.push('Daily Rate cannot be negative.')
    }
  }

  const duplicateOf =
    name && brand
      ? (opts.existing.find((p) => productIdentityKey(p.name, p.brand, p.model) === productIdentityKey(name, brand, model)) ?? null)
      : null
  if (duplicateOf) {
    errors.push(`A product with this name, brand and model already exists (${duplicateOf.name}). Nothing was saved.`)
  }

  const record: ImportedProductFields | null =
    errors.length === 0 && tracking
      ? {
          name,
          category,
          brand,
          tracking,
          serials: tracking === 'Serialised' ? serials : [],
          ...(model ? { model } : {}),
          ...(tracking !== 'Serialised' && quantity !== undefined ? { quantity } : {}),
          ...(dailyRatePaisa !== undefined ? { dailyRatePaisa } : {}),
          ...(cell(raw, 'description') ? { description: cell(raw, 'description') } : {}),
          ...(cell(raw, 'notes') ? { notes: cell(raw, 'notes') } : {}),
        }
      : null

  return { rowIndex, record, errors, warnings, duplicateOf, skip: false }
}

/** Multiple columns cannot overwrite one target — same rule, same words, as the clients mapper. */
export function productMappingErrors(
  headers: readonly string[],
  mapping: Readonly<Record<number, ProductImportTargetField>>,
): string[] {
  const groups = new Map<ProductImportTargetField, number[]>()
  headers.forEach((_, index) => {
    const target = mapping[index]
    if (!target || target === 'skip') return
    groups.set(target, [...(groups.get(target) ?? []), index + 1])
  })
  return [...groups]
    .filter(([, indices]) => indices.length > 1)
    .map(
      ([target, indices]) =>
        'Columns ' +
        indices.join(', ') +
        ' map to ' +
        (PRODUCT_IMPORT_TARGET_FIELDS.find((f) => f.key === target)?.label ?? target) +
        '. Choose one column; no values will be overwritten.',
    )
}

/**
 * The mandatory dry-run itself: every row built and judged, in-file duplicate
 * groups marked together, skipped rows still shown but excluded from commit.
 */
export function buildProductImportPreview(
  dataRows: readonly string[][],
  mapping: Readonly<Record<number, ProductImportTargetField>>,
  opts: ProductImportRowOptions,
  skipped: ReadonlySet<number>,
): ProductImportRowResult[] {
  const rows = dataRows.map((row, rowIndex) => {
    const raw: Partial<Record<ProductImportTargetField, string>> = {}
    row.forEach((value, index) => {
      const target = mapping[index]
      if (target && target !== 'skip') raw[target] = value
    })
    return { ...buildProductImportRow(raw, rowIndex, opts), skip: skipped.has(rowIndex) }
  })

  const groups = new Map<string, ProductImportRowResult[]>()
  for (const row of rows) {
    if (row.skip || !row.record) continue
    const key = productIdentityKey(row.record.name, row.record.brand, row.record.model)
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  for (const matches of groups.values()) {
    if (matches.length < 2) continue
    const message =
      'Repeated product (same name, brand and model) in rows ' +
      matches.map((r) => r.rowIndex + 1).join(', ') +
      '. Include only one of these rows.'
    for (const row of matches) row.errors.push(message)
  }
  return rows
}

/**
 * The action's `validate` half: the structural rules that need no server
 * context (requireds, the tracking enum, quantity/serial shapes, money).
 * Category existence and catalogue duplicates are checked against live data —
 * at the dry-run by the screen, and again at commit by the action's execute.
 */
export function validateImportedProduct(fields: ImportedProductFields): string[] {
  const errors: string[] = []
  if (!fields.name.trim()) errors.push('Product Name is required.')
  if (!fields.brand.trim()) errors.push('Brand is required.')
  if (!fields.category.trim()) errors.push('Category is required.')
  if (fields.tracking === 'Serialised') {
    if (fields.serials.length === 0) errors.push('A Serialised product needs at least one serial number.')
    const seen = new Set<string>()
    for (const s of fields.serials) {
      const key = s.trim().toLowerCase()
      if (seen.has(key)) errors.push(`Serial "${s}" is entered twice on this row.`)
      seen.add(key)
    }
  } else {
    const qty = fields.quantity ?? 0
    if (!Number.isInteger(qty) || qty < 1) errors.push(`A ${fields.tracking} product needs a whole quantity of 1 or more.`)
  }
  if (fields.dailyRatePaisa !== undefined && fields.dailyRatePaisa < 0) errors.push('Daily Rate cannot be negative.')
  return errors
}

/** The one-line sample file offered on the screen — every required column, no more. */
export const PRODUCT_IMPORT_SAMPLE_HEADERS = [
  'Product Name',
  'Category',
  'Brand',
  'Model',
  'Tracking Mode',
  'Quantity',
  'Serial Numbers',
  'Daily Rate',
  'Description',
  'Internal Notes',
] as const

export const PRODUCT_IMPORT_SAMPLE_ROW = [
  'Sony FX3 Cinema Camera',
  'Cameras',
  'Sony',
  'FX3',
  'Serialised',
  '',
  'SN-FX3-001; SN-FX3-002',
  '3500',
  'Full-frame cinema camera with 28-70mm kit lens',
  'Serial 002 has a small scratch on the LCD cover',
] as const
