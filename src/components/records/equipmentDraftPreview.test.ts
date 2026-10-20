import { describe, expect, it } from 'vitest'
import { buildEquipmentDraftPreview } from './equipmentDraftPreview'

describe('equipment unsaved preview', () => {
  it('displays entered serials and maps stored warehouse IDs to human labels', () => {
    const model = buildEquipmentDraftPreview(
      { name: 'FX3', brand: 'Sony', model: 'ILME-FX3', tracking_mode: 'Serialised' },
      [
        { serial_no: 'SN-001', condition: 'Excellent', warehouse_id: 'w1', rack: 'A', shelf: '2' },
        { serial_no: null, condition: 'Good', warehouse_id: null },
      ],
      'Camera',
      [{ id: 'w1', name: 'Boudha' }],
    )
    expect(model.quantity).toBe(2)
    expect(model.category).toBe('Camera')
    expect(model.maker).toBe('Sony ILME-FX3')
    expect(model.units[0]).toEqual({
      serial: 'SN-001', condition: 'Excellent', warehouse: 'Boudha',
      location: 'Rack A · Shelf 2',
    })
    expect(model.units[1]?.serial).toBe('Serial not entered')
    expect(model.units[1]?.warehouse).toBe('Warehouse not selected')
  })
  it('does not create imaginary serials for quantity tracked assets', () => {
    const model = buildEquipmentDraftPreview(
      { name: 'Sandbag', tracking_mode: 'Quantity', total_quantity: 22 },
      [{ serial_no: 'must-not-appear' }],
      undefined,
      [],
    )
    expect(model.quantity).toBe(22)
    expect(model.units).toEqual([])
  })
  it('reports incomplete records instead of asserting inventory availability', () => {
    const model = buildEquipmentDraftPreview({}, [], undefined, [])
    expect(model.name).toBe('Unnamed equipment')
    expect(model.quantity).toBeNull()
    expect(model.units).toEqual([])
    expect('assetCode' in model).toBe(false)
    expect('status' in model).toBe(false)
  })
})
