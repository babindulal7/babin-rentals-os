/**
 * Money-Role TOTP/MFA Security Boundary & Enforcement Gate (T1-17)
 *
 * Implements:
 * - AAL1 vs AAL2 session evaluation for money roles.
 * - Enforcement policy gate (OFF by default for safe staged rollout).
 * - Money-blind roles (Warehouse/Technician/Driver) always excluded.
 * - 30-day trusted device expiry checking.
 */

import type { SystemRole } from '../types/database'

export type AuthAssuranceLevel = 'aal1' | 'aal2'

export interface MfaPolicyConfig {
  isMfaEnforced: boolean // Default FALSE (OFF)
  trustedDeviceDurationDays: number // 30 days
}

export const DEFAULT_MFA_POLICY: MfaPolicyConfig = {
  isMfaEnforced: false,
  trustedDeviceDurationDays: 30,
}

export const MONEY_ROLES: SystemRole[] = [
  'Owner',
  'Admin',
  'Manager',
  'Coordinator',
  'Accountant',
]

export interface SessionSecurityContext {
  userId: string
  role: SystemRole
  currentAal: AuthAssuranceLevel
  trustedDeviceUntilUtc?: string
}

export interface MoneyAccessCheckResult {
  allowed: boolean
  code?: 'AAL2_REQUIRED' | 'ROLE_FORBIDDEN'
  message?: string
}

/** Check if role is classified as a money role */
export function isMoneyRole(role: SystemRole): boolean {
  return MONEY_ROLES.includes(role)
}

/**
 * Validates whether the current session is allowed to access money operations.
 */
export function assertMoneyAccess(
  session: SessionSecurityContext,
  policy: MfaPolicyConfig = DEFAULT_MFA_POLICY,
  currentDate = new Date(),
): MoneyAccessCheckResult {
  // 1. Money-blind roles are ALWAYS forbidden from accessing money
  if (!isMoneyRole(session.role)) {
    return {
      allowed: false,
      code: 'ROLE_FORBIDDEN',
      message: 'Role is money-blind and cannot perform financial actions.',
    }
  }

  // 2. If MFA enforcement is OFF, legitimate money roles are allowed at AAL1 or AAL2
  if (!policy.isMfaEnforced) {
    return { allowed: true }
  }

  // 3. If MFA enforcement is ARMED (ON):
  if (session.currentAal === 'aal2') {
    return { allowed: true }
  }

  // 4. Check if session has a valid trusted device lease
  if (session.trustedDeviceUntilUtc) {
    const trustedUntil = new Date(session.trustedDeviceUntilUtc)
    if (!isNaN(trustedUntil.getTime()) && currentDate < trustedUntil) {
      return { allowed: true }
    }
  }

  // Otherwise, fail-closed: AAL2 step-up required
  return {
    allowed: false,
    code: 'AAL2_REQUIRED',
    message: 'MFA verification (AAL2) required to access financial operations.',
  }
}
