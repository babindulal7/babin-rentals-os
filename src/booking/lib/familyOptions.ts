/**
 * src/booking/lib/familyOptions.ts
 *
 * T7-13 · Products with options on one page. Pure helpers that decide which options a
 * shopper may choose between for a product. Each option is its own catalogue product with
 * its own stock and rate, so choosing one adds that product, and nothing else, to the request.
 */

import type { CatalogueItem } from './catalogueApi'

export interface FamilyOptionRow {
  readonly familyId: string
  readonly familyName: string
  readonly productId: string
  readonly optionLabel: string
  readonly sortOrder: number
}

export interface FamilyOptionChoice {
  readonly item: CatalogueItem
  readonly optionLabel: string
}

/** A family is only shown as a picker when a shopper has at least two options to choose between. */
export const MIN_FAMILY_OPTIONS = 2

/**
 * The options a shopper can pick between for the selected product, in display order.
 * Empty when the product is standalone, or when fewer than two of its options are on the
 * catalogue page (an option that is not publicly sold is never offered).
 */
export function familyOptionChoices(
  selectedProductId: string,
  rows: readonly FamilyOptionRow[],
  items: readonly CatalogueItem[],
): FamilyOptionChoice[] {
  const selected = rows.find((row) => row.productId === selectedProductId)
  if (!selected) return []

  const itemsById = new Map(items.map((item) => [item.id, item] as const))
  const choices = rows
    .filter((row) => row.familyId === selected.familyId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.optionLabel.localeCompare(b.optionLabel))
    .flatMap((row) => {
      const item = itemsById.get(row.productId)
      return item ? [{ item, optionLabel: row.optionLabel }] : []
    })

  return choices.length >= MIN_FAMILY_OPTIONS ? choices : []
}
