import { createAction, type ActionConfig } from '../core'
import { newClientUuid, supabase } from '../../lib/supabase'
import { INVENTORY_STATES, UNIT_CONDITIONS, type InvStatus } from '../../lib/queries/inventory'

export type EquipmentUnitCondition = (typeof UNIT_CONDITIONS)[number]

export interface EquipmentUnitPatch {
  assetTag?: string
  serialNo?: string | null
  rack?: string | null
  shelf?: string | null
  bin?: string | null
  condition?: EquipmentUnitCondition
}
export interface EquipmentUnitSnapshot {
  id: string
  revision: string
  assetTag: string
  serialNo: string | null
  rack: string | null
  shelf: string | null
  bin: string | null
  condition: EquipmentUnitCondition
  state: InvStatus
}
export interface UpdateEquipmentUnitInput {
  id: string
  expectedRevision: string
  clientUuid: string
  patch: EquipmentUnitPatch
}
export interface EquipmentUnitSaveAttempt { fingerprint: string; input: UpdateEquipmentUnitInput }
const KEYS = new Set(['assetTag', 'serialNo', 'rack', 'shelf', 'bin', 'condition'])

/** Used by both the inline editor and callers outside it: unknown keys never reach SQL. */
export function equipmentUnitPatch(values: Record<string, unknown>): EquipmentUnitPatch {
  const result: EquipmentUnitPatch = {}
  for (const [key, value] of Object.entries(values)) {
    if (!KEYS.has(key)) throw new Error(`${key} cannot be changed in this unit editor.`)
    if (value !== null && typeof value !== 'string') throw new Error(`${key} must be text.`)
    if (key === 'assetTag') {
      if (typeof value !== 'string' || !value.trim()) throw new Error('An asset tag is required.')
      result.assetTag = value.trim()
    } else if (key === 'condition') {
      if (!UNIT_CONDITIONS.includes(value as EquipmentUnitCondition)) throw new Error('Choose a recorded unit condition.')
      result.condition = value as EquipmentUnitCondition
    } else {
      result[key as 'serialNo' | 'rack' | 'shelf' | 'bin'] = typeof value === 'string' ? value.trim() || null : null
    }
  }
  if (Object.keys(result).length === 0) throw new Error('No unit changes were provided.')
  return result
}

/** Preserve the complete request after an uncertain response, including its original revision. */
export function prepareEquipmentUnitSave(
  input: Omit<UpdateEquipmentUnitInput, 'clientUuid'>,
  previous: EquipmentUnitSaveAttempt | null,
): EquipmentUnitSaveAttempt {
  const normalized = { ...input, patch: equipmentUnitPatch(input.patch as Record<string, unknown>) }
  const fingerprint = JSON.stringify(normalized)
  return previous?.fingerprint === fingerprint ? previous : {
    fingerprint,
    input: { ...normalized, clientUuid: newClientUuid() },
  }
}

function savedSnapshot(value: unknown, id: string): EquipmentUnitSnapshot {
  if (!value || typeof value !== 'object') throw new Error('The unit save was not confirmed. Retry without leaving this editor.')
  const row = value as Record<string, unknown>
  if (row['id'] !== id || typeof row['revision'] !== 'string' || !Number.isFinite(Date.parse(row['revision'])) ||
      typeof row['assetTag'] !== 'string' || !row['assetTag'].trim() ||
      !UNIT_CONDITIONS.includes(row['condition'] as EquipmentUnitCondition) || !INVENTORY_STATES.includes(row['state'] as InvStatus) ||
      ['serialNo', 'rack', 'shelf', 'bin'].some(key => row[key] !== null && typeof row[key] !== 'string')) {
    throw new Error('The saved unit could not be verified. Retry without leaving this editor.')
  }
  // Deliberately reconstruct the response. No money or unexpected server field escapes this boundary.
  return {
    id, revision: row['revision'], assetTag: row['assetTag'],
    serialNo: row['serialNo'] as string | null, rack: row['rack'] as string | null,
    shelf: row['shelf'] as string | null, bin: row['bin'] as string | null,
    condition: row['condition'] as EquipmentUnitCondition, state: row['state'] as InvStatus,
  }
}

export const updateEquipmentUnitConfig: ActionConfig<UpdateEquipmentUnitInput, EquipmentUnitSnapshot> = {
  name: 'UPDATE_EQUIPMENT_UNIT',
  permissions: ['inventory.update'],
  implemented: true,
  validate(input) {
    if (!input.id?.trim() || !input.clientUuid?.trim()) throw new Error('A unit and stable save key are required.')
    if (!input.expectedRevision || !Number.isFinite(Date.parse(input.expectedRevision))) throw new Error('Reload the latest unit before saving.')
    equipmentUnitPatch(input.patch as Record<string, unknown>)
  },
  async execute(input, ctx) {
    // RULING 2026-10-26: the existing inventory.update role boundary stays stricter than generic unit RLS.
    if (!['Owner', 'Admin', 'Manager'].includes(ctx.role)) throw new Error('You cannot edit this unit.')
    if (ctx.isOnline === false || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      throw new Error('Connect to save the unit. Your changes are still here.')
    }
    const { data, error } = await supabase.rpc('update_equipment_unit', {
      p_unit_id: input.id, p_revision: input.expectedRevision, p_key: input.clientUuid,
      p_patch: equipmentUnitPatch(input.patch as Record<string, unknown>),
    })
    if (error) throw new Error(['42883','PGRST202'].includes(String(error.code)) ? 'This action is not available on this server yet. No changes were saved.' : error.message)
    return { result: savedSnapshot(data, input.id), events: [] }
  },
}
export const updateEquipmentUnit = createAction(updateEquipmentUnitConfig)
