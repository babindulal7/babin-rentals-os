import { describe, it, expect } from 'vitest'
import {
  generatePaymentLink, verifyPaymentLink, canGeneratePaymentLink,
} from '../paymentLinks'

describe('T7-15 payment link cryptographic model (backend activation still required)', () => {
  const params = {
    bookingId: 'BK-100', balanceDuePaisa: 500000,
    creatorRole: 'Coordinator' as const, creatorUserId: 'server-actor',
    currentTime: new Date('2026-11-18T10:00:00Z'),
  }

  it('fails closed by default, even when the caller claims a money role', async () => {
    expect(canGeneratePaymentLink('Owner')).toBe(true)
    expect(canGeneratePaymentLink('Warehouse')).toBe(false)
    const result = await generatePaymentLink(params)
    expect(result.success).toBe(false)
    expect(result.error).toContain('BACKEND_REQUIRED')
  })

  it('rejects floor roles and invalid amount in trusted server modeling', async () => {
    expect((await generatePaymentLink({ ...params, creatorRole: 'Warehouse' }, true)).success).toBe(false)
    expect((await generatePaymentLink({ ...params, balanceDuePaisa: 0 }, true)).success).toBe(false)
    expect((await generatePaymentLink({ ...params, balanceDuePaisa: 1.5 }, true)).success).toBe(false)
    expect((await generatePaymentLink({ ...params, customDurationHours: 300 }, true)).success).toBe(false)
  })

  it('uses unpredictable random tokens, stores digest only, and caps lifetime at 48h', async () => {
    const first = await generatePaymentLink(params, true)
    const second = await generatePaymentLink(params, true)
    expect(first.success).toBe(true)
    expect(second.success).toBe(true)
    expect(first.publicUrl).not.toBe(second.publicUrl)
    const bearer = new URL(first.publicUrl!).searchParams.get('token')!
    expect(bearer.length).toBe(64) // 256-bit hex
    expect(first.linkIntent!.tokenHash).not.toBe(bearer)
    expect(first.linkIntent!.tokenHash.length).toBe(64)
    expect(new Date(first.linkIntent!.expiresAtUtc).getTime() - params.currentTime.getTime()).toBe(48 * 3600000)
    expect((await verifyPaymentLink(first.linkIntent!, bearer, params.currentTime)).code).toBe('BACKEND_REQUIRED')
    expect((await verifyPaymentLink(first.linkIntent!, bearer, params.currentTime, true)).valid).toBe(true)
    expect((await verifyPaymentLink(first.linkIntent!, bearer + 'broken', params.currentTime, true)).code).toBe('INVALID_TOKEN')
    expect((await verifyPaymentLink(first.linkIntent!, bearer, new Date('2026-11-20T12:00:00Z'), true)).code).toBe('EXPIRED')
    expect((await verifyPaymentLink({ ...first.linkIntent!, status: 'paid' }, bearer, params.currentTime, true)).code).toBe('ALREADY_PAID')
    expect((await verifyPaymentLink({ ...first.linkIntent!, status: 'cancelled' }, bearer, params.currentTime, true)).code).toBe('NOT_PENDING')
  })
})
