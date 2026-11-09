import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ActionContext } from '../../core'
import { recordStockCheckScanConfig } from '../recordStockCheckScan'
import { confirmStockCheckMissingConfig } from '../confirmStockCheckMissing'

const db = vi.hoisted(() => {
  const state = {
    items: [
      {
        id: 'item-uuid-1',
        stock_audit_id: 'audit-uuid-1',
        product_unit_id: 'unit-uuid-1',
        expected_state: 'Available',
        outcome: 'Left unverified',
        scanned_state: null as string | null,
        scanned_at: null as string | null,
        scanned_by: null as string | null,
        discrepancy_notes: null as string | null,
      },
      {
        id: 'item-uuid-2',
        stock_audit_id: 'audit-uuid-1',
        product_unit_id: 'unit-uuid-2',
        expected_state: 'Available',
        outcome: 'Confirmed missing',
        scanned_state: null as string | null,
        scanned_at: '2026-11-01T10:00:00Z',
        scanned_by: 'user-1',
        discrepancy_notes: 'Confirmed missing previously',
      },
    ],
    updateCalls: [] as Array<{ table: string; id: string; patch: Record<string, unknown> }>,
  }

  return { state }
})

vi.mock('../../../lib/dataAccess', () => ({
  generateClientUuid: () => 'mock-client-uuid-1234',
  safeUpdate: async (table: string, id: string, patch: Record<string, unknown>) => {
    db.state.updateCalls.push({ table, id, patch })
    const target = db.state.items.find((i) => i.id === id)
    if (target) {
      Object.assign(target, patch)
    }
    return { success: true }
  },
}))

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    }),
  },
}))

vi.mock('../../../lib/queries/stockAudits', () => ({
  findStockAuditItemByCode: async (auditId: string, code: string) => {
    if (auditId === 'audit-uuid-1' && code === 'CAM-001') {
      const match = db.state.items.find((i) => i.id === 'item-uuid-1')
      if (match) {
        return {
          id: match.id,
          stockAuditId: match.stock_audit_id,
          productUnitId: match.product_unit_id,
          expectedState: match.expected_state,
          outcome: match.outcome,
          serialNo: 'CAM-001',
          productName: 'Sony FX6',
        }
      }
    }
    return null
  },
}))

describe('Stock Check Actions (#13 scan verification & #14 confirm missing)', () => {
  const ctx: ActionContext = {
    userId: 'user-operator-1',
    role: 'Warehouse',
    isOnline: true,
  }

  beforeEach(() => {
    db.state.updateCalls = []
    db.state.items[0]!.outcome = 'Left unverified'
    db.state.items[0]!.scanned_at = null
    db.state.items[0]!.scanned_by = null
    db.state.items[1]!.outcome = 'Confirmed missing'
  })

  it('validates input for recordStockCheckScan', () => {
    expect(() =>
      recordStockCheckScanConfig.validate({ auditId: '', code: 'CAM-001' }),
    ).toThrow('auditId is required.')
    expect(() =>
      recordStockCheckScanConfig.validate({ auditId: 'audit-1', code: '' }),
    ).toThrow('code is required.')
  })

  it('persists Found verification when scanned code matches manifest (#13)', async () => {
    const input = {
      auditId: 'audit-uuid-1',
      code: 'CAM-001',
    }

    const { result, events } = await recordStockCheckScanConfig.execute(input, ctx)

    expect(result.success).toBe(true)
    expect(result.match).toBe(true)
    expect(result.outcome).toBe('Found')
    expect(db.state.updateCalls).toHaveLength(1)
    expect(db.state.updateCalls[0]?.table).toBe('stock_audit_items')
    expect(db.state.updateCalls[0]?.id).toBe('item-uuid-1')
    expect(db.state.updateCalls[0]?.patch.outcome).toBe('Found')
    expect(db.state.updateCalls[0]?.patch.scanned_by).toBe('user-operator-1')

    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('inventory.stock_check_scan_recorded')
  })

  it('returns non-matching result without mutating database for unknown code (#13)', async () => {
    const input = {
      auditId: 'audit-uuid-1',
      code: 'UNKNOWN-999',
    }

    const { result, events } = await recordStockCheckScanConfig.execute(input, ctx)

    expect(result.success).toBe(false)
    expect(result.match).toBe(false)
    expect(db.state.updateCalls).toHaveLength(0)
    expect(events).toHaveLength(0)
  })

  it('validates input for confirmStockCheckMissing', () => {
    expect(() =>
      confirmStockCheckMissingConfig.validate({ auditId: '', itemId: 'item-1' }),
    ).toThrow('auditId is required.')
    expect(() =>
      confirmStockCheckMissingConfig.validate({ auditId: 'audit-1', itemId: '' }),
    ).toThrow('itemId is required.')
  })

  it('persists Confirmed missing decision with staff attribution (#14)', async () => {
    const input = {
      auditId: 'audit-uuid-1',
      itemId: 'item-uuid-1',
      notes: 'Shelf inspected, unit physically absent',
    }

    const { result, events } = await confirmStockCheckMissingConfig.execute(input, ctx)

    expect(result.success).toBe(true)
    expect(result.outcome).toBe('Confirmed missing')
    expect(result.reversal).toBe(false)
    expect(db.state.updateCalls).toHaveLength(1)
    expect(db.state.updateCalls[0]?.table).toBe('stock_audit_items')
    expect(db.state.updateCalls[0]?.id).toBe('item-uuid-1')
    expect(db.state.updateCalls[0]?.patch.outcome).toBe('Confirmed missing')
    expect(db.state.updateCalls[0]?.patch.scanned_by).toBe('user-operator-1')
    expect(db.state.updateCalls[0]?.patch.discrepancy_notes).toContain('physically absent')

    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('inventory.stock_check_item_confirmed_missing')
  })

  it('allows audited reversal of confirmed missing status back to Left unverified (#14)', async () => {
    const input = {
      auditId: 'audit-uuid-1',
      itemId: 'item-uuid-2',
      reversal: true,
      notes: 'Unit later found in maintenance bay',
    }

    const { result, events } = await confirmStockCheckMissingConfig.execute(input, ctx)

    expect(result.success).toBe(true)
    expect(result.outcome).toBe('Left unverified')
    expect(result.reversal).toBe(true)
    expect(db.state.updateCalls).toHaveLength(1)
    expect(db.state.updateCalls[0]?.table).toBe('stock_audit_items')
    expect(db.state.updateCalls[0]?.id).toBe('item-uuid-2')
    expect(db.state.updateCalls[0]?.patch.outcome).toBe('Left unverified')
    expect(db.state.updateCalls[0]?.patch.scanned_at).toBeNull()

    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('inventory.stock_check_missing_reversed')
  })
})
