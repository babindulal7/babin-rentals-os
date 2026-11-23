/**
 * T7-13 · familyOptionChoices decides which options a shopper may pick between.
 */
import { describe, it, expect } from 'vitest'
import type { CatalogueItem } from '../catalogueApi'
import { familyOptionChoices, type FamilyOptionRow } from '../familyOptions'

const product = (id: string, name: string): CatalogueItem => ({
  id,
  kind: 'product',
  slug: id,
  name,
  category_name: 'Lenses',
  description: '',
  photo_paths: [],
  daily_rate_paisa: 100000,
  weekly_rate_paisa: null,
  monthly_rate_paisa: null,
  bundle_contents: [],
})

const row = (familyId: string, productId: string, optionLabel: string, sortOrder: number): FamilyOptionRow => ({
  familyId,
  familyName: 'Sony FE 24-70mm',
  productId,
  optionLabel,
  sortOrder,
})

const EF = product('p-ef', 'Lens EF')
const PL = product('p-pl', 'Lens PL')
const E = product('p-e', 'Lens E')
const CABLE = product('p-cable', 'BNC cable')

describe('familyOptionChoices', () => {
  it('returns the family options in sort order, with their catalogue items', () => {
    const rows = [row('f1', 'p-pl', 'PL', 2), row('f1', 'p-ef', 'EF', 1)]
    const choices = familyOptionChoices('p-pl', rows, [EF, PL])
    expect(choices.map((c) => c.optionLabel)).toEqual(['EF', 'PL'])
    expect(choices.map((c) => c.item.id)).toEqual(['p-ef', 'p-pl'])
  })

  it('returns nothing for a standalone product', () => {
    const rows = [row('f1', 'p-ef', 'EF', 1), row('f1', 'p-pl', 'PL', 2)]
    expect(familyOptionChoices('p-cable', rows, [EF, PL, CABLE])).toEqual([])
  })

  it('offers only options that are on the catalogue page', () => {
    const rows = [row('f1', 'p-ef', 'EF', 1), row('f1', 'p-pl', 'PL', 2), row('f1', 'p-e', 'E', 3)]
    const choices = familyOptionChoices('p-ef', rows, [EF, E])
    expect(choices.map((c) => c.item.id)).toEqual(['p-ef', 'p-e'])
  })

  it('returns nothing when fewer than two options are on the catalogue page', () => {
    const rows = [row('f1', 'p-ef', 'EF', 1), row('f1', 'p-pl', 'PL', 2)]
    expect(familyOptionChoices('p-ef', rows, [EF])).toEqual([])
  })

  it('never mixes options from another family', () => {
    const rows = [row('f1', 'p-ef', 'EF', 1), row('f1', 'p-pl', 'PL', 2), row('f2', 'p-e', 'E', 1), row('f2', 'p-cable', 'Cable', 2)]
    const choices = familyOptionChoices('p-ef', rows, [EF, PL, E, CABLE])
    expect(choices.map((c) => c.item.id)).toEqual(['p-ef', 'p-pl'])
  })
})
