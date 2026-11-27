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

import { createEquipment } from '../createEquipment'

const ctx = { userId: 'usr-1', role: 'Manager' as const }

describe('createEquipment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects missing name, category, brand, or clientUuid', async () => {
    await expect(
      createEquipment(
        {
          clientUuid: 'u1',
          name: '',
          category: 'Cameras',
          brand: 'Sony',
          tracking: 'Quantity',
          status: 'Active',
          quantity: 1,
        },
        ctx,
      ),
    ).rejects.toThrow(/needs a name/i)

    await expect(
      createEquipment(
        {
          clientUuid: '',
          name: 'Sony FX6',
          category: 'Cameras',
          brand: 'Sony',
          tracking: 'Quantity',
          status: 'Active',
          quantity: 1,
        },
        ctx,
      ),
    ).rejects.toThrow(/idempotency key/i)
  })

  it('enforces inventory.create permission', async () => {
    await expect(
      createEquipment(
        {
          clientUuid: 'u1',
          name: 'Sony FX6',
          category: 'Cameras',
          brand: 'Sony',
          tracking: 'Quantity',
          status: 'Active',
          quantity: 1,
        },
        { userId: 'u-drv', role: 'Driver' },
      ),
    ).rejects.toThrow(/cannot perform/i)
  })

  it('creates a Quantity product with allocated asset code', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'inventory_categories') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: 'cat-1' }, error: null }),
            }),
          }),
        }
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }
    })
    rpcMock.mockResolvedValueOnce({ data: 'EQ000123', error: null })
    idempotentInsertMock.mockResolvedValueOnce({
      data: { id: 'prod-1', asset_code: 'EQ000123' },
      error: null,
    })

    const res = await createEquipment(
      {
        clientUuid: 'uuid-eq-1',
        name: 'SDI Cable',
        category: 'Cables',
        brand: 'Belden',
        tracking: 'Quantity',
        status: 'Active',
        quantity: 10,
      },
      ctx,
    )

    expect(res.status).toBe('Active')
    expect(res.assetCode).toBe('EQ000123')
    expect(res.productId).toBe('prod-1')
    expect(res.unitCount).toBe(0)
    expect(idempotentInsertMock).toHaveBeenCalledWith(
      'products',
      expect.objectContaining({ asset_code: 'EQ000123', name: 'SDI Cable', total_quantity: 10 }),
      { returningColumns: 'id, asset_code' },
    )
  })
})
