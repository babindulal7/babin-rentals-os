import { describe, it, expect, vi, beforeEach } from 'vitest'

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}))

vi.mock('../../../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: { rpc: rpcMock },
}))

vi.mock('../../../lib/queries/delivery', () => ({
  createDeliveryRecord: vi.fn(),
}))

import { createDeliveryJob } from '../createDeliveryJob'

const ctx = { userId: 'usr-1', role: 'Coordinator' as const }

describe('createDeliveryJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('validates bookingId, leg, and scheduledAt', async () => {
    await expect(createDeliveryJob({ bookingId: '', leg: 'Outbound', scheduledAt: '2026-12-01T10:00:00Z' }, ctx)).rejects.toThrow(/Valid booking ID/i)
    await expect(createDeliveryJob({ bookingId: 'bk-1', leg: 'Sideways' as never, scheduledAt: '2026-12-01T10:00:00Z' }, ctx)).rejects.toThrow(/Outbound or Return/i)
    await expect(createDeliveryJob({ bookingId: 'bk-1', leg: 'Outbound', scheduledAt: '' }, ctx)).rejects.toThrow(/Scheduled date\/time is required/i)
  })

  it('calls delivery_create_job RPC with trimmed optional fields', async () => {
    rpcMock.mockResolvedValueOnce({ data: 'job-99', error: null })

    const res = await createDeliveryJob(
      {
        bookingId: 'bk-1',
        leg: 'Return',
        scheduledAt: '2026-12-02T14:00:00Z',
        clientUuid: 'uuid-c1',
        vehicle: ' Van ',
        riderName: ' Hari ',
      },
      ctx,
    )

    expect(rpcMock).toHaveBeenCalledWith('delivery_create_job', {
      p_booking_id: 'bk-1',
      p_leg: 'Return',
      p_scheduled_at: '2026-12-02T14:00:00Z',
      p_key: 'uuid-c1',
      p_vehicle: 'Van',
      p_rider_name: 'Hari',
      p_rider_phone: null,
    })
    expect(res.jobId).toBe('job-99')
  })
})
