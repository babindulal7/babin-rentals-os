import { beforeEach, describe, expect, it, vi } from 'vitest'
const db = vi.hoisted(() => ({ rpc: vi.fn(), seq: 0 }))
vi.mock('../../../lib/supabase', () => ({ supabase: { rpc: db.rpc }, newClientUuid: () => `save-${++db.seq}` }))
const { updateEquipmentUnitConfig, prepareEquipmentUnitSave, equipmentUnitPatch } = await import('../updateEquipmentUnit')
const snapshot = { id: 'unit-1', revision: '2026-10-26T10:00:00Z', assetTag: 'CAM-1', serialNo: null, rack: 'A', shelf: null, bin: null, condition: 'Good', state: 'In Stock' }
const input = { id: 'unit-1', expectedRevision: '2026-10-25T10:00:00Z', clientUuid: 'key-1', patch: { assetTag: 'CAM-1' } }
const owner = { userId: 'owner', role: 'Owner' as const, isOnline: true }
beforeEach(() => { db.rpc.mockReset(); db.rpc.mockResolvedValue({ data: snapshot, error: null }) })
describe('persisted unit action', () => {
  it('uses only the atomic RPC and a confirmed money-free snapshot', async () => {
    const result = await updateEquipmentUnitConfig.execute(input, owner)
    expect(db.rpc).toHaveBeenCalledWith('update_equipment_unit', { p_unit_id: 'unit-1', p_revision: input.expectedRevision, p_key: 'key-1', p_patch: input.patch })
    expect(result.result).toEqual(snapshot)
    expect(result.events).toEqual([])
  })
  it.each(['state','status','replacementValue','purchasePrice','branchId','warehouseId','retiredAt'])('refuses the forbidden field %s', key => {
    expect(() => equipmentUnitPatch({ [key]: 'unsafe' })).toThrow(/cannot be changed/)
  })
  it('trims identity and converts empty optional location/serial to null', () => {
    expect(equipmentUnitPatch({ assetTag: '  CAM-2 ', serialNo: '', rack: ' ', shelf: ' B ' })).toEqual({ assetTag: 'CAM-2', serialNo: null, rack: null, shelf: 'B' })
  })
  it.each(['', '   '])('refuses an empty asset tag', tag => expect(() => equipmentUnitPatch({ assetTag: tag })).toThrow(/tag is required/))
  it('refuses invalid condition and absent changes', () => {
    expect(() => equipmentUnitPatch({ condition: 'Ready' })).toThrow(/condition/)
    expect(() => equipmentUnitPatch({})).toThrow(/No unit changes/)
  })
  it.each(['Warehouse','Technician','Driver','Coordinator','Accounts','Client'])('keeps %s outside the action boundary', async role => {
    await expect(updateEquipmentUnitConfig.execute(input, { ...owner, role: role as 'Warehouse' })).rejects.toThrow(/cannot edit/)
    expect(db.rpc).not.toHaveBeenCalled()
  })
  it('refuses offline and unknown revisions before claiming a write', async () => {
    await expect(updateEquipmentUnitConfig.execute(input, { ...owner, isOnline: false })).rejects.toThrow(/Connect to save/)
    expect(() => updateEquipmentUnitConfig.validate({ ...input, expectedRevision: '' })).toThrow(/Reload/)
    expect(db.rpc).not.toHaveBeenCalled()
  })
  it('does not certify null, mismatched or incomplete readback', async () => {
    for (const data of [null, {}, { ...snapshot, id: 'other' }, { ...snapshot, revision: null }]) {
      db.rpc.mockResolvedValueOnce({ data, error: null })
      await expect(updateEquipmentUnitConfig.execute(input, owner)).rejects.toThrow(/not confirmed|not be verified/)
    }
  })
  it('omits unexpected money fields returned by a server', async () => {
    db.rpc.mockResolvedValueOnce({ data: { ...snapshot, replacement_value: 999 }, error: null })
    expect((await updateEquipmentUnitConfig.execute(input, owner)).result).toEqual(snapshot)
  })
  it('surfaces stale/retry refusal without translating it to success', async () => {
    db.rpc.mockResolvedValueOnce({ data: null, error: { message: 'The unit changed. Reload the latest record.' } })
    await expect(updateEquipmentUnitConfig.execute(input, owner)).rejects.toThrow(/changed/)
  })
  it('keeps a retry key/revision for unchanged content and mints only for changed content', () => {
    const first = prepareEquipmentUnitSave({ id: input.id, expectedRevision: input.expectedRevision, patch: input.patch }, null)
    expect(prepareEquipmentUnitSave({ id: input.id, expectedRevision: input.expectedRevision, patch: input.patch }, first)).toBe(first)
    const changed = prepareEquipmentUnitSave({ id: input.id, expectedRevision: input.expectedRevision, patch: { rack: 'B' } }, first)
    expect(changed.input.clientUuid).not.toBe(first.input.clientUuid)
    expect(changed.input.expectedRevision).toBe(input.expectedRevision)
  })
})
