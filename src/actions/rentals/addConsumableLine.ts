import { createAction, type ActionConfig, type ActionContext } from '../core'
import { supabase, newClientUuid } from '../../lib/supabase'

export type AddConsumableLineInput = {
  /** Target booking ID. */
  bookingId: string
  /** Product ID of the consumable item. */
  productId: string
  /** Quantity to add (must be positive integer). */
  qty: number
  /** Law 8: Idempotency client UUID. */
  clientUuid?: string
  /** Optional note explaining floor addition or context. */
  lineNote?: string | null
}

export type AddConsumableLineResult = {
  success: true
  lineId: string
  bookingId: string
  productId: string
  productName: string
  qty: number
  unitPrice: number | null
  lineTotal: number | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const addConsumableLineConfig: ActionConfig<AddConsumableLineInput, AddConsumableLineResult> = {
  name: 'ADD_CONSUMABLE_LINE',
  permissions: ['rental.add_consumable'],
  implemented: true,

  validate: (input) => {
    if (!input.bookingId || !UUID_RE.test(input.bookingId)) {
      throw new Error('A valid booking UUID is required. Nothing was added.')
    }
    if (!input.productId || !UUID_RE.test(input.productId)) {
      throw new Error('A valid consumable product UUID is required. Nothing was added.')
    }
    if (!Number.isInteger(input.qty) || input.qty <= 0) {
      throw new Error('Quantity must be a positive whole integer. Nothing was added.')
    }
    if (input.clientUuid !== undefined && input.clientUuid.trim() !== '' && !UUID_RE.test(input.clientUuid)) {
      throw new Error('Client UUID is malformed. Provide a valid UUID or omit it.')
    }
  },

  execute: async (input, ctx: ActionContext) => {
    const key = input.clientUuid ?? newClientUuid()

    const { data, error } = await supabase.rpc('add_consumable_line', {
      p_booking_id: input.bookingId,
      p_product_id: input.productId,
      p_qty: input.qty,
      p_client_uuid: key,
      p_line_note: input.lineNote ? input.lineNote.trim() : null,
    })

    if (error) {
      throw new Error(`Failed to add consumable line: ${error.message}`)
    }

    const rows = Array.isArray(data) ? data : data ? [data] : []
    const first = (rows[0] ?? {}) as Record<string, unknown>

    const result: AddConsumableLineResult = {
      success: true,
      lineId: String(first['line_id'] ?? ''),
      bookingId: String(first['booking_id'] ?? input.bookingId),
      productId: String(first['product_id'] ?? input.productId),
      productName: String(first['product_name'] ?? ''),
      qty: Number(first['qty'] ?? input.qty),
      unitPrice: first['unit_price'] != null ? Number(first['unit_price']) : null,
      lineTotal: first['line_total'] != null ? Number(first['line_total']) : null,
    }

    return {
      result,
      events: [
        {
          type: 'rental.consumable_added',
          payload: {
            bookingId: input.bookingId,
            lineId: result.lineId,
            productId: input.productId,
            qty: input.qty,
            userId: ctx.userId,
          },
        },
      ],
    }
  },
}

export const addConsumableLine = createAction<AddConsumableLineInput, AddConsumableLineResult>(addConsumableLineConfig)
