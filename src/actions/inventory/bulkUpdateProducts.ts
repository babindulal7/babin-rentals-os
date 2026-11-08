import { createAction, type ActionConfig } from '../core'
import { supabase } from '../../lib/supabase'
import { canViewMoney } from '../../lib/rbac'

export interface BulkUpdateProductsInput {
  productIds: string[]
  field: string
  value: Record<string, unknown>
  clientUuid: string
}

export interface BulkUpdateProductResult {
  id: string
  success: boolean
  error?: string
  old_value?: unknown
  new_value?: unknown
}

export interface BulkUpdateProductsResponse {
  batch_id: string
  field: string
  total_requested: number
  updated_count: number
  results: BulkUpdateProductResult[]
}

const MONEY_FIELDS = [
  'rates_percentage',
  'daily_rate',
  'weekly_rate',
  'monthly_rate',
  'hourly_rate',
  'weekend_rate',
  'deposit_percent',
  'deposit_fixed',
  'purchase_price',
  'replacement_value',
]

export const bulkUpdateProductsConfig: ActionConfig<
  BulkUpdateProductsInput,
  BulkUpdateProductsResponse
> = {
  name: 'BULK_UPDATE_PRODUCTS',
  permissions: ['inventory.update'],
  implemented: true,
  validate(input) {
    if (!input.clientUuid) {
      throw new Error('clientUuid is required for bulk updates.')
    }
    if (!input.productIds || input.productIds.length === 0) {
      throw new Error('At least one product must be selected.')
    }
    if (!input.field) {
      throw new Error('Field to update is required.')
    }
  },
  async execute(input, ctx) {
    const permittedRoles = ['Owner', 'Admin', 'Manager']
    if (!permittedRoles.includes(ctx.role)) {
      throw new Error('Permission denied: bulk updates require Manager, Admin or Owner role.')
    }

    if (ctx.isOnline === false) {
      throw new Error('Connect to update products in bulk. Your changes are still here.')
    }

    if (MONEY_FIELDS.includes(input.field) && !canViewMoney(ctx.role)) {
      throw new Error('Permission denied: Warehouse and money-blind roles cannot modify financial fields.')
    }

    if (input.field === 'rates_percentage' && ctx.role !== 'Owner') {
      throw new Error('Permission denied: Only the Owner can adjust product rental rates by percentage.')
    }

    const { data, error } = await supabase.rpc('bulk_update_products', {
      p_product_ids: input.productIds,
      p_field: input.field,
      p_value: input.value,
      p_client_uuid: input.clientUuid,
    })

    if (error) {
      throw new Error(error.message)
    }

    if (!data || typeof data !== 'object') {
      throw new Error('The bulk update was not confirmed. Retry with your changes intact.')
    }

    return {
      result: data as unknown as BulkUpdateProductsResponse,
      events: [
        {
          type: 'inventory.products_bulk_updated',
          payload: {
            batchId: input.clientUuid,
            field: input.field,
            productCount: input.productIds.length,
          },
        },
      ],
    }
  },
}

export const bulkUpdateProducts = createAction(bulkUpdateProductsConfig)
