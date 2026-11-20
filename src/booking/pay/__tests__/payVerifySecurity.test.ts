import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../../../lib/supabase'
import { verifyOnlinePayment } from '../payApi'

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    functions: { invoke: vi.fn() },
    rpc: vi.fn(),
  },
}))

const verifyArgs = {
  intentId: 'fdf8abf7-71a9-479b-bcde-40b3fd2349fa',
  provider: 'khalti' as const,
  providerRef: 'test-ref',
  pidx: 'test-pidx',
}

describe('payment verification is fail-closed (D30)', () => {
  beforeEach(() => vi.resetAllMocks())

  it('never writes a payment from the browser when the Edge verifier rejects', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { success: false, error: 'Provider proof rejected.' },
      error: null,
    } as never)

    await expect(verifyOnlinePayment(verifyArgs)).rejects.toThrow('Provider proof rejected.')
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('does not fall back to a direct allocation RPC on an Edge network error', async () => {
    vi.mocked(supabase.functions.invoke).mockRejectedValue(new Error('Edge unavailable'))

    await expect(verifyOnlinePayment(verifyArgs)).rejects.toThrow('Edge unavailable')
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('does not fall back to a direct allocation RPC when invoke returns an error', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: { message: 'Verification service unavailable' },
    } as never)

    await expect(verifyOnlinePayment(verifyArgs)).rejects.toThrow('Verification service unavailable')
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('accepts only an explicit success response from the server verifier', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: {
        success: true,
        intent_id: verifyArgs.intentId,
        status: 'allocated',
        payment_id: 'payment-123',
      },
      error: null,
    } as never)

    await expect(verifyOnlinePayment(verifyArgs)).resolves.toMatchObject({
      success: true,
      status: 'allocated',
    })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })
})
