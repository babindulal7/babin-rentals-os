import type { Row, Store } from './engine'
import type { EquipmentUnitSnapshot } from '../../actions/inventory/updateEquipmentUnit'

/** Transactional local analogue. The client dispatches against a cloned store before persisting its overlay. */
export function updateUnitEditor(store: Store, args: Record<string, unknown>, actor: string): EquipmentUnitSnapshot {
  const person = store['users']?.find(row => row['id'] === actor)
  const role = String(person?.['primary_role'] ?? '')
  if (!person || !person['is_active'] || person['deactivated_at'] || !['Owner', 'Admin', 'Manager'].includes(role)) {
    throw new Error('Permission denied to edit equipment units.')
  }
  const unit = store['product_units']?.find(row => row['id'] === args['p_unit_id'])
  if (!unit) throw new Error('Unit not found.')
  if (role === 'Manager' && (unit['branch_id'] !== person['branch_id'] || !store['warehouses']?.some(w => w['id'] === unit['warehouse_id'] && w['branch_id'] === person['branch_id']))) {
    throw new Error('Unit branch access denied.')
  }
  const key = args['p_key']
  const revision = args['p_revision']
  const raw = args['p_patch']
  if (typeof key !== 'string' || !key || typeof revision !== 'string' || !Number.isFinite(Date.parse(revision)) || !raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('A unit, observed revision and stable save key are required.')
  }
  const columns: Record<string, string> = { assetTag: 'asset_tag', serialNo: 'serial_no', rack: 'rack', shelf: 'shelf', bin: 'bin', condition: 'condition' }
  const patch: Row = {}
  for (const [field, value] of Object.entries(raw)) {
    if (!(field in columns)) throw new Error(`Field ${field} cannot be changed in this unit editor.`)
    if (value !== null && typeof value !== 'string') throw new Error(`Unit field ${field} must be text.`)
    const cleaned = typeof value === 'string' ? value.trim() || null : null
    if (field === 'assetTag' && !cleaned) throw new Error('An asset tag is required.')
    if (field === 'condition' && !['Excellent', 'Good', 'Fair', 'Damaged', 'Lost'].includes(String(cleaned))) throw new Error('A condition is required.')
    patch[columns[field]!] = cleaned
  }
  if (!Object.keys(patch).length) throw new Error('No unit changes were provided.')
  const request = JSON.stringify({ operation: 'update_equipment_unit', unit: args['p_unit_id'], revision, patch })
  const receipt = store['record_editor_receipts']?.find(row => row['id'] === key)
  if (receipt) {
    if (receipt['actor'] !== actor || receipt['request'] !== request) throw new Error('This save key belongs to another change.')
    return receipt['response'] as EquipmentUnitSnapshot
  }
  if (Date.parse(String(unit['updated_at'])) !== Date.parse(revision)) throw new Error('The unit changed. Reload the latest record before saving.')
  if (unit['retired_at'] || unit['status'] === 'Retired') throw new Error('Retired units are read-only in this editor.')
  if (['rack', 'shelf', 'bin'].some(field => field in patch) && ['On Rent', 'Returning'].includes(String(unit['status']))) {
    throw new Error('Shelf location cannot change while the unit is out. Use its custody workflow.')
  }
  if ('condition' in patch && patch['condition'] !== unit['condition']) {
    if (!['In Stock', 'Reserved'].includes(String(unit['status'])) ||
        !['Excellent', 'Good', 'Fair'].includes(String(unit['condition'])) || !['Excellent', 'Good', 'Fair'].includes(String(patch['condition'])) ||
        store['damage_findings']?.some(row => row['unit_id'] === unit['id'] && !row['voided_at']) ||
        store['maintenance_records']?.some(row => row['product_unit_id'] === unit['id'] && !row['completed_at']) ||
        store['cleaning_queue_entries']?.some(row => row['unit_id'] === unit['id'] && (String(row['qc_fail_reason'] ?? '').trim() || row['problem_state'] !== 'No Problems'))) {
      throw new Error('Condition changes require the Return, damage or QC workflow for this unit.')
    }
  }
  const others = (store['product_units'] ?? []).filter(row => row['id'] !== unit['id'])
  if (patch['asset_tag'] && others.some(row => row['asset_tag'] === patch['asset_tag'])) throw new Error('This asset tag belongs to another unit.')
  if (patch['serial_no'] && others.some(row => row['serial_no'] === patch['serial_no'])) throw new Error('This manufacturer serial belongs to another unit.')
  const now = new Date(Math.max(Date.now(), Date.parse(revision) + 1)).toISOString()
  Object.assign(unit, patch, { updated_at: now, updated_by: actor })
  const response: EquipmentUnitSnapshot = {
    id: String(unit['id']), revision: now, assetTag: String(unit['asset_tag']),
    serialNo: unit['serial_no'] as string | null, rack: unit['rack'] as string | null,
    shelf: unit['shelf'] as string | null, bin: unit['bin'] as string | null,
    condition: unit['condition'] as EquipmentUnitSnapshot['condition'], state: unit['status'] as EquipmentUnitSnapshot['state'],
  }
  ;(store['record_editor_receipts'] ??= []).push({ id: key, actor, request, response })
  ;(store['audit_events'] ??= []).push({ id: crypto.randomUUID(), client_uuid: key, actor_id: actor,
    table_name: 'product_units', record_id: unit['id'], new_values: patch, created_at: now })
  return response
}
