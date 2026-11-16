import { roundHalfUp, parseMoney, type Paisa } from './money'
import { parseCsv, csvCell } from './csv'
import { productIdentityKey } from './productImport'

/**
 * # What a product itself asks as a security deposit (C6, T3-02)
 *
 * `products.deposit_fixed` and `products.deposit_percent` have been editable on
 * the equipment record since 0004, and nothing ever read them: New Rental's
 * recommended deposit was only "the gear total, never under Rs 5,000". A
 * deposit someone set on a camera body had no effect on the booking.
 *
 * ## The rule (⭐ B-5, the conservative reading — Babin may override)
 *
 * Per unit: a **fixed** deposit wins when it is set; otherwise **percent of the
 * unit's replacement value**; otherwise the product asks for nothing. Per line:
 * unit deposit × quantity (not × days — a deposit is held once). The booking's
 * product deposit is the sum over its physical lines.
 *
 * The recommended deposit is then **the larger of** the existing flat rule and
 * that sum. A product can raise the recommendation; it can never lower it below
 * what the booking asked before this existed. That is the stricter side, and it
 * is reversible with one expression.
 *
 * ## What it is not
 *
 * Not revenue and never part of Rental Total or Outstanding (Law 5) — it feeds
 * only the `recommendedDepositPaisa` input of the pricing pipeline, where the
 * deposit stays its own liability. A staff override (reason + authorising
 * manager) still wins over it, exactly as before.
 *
 * Money-blind sessions read `null` for every figure here (`products_v` masks
 * them), so for them this contributes nothing and the flat rule stands. They
 * never see the deposit in any case (Law 6).
 */

export interface ProductDepositTerms {
  /** `products.deposit_fixed`, whole paisa, or null when unset or masked. */
  fixedPaisa: number | null
  /** `products.deposit_percent`, 0–100, or null when unset or masked. */
  percent: number | null
  /** `products.replacement_value`, whole paisa, or null when unset or masked. */
  replacementPaisa: number | null
}

/** One unit's deposit, in paisa, or null when the product asks for none. */
export function unitDepositPaisa(terms: ProductDepositTerms | undefined): number | null {
  if (!terms) return null
  if (terms.fixedPaisa !== null && Number.isFinite(terms.fixedPaisa) && terms.fixedPaisa > 0) {
    return terms.fixedPaisa
  }
  if (
    terms.percent !== null &&
    terms.replacementPaisa !== null &&
    Number.isFinite(terms.percent) &&
    Number.isFinite(terms.replacementPaisa) &&
    terms.percent > 0 &&
    terms.replacementPaisa > 0
  ) {
    return (terms.replacementPaisa * terms.percent) / 100
  }
  return null
}

export interface DepositLine {
  productId?: string | null | undefined
  qty: number
  lineType?: string | undefined
}

/** Line types that are physical gear and so can carry a product deposit. */
const PHYSICAL = new Set(['Equipment', 'Accessory'])

/** Σ unit deposit × qty over the booking's physical lines, rounded to a whole rupee. */
export function productDepositPaisa(
  lines: readonly DepositLine[],
  terms: ReadonlyMap<string, ProductDepositTerms>,
): Paisa {
  let total = 0
  for (const line of lines) {
    if (!line.productId) continue
    if (line.lineType !== undefined && !PHYSICAL.has(line.lineType)) continue
    if (!Number.isFinite(line.qty) || line.qty <= 0) continue
    const unit = unitDepositPaisa(terms.get(line.productId))
    if (unit !== null) total += unit * line.qty
  }
  return (roundHalfUp(total / 100) * 100) as Paisa
}

/** The recommendation: the flat rule, raised (never lowered) by what the products ask. */
export function recommendedDepositWithProducts(flatRulePaisa: Paisa, fromProductsPaisa: Paisa): Paisa {
  return Math.max(flatRulePaisa, fromProductsPaisa) as Paisa
}

/* ── Deposit Setup (T3-02) ─────────────────────────────────────────────────── */

export type DepositRuleType = 'fixed' | 'percent' | 'none'

export interface ProductDepositRow {
  id: string
  name: string
  brand: string
  model: string | null
  category: string
  dailyRatePaisa: Paisa | null
  replacementValuePaisa: Paisa | null
  depositFixedPaisa: Paisa | null
  depositPercent: number | null
  effectiveDepositPaisa: Paisa | null
  hasDeposit: boolean
}

/** Determine which rule is actively configured for a product. */
export function depositRuleType(row: {
  depositFixedPaisa: Paisa | null
  depositPercent: number | null
}): DepositRuleType {
  if (row.depositFixedPaisa !== null && Number.isFinite(row.depositFixedPaisa) && row.depositFixedPaisa > 0) {
    return 'fixed'
  }
  if (row.depositPercent !== null && Number.isFinite(row.depositPercent) && row.depositPercent > 0) {
    return 'percent'
  }
  return 'none'
}

/** Determine whether a product has a complete and usable deposit rule. */
export function hasDepositRule(row: {
  depositFixedPaisa: Paisa | null
  depositPercent: number | null
  replacementValuePaisa?: Paisa | null
}): boolean {
  if (row.depositFixedPaisa !== null && Number.isFinite(row.depositFixedPaisa) && row.depositFixedPaisa > 0) {
    return true
  }
  if (
    row.depositPercent !== null &&
    Number.isFinite(row.depositPercent) &&
    row.depositPercent > 0 &&
    row.replacementValuePaisa !== null &&
    row.replacementValuePaisa !== undefined &&
    Number.isFinite(row.replacementValuePaisa) &&
    row.replacementValuePaisa > 0
  ) {
    return true
  }
  return false
}

/** Calculate effective unit deposit amount in Paisa, or null if unset. */
export function calculateEffectiveDeposit(row: {
  depositFixedPaisa: Paisa | null
  depositPercent: number | null
  replacementValuePaisa: Paisa | null
}): Paisa | null {
  const unit = unitDepositPaisa({
    fixedPaisa: row.depositFixedPaisa,
    percent: row.depositPercent,
    replacementPaisa: row.replacementValuePaisa,
  })
  return unit !== null ? (roundHalfUp(unit) as Paisa) : null
}

/** Export active products into RFC 4180 CSV for deposit review and bulk editing. */
export function exportDepositSetupCsv(rows: readonly ProductDepositRow[]): string {
  const header = [
    'Product ID',
    'Product Name',
    'Brand',
    'Model',
    'Category',
    'Rule Type',
    'Fixed Deposit (NPR)',
    'Deposit Percent (%)',
    'Replacement Value (NPR)',
    'Effective Unit Deposit (NPR)',
  ]

  const lines = [header.map(csvCell).join(',')]

  for (const r of rows) {
    const rule = depositRuleType(r)
    const fixedRupees = r.depositFixedPaisa !== null ? Math.round(r.depositFixedPaisa / 100) : ''
    const percentStr = r.depositPercent !== null ? String(r.depositPercent) : ''
    const replRupees = r.replacementValuePaisa !== null ? Math.round(r.replacementValuePaisa / 100) : ''
    const effectiveRupees = r.effectiveDepositPaisa !== null ? Math.round(r.effectiveDepositPaisa / 100) : ''

    const line = [
      r.id,
      r.name,
      r.brand,
      r.model ?? '',
      r.category,
      rule,
      fixedRupees,
      percentStr,
      replRupees,
      effectiveRupees,
    ]
    lines.push(line.map(csvCell).join(','))
  }

  return lines.join('\r\n')
}

export interface DepositCsvDryRunEntry {
  rowIndex: number
  productId: string
  productName: string
  brand: string
  model: string | null
  category: string
  oldRule: DepositRuleType
  newRule: DepositRuleType
  oldFixed: Paisa | null
  newFixed: Paisa | null
  oldPercent: number | null
  newPercent: number | null
  oldReplacement: Paisa | null
  newReplacement: Paisa | null
  oldEffective: Paisa | null
  newEffective: Paisa | null
  hasChange: boolean
  error?: string | null
}

export interface DepositCsvDryRunResult {
  entries: DepositCsvDryRunEntry[]
  totalRows: number
  changeCount: number
  unchangedCount: number
  errorCount: number
}

/**
 * Pure CSV dry-run validator for Deposit Setup (T3-02, BQ-407).
 * Parses the CSV and maps rows against existing products before applying changes.
 */
export function parseDepositSetupCsv(
  csvText: string,
  existingProducts: readonly ProductDepositRow[],
): DepositCsvDryRunResult {
  const parsed = parseCsv(csvText)
  if (parsed.errors.length > 0 || parsed.rows.length === 0) {
    return {
      entries: [],
      totalRows: 0,
      changeCount: 0,
      unchangedCount: 0,
      errorCount: parsed.errors.length,
    }
  }

  const header = parsed.rows[0]!.map((h) => h.toLowerCase().trim().replace(/[^a-z0-9]/g, ''))
  const idIdx = header.findIndex((h) => h.includes('id') || h === 'productid')
  const nameIdx = header.findIndex((h) => h.includes('name') || h === 'productname')
  const brandIdx = header.findIndex((h) => h === 'brand')
  const modelIdx = header.findIndex((h) => h === 'model')
  const ruleIdx = header.findIndex((h) => h.includes('ruletype') || h === 'rule' || h === 'type')
  const fixedIdx = header.findIndex((h) => h.includes('fixed') || h === 'depositfixed' || h === 'fixeddeposit')
  const percentIdx = header.findIndex((h) => h.includes('percent') || h === 'depositpercent')
  const replIdx = header.findIndex((h) => h.includes('replacement') || h === 'replacementvalue')

  const byId = new Map<string, ProductDepositRow>()
  const byKey = new Map<string, ProductDepositRow>()
  for (const p of existingProducts) {
    byId.set(p.id.toLowerCase(), p)
    byKey.set(productIdentityKey(p.name, p.brand, p.model), p)
  }

  const entries: DepositCsvDryRunEntry[] = []
  let changeCount = 0
  let unchangedCount = 0
  let errorCount = 0

  for (let i = 1; i < parsed.rows.length; i++) {
    const rawRow = parsed.rows[i]!
    if (rawRow.length === 0 || (rawRow.length === 1 && !rawRow[0]?.trim())) continue

    const idVal = (idIdx >= 0 ? rawRow[idIdx]?.trim() : '') ?? ''
    const nameVal = (nameIdx >= 0 ? rawRow[nameIdx]?.trim() : '') ?? ''
    const brandVal = (brandIdx >= 0 ? rawRow[brandIdx]?.trim() : '') ?? ''
    const modelVal = (modelIdx >= 0 ? rawRow[modelIdx]?.trim() : '') ?? ''

    let target = idVal ? byId.get(idVal.toLowerCase()) : undefined
    if (!target && nameVal && brandVal) {
      target = byKey.get(productIdentityKey(nameVal, brandVal, modelVal))
    }

    if (!target) {
      errorCount++
      entries.push({
        rowIndex: i,
        productId: idVal || 'unknown',
        productName: nameVal || `Row ${i + 1}`,
        brand: brandVal,
        model: modelVal || null,
        category: 'Unknown',
        oldRule: 'none',
        newRule: 'none',
        oldFixed: null,
        newFixed: null,
        oldPercent: null,
        newPercent: null,
        oldReplacement: null,
        newReplacement: null,
        oldEffective: null,
        newEffective: null,
        hasChange: false,
        error: `Product not found in active inventory (ID: "${idVal || '—'}", Name: "${nameVal || '—'}").`,
      })
      continue
    }

    const ruleRaw = (ruleIdx >= 0 ? rawRow[ruleIdx]?.trim().toLowerCase() : '') ?? ''
    const fixedRaw = fixedIdx >= 0 ? rawRow[fixedIdx]?.trim() : ''
    const percentRaw = percentIdx >= 0 ? rawRow[percentIdx]?.trim() : ''
    const replRaw = replIdx >= 0 ? rawRow[replIdx]?.trim() : ''

    let rowError: string | null = null
    let newFixed: Paisa | null = target.depositFixedPaisa
    let newPercent: number | null = target.depositPercent
    let newReplacement: Paisa | null = target.replacementValuePaisa

    // Parse fixed
    if (fixedRaw !== undefined && fixedRaw !== '') {
      const parsedFixed = parseMoney(fixedRaw)
      if (parsedFixed === null) {
        rowError = `Invalid Fixed Deposit amount: "${fixedRaw}".`
      } else if (parsedFixed < 0) {
        rowError = 'Fixed Deposit cannot be negative.'
      } else {
        newFixed = parsedFixed === 0 ? null : parsedFixed
      }
    }

    // Parse percent
    if (!rowError && percentRaw !== undefined && percentRaw !== '') {
      const cleanPct = percentRaw.replace('%', '').trim()
      const n = Number(cleanPct)
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        rowError = `Deposit Percent must be a number between 0 and 100 (got "${percentRaw}").`
      } else {
        newPercent = n === 0 ? null : n
      }
    }

    // Parse replacement value
    if (!rowError && replRaw !== undefined && replRaw !== '') {
      const parsedRepl = parseMoney(replRaw)
      if (parsedRepl === null) {
        rowError = `Invalid Replacement Value: "${replRaw}".`
      } else if (parsedRepl < 0) {
        rowError = 'Replacement Value cannot be negative.'
      } else {
        newReplacement = parsedRepl === 0 ? null : parsedRepl
      }
    }

    // Determine target rule
    let targetRule: DepositRuleType
    if (ruleRaw === 'fixed' || (ruleRaw === '' && newFixed !== null && newFixed > 0)) {
      targetRule = 'fixed'
      newPercent = null // Fixed wins
    } else if (ruleRaw === 'percent' || (ruleRaw === '' && newPercent !== null && newPercent > 0)) {
      targetRule = 'percent'
      newFixed = null
    } else if (ruleRaw === 'none' || ruleRaw === 'clear' || (newFixed === null && newPercent === null)) {
      targetRule = 'none'
      newFixed = null
      newPercent = null
    } else {
      targetRule = depositRuleType({ depositFixedPaisa: newFixed, depositPercent: newPercent })
    }

    const oldEffective = calculateEffectiveDeposit({
      depositFixedPaisa: target.depositFixedPaisa,
      depositPercent: target.depositPercent,
      replacementValuePaisa: target.replacementValuePaisa,
    })

    const newEffective = calculateEffectiveDeposit({
      depositFixedPaisa: newFixed,
      depositPercent: newPercent,
      replacementValuePaisa: newReplacement,
    })

    const hasChange =
      (target.depositFixedPaisa ?? null) !== (newFixed ?? null) ||
      (target.depositPercent ?? null) !== (newPercent ?? null) ||
      (target.replacementValuePaisa ?? null) !== (newReplacement ?? null)

    if (rowError) {
      errorCount++
    } else if (hasChange) {
      changeCount++
    } else {
      unchangedCount++
    }

    entries.push({
      rowIndex: i,
      productId: target.id,
      productName: target.name,
      brand: target.brand,
      model: target.model,
      category: target.category,
      oldRule: depositRuleType(target),
      newRule: targetRule,
      oldFixed: target.depositFixedPaisa,
      newFixed,
      oldPercent: target.depositPercent,
      newPercent,
      oldReplacement: target.replacementValuePaisa,
      newReplacement,
      oldEffective,
      newEffective,
      hasChange,
      ...(rowError ? { error: rowError } : {}),
    })
  }

  return {
    entries,
    totalRows: entries.length,
    changeCount,
    unchangedCount,
    errorCount,
  }
}
