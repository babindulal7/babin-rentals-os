import { createAction, type ActionContext, type ActionConfig } from '../core'
import { safeUpdate, generateClientUuid } from '../../lib/dataAccess'
import { supabase } from '../../lib/supabase'
import { findStockAuditItemByCode } from '../../lib/queries/stockAudits'

export type RecordStockCheckScanInput = {
  auditId: string
  code: string
  productUnitId?: string
  clientUuid?: string
}

export type RecordStockCheckScanResult = {
  success: boolean
  match: boolean
  auditId: string
  itemId?: string
  productUnitId?: string
  code: string
  outcome: string
  scannedAt: string
  message?: string
}

export const recordStockCheckScanConfig: ActionConfig<
  RecordStockCheckScanInput,
  RecordStockCheckScanResult
> = {
  name: 'RECORD_STOCK_CHECK_SCAN',
  permissions: ['inventory.audit'],
  implemented: true,

  validate: (input) => {
    if (!input.auditId?.trim()) {
      throw new Error('auditId is required.')
    }
    if (!input.code?.trim()) {
      throw new Error('code is required.')
    }
  },

  execute: async (input, ctx: ActionContext) => {
    const auditId = input.auditId.trim()
    const code = input.code.trim()

    // Resolve item on the audit manifest
    let item = await findStockAuditItemByCode(auditId, code)

    if (!item && input.productUnitId) {
      const { data } = await supabase
        .from('stock_audit_items')
        .select('id, stock_audit_id, product_unit_id, outcome, expected_state')
        .eq('stock_audit_id', auditId)
        .eq('product_unit_id', input.productUnitId)
        .maybeSingle()

      if (data) {
        item = {
          id: data.id,
          stockAuditId: data.stock_audit_id,
          productUnitId: data.product_unit_id,
          outcome: data.outcome,
          expectedState: data.expected_state,
        } as never
      }
    }

    if (!item) {
      return {
        result: {
          success: false,
          match: false,
          auditId,
          code,
          outcome: 'Left unverified',
          scannedAt: new Date().toISOString(),
          message: `Code "${code}" is not on this audit's manifest.`,
        },
        events: [],
      }
    }

    const now = new Date().toISOString()
    const actionUuid = input.clientUuid || generateClientUuid()

    const patch: Record<string, unknown> = {
      outcome: 'Found',
      scanned_state: item.expectedState || 'Available',
      scanned_at: now,
      scanned_by: ctx.userId,
    }

    await safeUpdate('stock_audit_items' as never, item.id, patch as never, actionUuid, {
      returnRow: false,
    })

    const events = [
      {
        type: 'inventory.stock_check_scan_recorded',
        payload: {
          auditId,
          itemId: item.id,
          productUnitId: item.productUnitId,
          code,
          outcome: 'Found',
          scannedAt: now,
          userId: ctx.userId,
        },
      },
    ]

    return {
      result: {
        success: true,
        match: true,
        auditId,
        itemId: item.id,
        productUnitId: item.productUnitId,
        code,
        outcome: 'Found',
        scannedAt: now,
      },
      events,
    }
  },
}

export const recordStockCheckScan = createAction<
  RecordStockCheckScanInput,
  RecordStockCheckScanResult
>(recordStockCheckScanConfig)
