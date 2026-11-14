import { describe, expect, it, vi } from 'vitest'
import { verifyStaffSwitchCandidate, type StaffSwitchDependencies, type StaffSwitchSession } from '../staffSwitch'

const session: StaffSwitchSession = {
  access_token: 'valid-access-token',
  refresh_token: 'rotated-target-refresh-token',
  user: { id: 'warehouse-user', email: 'warehouse@example.invalid' },
  expires_at: 4_102_444_800,
}

function harness(overrides: Partial<StaffSwitchDependencies> = {}) {
  const events: string[] = []
  const refreshTarget = vi.fn(async (_token: string) => {
    events.push('refresh-target-only')
    return { session, userId: 'warehouse-user' }
  })
  const saveRotatedToken = vi.fn(async (_userId: string, _token: string) => {
    events.push('persist-rotated-token')
  })
  const verifyTargetPin = vi.fn(async (_pin: string) => {
    events.push('verify-pin-on-target')
    return { ok: true }
  })
  const deps: StaffSwitchDependencies = {
    refreshTarget, saveRotatedToken, verifyTargetPin, ...overrides,
  }
  return { deps, events, refreshTarget, saveRotatedToken, verifyTargetPin }
}

describe('T1-15 — verify target without activating main Supabase session', () => {
  it('verifies target ID and PIN, saving the rotated token before PIN evaluation', async () => {
    const h = harness()
    const verdict = await verifyStaffSwitchCandidate('warehouse-user', '1234', 'old-refresh-token', h.deps)
    expect(verdict).toEqual({ status: 'approved', session })
    expect(h.refreshTarget).toHaveBeenCalledWith('old-refresh-token')
    expect(h.saveRotatedToken).toHaveBeenCalledWith('warehouse-user', 'rotated-target-refresh-token')
    expect(h.verifyTargetPin).toHaveBeenCalledWith('1234')
    expect(h.events).toEqual(['refresh-target-only', 'persist-rotated-token', 'verify-pin-on-target'])
  })

  it('refuses a wrong PIN and retains the rotated token for subsequent lockout attempts', async () => {
    const h = harness({ verifyTargetPin: vi.fn(async () => ({ ok: false, reason: 'incorrect' })) })
    expect(await verifyStaffSwitchCandidate('warehouse-user', '4321', 'old-token', h.deps))
      .toEqual({ status: 'denied', reason: 'incorrect', message: 'Incorrect PIN.', lockedUntil: null })
    expect(h.saveRotatedToken).toHaveBeenCalledOnce()
  })

  it('accepts only boolean true, not a truthy string or number', async () => {
    for (const value of ['true', 1, null, undefined]) {
      const h = harness({ verifyTargetPin: vi.fn(async () => ({ ok: value })) })
      const result = await verifyStaffSwitchCandidate('warehouse-user', '1234', 'old-token', h.deps)
      expect(result.status).toBe('denied')
    }
  })

  it('refuses malformed, legacy six-digit and empty PINs without refreshing credentials', async () => {
    for (const pin of ['', '1', '123456', '12ab', '12 4']) {
      const h = harness()
      const result = await verifyStaffSwitchCandidate('warehouse-user', pin, 'old-token', h.deps)
      expect(result.status).toBe('denied')
      expect(h.refreshTarget).not.toHaveBeenCalled()
    }
  })

  it('refuses a valid target token returning the wrong user ID before checking any PIN', async () => {
    const h = harness({ refreshTarget: vi.fn(async () => ({ session, userId: 'owner-user' })) })
    await expect(verifyStaffSwitchCandidate('warehouse-user', '1234', 'old-token', h.deps))
      .rejects.toThrow(/does not match/)
    expect(h.saveRotatedToken).not.toHaveBeenCalled()
    expect(h.verifyTargetPin).not.toHaveBeenCalled()
  })

  it('refuses an invalid access/refresh pair and an expired JWT', async () => {
    for (const badSession of [
      { ...session, access_token: '' },
      { ...session, refresh_token: '' },
      { ...session, expires_at: 100 },
    ]) {
      const h = harness({ refreshTarget: vi.fn(async () => ({ session: badSession, userId: 'warehouse-user' })) })
      await expect(verifyStaffSwitchCandidate('warehouse-user', '1234', 'old-token', h.deps))
        .rejects.toThrow(/does not match/)
      expect(h.verifyTargetPin).not.toHaveBeenCalled()
    }
  })

  it('refuses PIN verification if securely persisting the rotated refresh token fails', async () => {
    const h = harness({ saveRotatedToken: vi.fn(async () => { throw new Error('IndexedDB write failed') }) })
    await expect(verifyStaffSwitchCandidate('warehouse-user', '1234', 'old-token', h.deps))
      .rejects.toThrow(/IndexedDB write failed/)
    expect(h.verifyTargetPin).not.toHaveBeenCalled()
  })

  it('propagates a network failure rather than inventing PIN success', async () => {
    const h = harness({ verifyTargetPin: vi.fn(async () => { throw new Error('network offline') }) })
    await expect(verifyStaffSwitchCandidate('warehouse-user', '1234', 'old-token', h.deps))
      .rejects.toThrow(/network offline/)
  })

  it('preserves server-side five-attempt lockout data', async () => {
    const until = '2026-11-12T23:00:00Z'
    const h = harness({
      verifyTargetPin: vi.fn(async () => ({
        ok: false, reason: 'locked', locked_until: until, message: 'Try again later',
      })),
    })
    const result = await verifyStaffSwitchCandidate('warehouse-user', '4444', 'old-token', h.deps)
    expect(result).toEqual({ status: 'denied', reason: 'locked', message: 'Try again later', lockedUntil: until })
  })
})
