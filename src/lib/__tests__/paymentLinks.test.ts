import { describe, it, expect } from 'vitest'
import {
  generatePaymentLink,
  verifyPaymentLink,
  canGeneratePaymentLink,
  type PaymentLinkIntent,
} from '../paymentLinks'

describe('T7-15 Payment Links from Bookings', () => {
  it('enforces RBAC: Coordinator and money roles can generate links; Warehouse cannot', () => {
    expect(canGeneratePaymentLink('Owner')).toBe(true)
    expect(canGeneratePaymentLink('Coordinator')).toBe(true)
    expect(canGeneratePaymentLink('Accounts')).toBe(true)
    expect(canGeneratePaymentLink('Warehouse')).toBe(false)
    expect(canGeneratePaymentLink('Technician')).toBe(false)
    expect(canGeneratePaymentLink('Driver')).toBe(false)

    const denied = generatePaymentLink({
      bookingId: 'BK-100',
      balanceDuePaisa: 500000,
      creatorRole: 'Warehouse',
      creatorUserId: 'user-wh',
    })
    expect(denied.success).toBe(false)
    expect(denied.error).toContain('Permission denied')
  })

  it('generates a 48-hour payment link for legitimate balance', () => {
    const now = new Date('2026-11-18T10:00:00Z')
    const res = generatePaymentLink({
      bookingId: 'BK-100',
      balanceDuePaisa: 500000,
      creatorRole: 'Coordinator',
      creatorUserId: 'user-coord',
      currentTime: now,
    })

    expect(res.success).toBe(true)
    expect(res.linkIntent?.amountPaisa).toBe(500000)
    expect(res.linkIntent?.status).toBe('pending')
    expect(res.publicUrl).toContain('https://book.babinrentals.com/pay/')

    const expiry = new Date(res.linkIntent!.expiresAtUtc)
    const diffHours = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60)
    expect(diffHours).toBe(48)
  })

  it('validates token match and rejects expired links after 48 hours', () => {
    const now = new Date('2026-11-18T10:00:00Z')
    const res = generatePaymentLink({
      bookingId: 'BK-100',
      balanceDuePaisa: 500000,
      creatorRole: 'Coordinator',
      creatorUserId: 'user-coord',
      currentTime: now,
    })
    const intent = res.linkIntent!

    // Token mismatch
    const badToken = verifyPaymentLink(intent, 'bad-token-value', now)
    expect(badToken.valid).toBe(false)
    expect(badToken.code).toBe('INVALID_TOKEN')

    // Valid within 48h
    const withinTime = new Date('2026-11-19T10:00:00Z')
    const ok = verifyPaymentLink(intent, intent.tokenHash, withinTime)
    expect(ok.valid).toBe(true)

    // Expired after 50h
    const expiredTime = new Date('2026-11-20T12:00:00Z')
    const expired = verifyPaymentLink(intent, intent.tokenHash, expiredTime)
    expect(expired.valid).toBe(false)
    expect(expired.code).toBe('EXPIRED')
  })

  it('rejects links already marked paid', () => {
    const paidIntent: PaymentLinkIntent = {
      linkId: 'pl_1',
      bookingId: 'BK-1',
      amountPaisa: 10000,
      tokenHash: 'token_1',
      status: 'paid',
      expiresAtUtc: new Date(Date.now() + 86400000).toISOString(),
      createdBy: 'user',
      createdAtUtc: new Date().toISOString(),
    }
    const res = verifyPaymentLink(paidIntent, 'token_1')
    expect(res.valid).toBe(false)
    expect(res.code).toBe('ALREADY_PAID')
  })
})
