import { describe, it, expect, vi, beforeEach } from 'vitest'

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}))

vi.mock('../../../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: { rpc: rpcMock },
}))

vi.mock('../../../lib/queries/delivery', () => ({
  assignDeliveryRider: vi.fn(),
}))

import { assignDeliveryDriver } from '../assignDeliveryDriver'

const ctx = { userId: 'usr-1', role: 'Coordinator' as const }

describe('assignDeliveryDriver', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects missing jobId or missing both driverId and riderName', async () => {
    await expect(assignDeliveryDriver({ jobId: '', driverId: 'd-1' }, ctx)).rejects.toThrow(/Valid delivery job ID/i)
    await expect(assignDeliveryDriver({ jobId: 'job-1' }, ctx)).rejects.toThrow(/assigned staff driver or a hired rider/i)
  })

  it('enforces delivery.assign permission', async () => {
    await expect(
      assignDeliveryDriver({ jobId: 'job-1', riderName: 'Ram' }, { userId: 'u-c', role: 'Client' }),
    ).rejects.toThrow(/cannot perform/i)
  })

  it('calls delivery_assign_driver RPC and emits DELIVERY_DRIVER_ASSIGNED', async () => {
    rpcMock.mockResolvedValueOnce({ data: 'job-1', error: null })

    const res = await assignDeliveryDriver(
      { jobId: 'job-1', riderName: '  Ram  ', riderPhone: ' 9800000000 ', vehicle: ' Scooter ', requestKey: 'rk-1' },
      ctx,
    )

    expect(rpcMock).toHaveBeenCalledWith('delivery_assign_driver', {
      p_job_id: 'job-1',
      p_driver_id: null,
      p_request_key: 'rk-1',
      p_vehicle: 'Scooter',
      p_rider_name: 'Ram',
      p_rider_phone: '9800000000',
    })
    expect(res.jobId).toBe('job-1')
  })
})
