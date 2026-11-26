import { describe, expect, it } from 'vitest'
import { updateUnitEditor } from '../equipmentUnitEditor'
import { buildStore } from '../corpus'
import type { Store } from '../engine'
const revision = '2026-10-25T10:00:00.000Z'
function fixture(): Store {
  return {
    users: [{ id: 'manager', primary_role: 'Manager', is_active: true, deactivated_at: null, branch_id: 'branch-a' }],
    warehouses: [{ id: 'warehouse-a', branch_id: 'branch-a' }, { id: 'warehouse-b', branch_id: 'branch-b' }],
    product_units: [{ id: 'unit-a', asset_tag: 'A', serial_no: null, rack: null, shelf: null, bin: null,
      condition: 'Good', status: 'In Stock', branch_id: 'branch-a', warehouse_id: 'warehouse-a', updated_at: revision },
      { id: 'unit-b', asset_tag: 'B', serial_no: 'SERIAL-B', branch_id: 'branch-b', warehouse_id: 'warehouse-b', updated_at: revision }],
    record_editor_receipts: [], audit_events: [],
  }
}
const args = (patch: Record<string, unknown>, key = 'key-a') => ({ p_unit_id: 'unit-a', p_revision: revision, p_key: key, p_patch: patch })
describe('transactional local unit mock', () => {
  it('allows a seeded unit to save against its initial revision and then rejects a stale save', () => {
    const store = buildStore({ seeded: true })
    const unit = store.product_units?.[0]
    const owner = store.users?.find(row => row.primary_role === 'Owner')
    if (!unit || !owner) throw new Error('Seeded unit and Owner are required for this contract')
    expect(unit.updated_at).toBe(unit.created_at)
    const input = { p_unit_id: unit.id, p_revision: String(unit.updated_at), p_key: 'seed-save', p_patch: { shelf: 'QA-STOCK' } }
    const result = updateUnitEditor(store, input, String(owner.id))
    expect(result.shelf).toBe('QA-STOCK')
    expect(result.revision).not.toBe(input.p_revision)
    expect(updateUnitEditor(store, input, String(owner.id))).toEqual(result)
    expect(() => updateUnitEditor(store, { ...input, p_key: 'stale-save' }, String(owner.id))).toThrow(/unit changed/)
  })
  it('persists real store values, receipt and one audit without money', () => {
    const store = fixture()
    const input = args({ rack: ' A ', serialNo: '' })
    const first = updateUnitEditor(store, input, 'manager')
    expect(first.rack).toBe('A'); expect(first.serialNo).toBeNull()
    expect(store.product_units?.[0]?.rack).toBe('A')
    expect(updateUnitEditor(store, input, 'manager')).toEqual(first)
    expect(store.audit_events).toHaveLength(1)
    expect(Object.keys(first)).not.toContain('replacement_value')
  })
  it('refuses changed retry data and stale editors', () => {
    const store = fixture()
    updateUnitEditor(store, args({ rack: 'A' }), 'manager')
    expect(() => updateUnitEditor(store, args({ rack: 'B' }), 'manager')).toThrow(/another change/)
    expect(() => updateUnitEditor(store, args({ rack: 'B' }, 'new-key'), 'manager')).toThrow(/unit changed/)
  })
  it('checks current branch before returning a historical receipt', () => {
    const store = fixture(); const input = args({ rack: 'A' })
    updateUnitEditor(store, input, 'manager')
    Object.assign(store.product_units![0]!, { branch_id: 'branch-b', warehouse_id: 'warehouse-b' })
    expect(() => updateUnitEditor(store, input, 'manager')).toThrow(/branch access denied/)
  })
  it('refuses widening role and fields before mutation', () => {
    const store = fixture()
    store.users![0]!.primary_role = 'Warehouse'
    expect(() => updateUnitEditor(store, args({ rack: 'A' }), 'manager')).toThrow(/Permission denied/)
    store.users![0]!.primary_role = 'Manager'
    expect(() => updateUnitEditor(store, args({ status: 'In Stock' }), 'manager')).toThrow(/cannot be changed/)
    expect(store.audit_events).toHaveLength(0)
  })
  it('refuses unresolved defects and does not simulate clearance', () => {
    const store = fixture()
    store.damage_findings = [{ unit_id: 'unit-a', voided_at: null }]
    expect(() => updateUnitEditor(store, args({ condition: 'Excellent' }), 'manager')).toThrow(/QC workflow/)
    expect(store.product_units?.[0]?.condition).toBe('Good')
    expect(store.audit_events).toHaveLength(0)
  })
  it('checks unique identities without changing the staged row', () => {
    const store = fixture()
    expect(() => updateUnitEditor(store, args({ serialNo: 'SERIAL-B' }), 'manager')).toThrow(/another unit/)
    expect(() => updateUnitEditor(store, args({ assetTag: 'B' }), 'manager')).toThrow(/another unit/)
    expect(store.product_units?.[0]?.asset_tag).toBe('A')
  })
})
