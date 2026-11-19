import { createAction, type ActionConfig, type ActionContext } from '../core'
import { newClientUuid, supabase } from '../../lib/supabase'

export type PartnerCostKind = 'daily' | 'fixed'

export interface RecordTemporaryStockInput {
  clientUuid?: string | undefined
  supplierId: string
  productId: string
  trackingMode?: 'Serialised' | 'Quantity' | undefined
  quantity: number
  availableFrom: string
  availableUntil: string
  costKind: PartnerCostKind
  costPaisa: number
  notes?: string | undefined
  assetCodes?: string[] | undefined
  branchId?: string | undefined
  warehouseId?: string | undefined
}

export interface RecordTemporaryStockResult {
  id: string
  client_uuid: string
  status: 'Active'
  quantity: number
  available_from: string
  available_until: string
}

export const recordTemporaryStockConfig: ActionConfig<RecordTemporaryStockInput, RecordTemporaryStockResult> = {
  name: 'RECORD_TEMPORARY_STOCK',
  permissions: ['inventory.update'],
  implemented: true,

  validate(input) {
    if (!input.supplierId) throw new Error('Supplier ID is required.')
    if (!input.productId) throw new Error('Product ID is required.')
    if (!input.availableFrom) throw new Error('Available from date is required.')
    if (!input.availableUntil) throw new Error('Available until date is required.')
    if (new Date(input.availableUntil).getTime() <= new Date(input.availableFrom).getTime()) {
      throw new Error('Available until date must be strictly after available from date.')
    }
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw new Error('Quantity must be an integer greater than zero.')
    }
    if (!['daily', 'fixed'].includes(input.costKind)) {
      throw new Error('Cost kind must be either daily or fixed.')
    }
    if (input.costPaisa < 0) {
      throw new Error('Cost paisa cannot be negative.')
    }
  },

  async execute(input, ctx: ActionContext) {
    if (!['Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts'].includes(ctx.role)) {
      throw new Error('AUTH:permission_denied|Only management, coordinator, and accounts roles can record partner stock.')
    }

    const clientUuid = input.clientUuid ?? newClientUuid()
    const { data, error } = await supabase.rpc('record_temporary_stock', {
      p_payload: {
        client_uuid: clientUuid,
        supplier_id: input.supplierId,
        product_id: input.productId,
        tracking_mode: input.trackingMode,
        quantity: input.quantity,
        available_from: input.availableFrom,
        available_until: input.availableUntil,
        cost_kind: input.costKind,
        cost_paisa: input.costPaisa,
        notes: input.notes ?? null,
        asset_codes: input.assetCodes ?? [],
        branch_id: input.branchId ?? null,
        warehouse_id: input.warehouseId ?? null,
      },
    })

    if (error) {
      throw new Error(error.message)
    }

    const row = (data as Record<string, unknown>) ?? {}
    return {
      result: {
        id: String(row['id'] ?? ''),
        client_uuid: String(row['client_uuid'] ?? ''),
        status: (row['status'] as 'Active') ?? 'Active',
        quantity: Number(row['quantity'] ?? 0),
        available_from: String(row['available_from'] ?? ''),
        available_until: String(row['available_until'] ?? ''),
      },
      events: [],
    }
  },
}

export const recordTemporaryStock = createAction(recordTemporaryStockConfig)
