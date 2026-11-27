import { describe, it, expect } from 'vitest'
import {
  canImportPricingStructures,
  guessPricingTargetField,
  structureIdentityKey,
  pricingMappingErrors,
  buildPricingImportPreview,
} from '../pricingStructureImport'

describe('pricingStructureImport', () => {
  it('gates pricing structure import to authorised roles', () => {
    expect(canImportPricingStructures('Owner')).toBe(true)
    expect(canImportPricingStructures('Warehouse')).toBe(false)
  })

  it('guesses pricing headers and checks duplicate mappings', () => {
    expect(guessPricingTargetField('structure_name')).toBe('structure_name')
    expect(guessPricingTargetField('duration_days')).toBe('tile_duration_days')
    expect(guessPricingTargetField('rule_kind')).toBe('rule_kind')
    expect(structureIdentityKey('  Babin Daily  ')).toBe('babin daily')

    const errs = pricingMappingErrors(['A', 'B'], { 0: 'structure_name', 1: 'structure_name' })
    expect(errs.length).toBe(1)
  })

  it('blocks duplicate existing structure names in preview', () => {
    const preview = buildPricingImportPreview({
      hasHeaderRow: true,
      rawRows: [
        ['Structure', 'Duration', 'Amount', 'Ruleset', 'Kind', 'RuleName', 'ApplyWhen'],
        ['Babin Daily', '1', '5000', '', '', '', ''],
      ],
      mapping: {
        0: 'structure_name',
        1: 'tile_duration_days',
        2: 'tile_amount',
        3: 'ruleset_name',
        4: 'rule_kind',
        5: 'rule_name',
        6: 'rule_apply_when',
      },
      existingStructures: [{ id: 's-1', name: 'Babin Daily' }],
      skippedRows: new Set(),
    })

    expect(preview).toHaveLength(1)
    expect(preview[0]?.duplicateOf?.id).toBe('s-1')
    expect(preview[0]?.errors.some((e) => e.includes('already exists'))).toBe(true)
  })
})
