import { describe, it, expect, vi, beforeEach } from 'vitest'

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}))

vi.mock('../../../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: { rpc: rpcMock },
}))

vi.mock('../../../lib/queries/delivery', () => ({
  updateDeliveryStatus: vi.fn(),
}))

import { transitionDeliveryJob } from '../transitionDeliveryJob'

const ctx = { userId: 'usr-drv', role: 'Driver' as const }

describe('transitionDeliveryJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('enforces recipient name on Delivered and 10-char note on Failed', async () => {
    await expect(
      transitionDeliveryJob({ jobId: 'j1', expectedStatus: 'In Transit', nextStatus: 'Delivered', recipient: 'A' }, ctx),
    ).rejects.toThrow(/recipient name/i)

    await expect(
      transitionDeliveryJob({ jobId: 'j1', expectedStatus: 'In Transit', nextStatus: 'Failed', note: 'too short' }, ctx),
    ).rejects.toThrow(/at least 10 characters/i)
  })

  it('calls delivery_transition_job RPC on valid transition', async () => {
    rpcMock.mockResolvedValueOnce({ data: 'j1', error: null })

    const res = await transitionDeliveryJob(
      {
        jobId: 'j1',
        expectedStatus: 'In Transit',
        nextStatus: 'Delivered',
        recipient: '  Babin Dulal  ',
        requestKey: 'rk-3',
      },
      ctx,
    )

    expect(rpcMock).toHaveBeenCalledWith('delivery_transition_job', {
      p_job_id: 'j1',
      p_expected_status: 'In Transit',
      p_next_status: 'Delivered',
      p_request_key: 'rk-3',
      p_recipient: 'Babin Dulal',
      p_note: null,
    })
    expect(res.jobId).toBe('j1')
  })
})
