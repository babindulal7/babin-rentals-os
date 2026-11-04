import { supabase } from '../supabase'
import { captureError } from '../monitoring'
import type { ProductDepositTerms } from '../productDeposit'
import type { DepositSetupRow } from '../depositSetup'

/**
 * Deposit terms for the products on a booking (C6, see `lib/productDeposit.ts`).
 *
 * Reads `products_v`, never `products`: `deposit_percent`, `deposit_fixed` and
 * `replacement_value` are money columns and the view masks them to `null` for a
 * money-blind session (Law 6). That `null` means "this session may not see it",
 * never "free" — `unitDepositPaisa` turns it into "asks for nothing", which
 * leaves the existing flat deposit rule standing.
 *
 * A failed read throws to the caller. Swallowing it here would silently weaken a
 * deposit to the flat rule with no one told; the caller decides how to say so.
 */

type Row = {
  id: string
  replacement_value: number | string | null
  deposit_percent: number | string | null
  deposit_fixed: number | string | null
}

const toPaisa = (v: number | string | null): number | null => {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

const toNumber = (v: number | string | null): number | null => {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export async function fetchProductDepositTerms(
  productIds: readonly string[],
): Promise<Map<string, ProductDepositTerms>> {
  const ids = [...new Set(productIds.filter(Boolean))]
  const out = new Map<string, ProductDepositTerms>()
  if (ids.length === 0) return out

  const { data, error } = await supabase
    .from('products_v')
    .select('id, replacement_value, deposit_percent, deposit_fixed')
    .in('id', ids)

  if (error) {
    captureError(new Error(`product deposit read failed: ${error.message}`), { where: 'productDeposits.fetch' })
    throw new Error(error.message)
  }

  for (const row of (data ?? []) as unknown as Row[]) {
    out.set(row.id, {
      fixedPaisa: toPaisa(row.deposit_fixed),
      percent: toNumber(row.deposit_percent),
      replacementPaisa: toPaisa(row.replacement_value),
    })
  }
  return out
}

/** The Deposit setup tab's list: every active product, in name order. */
type SetupRow = Row & {
  id: string | null
  asset_code: string | null
  name: string | null
  brand: string | null
  model: string | null
}

/**
 * Reads every active product for the T3-02 bulk editor.
 *
 * `products_v` masks the three money columns for a money-blind session, but the
 * screen refuses those roles before this is called — the nulls here are
 * "nobody has set one", not "you may not see it". A money-blind caller would
 * see a full list of unset deposits, which is why the action and the tab are
 * gated instead of relying on the mask.
 *
 * Throws on a failed read: an empty list would read as "no products to
 * configure", which would make the progress counter lie.
 */
export async function fetchDepositSetupRows(): Promise<DepositSetupRow[]> {
  const { data, error } = await supabase
    .from('products_v')
    .select('id, asset_code, name, brand, model, deposit_fixed, deposit_percent, replacement_value')
    .eq('is_active', true)
    .order('name')
    .order('asset_code')

  if (error) {
    captureError(new Error(`deposit setup read failed: ${error.message}`), { where: 'productDeposits.fetchSetup' })
    throw new Error(error.message)
  }

  const rows: DepositSetupRow[] = []
  for (const raw of (data ?? []) as unknown as SetupRow[]) {
    if (raw.id === null) continue
    rows.push({
      id: raw.id,
      assetCode: raw.asset_code,
      name: raw.name ?? raw.asset_code ?? 'Unnamed product',
      brand: raw.brand,
      model: raw.model,
      fixedPaisa: toPaisa(raw.deposit_fixed),
      percent: toNumber(raw.deposit_percent),
      replacementPaisa: toPaisa(raw.replacement_value),
    })
  }
  return rows
}
