import { createAction, type ActionConfig, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { newClientUuid, supabase } from '../../lib/supabase'

export type RestockConsumableInput = {
  productId: string
  qty: number
  supplier?: string | null
  /** Cost in rupees (only recorded if actor has money visibility, Law 6). */
  cost?: number | null
  receivedDate?: string | null
  /** Law 8: client UUID for idempotency. */
  clientUuid?: string
}

export type RestockConsumableResult = {
  success: boolean
  id: string
  productId: string
  qty: number
  quantityBefore: number
  quantityAfter: number
  supplier: string | null
  cost: number | null
  receivedDate: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const restockConsumableConfig: ActionConfig<RestockConsumableInput, RestockConsumableResult> = {
  name: 'RESTOCK_CONSUMABLE',
  permissions: ['inventory.restock_consumable'],
  implemented: true,

  validate: (input) => {
    if (!input.productId || !UUID_RE.test(input.productId)) {
      throw new Error('A valid product UUID is required.')
    }
    if (!Number.isSafeInteger(input.qty) || input.qty <= 0) {
      throw new Error('Restock quantity must be a positive whole number.')
    }
    if (input.clientUuid !== undefined && input.clientUuid.trim() !== '' && !UUID_RE.test(input.clientUuid)) {
      throw new Error('Client UUID is malformed. Provide a valid UUID or omit it.')
    }
  },

  execute: async (input, ctx: ActionContext) => {
    const key = input.clientUuid ?? newClientUuid()

    const { data, error } = await supabase.rpc('restock_consumable', {
      p_product_id: input.productId,
      p_qty: input.qty,
      p_supplier: input.supplier ? input.supplier.trim() : null,
      p_cost: input.cost != null && input.cost >= 0 ? input.cost : null,
      p_received_date: input.receivedDate ? input.receivedDate.trim() : null,
      p_client_uuid: key,
    })

    if (error) throw error

    const rows = Array.isArray(data) ? data : data ? [data] : []
    const row = rows[0] as Record<string, unknown> | undefined

    if (!row || !Number.isInteger(row['quantity_before']) || !Number.isInteger(row['quantity_after'])) {
      throw new Error('Restock was not confirmed by the database. Refresh before retrying.')
    }

    const result: RestockConsumableResult = {
      success: true,
      id: String(row['id'] ?? ''),
      productId: String(row['product_id'] ?? input.productId),
      qty: Number(row['qty'] ?? input.qty),
      quantityBefore: Number(row['quantity_before']),
      quantityAfter: Number(row['quantity_after']),
      supplier: row['supplier'] != null ? String(row['supplier']) : null,
      cost: row['cost'] != null ? Number(row['cost']) : null,
      receivedDate: String(row['received_date'] ?? ''),
    }

    return {
      result,
      events: [
        {
          type: EVENT_TYPES.STOCK_ADJUSTED,
          payload: {
            productId: input.productId,
            delta: input.qty,
            reason: `Restock: ${input.qty} units from ${input.supplier || 'unspecified supplier'}`,
            userId: ctx.userId,
          },
        },
      ],
    }
  },
}

export const restockConsumable = createAction<RestockConsumableInput, RestockConsumableResult>(restockConsumableConfig)
