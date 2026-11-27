import { describe, it, expect, vi, beforeEach } from 'vitest'

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}))

vi.mock('../../../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: { rpc: rpcMock },
}))

vi.mock('../../../lib/queries/delivery', () => ({
  rescheduleDeliveryRecord: vi.fn(),
}))

import { rescheduleDeliveryJob } from '../rescheduleDeliveryJob'

const ctx = { userId: 'usr-1', role: 'Coordinator' as const }

describe('rescheduleDeliveryJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects missing jobId or invalid timestamp', async () => {
    await expect(rescheduleDeliveryJob({ jobId: '', newScheduledAt: '2026-12-03T10:00:00Z' }, ctx)).rejects.toThrow(/Valid delivery job ID/i)
    await expect(rescheduleDeliveryJob({ jobId: 'j1', newScheduledAt: 'not-a-date' }, ctx)).rejects.toThrow(/valid timestamp/i)
  })

  it('calls delivery_reschedule_job RPC and returns updated schedule', async () => {
    rpcMock.mockResolvedValueOnce({ data: 'j1', error: null })

    const res = await rescheduleDeliveryJob(
      { jobId: 'j1', newScheduledAt: '2026-12-03T11:30:00Z', notes: ' Client requested ', requestKey: 'rk-2' },
      ctx,
    )

    expect(rpcMock).toHaveBeenCalledWith('delivery_reschedule_job', {
      p_job_id: 'j1',
      p_new_scheduled_at: '2026-12-03T11:30:00Z',
      p_request_key: 'rk-2',
      p_notes: 'Client requested',
    })
    expect(res).toEqual({ jobId: 'j1', newScheduledAt: '2026-12-03T11:30:00Z' })
  })
})
