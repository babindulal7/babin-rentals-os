import { createAction, type ActionConfig } from '../core'
import { supabase } from '../../lib/supabase'

/**
 * T2-17: narrow, fail-closed unit identity/location write.
 *
 * The UPDATE uses one atomic id + updated_at predicate; a stale tab cannot
 * overwrite a newer edit between the comparison and the write. The existing
 * trg_audit_product_units (0010) inserts the audit row in that same database
 * transaction and derives the actor from updated_by. This action never reads
 * or writes a money field, unit status or condition.
 *
 * The caller supplies a stable clientUuid for its retry. The revision predicate
 * prevents a replay from applying the write a second time; a replay after a
 * possibly committed network failure reports a conflict, never a false save.
 */
export type UnitIdentityPatch = Partial<{
  assetTag: string
  serialNo: string | null
  rack: string | null
  shelf: string | null
  bin: string | null
}>

export interface UpdateUnitInput {
  unitId: string
  expectedRevision: string
  clientUuid: string
  patch: UnitIdentityPatch
}

export interface UpdateUnitResult {
  id: string
  assetTag: string
  serialNo: string | null
  rack: string | null
  shelf: string | null
  bin: string | null
  updatedAt: string
}

const columnByField = {
  assetTag: 'asset_tag',
  serialNo: 'serial_no',
  rack: 'rack',
  shelf: 'shelf',
  bin: 'bin',
} as const

type Field = keyof typeof columnByField

function normalizedPatch(input: UnitIdentityPatch): Record<string, string | null> {
  const result: Record<string, string | null> = {}
  for (const [key, raw] of Object.entries(input)) {
    if (!Object.prototype.hasOwnProperty.call(columnByField, key)) {
      throw new Error('This field cannot be changed in the unit editor. Nothing was saved.')
    }
    if (raw !== null && typeof raw !== 'string') {
      throw new Error('Unit identity and location values must be text. Nothing was saved.')
    }
    // Keep internal spaces and dashes (e.g. FX3-A), but trim separators at the edges.
    const value = raw === null ? '' : raw.replace(/^[\s-]+|[\s-]+$/g, '')
    if (key === 'assetTag' && !value) {
      throw new Error('Asset tag is required for scanning. Nothing was saved.')
    }
    result[columnByField[key as Field]] = value || null
  }
  if (Object.keys(result).length === 0) {
    throw new Error('Nothing was changed, so nothing was saved.')
  }
  return result
}

const RETURNING_COLUMNS = 'id, asset_tag, serial_no, rack, shelf, bin, updated_at'

export const updateUnitConfig: ActionConfig<UpdateUnitInput, UpdateUnitResult> = {
  name: 'UPDATE_UNIT',
  permissions: ['inventory.update_unit_identity'],
  implemented: true,
  validate(input) {
    if (!input.unitId?.trim() || !input.clientUuid?.trim()) {
      throw new Error('Unit or action identity is missing. Nothing was saved.')
    }
    if (!input.expectedRevision || Number.isNaN(Date.parse(input.expectedRevision))) {
      throw new Error('Unit revision is missing. Reload the unit before saving.')
    }
    normalizedPatch(input.patch)
  },
  async execute(input, ctx) {
    if (ctx.isOnline === false || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      throw new Error('You are offline. Unit details were not saved; reconnect and retry.')
    }
    const patch = normalizedPatch(input.patch)
    const revisionMs = Date.parse(input.expectedRevision)
    const newRevision = new Date(Math.max(Date.now(), revisionMs + 1_000)).toISOString()

    // Only an exact revision match may write. Set updated_at explicitly because
    // unrelated product_units writers do not all bump it automatically.
    const { data, error } = await supabase
      .from('product_units')
      .update({ ...patch, updated_at: newRevision, updated_by: ctx.userId })
      .eq('id', input.unitId)
      .eq('updated_at', input.expectedRevision)
      .select(RETURNING_COLUMNS)
      .maybeSingle()

    if (error) {
      if (error.code === '23505') {
        throw new Error('That asset tag or manufacturer serial is already assigned to another unit. Nothing was saved.')
      }
      throw new Error('Unit details were not saved: ' + error.message)
    }
    if (!data) {
      throw new Error('This unit changed since you opened it, or you cannot edit it. Reload before saving; nothing was overwritten.')
    }

    // The narrow DB echo is the persistence receipt, not an optimistic local patch.
    const saved = data as unknown as {
      id: string
      asset_tag: string
      serial_no: string | null
      rack: string | null
      shelf: string | null
      bin: string | null
      updated_at: string
    }
    if (!saved.updated_at || !saved.asset_tag || saved.id !== input.unitId) {
      throw new Error('Could not verify the unit save receipt. Reload before continuing.')
    }
    return {
      result: {
        id: saved.id,
        assetTag: saved.asset_tag,
        serialNo: saved.serial_no,
        rack: saved.rack,
        shelf: saved.shelf,
        bin: saved.bin,
        updatedAt: saved.updated_at,
      },
      events: [],
    }
  },
}

export const updateUnit = createAction(updateUnitConfig)
