import { createAction, type ActionConfig, type ActionContext } from '../core'
import { newClientUuid, supabase } from '../../lib/supabase'

export interface UnitIntakeRow {
  serial_no?: string | undefined
  warehouse_id: string
  rack?: string | undefined
  shelf?: string | undefined
  bin?: string | undefined
  condition?: string | undefined
  purchase_date?: string | undefined
}

export interface AddEquipmentUnitsInput {
  productId: string
  units: UnitIntakeRow[]
  clientUuid?: string | undefined
}

export interface AddEquipmentUnitsResult {
  product_id: string
  added_count: number
  total_quantity: number
  unit_ids: string[]
}

export const addEquipmentUnitsConfig: ActionConfig<AddEquipmentUnitsInput, AddEquipmentUnitsResult> = {
  name: 'ADD_EQUIPMENT_UNITS',
  permissions: ['inventory.update'],
  implemented: true,
  validate(input) {
    if (!input.productId) throw new Error('Product ID is required.')
    if (!input.units || !input.units.length) throw new Error('At least one unit is required.')
    for (const u of input.units) {
      if (!u.warehouse_id) throw new Error('Warehouse is required for every unit.')
    }
  },
  async execute(input, ctx: ActionContext) {
    if (!['Owner', 'Admin', 'Manager'].includes(ctx.role)) {
      throw new Error('Only Owner, Admin, or Manager may add equipment units.')
    }
    if (ctx.isOnline === false) throw new Error('Connect to add units to equipment.')
    const { data, error } = await supabase.rpc('add_equipment_units', {
      p_product_id: input.productId,
      p_units: input.units,
      p_key: input.clientUuid ?? newClientUuid(),
    })
    if (error) throw new Error(error.message)
    if (!data || typeof data !== 'object') {
      throw new Error('Unit intake was not confirmed by the server.')
    }
    return { result: data as AddEquipmentUnitsResult, events: [] }
  },
}
export const addEquipmentUnits = createAction(addEquipmentUnitsConfig)

export interface RetireEquipmentUnitInput {
  unitId: string
  reason: string
  clientUuid?: string | undefined
}

export interface RetireEquipmentUnitResult {
  unit_id: string
  asset_tag: string
  product_id: string
  status: 'Retired'
  total_quantity: number
  retired_at: string
}

export const retireEquipmentUnitConfig: ActionConfig<RetireEquipmentUnitInput, RetireEquipmentUnitResult> = {
  name: 'RETIRE_EQUIPMENT_UNIT',
  permissions: ['inventory.update'],
  implemented: true,
  validate(input) {
    if (!input.unitId) throw new Error('Unit ID is required.')
    if (!input.reason || input.reason.trim().length < 10) {
      throw new Error('Retirement requires an explanation of at least 10 characters.')
    }
  },
  async execute(input, ctx: ActionContext) {
    if (!['Owner', 'Admin', 'Manager'].includes(ctx.role)) {
      throw new Error('Only Owner, Admin, or Manager may retire equipment units.')
    }
    if (ctx.isOnline === false) throw new Error('Connect to retire equipment.')
    const { data, error } = await supabase.rpc('retire_equipment_unit', {
      p_unit_id: input.unitId,
      p_reason: input.reason.trim(),
      p_key: input.clientUuid ?? newClientUuid(),
    })
    if (error) throw new Error(error.message)
    if (!data || typeof data !== 'object') {
      throw new Error('Unit retirement was not confirmed by the server.')
    }
    return { result: data as RetireEquipmentUnitResult, events: [] }
  },
}
export const retireEquipmentUnit = createAction(retireEquipmentUnitConfig)
