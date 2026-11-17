import { describe, it, expect, beforeEach } from 'vitest'
import {
  verifyPublicRequestAbuse,
  resetAbuseProtectionState,
  type VerificationRequest,
} from '../abuseProtection'

describe('T7-09 Public Abuse Protection Boundary', () => {
  beforeEach(() => {
    resetAbuseProtectionState()
  })

  it('rejects requests with missing or empty verification tokens', () => {
    const req: VerificationRequest = {
      ip: '202.70.78.1',
      action: 'guest_booking',
      identifier: 'test@example.com',
    }
    const res = verifyPublicRequestAbuse(req)
    expect(res.allowed).toBe(false)
    expect(res.code).toBe('MISSING_TOKEN')
  })

  it('rejects invalid verification tokens', () => {
    const req: VerificationRequest = {
      ip: '202.70.78.1',
      action: 'guest_booking',
      identifier: 'test@example.com',
      turnstileToken: 'bad_token_123',
    }
    const res = verifyPublicRequestAbuse(req)
    expect(res.allowed).toBe(false)
    expect(res.code).toBe('INVALID_TOKEN')
  })

  it('rejects replayed / reused tokens', () => {
    const req: VerificationRequest = {
      ip: '202.70.78.1',
      action: 'email_otp',
      identifier: 'client1@example.com',
      turnstileToken: 'cf_valid_token_xyz',
    }

    const first = verifyPublicRequestAbuse(req)
    expect(first.allowed).toBe(true)

    // Replay same token
    const second = verifyPublicRequestAbuse(req)
    expect(second.allowed).toBe(false)
    expect(second.code).toBe('TOKEN_REUSED')
  })

  it('enforces email OTP rate limit per target without leaking email existence', () => {
    const email = 'spam_target@domain.com'

    for (let i = 0; i < 3; i++) {
      const res = verifyPublicRequestAbuse({
        ip: `202.70.78.${i + 1}`,
        action: 'email_otp',
        identifier: email,
        turnstileToken: `cf_valid_token_${i}`,
      })
      expect(res.allowed).toBe(true)
    }

    // 4th attempt exceeds max 3 per hour
    const blocked = verifyPublicRequestAbuse({
      ip: '202.70.78.99',
      action: 'email_otp',
      identifier: email,
      turnstileToken: 'cf_valid_token_overflow',
    })
    expect(blocked.allowed).toBe(false)
    expect(blocked.code).toBe('TARGET_RATE_LIMITED')
  })
})
