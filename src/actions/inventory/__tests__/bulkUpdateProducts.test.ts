import { describe, it, expect, vi, beforeEach } from 'vitest'
import { bulkUpdateProducts, bulkUpdateProductsConfig } from '../bulkUpdateProducts'
import { supabase } from '../../../lib/supabase'

vi.mock('../../../lib/supabase', () => {
  return {
    IS_MOCK: false,
    supabase: {
      rpc: vi.fn(),
    },
    newClientUuid: () => '99999999-0000-4000-8000-000000000001',
  }
})

describe('bulkUpdateProducts action (T4-12, B32, B33)', () => {
  const mockRpc = vi.mocked(supabase.rpc)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('validates input parameters correctly', () => {
    // Missing clientUuid
    expect(() =>
      bulkUpdateProductsConfig.validate({
        clientUuid: '',
        productIds: ['11111111-0000-4000-8000-000000000001'],
        field: 'prep_time_minutes',
        value: { prep_time_minutes: 15 },
      })
    ).toThrow(/clientUuid is required/)

    // Empty productIds
    expect(() =>
      bulkUpdateProductsConfig.validate({
        clientUuid: '99999999-0000-4000-8000-000000000001',
        productIds: [],
        field: 'prep_time_minutes',
        value: { prep_time_minutes: 15 },
      })
    ).toThrow(/At least one product must be selected/)

    // Missing field
    expect(() =>
      bulkUpdateProductsConfig.validate({
        clientUuid: '99999999-0000-4000-8000-000000000001',
        productIds: ['11111111-0000-4000-8000-000000000001'],
        field: '',
        value: {},
      })
    ).toThrow(/Field to update is required/)
  })

  it('refuses unauthorized roles (Coordinator, Warehouse, Client)', async () => {
    await expect(
      bulkUpdateProducts(
        {
          clientUuid: '99999999-0000-4000-8000-000000000001',
          productIds: ['11111111-0000-4000-8000-000000000001'],
          field: 'prep_time_minutes',
          value: { prep_time_minutes: 15 },
        },
        {
          userId: 'user-coord',
          role: 'Coordinator',
          isOnline: true,
        }
      )
    ).rejects.toThrow(/cannot perform "BULK_UPDATE_PRODUCTS"|Permission denied/)
  })

  it('fails closed when offline', async () => {
    await expect(
      bulkUpdateProducts(
        {
          clientUuid: '99999999-0000-4000-8000-000000000001',
          productIds: ['11111111-0000-4000-8000-000000000001'],
          field: 'prep_time_minutes',
          value: { prep_time_minutes: 15 },
        },
        {
          userId: 'user-mgr',
          role: 'Manager',
          isOnline: false,
        }
      )
    ).rejects.toThrow(/Connect to update products in bulk/)
  })

  it('refuses money fields when money-blind under Law 6', async () => {
    await expect(
      bulkUpdateProducts(
        {
          clientUuid: '99999999-0000-4000-8000-000000000001',
          productIds: ['11111111-0000-4000-8000-000000000001'],
          field: 'daily_rate',
          value: { daily_rate: 5000 },
        },
        {
          userId: 'user-wh',
          role: 'Warehouse',
          isOnline: true,
        }
      )
    ).rejects.toThrow(/cannot perform "BULK_UPDATE_PRODUCTS"|Permission denied/)
  })

  it('refuses rate percentage adjustments for non-Owner roles (Manager/Admin) under B32', async () => {
    await expect(
      bulkUpdateProducts(
        {
          clientUuid: '99999999-0000-4000-8000-000000000001',
          productIds: ['11111111-0000-4000-8000-000000000001'],
          field: 'rates_percentage',
          value: { percentage: 5 },
        },
        {
          userId: 'user-mgr',
          role: 'Manager',
          isOnline: true,
        }
      )
    ).rejects.toThrow(/Only the Owner can adjust product rental rates by percentage/)
  })

  it('allows Owner to update rates by percentage and returns server response', async () => {
    const fakeResponse = {
      batch_id: '99999999-0000-4000-8000-000000000001',
      field: 'rates_percentage',
      total_requested: 2,
      updated_count: 2,
      results: [
        { id: 'p1', success: true, old_value: { daily_rate: 1000 }, new_value: { daily_rate: 1050 } },
        { id: 'p2', success: true, old_value: { daily_rate: 2000 }, new_value: { daily_rate: 2100 } },
      ],
    }

    mockRpc.mockResolvedValueOnce({ data: fakeResponse, error: null } as never)

    const res = await bulkUpdateProducts(
      {
        clientUuid: '99999999-0000-4000-8000-000000000001',
        productIds: ['p1', 'p2'],
        field: 'rates_percentage',
        value: { percentage: 5 },
      },
      {
        userId: 'user-owner',
        role: 'Owner',
        isOnline: true,
      }
    )

    expect(mockRpc).toHaveBeenCalledWith('bulk_update_products', {
      p_product_ids: ['p1', 'p2'],
      p_field: 'rates_percentage',
      p_value: { percentage: 5 },
      p_client_uuid: '99999999-0000-4000-8000-000000000001',
    })

    expect(res.updated_count).toBe(2)
    expect(res.batch_id).toBe('99999999-0000-4000-8000-000000000001')
  })
})
