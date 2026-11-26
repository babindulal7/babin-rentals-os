import { createAction, type ActionConfig } from '../core'
import { safeUpdate } from '../../lib/dataAccess'
import { logAuditEvent } from '../../lib/audit'
import { generateClientUuid } from '../../lib/supabase'

export interface UpdateUnitInput {
  unitId: string
  clientUuid: string
  expectedRevision: string
  assetTag: string
  serialNo: string | null
  rack: string | null
  shelf: string | null
  bin: string | null
}

export interface UpdateUnitResult {
  unitId: string
  assetTag: string
  serialNo: string | null
  rack: string | null
  shelf: string | null
  bin: string | null
  revision: string
}

const VALID_STATUSES = [
  'In Stock',
  'Reserved',
  'Packed',
  'On Rent',
  'Returning',
  'Inspection',
  'Cleaning',
  'Maintenance',
  'Missing',
  'Retired',
] as const

function trimOrNull(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null
  const trimmed = v.trim()
  return trimmed === '' ? null : trimmed
}

function validateAssetTag(v: string): string | null {
  const trimmed = v.trim()
  if (!trimmed) return 'Asset tag cannot be empty.'
  return null
}

function validateSerialNo(v: string | null): string | null {
  // Serial may be empty/null - no validation needed beyond trimming
  return null
}

export const updateUnitConfig: ActionConfig<UpdateUnitInput, UpdateUnitResult> = {
  name: 'UPDATE_UNIT',
  permissions: ['inventory.edit_identity'],
  implemented: true,
  validate(input) {
    if (!input.unitId) throw new Error('Unit ID is required.')
    if (!input.clientUuid) throw new Error('Idempotency key is required (Law 8).')
    if (!input.expectedRevision) throw new Error('Reload the unit before saving.')

    const assetTagError = validateAssetTag(input.assetTag)
    if (assetTagError) throw new Error(assetTagError)

    // Serial, rack, shelf, bin are trimmed but not refused for spaces/dashes
  },
  async execute(input, ctx) {
    // Fetch current unit for audit trail and optimistic locking
    const { data: currentUnit, error: fetchError } = await safeUpdate.supabase
      .from('product_units')
      .select('id, asset_tag, serial_no, status, condition, rack, shelf, bin, updated_at')
      .eq('id', input.unitId)
      .single()

    if (fetchError || !currentUnit) {
      throw new Error('Unit not found.')
    }

    // Optimistic locking: check revision (updated_at)
    if (currentUnit.updated_at !== input.expectedRevision) {
      throw new Error('This unit was changed by someone else since you opened it. Reload to see the latest values.')
    }

    // Prepare update payload - only the allowed fields
    const updatePayload = {
      asset_tag: input.assetTag.trim(),
      serial_no: trimOrNull(input.serialNo),
      rack: trimOrNull(input.rack),
      shelf: trimOrNull(input.shelf),
      bin: trimOrNull(input.bin),
      updated_by: ctx.userId,
    }

    // Perform the update with the client_uuid for idempotency
    const { data: updatedUnit, error: updateError } = await safeUpdate(
      'product_units',
      input.unitId,
      updatePayload,
      input.clientUuid,
      { queueOnFailure: false } // Custody write - must not queue offline
    )

    if (updateError) {
      // Check for unique constraint violation on asset_tag
      if (updateError.code === '23505' && updateError.message.includes('product_units_asset_tag_key')) {
        throw new Error('This asset tag is already in use by another unit.')
      }
      throw new Error(`Failed to save unit: ${updateError.message}`)
    }

    if (!updatedUnit) {
      throw new Error('The save was not confirmed. Retry with your changes intact.')
    }

    // Log audit event
    await logAuditEvent({
      eventClass: 'status change',
      category: 'Inventory',
      module: 'Inventory',
      action: 'Update',
      severity: 'Informational',
      status: 'Success',
      tableName: 'product_units',
      recordId: input.unitId,
      actorId: ctx.userId,
      actorRole: ctx.role,
      oldValues: {
        asset_tag: currentUnit.asset_tag,
        serial_no: currentUnit.serial_no,
        rack: currentUnit.rack,
        shelf: currentUnit.shelf,
        bin: currentUnit.bin,
      },
      newValues: {
        asset_tag: updatedUnit.asset_tag,
        serial_no: updatedUnit.serial_no,
        rack: updatedUnit.rack,
        shelf: updatedUnit.shelf,
        bin: updatedUnit.bin,
      },
      reason: 'Unit identity/location updated via Asset Detail editor',
    })

    return {
      result: {
        unitId: updatedUnit.id,
        assetTag: updatedUnit.asset_tag,
        serialNo: updatedUnit.serial_no,
        rack: updatedUnit.rack,
        shelf: updatedUnit.shelf,
        bin: updatedUnit.bin,
        revision: updatedUnit.updated_at,
      },
      events: [],
    }
  },
}

export const updateUnit = createAction(updateUnitConfig)