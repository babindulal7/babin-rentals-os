import { createAction, type ActionConfig, type ActionContext } from '../core'
import { supabase, newClientUuid } from '../../lib/supabase'

export type CounterSaleLineInput = {
  productId: string
  qty: number
  clientUuid?: string
}

export type CreateCounterSaleInput = {
  clientId: string
  branchId?: string
  notes?: string | null
  lines: CounterSaleLineInput[]
  clientUuid?: string
}

export type CreateCounterSaleResult = {
  success: true
  bookingId: string
  bookingNo: string
  invoiceId: string
  lineCount: number
  isCounterSale: true
  totalAmount: number | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const createCounterSaleConfig: ActionConfig<CreateCounterSaleInput, CreateCounterSaleResult> = {
  name: 'CREATE_COUNTER_SALE',
  permissions: ['rental.create'],
  implemented: true,

  validate: (input) => {
    if (!input.clientId || !UUID_RE.test(input.clientId)) {
      throw new Error('A valid client UUID is required to initiate a counter sale.')
    }
    if (!Array.isArray(input.lines) || input.lines.length === 0) {
      throw new Error('At least one consumable item must be added for a counter sale.')
    }
    for (const line of input.lines) {
      if (!line.productId || !UUID_RE.test(line.productId)) {
        throw new Error('Every item in a counter sale requires a valid product UUID.')
      }
      if (!Number.isInteger(line.qty) || line.qty <= 0) {
        throw new Error('Quantity must be a positive integer.')
      }
    }
  },

  execute: async (input, ctx: ActionContext) => {
    const key = input.clientUuid ?? newClientUuid()

    const payload = {
      client_uuid: key,
      client_id: input.clientId,
      branch_id: input.branchId,
      notes: input.notes?.trim() || null,
      lines: input.lines.map((l) => ({
        product_id: l.productId,
        qty: l.qty,
        client_uuid: l.clientUuid ?? newClientUuid(),
      })),
    }

    const { data, error } = await supabase.rpc('create_counter_sale', {
      p_payload: payload,
    })

    if (error) {
      throw new Error(error.message)
    }

    const res = (data ?? {}) as Record<string, unknown>
    const result: CreateCounterSaleResult = {
      success: true,
      bookingId: String(res['booking_id'] ?? ''),
      bookingNo: String(res['booking_no'] ?? ''),
      invoiceId: String(res['invoice_id'] ?? ''),
      lineCount: Number(res['line_count'] ?? input.lines.length),
      isCounterSale: true,
      totalAmount: res['total_amount'] != null ? Number(res['total_amount']) : null,
    }

    return {
      result,
      events: [
        {
          type: 'rental.counter_sale_created',
          payload: {
            bookingId: result.bookingId,
            bookingNo: result.bookingNo,
            invoiceId: result.invoiceId,
            lineCount: result.lineCount,
            userId: ctx.userId,
          },
        },
      ],
    }
  },
}

export const createCounterSale = createAction(createCounterSaleConfig)
