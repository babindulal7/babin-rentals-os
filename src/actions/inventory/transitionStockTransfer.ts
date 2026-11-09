import { createAction, type ActionConfig, type ActionContext } from '../core'
import { safeUpdate, generateClientUuid } from '../../lib/dataAccess'
import { supabase } from '../../lib/supabase'
import { TRANSFER_FLOW, TRANSFER_TERMINAL, type TransferStatus } from '../../data/warehouse'

export type TransitionStockTransferInput = {
  /** Target stock_transfers.id (UUID) or transfer_no */
  transferId: string
  targetStatus: TransferStatus
  cancellationReason?: string
  clientUuid?: string
}

export type TransitionStockTransferResult = {
  success: boolean
  transferId: string
  transferNo: string
  previousStatus: string
  newStatus: string
  timestamp: string
}

export const transitionStockTransferConfig: ActionConfig<
  TransitionStockTransferInput,
  TransitionStockTransferResult
> = {
  name: 'TRANSITION_STOCK_TRANSFER',
  permissions: ['inventory.transfer'],
  implemented: true,

  validate: (input) => {
    if (!input.transferId?.trim()) {
      throw new Error('transferId is required.')
    }
    if (!input.targetStatus) {
      throw new Error('targetStatus is required.')
    }
    if (input.targetStatus === 'Cancelled') {
      const reason = input.cancellationReason?.trim() ?? ''
      if (reason.length < 10) {
        throw new Error(
          'A cancellation reason of at least 10 characters is required to cancel a stock transfer.',
        )
      }
    }
  },

  execute: async (input, ctx: ActionContext) => {
    const rawTarget = input.transferId.trim()
    const targetStatus = input.targetStatus

    // Resolve target transfer from database
    const { data: transfer, error: findError } = await supabase
      .from('stock_transfers')
      .select('id, transfer_no, status, source_warehouse_id, destination_warehouse_id')
      .or(`id.eq.${rawTarget},transfer_no.eq.${rawTarget}`)
      .maybeSingle()

    if (findError) {
      throw new Error(`Failed to find stock transfer: ${findError.message}`)
    }
    if (!transfer) {
      throw new Error(`Stock transfer "${rawTarget}" was not found.`)
    }

    const currentStatus = transfer.status as TransferStatus

    // Same warehouse move is illegal
    if (transfer.source_warehouse_id === transfer.destination_warehouse_id) {
      throw new Error('Source and destination cannot be the same warehouse.')
    }

    // Terminal states cannot be transitioned
    if (TRANSFER_TERMINAL.has(currentStatus)) {
      throw new Error(`Stock transfer is already in terminal state "${currentStatus}" and cannot be changed.`)
    }

    // Legal state progression check
    if (targetStatus !== 'Cancelled') {
      const expectedNext = TRANSFER_FLOW[currentStatus]?.next
      if (expectedNext !== targetStatus) {
        throw new Error(
          `Illegal transfer status transition: "${currentStatus}" cannot transition directly to "${targetStatus}". Next expected status is "${expectedNext ?? 'none'}".`,
        )
      }
    }

    const now = new Date().toISOString()
    const actionUuid = input.clientUuid || generateClientUuid()

    const patch: Record<string, unknown> = {
      status: targetStatus,
      updated_at: now,
      updated_by: ctx.userId,
    }

    if (targetStatus === 'Approved') {
      patch.approved_at = now
      patch.approved_by = ctx.userId
    } else if (targetStatus === 'In Transit') {
      patch.dispatched_at = now
      patch.dispatched_by = ctx.userId
    } else if (targetStatus === 'Received') {
      patch.received_at = now
      patch.received_by = ctx.userId
    } else if (targetStatus === 'Completed') {
      patch.completed_at = now
    } else if (targetStatus === 'Cancelled') {
      patch.cancelled_at = now
      patch.cancelled_by = ctx.userId
      patch.cancellation_reason = input.cancellationReason?.trim()
    }

    await safeUpdate('stock_transfers' as never, transfer.id, patch as never, actionUuid, {
      returnRow: false,
    })

    // If Received or Completed: update serialized units destination warehouse if applicable
    if (targetStatus === 'Received' || targetStatus === 'Completed') {
      try {
        const { data: lines } = await supabase
          .from('stock_transfer_lines')
          .select('id, product_unit_id, requested_quantity')
          .eq('transfer_id', transfer.id)

        if (lines && lines.length > 0) {
          for (const line of lines) {
            // Update line received quantity
            await safeUpdate(
              'stock_transfer_lines' as never,
              line.id,
              {
                received_quantity: line.requested_quantity,
                transferred_quantity: line.requested_quantity,
              } as never,
              generateClientUuid(),
              { returnRow: false },
            )

            // Update physical unit warehouse location if unit exists
            if (line.product_unit_id && transfer.destination_warehouse_id) {
              await safeUpdate(
                'product_units' as never,
                line.product_unit_id,
                {
                  warehouse_id: transfer.destination_warehouse_id,
                  updated_at: now,
                } as never,
                generateClientUuid(),
                { returnRow: false },
              )
            }
          }
        }
      } catch {
        // Line updates are best-effort alongside header status transition
      }
    }

    const events = [
      {
        type: 'inventory.stock_transfer_status_updated',
        payload: {
          transferId: transfer.id,
          transferNo: transfer.transfer_no,
          previousStatus: currentStatus,
          newStatus: targetStatus,
          userId: ctx.userId,
          timestamp: now,
        },
      },
    ]

    return {
      result: {
        success: true,
        transferId: transfer.id,
        transferNo: transfer.transfer_no,
        previousStatus: currentStatus,
        newStatus: targetStatus,
        timestamp: now,
      },
      events,
    }
  },
}

export const transitionStockTransfer = createAction<
  TransitionStockTransferInput,
  TransitionStockTransferResult
>(transitionStockTransferConfig)
