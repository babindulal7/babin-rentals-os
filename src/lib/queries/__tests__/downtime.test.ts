import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listProductDowntimes, listAssetDowntimes } from '../downtime'
import { supabase } from '../../supabase'

vi.mock('../../supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

describe('downtime queries (T2-21)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('listProductDowntimes queries inventory_reservations for product downtime holds', async () => {
    const mockData = [
      {
        id: 'dt-1',
        asset_id: 'unit-1',
        product_id: 'prod-1',
        qty: 1,
        period: '["2026-11-20 09:00:00+05:45","2026-11-23 18:00:00+05:45")',
        downtime_reason: 'Repair',
        downtime_notes: 'Shutter replacement',
        created_by: 'user-1',
        released_at: null,
        released_reason: null,
        ended_by: null,
        created_at: '2026-11-15T10:00:00Z',
        product_units: { asset_tag: 'CAM-01' },
        products: { name: 'Sony FX3' },
      },
    ]

    const queryBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValueOnce({ data: mockData, error: null }),
    }

    vi.mocked(supabase.from).mockReturnValueOnce(queryBuilder as any)

    const rows = await listProductDowntimes('prod-1')
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.id).toBe('dt-1')
    expect(row.assetTag).toBe('CAM-01')
    expect(row.reason).toBe('Repair')
    expect(row.notes).toBe('Shutter replacement')
    expect(row.releasedAt).toBeNull()
  })

  it('listAssetDowntimes queries inventory_reservations for asset downtime holds', async () => {
    const mockData = [
      {
        id: 'dt-2',
        asset_id: 'unit-2',
        product_id: 'prod-2',
        qty: 1,
        period: '["2026-11-25 09:00:00+05:45","2026-11-28 18:00:00+05:45")',
        downtime_reason: 'Service or calibration',
        downtime_notes: null,
        created_by: 'user-2',
        released_at: null,
        released_reason: null,
        ended_by: null,
        created_at: '2026-11-15T11:00:00Z',
        product_units: { asset_tag: 'LENS-02' },
        products: { name: '24-70mm GM' },
      },
    ]

    const queryBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValueOnce({ data: mockData, error: null }),
    }

    vi.mocked(supabase.from).mockReturnValueOnce(queryBuilder as any)

    const rows = await listAssetDowntimes('unit-2')
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.id).toBe('dt-2')
    expect(row.assetTag).toBe('LENS-02')
    expect(row.reason).toBe('Service or calibration')
  })
})
