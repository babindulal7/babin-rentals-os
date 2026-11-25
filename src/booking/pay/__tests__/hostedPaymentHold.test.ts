import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBookingPaymentLink, fetchOnlinePaymentProviders, initOnlinePayment, verifyOnlinePayment } from '../payApi'

const { rpc, invoke } = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }))
vi.mock('../../../lib/supabase', () => ({ supabase: { rpc, functions: { invoke } } }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('hosted payment safety hold', () => {
  it('does not advertise hosted providers or initiate/allocate from a browser session', async () => {
    vi.stubEnv('VITE_DATA_SOURCE', 'supabase')
    await expect(createBookingPaymentLink('booking-1')).rejects.toThrow('temporarily unavailable')
    expect(await fetchOnlinePaymentProviders()).toEqual([])
    await expect(initOnlinePayment({ bookingId: 'booking-1' })).rejects.toThrow('temporarily unavailable')
    await expect(verifyOnlinePayment({ intentId: 'intent-1', providerRef: 'unverified' })).rejects.toThrow('No payment has been recorded')
    expect(rpc).not.toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('retains explicitly local mock checkout without touching the backend', async () => {
    vi.stubEnv('VITE_DATA_SOURCE', 'mock')
    expect((await createBookingPaymentLink('booking-1')).token).toMatch(/^mock-link-/)
    expect((await fetchOnlinePaymentProviders()).length).toBeGreaterThan(0)
    expect((await initOnlinePayment({ bookingId: 'booking-1' })).is_sandbox).toBe(true)
    expect((await verifyOnlinePayment({ intentId: 'intent-1', providerRef: 'mock' })).success).toBe(true)
    expect(rpc).not.toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
  })
})
