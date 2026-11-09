import { createAction, type ActionContext, type ActionConfig } from '../core'
import { safeUpdate, generateClientUuid } from '../../lib/dataAccess'

export type ConfirmStockCheckMissingInput = {
  auditId: string
  itemId: string
  notes?: string
  reversal?: boolean
  clientUuid?: string
}

export type ConfirmStockCheckMissingResult = {
  success: boolean
  auditId: string
  itemId: string
  outcome: string
  reversal: boolean
  timestamp: string
}

export const confirmStockCheckMissingConfig: ActionConfig<
  ConfirmStockCheckMissingInput,
  ConfirmStockCheckMissingResult
> = {
  name: 'CONFIRM_STOCK_CHECK_MISSING',
  permissions: ['inventory.audit'],
  implemented: true,

  validate: (input) => {
    if (!input.auditId?.trim()) {
      throw new Error('auditId is required.')
    }
    if (!input.itemId?.trim()) {
      throw new Error('itemId is required.')
    }
  },

  execute: async (input, ctx: ActionContext) => {
    const auditId = input.auditId.trim()
    const itemId = input.itemId.trim()
    const isReversal = Boolean(input.reversal)
    const targetOutcome = isReversal ? 'Left unverified' : 'Confirmed missing'
    const now = new Date().toISOString()
    const actionUuid = input.clientUuid || generateClientUuid()

    const patch: Record<string, unknown> = {
      outcome: targetOutcome,
      discrepancy_notes: input.notes?.trim() || (isReversal ? null : 'Confirmed missing by staff during audit'),
      scanned_at: isReversal ? null : now,
      scanned_by: ctx.userId,
    }

    await safeUpdate('stock_audit_items' as never, itemId, patch as never, actionUuid, {
      returnRow: false,
    })

    const events = [
      {
        type: isReversal
          ? 'inventory.stock_check_missing_reversed'
          : 'inventory.stock_check_item_confirmed_missing',
        payload: {
          auditId,
          itemId,
          outcome: targetOutcome,
          reversal: isReversal,
          notes: patch.discrepancy_notes,
          userId: ctx.userId,
          timestamp: now,
        },
      },
    ]

    return {
      result: {
        success: true,
        auditId,
        itemId,
        outcome: targetOutcome,
        reversal: isReversal,
        timestamp: now,
      },
      events,
    }
  },
}

export const confirmStockCheckMissing = createAction<
  ConfirmStockCheckMissingInput,
  ConfirmStockCheckMissingResult
>(confirmStockCheckMissingConfig)
