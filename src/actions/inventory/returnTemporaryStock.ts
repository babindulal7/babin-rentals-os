import { createAction, type ActionConfig, type ActionContext } from '../core'
import { supabase } from '../../lib/supabase'

export interface ReturnTemporaryStockInput {
  temporaryStockId: string
  notes?: string | undefined
}

export interface ReturnTemporaryStockResult {
  id: string
  status: 'Returned to partner'
  returned_at: string
}

export const returnTemporaryStockConfig: ActionConfig<ReturnTemporaryStockInput, ReturnTemporaryStockResult> = {
  name: 'RETURN_TEMPORARY_STOCK',
  permissions: ['inventory.update'],
  implemented: true,

  validate(input) {
    if (!input.temporaryStockId) throw new Error('Temporary stock ID is required.')
  },

  async execute(input, ctx: ActionContext) {
    if (!['Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician'].includes(ctx.role)) {
      throw new Error('AUTH:permission_denied|Only staff roles can complete partner gear return.')
    }

    const { data, error } = await supabase.rpc('return_temporary_stock', {
      p_payload: {
        temporary_stock_id: input.temporaryStockId,
        notes: input.notes ?? null,
      },
    })

    if (error) {
      throw new Error(error.message)
    }

    const row = (data as Record<string, unknown>) ?? {}
    return {
      result: {
        id: String(row['id'] ?? ''),
        status: (row['status'] as 'Returned to partner') ?? 'Returned to partner',
        returned_at: String(row['returned_at'] ?? ''),
      },
      events: [],
    }
  },
}

export const returnTemporaryStock = createAction(returnTemporaryStockConfig)
