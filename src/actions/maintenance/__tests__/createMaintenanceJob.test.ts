import { describe, it, expect, vi, beforeEach } from 'vitest'

const { idempotentInsertMock, fromMock } = vi.hoisted(() => ({
  idempotentInsertMock: vi.fn(),
  fromMock: vi.fn(),
}))

vi.mock('../../../lib/dataAccess', () => ({
  idempotentInsert: idempotentInsertMock,
  generateClientUuid: () => 'uuid-mnt-1',
}))

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: fromMock,
  },
}))

import { createMaintenanceJob } from '../createMaintenanceJob'

const ctx = { userId: 'usr-tech', role: 'Technician' as const }

describe('createMaintenanceJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('validates description, unit identifier, and non-negative cost', async () => {
    await expect(createMaintenanceJob({ description: '', productUnitId: 'u1' }, ctx)).rejects.toThrow(/Description is required/i)
    await expect(createMaintenanceJob({ description: 'Sensor clean' }, ctx)).rejects.toThrow(/productUnitId or serialNo is required/i)
    await expect(createMaintenanceJob({ description: 'Sensor clean', productUnitId: 'u1', cost: -10 }, ctx)).rejects.toThrow(/Cost cannot be negative/i)
  })

  it('inserts maintenance_records with non-money returningColumns', async () => {
    fromMock.mockReturnValue({
      select: () => ({ count: 4 }),
    })
    idempotentInsertMock.mockResolvedValueOnce({ id: 'mnt-1' })

    const res = await createMaintenanceJob(
      {
        description: 'Sensor calibration',
        productUnitId: 'unit-1',
        recordNo: 'MNT-2026-0005',
        clientUuid: 'uuid-m1',
      },
      ctx,
    )

    expect(res).toEqual({ success: true, id: 'mnt-1', recordNo: 'MNT-2026-0005' })
    expect(idempotentInsertMock).toHaveBeenCalledWith(
      'maintenance_records',
      expect.objectContaining({ record_no: 'MNT-2026-0005', product_unit_id: 'unit-1' }),
      { returningColumns: 'id, record_no, status, product_unit_id' },
    )
  })
})
