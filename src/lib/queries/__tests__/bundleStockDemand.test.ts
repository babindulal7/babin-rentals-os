import { describe, expect, it } from 'vitest'
import {
  buildBookingStockDemand, type BundleRequirement, type SavedStockLine,
} from '../bundleStockDemand'

const window = {
  fromAd: '2026-11-02T00:15:00.000Z',
  toAd: '2026-11-05T00:15:00.000Z',
}
const bundle: SavedStockLine = {
  id: 'bundle-parent', line_type: 'Bundle', product_id: null,
  bundle_id: 'bundle-1', parent_line_id: null, description: 'FX3 kit', qty: 2,
}
const camera: SavedStockLine = {
  id: 'kit-camera', line_type: 'Equipment', product_id: 'fx3',
  bundle_id: 'bundle-1', parent_line_id: bundle.id, description: 'Sony FX3', qty: 2,
}
const lens: SavedStockLine = {
  id: 'kit-lens', line_type: 'Equipment', product_id: 'lens',
  bundle_id: 'bundle-1', parent_line_id: bundle.id, description: 'Sony 24-70', qty: 2,
}
const expected: BundleRequirement[] = [
  { id: 'item-cam', bundle_id: 'bundle-1', product_id: 'fx3', quantity: 1, is_mandatory: true },
  { id: 'item-lens', bundle_id: 'bundle-1', product_id: 'lens', quantity: 1, is_mandatory: true },
]
const looseCamera: SavedStockLine = {
  id: 'loose-camera', line_type: 'Equipment', product_id: 'fx3',
  bundle_id: null, parent_line_id: null, description: 'Sony FX3', qty: 1,
}

describe('saved bundle stock demand (availability preview only)', () => {
  it('checks saved equipment children rather than claiming a bundle parent is a stock product', () => {
    const demand = buildBookingStockDemand('B-77', [bundle, camera, lens], expected, window)
    expect(demand).toHaveLength(2)
    expect(demand.map(v => [v.productId, v.requestedQty])).toEqual([['fx3', 2], ['lens', 2]])
    expect(demand.every(v => v.productId !== bundle.id)).toBe(true)
  })

  it('combines loose and bundle demand for the same model before checking capacity', () => {
    const demand = buildBookingStockDemand('B-77', [bundle, camera, lens, looseCamera], expected, window)
    expect(demand.find(v => v.productId === 'fx3')?.requestedQty).toBe(3)
    expect(demand.filter(v => v.productId === 'fx3')).toHaveLength(1)
  })

  it('refuses a bundle parent when no saved equipment children exist', () => {
    expect(() => buildBookingStockDemand('B-77', [bundle], expected, window))
      .toThrow(/no saved equipment components/)
  })

  it('refuses an incomplete saved mandatory component rather than inventing its stock', () => {
    expect(() => buildBookingStockDemand('B-77', [bundle, camera], expected, window))
      .toThrow(/missing required bundle equipment/)
  })

  it('honors parent bundle quantity when comparing mandatory equipment totals', () => {
    expect(() => buildBookingStockDemand('B-77', [bundle, { ...camera, qty: 1 }, lens], expected, window))
      .toThrow(/missing required bundle equipment/)
  })

  it('refuses a missing bundle catalogue definition rather than claiming available', () => {
    expect(() => buildBookingStockDemand('B-77', [bundle, camera, lens], [], window))
      .toThrow(/requirements could not be loaded/)
  })

  it('refuses orphaned children even when their product exists', () => {
    expect(() => buildBookingStockDemand('B-77', [{ ...camera, parent_line_id: 'missing' }], expected, window))
      .toThrow(/orphan or non-bundle/)
  })

  it('refuses child equipment attached to a different bundle ID', () => {
    expect(() => buildBookingStockDemand('B-77', [bundle, { ...camera, bundle_id: 'wrong' }, lens], expected, window))
      .toThrow(/wrong bundle/)
  })

  it('does not count service lines as physical stock but still checks included equipment', () => {
    const service: SavedStockLine = {
      id: 'service', line_type: 'Service', product_id: null,
      bundle_id: null, parent_line_id: null, description: 'Operator', qty: 1,
    }
    const demand = buildBookingStockDemand('B-77', [service, looseCamera], [], window)
    expect(demand).toHaveLength(1)
    expect(demand[0]?.productId).toBe('fx3')
  })

  it('refuses a booking with only non-stock services instead of showing equipment available', () => {
    const service: SavedStockLine = {
      id: 'service', line_type: 'Service', product_id: null,
      bundle_id: null, parent_line_id: null, description: 'Operator', qty: 1,
    }
    expect(() => buildBookingStockDemand('B-77', [service], [], window))
      .toThrow(/no verifiable equipment stock lines/)
  })

  it('refuses an unverified sub-rental instead of counting it as owned gear', () => {
    expect(() => buildBookingStockDemand('B-77', [{
      ...looseCamera, line_type: 'Sub-rental',
    }], [], window)).toThrow(/without verifiable in-house equipment/)
  })

  it('refuses a child equipment line with missing product identity', () => {
    expect(() => buildBookingStockDemand('B-77', [bundle, { ...camera, product_id: null }, lens], expected, window))
      .toThrow(/without a linked equipment product/)
  })

  it('refuses an invalid mandatory component requirement', () => {
    expect(() => buildBookingStockDemand('B-77', [bundle, camera, lens], [
      { ...expected[0]!, quantity: 0 }, expected[1]!,
    ], window)).toThrow(/invalid bundle component requirement/)
  })
})
