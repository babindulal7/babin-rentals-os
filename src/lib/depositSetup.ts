import { csvCell, parseCsv } from './csv'
import { formatMoney, parseMoney, roundHalfUp, type Paisa } from './money'
import { productIdentityKey } from './productImport'
import { unitDepositPaisa } from './productDeposit'
import type { RecordValues } from './recordEditor'

/**
 * # Deposit setup — the bulk editor's rules (T3-02)
 *
 * D11 says Booqable's global default was "no deposit", so every imported product
 * arrives with `deposit_fixed` and `deposit_percent` empty. Staff have to fill
 * all of them before the trial, and the card asks for three things this engine
 * owns so the screen can only present:
 *
 *   1. **one definition of "set"** — a product is configured when either
 *      `deposit_fixed` or `deposit_percent` is non-null. Blank means "nobody has
 *      decided yet"; `0` means "deliberately no deposit" and counts as decided.
 *      That distinction is the whole reason the counter exists: a zero and a
 *      blank both look like "no money", and only one of them is finished work.
 *   2. **the effective deposit, read through `productDeposit.unitDepositPaisa`**
 *      — the booking engine's own rule (fixed wins, else percent of replacement,
 *      else nothing). This screen must never invent a second interpretation of
 *      the two columns it is feeding.
 *   3. **a CSV round trip whose dry run is the same computation as the apply**
 *      — matching by `asset_code` first, then name + brand + model, and never
 *      clearing a column the file did not carry. A blank cell in a present
 *      column is an instruction to clear; an absent column is not.
 *
 * Amounts are integer paisa here. `products.deposit_fixed` and
 * `replacement_value` are `numeric(14,2)` rupees, so the action converts once
 * with `toRupees` at the database boundary, exactly as `recordPayload` does.
 * `deposit_percent` is a percentage and stays a plain number.
 *
 * Law 5: none of these figures is revenue. They feed the booking's recommended
 * deposit, which is a liability the product never adds to Rental Total or
 * Outstanding.
 */

export const DEPOSIT_VALUE_FIELDS = ['deposit_fixed', 'deposit_percent', 'replacement_value'] as const
export type DepositValueField = (typeof DEPOSIT_VALUE_FIELDS)[number]

export const DEPOSIT_FIELD_LABELS: Readonly<Record<DepositValueField, string>> = {
  deposit_fixed: 'Fixed deposit',
  deposit_percent: 'Deposit percent',
  replacement_value: 'Replacement value',
}

export interface DepositSetupRow {
  id: string
  assetCode: string | null
  name: string
  brand: string | null
  model: string | null
  /** `products.deposit_fixed` in paisa, or null when nobody has set one. */
  fixedPaisa: number | null
  /** `products.deposit_percent`, 0-100, or null when unset. */
  percent: number | null
  /** `products.replacement_value` in paisa, or null when unset. */
  replacementPaisa: number | null
}

/** The three inputs as typed. Text, because a blank is not the same as a zero. */
export interface DepositDraft {
  fixed: string
  percent: string
  replacement: string
}

export interface DepositDraftValues {
  fixedPaisa: number | null
  percent: number | null
  replacementPaisa: number | null
}

export interface DepositDraftErrors {
  fixed?: string
  percent?: string
  replacement?: string
}

export interface DepositDraftParse {
  ok: boolean
  errors: DepositDraftErrors
  warnings: string[]
  values: DepositDraftValues
}

const FACTOR = 100

/** Rupees in the database to integer paisa, without a float in the amount. */
function rupeesToPaisa(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.round(n * FACTOR)
}

/** Paisa to a plain rupee string for an input or a CSV cell. No grouping, no "Rs". */
export function paisaToRupeeText(paisa: number | null): string {
  if (paisa === null || !Number.isFinite(paisa)) return ''
  const whole = Math.trunc(paisa / FACTOR)
  const paise = Math.abs(paisa) % FACTOR
  return paise === 0 ? String(whole) : `${whole}.${String(paise).padStart(2, '0')}`
}

export function depositDraftFromRow(row: DepositSetupRow): DepositDraft {
  return {
    fixed: paisaToRupeeText(row.fixedPaisa),
    percent: row.percent === null ? '' : String(row.percent),
    replacement: paisaToRupeeText(row.replacementPaisa),
  }
}

export function emptyDepositDraft(): DepositDraft {
  return { fixed: '', percent: '', replacement: '' }
}

export function depositDraftValuesFromRecord(values: RecordValues): DepositDraftValues {
  const percent = (() => {
    const raw = values.deposit_percent
    if (raw === null || raw === undefined || raw === '') return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  })()
  return {
    fixedPaisa: rupeesToPaisa(values.deposit_fixed),
    percent,
    replacementPaisa: rupeesToPaisa(values.replacement_value),
  }
}

/** A blank money input means "not set"; "0" means a deliberate zero. */
function parseMoneyCell(raw: string): { ok: true; paisa: number | null } | { ok: false } {
  const trimmed = raw.trim()
  if (trimmed === '') return { ok: true, paisa: null }
  const paisa = parseMoney(trimmed)
  if (paisa === null || paisa < 0) return { ok: false }
  return { ok: true, paisa }
}

/** Percentages stay numeric (money.ts §2.3), with the column's two decimals. */
function parsePercentCell(raw: string): { ok: true; percent: number | null } | { ok: false } {
  const trimmed = raw.trim().replace(/%$/, '').trim()
  if (trimmed === '') return { ok: true, percent: null }
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return { ok: false }
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < 0 || n > 100) return { ok: false }
  return { ok: true, percent: n }
}

export function parseDepositDraft(draft: DepositDraft): DepositDraftParse {
  const errors: DepositDraftErrors = {}
  const warnings: string[] = []

  const fixed = parseMoneyCell(draft.fixed)
  if (!fixed.ok) errors.fixed = 'Enter a rupee amount, for example 15,000.'

  const replacement = parseMoneyCell(draft.replacement)
  if (!replacement.ok) errors.replacement = 'Enter a rupee amount, for example 4,20,000.'

  const percent = parsePercentCell(draft.percent)
  if (!percent.ok) errors.percent = 'Enter a percentage from 0 to 100, with up to two decimals.'

  const values: DepositDraftValues = {
    fixedPaisa: fixed.ok ? fixed.paisa : null,
    percent: percent.ok ? percent.percent : null,
    replacementPaisa: replacement.ok ? replacement.paisa : null,
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors, warnings, values }
  }

  if (values.fixedPaisa !== null && values.fixedPaisa > 0 && values.percent !== null && values.percent > 0) {
    warnings.push('A fixed deposit above zero wins; the percentage is ignored while it is set.')
  }
  if (values.percent !== null && values.percent > 0 && (values.replacementPaisa === null || values.replacementPaisa === 0)) {
    warnings.push('A percentage with no replacement value asks for no deposit. Set the replacement value too.')
  }
  if (values.fixedPaisa === 0 && values.percent === null) {
    warnings.push('A fixed deposit of zero means this product deliberately asks for no deposit.')
  }

  return { ok: true, errors, warnings, values }
}

/** What the booking engine will hold per unit, rounded to a whole rupee for display. */
export function effectiveUnitDepositPaisa(
  row: Pick<DepositSetupRow, 'fixedPaisa' | 'percent' | 'replacementPaisa'>,
): Paisa | null {
  const unit = unitDepositPaisa({
    fixedPaisa: row.fixedPaisa,
    percent: row.percent,
    replacementPaisa: row.replacementPaisa,
  })
  if (unit === null) return null
  return (roundHalfUp(unit / FACTOR) * FACTOR) as Paisa
}

/** Which deposit rule is actually in force. Mirrors `unitDepositPaisa` exactly. */
export function depositBasis(row: Pick<DepositSetupRow, 'fixedPaisa' | 'percent' | 'replacementPaisa'>): 'fixed' | 'percent' | 'none' {
  if (row.fixedPaisa !== null && Number.isFinite(row.fixedPaisa) && row.fixedPaisa > 0) return 'fixed'
  if (
    row.percent !== null &&
    row.replacementPaisa !== null &&
    Number.isFinite(row.percent) &&
    Number.isFinite(row.replacementPaisa) &&
    row.percent > 0 &&
    row.replacementPaisa > 0
  ) {
    return 'percent'
  }
  return 'none'
}

/** Decided vs. blank: zero is a decision, empty is unfinished work. */
export function isDepositConfigured(row: Pick<DepositSetupRow, 'fixedPaisa' | 'percent'>): boolean {
  return row.fixedPaisa !== null || row.percent !== null
}

/**
 * The one warning worth surfacing on a list row: a percentage that names a
 * replacement value which is missing. It is not an error — the product is
 * "configured" — but it asks the client for nothing, so the counter alone would
 * overstate readiness.
 */
export function depositRowWarning(row: Pick<DepositSetupRow, 'fixedPaisa' | 'percent' | 'replacementPaisa'>): string | null {
  if (row.percent !== null && row.percent > 0 && (row.replacementPaisa === null || row.replacementPaisa === 0)) {
    return 'Percentage set, but the replacement value is missing, so this asks for no deposit.'
  }
  return null
}

export interface DepositProgress {
  total: number
  configured: number
  unset: number
  /** Whole percent, 0-100. Zero products reads as 0, not NaN. */
  percentComplete: number
}

export function depositSetupProgress(rows: readonly DepositSetupRow[]): DepositProgress {
  const total = rows.length
  const configured = rows.reduce((sum, row) => sum + (isDepositConfigured(row) ? 1 : 0), 0)
  return {
    total,
    configured,
    unset: total - configured,
    percentComplete: total === 0 ? 0 : Math.round((configured / total) * 100),
  }
}

export interface DepositFilter {
  search?: string
  onlyUnset?: boolean
}

/** Search plus the card's "no deposit set" filter. Order is the caller's. */
export function filterDepositRows(rows: readonly DepositSetupRow[], filter: DepositFilter = {}): DepositSetupRow[] {
  const needle = (filter.search ?? '').trim().toLowerCase()
  return rows.filter((row) => {
    if (filter.onlyUnset === true && isDepositConfigured(row)) return false
    if (needle === '') return true
    return [row.name, row.assetCode ?? '', row.brand ?? '', row.model ?? '']
      .join(' ')
      .toLowerCase()
      .includes(needle)
  })
}

/** Fields whose parsed draft value differs from what the row currently holds. */
export function changedDepositFields(
  current: DepositDraftValues,
  next: DepositDraftValues,
): DepositValueField[] {
  const changed: DepositValueField[] = []
  if (current.fixedPaisa !== next.fixedPaisa) changed.push('deposit_fixed')
  if (current.percent !== next.percent) changed.push('deposit_percent')
  if (current.replacementPaisa !== next.replacementPaisa) changed.push('replacement_value')
  return changed
}

export function depositDraftIsDirty(row: DepositSetupRow, draft: DepositDraft): boolean {
  const parsed = parseDepositDraft(draft)
  if (!parsed.ok) return true
  return changedDepositFields(
    { fixedPaisa: row.fixedPaisa, percent: row.percent, replacementPaisa: row.replacementPaisa },
    parsed.values,
  ).length > 0
}

/* ── CSV round trip ───────────────────────────────────────────────────────── */

export const DEPOSIT_CSV_HEADERS = [
  'asset_code',
  'name',
  'brand',
  'model',
  'deposit_fixed',
  'deposit_percent',
  'replacement_value',
] as const

export function buildDepositSetupCsv(rows: readonly DepositSetupRow[]): string {
  const lines = [DEPOSIT_CSV_HEADERS.map(csvCell).join(',')]
  for (const row of rows) {
    lines.push(
      [
        row.assetCode ?? '',
        row.name,
        row.brand ?? '',
        row.model ?? '',
        paisaToRupeeText(row.fixedPaisa),
        row.percent === null ? '' : String(row.percent),
        paisaToRupeeText(row.replacementPaisa),
      ]
        .map(csvCell)
        .join(','),
    )
  }
  return `${lines.join('\r\n')}\r\n`
}

export interface DepositCsvFieldChange {
  field: DepositValueField
  from: number | null
  to: number | null
}

export interface DepositCsvProductChange {
  productId: string
  productName: string
  assetCode: string | null
  /** 1-based, counting the header as row 1. */
  rowNumber: number
  changes: DepositCsvFieldChange[]
  newValues: DepositDraftValues
}

export interface DepositCsvSkippedRow {
  rowNumber: number
  reason: string
}

export interface DepositCsvPreview {
  ok: boolean
  fileErrors: string[]
  rowErrors: string[]
  changes: DepositCsvProductChange[]
  unchanged: number
  dataRows: number
}

const HEADER_ALIASES: Readonly<Record<string, (typeof DEPOSIT_CSV_HEADERS)[number]>> = {
  asset_code: 'asset_code',
  assetcode: 'asset_code',
  code: 'asset_code',
  name: 'name',
  product: 'name',
  brand: 'brand',
  model: 'model',
  deposit_fixed: 'deposit_fixed',
  fixed_deposit: 'deposit_fixed',
  deposit_percent: 'deposit_percent',
  deposit_percentage: 'deposit_percent',
  replacement_value: 'replacement_value',
  replacement: 'replacement_value',
}

const EMPTY_MATCH = { ok: false as const, reason: 'No active product matches this row.' }
type RowMatch = { ok: true; row: DepositSetupRow } | typeof EMPTY_MATCH

function normaliseHeader(cell: string): string {
  return cell.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/\s+/g, '_')
}

function rowValueFor(field: DepositValueField, values: DepositDraftValues): number | null {
  if (field === 'deposit_percent') return values.percent
  return field === 'deposit_fixed' ? values.fixedPaisa : values.replacementPaisa
}

function matchAssetCode(code: string, rows: readonly DepositSetupRow[]): DepositSetupRow | null {
  const needle = code.trim().toLowerCase()
  if (needle === '') return null
  return rows.find((row) => (row.assetCode ?? '').trim().toLowerCase() === needle) ?? null
}

function matchIdentity(
  name: string,
  brand: string,
  model: string,
  rows: readonly DepositSetupRow[],
): { row: DepositSetupRow } | { ambiguous: true } | null {
  const key = productIdentityKey(name, brand, model)
  const matches = rows.filter((row) => productIdentityKey(row.name, row.brand ?? '', row.model) === key)
  if (matches.length === 1) return { row: matches[0]! }
  if (matches.length > 1) return { ambiguous: true }
  return null
}

/**
 * Reads a deposit CSV and computes exactly what an apply would change.
 *
 * Columns absent from the file preserve today's values; a *present* column with
 * a blank cell clears that value to "not set". The dry run is refused as a whole
 * when the parser failed, a row does not resolve to one product, a value is
 * invalid, or the same product appears twice — the operator fixes the file, not
 * a half-applied catalogue.
 */
export function previewDepositSetupCsv(text: string, rows: readonly DepositSetupRow[]): DepositCsvPreview {
  const parsed = parseCsv(text)
  const fileErrors = [...parsed.errors]
  const rowErrors: string[] = []
  const changes: DepositCsvProductChange[] = []
  let unchanged = 0

  if (parsed.rows.length === 0) {
    return {
      ok: false,
      fileErrors: [...fileErrors, 'The file is empty.'],
      rowErrors,
      changes,
      unchanged,
      dataRows: 0,
    }
  }

  const header = parsed.rows[0]!.map(normaliseHeader)
  const index = new Map<string, number>()
  for (let i = 0; i < header.length; i++) {
    const canonical = HEADER_ALIASES[header[i]!]
    if (canonical === undefined) continue
    if (index.has(canonical)) {
      fileErrors.push(`The ${canonical} column appears more than once.`)
      continue
    }
    index.set(canonical, i)
  }

  if (!index.has('asset_code') && !index.has('name')) {
    fileErrors.push('The file needs an asset_code column or a name column so each row can be matched to a product.')
  }
  if (!DEPOSIT_VALUE_FIELDS.some((field) => index.has(field))) {
    fileErrors.push('The file has no deposit_fixed, deposit_percent or replacement_value column, so there is nothing to apply.')
  }

  const dataRows = parsed.rows.length - 1
  if (fileErrors.length > 0) {
    return { ok: false, fileErrors, rowErrors, changes, unchanged, dataRows }
  }

  const seen = new Map<string, number>()

  for (let i = 1; i < parsed.rows.length; i++) {
    const cells = parsed.rows[i]!
    const rowNumber = i + 1
    const cell = (field: (typeof DEPOSIT_CSV_HEADERS)[number]): string | null => {
      const at = index.get(field)
      return at === undefined ? null : (cells[at] ?? '')
    }

    const assetCode = cell('asset_code')
    const name = cell('name')
    const brand = cell('brand')
    const model = cell('model')

    let match: RowMatch = EMPTY_MATCH
    const byCode = assetCode === null ? null : matchAssetCode(assetCode, rows)
    if (byCode) {
      match = { ok: true, row: byCode }
    } else if (name !== null && name.trim() !== '') {
      const byIdentity = matchIdentity(name, brand ?? '', model ?? '', rows)
      if (byIdentity && 'row' in byIdentity) match = { ok: true, row: byIdentity.row }
      else if (byIdentity && 'ambiguous' in byIdentity) {
        rowErrors.push(
          `Row ${rowNumber}: more than one active product matches ${name.trim()} (${brand ?? ''} ${model ?? ''}). ` +
            'Add the asset_code column so the row can be identified.',
        )
        continue
      }
    }

    if (!match.ok) {
      rowErrors.push(
        `Row ${rowNumber}${assetCode ? ` (${assetCode})` : ''}: ${match.reason} ` +
          'Nothing has been applied.',
      )
      continue
    }

    const row = match.row
    const priorRow = seen.get(row.id)
    if (priorRow !== undefined) {
      rowErrors.push(`Row ${rowNumber}: ${row.name} already appears on row ${priorRow}.`)
      continue
    }
    seen.set(row.id, rowNumber)

    const draft: DepositDraft = {
      fixed: cell('deposit_fixed') ?? paisaToRupeeText(row.fixedPaisa),
      percent: cell('deposit_percent') ?? (row.percent === null ? '' : String(row.percent)),
      replacement: cell('replacement_value') ?? paisaToRupeeText(row.replacementPaisa),
    }
    const values = parseDepositDraft(draft)
    if (!values.ok) {
      const detail = Object.values(values.errors).filter(Boolean).join(' ')
      rowErrors.push(`Row ${rowNumber} (${row.name}): ${detail}`)
      continue
    }

    const before: DepositDraftValues = {
      fixedPaisa: row.fixedPaisa,
      percent: row.percent,
      replacementPaisa: row.replacementPaisa,
    }
    const changedFields = changedDepositFields(before, values.values)
    if (changedFields.length === 0) {
      unchanged++
      continue
    }

    changes.push({
      productId: row.id,
      productName: row.name,
      assetCode: row.assetCode,
      rowNumber,
      changes: changedFields.map((field) => ({
        field,
        from: rowValueFor(field, before),
        to: rowValueFor(field, values.values),
      })),
      newValues: values.values,
    })
  }

  if (dataRows === 0) {
    fileErrors.push('The file has a header but no data rows.')
  }

  return {
    ok: fileErrors.length === 0 && rowErrors.length === 0,
    fileErrors,
    rowErrors,
    changes,
    unchanged,
    dataRows,
  }
}

/** One sentence per changed cell, for the dry-run list. */
export function describeDepositChange(change: DepositCsvFieldChange): string {
  const render = (value: number | null): string =>
    value === null ? 'not set' : change.field === 'deposit_percent' ? `${value}%` : formatMoney(value as Paisa)
  return `${DEPOSIT_FIELD_LABELS[change.field]}: ${render(change.from)} to ${render(change.to)}`
}
