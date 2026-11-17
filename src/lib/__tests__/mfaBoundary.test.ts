import { describe, it, expect } from 'vitest'
import {
  assertMoneyAccess,
  isMoneyRole,
  type SessionSecurityContext,
  type MfaPolicyConfig,
} from '../mfaBoundary'

describe('T1-17 Money Role MFA Boundary', () => {
  const armedPolicy: MfaPolicyConfig = {
    isMfaEnforced: true,
    trustedDeviceDurationDays: 30,
  }

  const stagedOffPolicy: MfaPolicyConfig = {
    isMfaEnforced: false,
    trustedDeviceDurationDays: 30,
  }

  it('correctly categorises money vs money-blind roles', () => {
    expect(isMoneyRole('Owner')).toBe(true)
    expect(isMoneyRole('Accountant')).toBe(true)
    expect(isMoneyRole('Warehouse')).toBe(false)
    expect(isMoneyRole('Technician')).toBe(false)
    expect(isMoneyRole('Driver')).toBe(false)
  })

  it('always forbids money-blind roles regardless of AAL or policy state', () => {
    const warehouseSession: SessionSecurityContext = {
      userId: 'user-wh',
      role: 'Warehouse',
      currentAal: 'aal2',
    }
    const res = assertMoneyAccess(warehouseSession, stagedOffPolicy)
    expect(res.allowed).toBe(false)
    expect(res.code).toBe('ROLE_FORBIDDEN')
  })

  it('allows money roles at AAL1 when MFA policy is OFF (staged rollout)', () => {
    const accountantAal1: SessionSecurityContext = {
      userId: 'user-acc',
      role: 'Accountant',
      currentAal: 'aal1',
    }
    const res = assertMoneyAccess(accountantAal1, stagedOffPolicy)
    expect(res.allowed).toBe(true)
  })

  it('requires AAL2 when MFA policy is ARMED and no trusted device exists', () => {
    const accountantAal1: SessionSecurityContext = {
      userId: 'user-acc',
      role: 'Accountant',
      currentAal: 'aal1',
    }
    const res = assertMoneyAccess(accountantAal1, armedPolicy)
    expect(res.allowed).toBe(false)
    expect(res.code).toBe('AAL2_REQUIRED')

    // Same accountant at AAL2 succeeds
    const accountantAal2: SessionSecurityContext = {
      ...accountantAal1,
      currentAal: 'aal2',
    }
    expect(assertMoneyAccess(accountantAal2, armedPolicy).allowed).toBe(true)
  })

  it('allows AAL1 if trusted device lease is still valid', () => {
    const now = new Date('2026-11-18T10:00:00Z')
    const validUntil = new Date('2026-12-10T10:00:00Z').toISOString()

    const sessionWithTrust: SessionSecurityContext = {
      userId: 'user-mgr',
      role: 'Manager',
      currentAal: 'aal1',
      trustedDeviceUntilUtc: validUntil,
    }

    const res = assertMoneyAccess(sessionWithTrust, armedPolicy, now)
    expect(res.allowed).toBe(true)

    // After expiry date -> denied
    const expiredDate = new Date('2026-12-15T10:00:00Z')
    const expiredRes = assertMoneyAccess(sessionWithTrust, armedPolicy, expiredDate)
    expect(expiredRes.allowed).toBe(false)
    expect(expiredRes.code).toBe('AAL2_REQUIRED')
  })
})
