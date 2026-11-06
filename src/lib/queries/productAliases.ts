import { supabase } from '../supabase'
import { captureError } from '../monitoring'

/**
 * The spellings staff taught the paste-list matcher (T3-12, migration 0223).
 *
 * The matcher in `lib/gearListParser.ts` compares a pasted line against a candidate's
 * `name`, `haystack` and `aliases`. This reads the third of those, keyed by product, so
 * the panel can hand each candidate the words it has learned.
 *
 * **Rows come back already normalised.** `alias_normalised` is the column the matcher
 * compares against, and it is stored as `normaliseGearText()` produced it — that contract
 * is asserted in `lib/__tests__/gearListParser.test.ts`. Re-normalising here would hide a
 * drift between the two implementations rather than expose it, so this does not.
 *
 * **A failed read is not fatal, and that is deliberate.** Unlike deposit terms — where a
 * swallowed error would quietly weaken a money rule — aliases are a teaching aid: with an
 * empty map the matcher still works on names and asset codes, staff simply correct more
 * lines by hand. So the failure is reported to monitoring and the feature carries on,
 * rather than taking the New Rental screen down with it. A silent `catch` would be the
 * defect here, not the fallback.
 */

type Row = {
  product_id: string
  alias_normalised: string
}

/** Active aliases by product id. Empty when the read fails — the matcher copes. */
export async function fetchProductAliases(): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()

  const { data, error } = await supabase
    .from('product_aliases')
    .select('product_id, alias_normalised')
    .eq('is_active', true)

  if (error) {
    captureError(new Error(`product alias read failed: ${error.message}`), {
      where: 'productAliases.fetch',
    })
    return out
  }

  for (const row of (data ?? []) as unknown as Row[]) {
    if (!row.product_id || !row.alias_normalised) continue
    const list = out.get(row.product_id)
    if (list) list.push(row.alias_normalised)
    else out.set(row.product_id, [row.alias_normalised])
  }

  return out
}

/** The aliases for the products on this read, in the shape the matcher wants. */
export function aliasesFor(
  aliases: ReadonlyMap<string, readonly string[]>,
  productId: string,
): readonly string[] {
  return aliases.get(productId) ?? []
}
