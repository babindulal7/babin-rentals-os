import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../../../lib/supabase'
import { fetchOnlinePaymentProviders, fetchPaymentLinkDetails, initOnlinePayment, verifyOnlinePayment } from '../payApi'

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

  it('never creates an intent in the browser after a failed server initialization', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { success: false, error: 'Forbidden target' },
      error: null,
    } as never)

    await expect(initOnlinePayment({
      clientUuid: 'test-client-uuid',
      bookingRequestId: 'another-customer-request',
      provider: 'fonepay',
    })).rejects.toThrow('Forbidden target')
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('does not synthesize a payment link when the initiation service is unavailable', async () => {
    vi.mocked(supabase.functions.invoke).mockRejectedValue(new Error('Network offline'))

    await expect(initOnlinePayment({
      bookingRequestId: 'request-123',
      provider: 'esewa',
    })).rejects.toThrow('Network offline')
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('preserves the confirmed booking plus owned request as separate authorization inputs', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: {
        success: true, intent_id: 'intent-33', amount_paisa: 450000,
        amount_rupees: '4500.00', provider: 'fonepay', payment_url: 'https://example.invalid',
      },
      error: null,
    } as never)
    await initOnlinePayment({
      clientUuid: 'balance-attempt-1',
      bookingId: 'confirmed-booking-22',
      bookingRequestId: 'owned-request-11',
      provider: 'fonepay',
    })
    expect(supabase.functions.invoke).toHaveBeenCalledWith('pay-init', {
      body: expect.objectContaining({
        bookingId: 'confirmed-booking-22',
        bookingRequestId: 'owned-request-11',
        clientUuid: 'balance-attempt-1',
      }),
    })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('does not invent enabled providers on failure or expose a sandbox default', async () => {
    vi.mocked(supabase.functions.invoke).mockRejectedValue(new Error('service offline'))
    await expect(fetchOnlinePaymentProviders()).rejects.toThrow('service offline')
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('fails closed when provider discovery returns malformed data', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { success: true, providers: null },
      error: null,
    } as never)
    await expect(fetchOnlinePaymentProviders()).rejects.toThrow(/could not be verified/i)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('never resolves payment-link details through a browser RPC if Edge is down', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: { message: 'server offline' },
    } as never)
    await expect(fetchPaymentLinkDetails('redacted-token')).resolves.toEqual({
      valid: false, reason: 'verification_unavailable',
    })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

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
