import { createAction, type ActionConfig, type ActionContext } from '../core'
import { supabase, newClientUuid } from '../../lib/supabase'

export interface CounterSaleLineInput {
  productId: string
  qty: number
  clientUuid?: string
}

export interface CreateCounterSaleInput {
  clientUuid?: string
  branchId?: string
  clientId?: string
  lines: CounterSaleLineInput[]
  notes?: string
}

export interface CreateCounterSaleResult {
  success: true
  bookingId: string
  bookingNo: string
  bookingKind: 'counter_sale'
  stage: string
  lineCount: number
  clientUuid: string
  invoiceId?: string | undefined
  totalAmountPaisa?: number | undefined
  status: 'created' | 'existing'
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const createCounterSaleConfig: ActionConfig<CreateCounterSaleInput, CreateCounterSaleResult> = {
  name: 'CREATE_COUNTER_SALE',
  permissions: ['sales.create'],
  implemented: true,

  validate: (input) => {
    if (!input.lines || !Array.isArray(input.lines) || input.lines.length === 0) {
      throw new Error('At least one consumable item is required for a counter sale.')
    }
    for (const line of input.lines) {
      if (!line.productId || !UUID_RE.test(line.productId)) {
        throw new Error('A valid product UUID is required for each line.')
      }
      if (!Number.isInteger(line.qty) || line.qty <= 0) {
        throw new Error('Quantity must be a positive integer.')
      }
    }
    if (input.clientUuid !== undefined && input.clientUuid.trim() !== '' && !UUID_RE.test(input.clientUuid)) {
      throw new Error('clientUuid must be a valid UUID.')
    }
    if (input.branchId !== undefined && input.branchId.trim() !== '' && !UUID_RE.test(input.branchId)) {
      throw new Error('branchId must be a valid UUID.')
    }
    if (input.clientId !== undefined && input.clientId.trim() !== '' && !UUID_RE.test(input.clientId)) {
      throw new Error('clientId must be a valid UUID.')
    }
  },

  execute: async (input, ctx: ActionContext) => {
    const key = input.clientUuid ?? newClientUuid()

    const { data, error } = await supabase.rpc('create_counter_sale', {
      p_payload: {
        client_uuid: key,
        actor_id: ctx.userId,
        branch_id: input.branchId,
        client_id: input.clientId,
        lines: input.lines.map((l) => ({
          product_id: l.productId,
          qty: l.qty,
          client_uuid: l.clientUuid,
        })),
        notes: input.notes?.trim() || null,
      },
    })

    if (error) {
      throw new Error(`Failed to create counter sale: ${error.message}`)
    }

    const res = data as Record<string, unknown>
    const result: CreateCounterSaleResult = {
      success: true,
      bookingId: String(res['booking_id'] ?? ''),
      bookingNo: String(res['booking_no'] ?? ''),
      bookingKind: 'counter_sale',
      stage: String(res['stage'] ?? 'Booked'),
      lineCount: Number(res['line_count'] ?? input.lines.length),
      clientUuid: String(res['client_uuid'] ?? key),
      invoiceId: res['invoice_id'] ? String(res['invoice_id']) : undefined,
      totalAmountPaisa: res['total_amount_paisa'] != null ? Number(res['total_amount_paisa']) : undefined,
      status: (res['status'] as 'created' | 'existing') ?? 'created',
    }

    return {
      result,
      events: [],
    }
  },
}

export const createCounterSale = createAction(createCounterSaleConfig)
