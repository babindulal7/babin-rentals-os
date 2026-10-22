import { describe, expect, it } from 'vitest'
import {
  buildProductImportPreview,
  buildProductImportRow,
  canImportProducts,
  guessProductTargetField,
  productMappingErrors,
  productIdentityKey,
  PRODUCT_IMPORT_SAMPLE_HEADERS,
  PRODUCT_IMPORT_SAMPLE_ROW,
  type ProductImportTargetField,
} from '../productImport'
import type { SystemRole } from '../../types/database'

const CATEGORIES = ['Cameras', 'Lenses', 'Lighting', 'Audio', 'Support', 'Power', 'Accessories']
const EXISTING = [
  { id: 'p-1', name: 'Sony FX3 Cinema Camera', brand: 'Sony', model: 'FX3' },
  { id: 'p-2', name: 'Aputure 600d Pro', brand: 'Aputure', model: null },
]
const OPTS = { categories: CATEGORIES, existing: EXISTING }

const row = (extra: Partial<Record<ProductImportTargetField, string>> = {}) => ({
  name: 'Rode NTG5 Shotgun Mic',
  category: 'Audio',
  brand: 'Rode',
  tracking: 'Quantity',
  quantity: '3',
  ...extra,
})

describe('product CSV import validation (BQ-407)', () => {
  it('the sample row is valid and produces a createEquipment-shaped record', () => {
    const opts = { categories: CATEGORIES, existing: [] }
    const mapping = Object.fromEntries(
      PRODUCT_IMPORT_SAMPLE_HEADERS.map((field, index) => [index, guessProductTargetField(field)]),
    )
    // The sample headers guess to their own targets — the guess table is the sample's contract.
    expect(mapping).toEqual({
      0: 'name', 1: 'category', 2: 'brand', 3: 'model', 4: 'tracking',
      5: 'quantity', 6: 'serials', 7: 'dailyRate', 8: 'description', 9: 'notes',
    })
    const sampleRow = [...PRODUCT_IMPORT_SAMPLE_ROW].map((v) => String(v))
    const result = buildProductImportPreview([sampleRow], mapping, opts, new Set())[0]!
    expect(result.errors).toEqual([])
    expect(result.record).toMatchObject({
      name: 'Sony FX3 Cinema Camera',
      category: 'Cameras',
      brand: 'Sony',
      model: 'FX3',
      tracking: 'Serialised',
      serials: ['SN-FX3-001', 'SN-FX3-002'],
      dailyRatePaisa: 350000,
    })
    expect(result.record).not.toHaveProperty('quantity')
  })

  it.each([
    { name: '' },
    { brand: '' },
    { category: '' },
    { category: 'Drones' }, // BQ-407: unknown category rejected at the dry-run, not the FK
    { tracking: '' },
    { tracking: 'Per-unit' }, // BQ-407: invalid enum rejected, never defaulted
    { tracking: 'Quantity', quantity: '' }, // Quantity row without a quantity
    { tracking: 'Quantity', quantity: '2.5' }, // not a whole number
    { tracking: 'Quantity', quantity: '0' }, // below 1
    { tracking: 'Serialised', quantity: '2' }, // serialised must not carry a quantity
    { tracking: 'Serialised', serials: '' }, // serialised without serials
    { tracking: 'Serialised', serials: 'SN-1, SN-1' }, // repeated serial in one row
    { tracking: 'Quantity', serials: 'SN-1' }, // quantity row carrying serials
    { dailyRate: 'cheap' }, // not money
  ])('blocks an invalid row: %j', (extra) => {
    const result = buildProductImportRow(row(extra), 0, OPTS)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.record).toBeNull()
  })

  it('parses the daily rate through the one money engine, grouping and all', () => {
    const result = buildProductImportRow(row({ dailyRate: 'Rs. 1,250.50' }), 0, OPTS)
    expect(result.errors).toEqual([])
    expect(result.record?.dailyRatePaisa).toBe(125050)
  })

  it('leaves a blank daily rate absent, never zero (Law 6 shape)', () => {
    const result = buildProductImportRow(row(), 0, OPTS)
    expect(result.errors).toEqual([])
    expect(result.record).not.toHaveProperty('dailyRatePaisa')
  })

  it('blocks a row that duplicates an existing catalogue product (the commit key)', () => {
    const result = buildProductImportRow(
      row({ name: 'Sony FX3 Cinema Camera', brand: 'Sony', model: 'FX3', tracking: 'Serialised', serials: 'SN-X', quantity: '' }),
      0,
      OPTS,
    )
    expect(result.duplicateOf?.id).toBe('p-1')
    expect(result.errors.some((e) => e.includes('already exists'))).toBe(true)
    expect(result.record).toBeNull()
  })

  it('matches the duplicate key case- and space-insensitively', () => {
    expect(productIdentityKey(' sony fx3 ', 'SONY', 'fx3')).toBe(productIdentityKey('Sony FX3', 'Sony', 'FX3'))
  })

  it('does not overwrite a target when two columns map to it', () => {
    expect(productMappingErrors(['Name', 'Name', 'Brand'], { 0: 'name', 1: 'name', 2: 'brand' })).toEqual([
      expect.stringContaining('Columns 1, 2'),
    ])
    expect(productMappingErrors(['Name', 'X', 'Brand'], { 0: 'name', 1: 'skip', 2: 'brand' })).toEqual([])
  })

  it('flags every in-file duplicate of one product; skipping one resolves the collision', () => {
    const data = [
      ['Mic', 'Rode', 'NTG5', 'Quantity', '2', 'Audio'],
      ['mic', ' Rode ', 'ntg5', 'Quantity', '2', 'Audio'],
    ]
    const mapping = { 0: 'name', 1: 'brand', 2: 'model', 3: 'tracking', 4: 'quantity', 5: 'category' } as const
    const all = buildProductImportPreview(data, mapping, OPTS, new Set())
    expect(all.every((r) => r.errors.some((e) => e.includes('Repeated product')))).toBe(true)
    const chosen = buildProductImportPreview(data, mapping, OPTS, new Set([1]))
    expect(chosen[0]!.errors).toEqual([])
    expect(chosen[1]!.skip).toBe(true)
  })

  it('does not treat distinct models of the same brand as duplicates', () => {
    const rows = buildProductImportPreview(
      [
        ['FX3', 'Sony', 'FX3', 'Serialised', 'SN-1', 'Cameras'],
        ['FX30', 'Sony', 'FX30', 'Serialised', 'SN-2', 'Cameras'],
      ],
      { 0: 'name', 1: 'brand', 2: 'model', 3: 'tracking', 4: 'serials', 5: 'category' },
      OPTS,
      new Set(),
    )
    expect(rows.every((r) => r.errors.length === 0)).toBe(true)
  })

  it('never guesses an on-hand count column into the quantity target (BQ-407)', () => {
    expect(guessProductTargetField('On Hand')).toBe('skip')
    expect(guessProductTargetField('Stock Count')).toBe('skip')
    expect(guessProductTargetField('Qty')).toBe('quantity')
  })

  it('guesses the common header aliases', () => {
    expect(guessProductTargetField('Product Name')).toBe('name')
    expect(guessProductTargetField('Make')).toBe('brand')
    expect(guessProductTargetField('Rate')).toBe('dailyRate')
    expect(guessProductTargetField('Serial Numbers')).toBe('serials')
    expect(guessProductTargetField('Internal Notes')).toBe('notes')
    expect(guessProductTargetField('Something Else Entirely')).toBe('skip')
  })

  it.each(['Owner', 'Admin', 'Manager'] as SystemRole[])('allows %s import', (role) =>
    expect(canImportProducts(role)).toBe(true),
  )
  it.each(['Coordinator', 'Accounts', 'Warehouse', 'Technician', 'Driver', 'Client'] as SystemRole[])('refuses %s import', (role) =>
    expect(canImportProducts(role)).toBe(false),
  )
})
