import { describe, it, expect, vi, beforeEach } from 'vitest'

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}))

vi.mock('../../../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: { rpc: rpcMock },
}))

import { attachDeliveryProof } from '../attachDeliveryProof'

const ctx = { userId: 'usr-drv', role: 'Driver' as const }

describe('attachDeliveryProof', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('validates jobId, requestKey, and at least one proof artifact', async () => {
    await expect(attachDeliveryProof({ jobId: '', requestKey: 'rk', photoPath: 'a.jpg' }, ctx)).rejects.toThrow(/Job ID is required/i)
    await expect(attachDeliveryProof({ jobId: 'j1', requestKey: '', photoPath: 'a.jpg' }, ctx)).rejects.toThrow(/Request key is required/i)
    await expect(attachDeliveryProof({ jobId: 'j1', requestKey: 'rk' }, ctx)).rejects.toThrow(/At least one proof artifact/i)
  })

  it('calls delivery_attach_proof RPC and surfaces RPC errors', async () => {
    rpcMock.mockResolvedValueOnce({ data: 'j1', error: null })
    const res = await attachDeliveryProof({ jobId: 'j1', requestKey: 'rk-1', photoPath: 'proof/j1.jpg' }, ctx)
    expect(res.jobId).toBe('j1')

    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'storage mismatch' } })
    await expect(
      attachDeliveryProof({ jobId: 'j1', requestKey: 'rk-1', signaturePath: 'sig/j1.png' }, ctx),
    ).rejects.toThrow(/Failed to attach proof: storage mismatch/i)
  })
})
