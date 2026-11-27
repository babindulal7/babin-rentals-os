import { describe, it, expect } from 'vitest'
import {
  canImportBundles,
  guessBundleTargetField,
  bundleIdentityKey,
  bundleMappingErrors,
  buildBundleImportPreview,
} from '../bundleImport'
import { rupees } from '../money'

describe('bundleImport', () => {
  it('gates bundle import to authorised roles', () => {
    expect(canImportBundles('Owner')).toBe(true)
    expect(canImportBundles('Manager')).toBe(true)
    expect(canImportBundles('Driver')).toBe(false)
    expect(canImportBundles('Client')).toBe(false)
  })

  it('guesses common CSV header names and validates required mappings', () => {
    expect(guessBundleTargetField('Bundle Code')).toBe('bundleCode')
    expect(guessBundleTargetField('Bundle Rate')).toBe('bundleRate')
    expect(guessBundleTargetField('Line Kind')).toBe('lineKind')
    expect(guessBundleTargetField('Unrelated Column')).toBe('skip')
    expect(bundleIdentityKey('  bnd-01 ')).toBe('BND-01')

    const dupErrors = bundleMappingErrors(['A', 'B'], { 0: 'bundleCode', 1: 'bundleCode' })
    expect(dupErrors.length).toBe(1)
  })

  it('builds grouped bundle preview and rejects invalid line kinds or quantities', () => {
    const preview = buildBundleImportPreview({
      hasHeaderRow: true,
      rawRows: [
        ['Code', 'Name', 'Category', 'Rate', 'Kind', 'Model', 'Qty'],
        ['BND-001', 'FX6 Kit', 'Cameras', '15000', 'equipment', 'Sony FX6', '1'],
        ['BND-001', 'FX6 Kit', 'Cameras', '15000', 'equipment', 'Tripod', '2'],
        ['BND-002', 'Bad Kit', 'Cameras', '5000', 'invalid_kind', 'Lens', '0'],
      ],
      mapping: {
        0: 'bundleCode',
        1: 'name',
        2: 'category',
        3: 'bundleRate',
        4: 'lineKind',
        5: 'lineModel',
        6: 'lineQuantity',
      },
      existingBundles: [],
      existingProducts: [{ id: 'p-1', model: 'Sony FX6' }],
      existingCrew: [],
      existingVehicles: [],
      skippedRows: new Set(),
    })

    expect(preview).toHaveLength(2)
    expect(preview[0]?.errors).toEqual([])
    expect(preview[0]?.record?.bundleRatePaisa).toBe(rupees(15000))
    expect(preview[0]?.record?.lines).toHaveLength(2)
    expect(preview[1]?.errors.length).toBeGreaterThan(0)
    expect(preview[1]?.record?.lines).toEqual([])
  })
})
