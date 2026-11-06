import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ActionContext } from '../../core'
import {
  transitionStockTransferConfig,
  type TransitionStockTransferInput,
} from '../transitionStockTransfer'

const db = vi.hoisted(() => {
  const state = {
    transfers: [
      {
        id: 'tr-uuid-1',
        transfer_no: 'TR-2026-0001',
        status: 'Pending',
        source_warehouse_id: 'wh-source-1',
        destination_warehouse_id: 'wh-dest-2',
      },
      {
        id: 'tr-uuid-2',
        transfer_no: 'TR-2026-0002',
        status: 'In Transit',
        source_warehouse_id: 'wh-source-1',
        destination_warehouse_id: 'wh-dest-2',
      },
      {
        id: 'tr-uuid-3',
        transfer_no: 'TR-2026-0003',
        status: 'Completed',
        source_warehouse_id: 'wh-source-1',
        destination_warehouse_id: 'wh-dest-2',
      },
      {
        id: 'tr-uuid-same-wh',
        transfer_no: 'TR-2026-0004',
        status: 'Pending',
        source_warehouse_id: 'wh-source-1',
        destination_warehouse_id: 'wh-source-1',
      },
    ],
    lines: [
      {
        id: 'line-uuid-1',
        transfer_id: 'tr-uuid-2',
        product_unit_id: 'unit-uuid-10',
        requested_quantity: 1,
        transferred_quantity: 1,
        received_quantity: 0,
      },
    ],
    updateCalls: [] as Array<{ table: string; id: string; patch: Record<string, unknown> }>,
  }

  return { state }
})

vi.mock('../../../lib/dataAccess', () => ({
  generateClientUuid: () => 'mock-transfer-action-uuid',
  safeUpdate: async (table: string, id: string, patch: Record<string, unknown>) => {
    db.state.updateCalls.push({ table, id, patch })
    return { success: true }
  },
}))

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        or: (condition: string) => ({
          maybeSingle: async () => {
            if (table === 'stock_transfers') {
              const match = db.state.transfers.find(
                (t) => condition.includes(t.id) || condition.includes(t.transfer_no),
              )
              return { data: match || null, error: null }
            }
            return { data: null, error: null }
          },
        }),
        eq: () => ({
          then: (resolve: (val: unknown) => void) => {
            if (table === 'stock_transfer_lines') {
              resolve({ data: db.state.lines, error: null })
            } else {
              resolve({ data: [], error: null })
            }
          },
        }),
      }),
    }),
  },
}))

describe('transitionStockTransfer action (#15 Stock Transfer Lifecycle)', () => {
  const ctx: ActionContext = {
    userId: 'user-wh-1',
    role: 'Warehouse',
    isOnline: true,
  }

  beforeEach(() => {
    db.state.updateCalls = []
  })

  it('validates required inputs', () => {
    expect(() =>
      transitionStockTransferConfig.validate({
        transferId: '',
        targetStatus: 'Approved',
      } as TransitionStockTransferInput),
    ).toThrow('transferId is required.')

    expect(() =>
      transitionStockTransferConfig.validate({
        transferId: 'tr-1',
        targetStatus: '' as never,
      }),
    ).toThrow('targetStatus is required.')
  })

  it('enforces cancellation reason of at least 10 characters', () => {
    expect(() =>
      transitionStockTransferConfig.validate({
        transferId: 'tr-1',
        targetStatus: 'Cancelled',
        cancellationReason: 'short',
      }),
    ).toThrow('A cancellation reason of at least 10 characters is required')
  })

  it('refuses transfer when source and destination warehouse are the same', async () => {
    await expect(
      transitionStockTransferConfig.execute(
        { transferId: 'tr-uuid-same-wh', targetStatus: 'Approved' },
        ctx,
      ),
    ).rejects.toThrow('Source and destination cannot be the same warehouse')
  })

  it('refuses transition from a terminal state (Completed or Cancelled)', async () => {
    await expect(
      transitionStockTransferConfig.execute(
        { transferId: 'tr-uuid-3', targetStatus: 'Approved' },
        ctx,
      ),
    ).rejects.toThrow('already in terminal state')
  })

  it('refuses illegal forward leap (e.g. Pending to In Transit)', async () => {
    await expect(
      transitionStockTransferConfig.execute(
        { transferId: 'tr-uuid-1', targetStatus: 'In Transit' },
        ctx,
      ),
    ).rejects.toThrow('Illegal transfer status transition')
  })

  it('successfully transitions Pending to Approved and sets approved metadata', async () => {
    const { result, events } = await transitionStockTransferConfig.execute(
      { transferId: 'tr-uuid-1', targetStatus: 'Approved' },
      ctx,
    )

    expect(result.success).toBe(true)
    expect(result.previousStatus).toBe('Pending')
    expect(result.newStatus).toBe('Approved')

    const update = db.state.updateCalls.find((u) => u.table === 'stock_transfers')
    expect(update).toBeDefined()
    expect(update?.patch.status).toBe('Approved')
    expect(update?.patch.approved_by).toBe('user-wh-1')
    expect(update?.patch.approved_at).toBeDefined()

    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('inventory.stock_transfer_status_updated')
  })

  it('successfully transitions to Received and updates physical unit warehouse location', async () => {
    const { result } = await transitionStockTransferConfig.execute(
      { transferId: 'tr-uuid-2', targetStatus: 'Received' },
      ctx,
    )

    expect(result.success).toBe(true)
    expect(result.newStatus).toBe('Received')

    const transferUpdate = db.state.updateCalls.find((u) => u.table === 'stock_transfers')
    expect(transferUpdate?.patch.status).toBe('Received')
    expect(transferUpdate?.patch.received_by).toBe('user-wh-1')

    const lineUpdate = db.state.updateCalls.find((u) => u.table === 'stock_transfer_lines')
    expect(lineUpdate?.patch.received_quantity).toBe(1)

    const unitUpdate = db.state.updateCalls.find((u) => u.table === 'product_units')
    expect(unitUpdate?.patch.warehouse_id).toBe('wh-dest-2')
  })

  it('successfully cancels transfer with valid cancellation reason', async () => {
    const { result, events } = await transitionStockTransferConfig.execute(
      {
        transferId: 'tr-uuid-1',
        targetStatus: 'Cancelled',
        cancellationReason: 'Booking cancelled by client, gear not needed',
      },
      ctx,
    )

    expect(result.success).toBe(true)
    expect(result.newStatus).toBe('Cancelled')

    const update = db.state.updateCalls.find((u) => u.table === 'stock_transfers')
    expect(update?.patch.status).toBe('Cancelled')
    expect(update?.patch.cancellation_reason).toBe('Booking cancelled by client, gear not needed')
    expect(update?.patch.cancelled_by).toBe('user-wh-1')
    expect(update?.patch.cancelled_at).toBeDefined()

    expect((events[0]?.payload as { newStatus?: string })?.newStatus).toBe('Cancelled')
  })
})
