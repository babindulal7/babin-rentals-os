import { describe, it, expect, vi, beforeEach } from 'vitest'

const { idempotentInsertMock, rpcMock, fromMock } = vi.hoisted(() => ({
  idempotentInsertMock: vi.fn(),
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
}))

vi.mock('../../../lib/dataAccess', () => ({
  idempotentInsert: idempotentInsertMock,
}))

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: rpcMock,
    from: fromMock,
  },
}))

vi.mock('../../../lib/audit', () => ({
  logAuditEvent: vi.fn(async () => ({ ok: true })),
}))

vi.mock('../../../lib/monitoring', () => ({
  captureError: vi.fn(),
}))

import { createStockTransfer } from '../createStockTransfer'

const ctx = { userId: 'usr-1', role: 'Warehouse' as const }

describe('createStockTransfer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects missing idempotency keys, identical source/destination, or missing asset', async () => {
    await expect(
      createStockTransfer(
        {
          clientUuid: '',
          lineClientUuid: 'l1',
          transferType: 'Warehouse Transfer',
          sourceWarehouseId: 'w1',
          destinationWarehouseId: 'w2',
          productId: 'p1',
        },
        ctx,
      ),
    ).rejects.toThrow(/idempotency key/i)

    await expect(
      createStockTransfer(
        {
          clientUuid: 'c1',
          lineClientUuid: 'l1',
          transferType: 'Warehouse Transfer',
          sourceWarehouseId: 'w1',
          destinationWarehouseId: 'w1',
          productId: 'p1',
        },
        ctx,
      ),
    ).rejects.toThrow(/different warehouses/i)
  })

  it('inserts stock_transfers header and stock_transfer_lines row', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'warehouses') {
        return {
          select: () => ({
            eq: (_col: string, val: string) => ({
              maybeSingle: async () => ({
                data: { id: val, branch_id: 'br-1', name: val === 'w1' ? 'Main' : 'Studio B' },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'products') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: 'p1', name: 'Sony FX6' }, error: null }),
            }),
          }),
        }
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }
    })

    rpcMock.mockResolvedValueOnce({ data: 'TRF-2026-0001', error: null })
    idempotentInsertMock
      .mockResolvedValueOnce({ data: { id: 'tr-1', transfer_no: 'TRF-2026-0001' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'trl-1' }, error: null })

    const res = await createStockTransfer(
      {
        clientUuid: 'c1',
        lineClientUuid: 'l1',
        transferType: 'Warehouse Transfer',
        sourceWarehouseId: 'w1',
        destinationWarehouseId: 'w2',
        productId: 'p1',
      },
      ctx,
    )

    expect(res.status).toBe('Pending')
    expect(res.transferId).toBe('tr-1')
    expect(res.transferNo).toBe('TRF-2026-0001')
    expect(res.productName).toBe('Sony FX6')
    expect(idempotentInsertMock).toHaveBeenCalledTimes(2)
  })
})
