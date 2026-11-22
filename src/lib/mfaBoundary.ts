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
import { supabase } from './supabase'

export type AuthAssuranceLevel = 'aal1' | 'aal2'

export interface MfaPolicyConfig {
  isMfaEnforced: boolean // Default FALSE (OFF)
  trustedDeviceDurationDays: number // 30 days
}

export const DEFAULT_MFA_POLICY: MfaPolicyConfig = {
  isMfaEnforced: false,
  trustedDeviceDurationDays: 30,
}

const currentMfaPolicy: MfaPolicyConfig = { ...DEFAULT_MFA_POLICY }

export interface StaffMfaOverviewItem {
  user_id: string
  full_name: string
  email: string | null
  primary_role: SystemRole
  is_money_role: boolean
  mfa_status: 'unregistered' | 'unverified' | 'verified'
  verified_at: string | null
  last_used_at: string | null
}

let mockMfaOverview: StaffMfaOverviewItem[] = [
  {
    user_id: '00000000-0000-0000-0000-000000000101',
    full_name: 'Babin Dulal',
    email: 'babin@babinrentals.com',
    primary_role: 'Owner',
    is_money_role: true,
    mfa_status: 'verified',
    verified_at: '2026-11-01T06:00:00Z',
    last_used_at: '2026-11-23T01:00:00Z',
  },
  {
    user_id: '00000000-0000-0000-0000-000000000102',
    full_name: 'Sita Sharma',
    email: 'sita@babinrentals.com',
    primary_role: 'Admin',
    is_money_role: true,
    mfa_status: 'verified',
    verified_at: '2026-11-05T06:00:00Z',
    last_used_at: '2026-11-22T10:00:00Z',
  },
  {
    user_id: '00000000-0000-0000-0000-000000000104',
    full_name: 'Hari Thapa',
    email: 'hari@babinrentals.com',
    primary_role: 'Coordinator',
    is_money_role: true,
    mfa_status: 'unregistered',
    verified_at: null,
    last_used_at: null,
  },
  {
    user_id: '00000000-0000-0000-0000-000000000109',
    full_name: 'Gita Basnet',
    email: 'gita@babinrentals.com',
    primary_role: 'Accounts',
    is_money_role: true,
    mfa_status: 'unregistered',
    verified_at: null,
    last_used_at: null,
  },
  {
    user_id: '00000000-0000-0000-0000-000000000103',
    full_name: 'Ram Bahadur',
    email: null,
    primary_role: 'Warehouse',
    is_money_role: false,
    mfa_status: 'unregistered',
    verified_at: null,
    last_used_at: null,
  },
]

export const MONEY_ROLES: SystemRole[] = [
  'Owner',
  'Admin',
  'Manager',
  'Coordinator',
  'Accounts',
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

/** Retrieve staff MFA overview for Settings ▸ Access (Owner, Admin, Manager) */
export async function fetchStaffMfaOverview(): Promise<StaffMfaOverviewItem[]> {
  const isMock = import.meta.env.VITE_DATA_SOURCE === 'mock' || !supabase
  if (isMock) {
    return [...mockMfaOverview]
  }

  const { data, error } = await supabase.rpc('get_staff_mfa_overview')
  if (error) {
    throw new Error(error.message.replace(/^GATE:[^|]*\|/, ''))
  }
  return (data as StaffMfaOverviewItem[]) || []
}

/** Check if two-step auth enforcement is currently armed */
export async function fetchTwoStepAuthEnforcement(): Promise<boolean> {
  const isMock = import.meta.env.VITE_DATA_SOURCE === 'mock' || !supabase
  if (isMock) {
    return currentMfaPolicy.isMfaEnforced
  }

  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'twoStepAuthRequired')
    .eq('scope', 'org')
    .maybeSingle()

  if (error) {
    return false
  }
  return Boolean(data?.value)
}

/** Toggle two-step authentication enforcement (Owner only) */
export async function setTwoStepAuthEnforcement(enabled: boolean): Promise<boolean> {
  const isMock = import.meta.env.VITE_DATA_SOURCE === 'mock' || !supabase
  if (isMock) {
    currentMfaPolicy.isMfaEnforced = enabled
    return enabled
  }

  const { data, error } = await supabase.rpc('set_two_step_auth_enforcement', { p_enabled: enabled })
  if (error) {
    throw new Error(error.message.replace(/^GATE:[^|]*\|/, ''))
  }
  const result = data as { is_enforced?: boolean }
  return Boolean(result?.is_enforced)
}

/** Reset lost-phone MFA factor for a staff member (Owner or Admin) */
export async function resetStaffMfa(targetUserId: string): Promise<boolean> {
  const isMock = import.meta.env.VITE_DATA_SOURCE === 'mock' || !supabase
  if (isMock) {
    mockMfaOverview = mockMfaOverview.map((u) =>
      u.user_id === targetUserId
        ? { ...u, mfa_status: 'unregistered', verified_at: null, last_used_at: null }
        : u
    )
    return true
  }

  const { data, error } = await supabase.rpc('reset_staff_mfa', { p_target_user_id: targetUserId })
  if (error) {
    throw new Error(error.message.replace(/^GATE:[^|]*\|/, ''))
  }
  const result = data as { success?: boolean }
  return Boolean(result?.success)
}

/** Record MFA enrolment verification for current user */
export async function recordStaffMfaEnrolment(userId?: string): Promise<boolean> {
  const isMock = import.meta.env.VITE_DATA_SOURCE === 'mock' || !supabase
  if (isMock) {
    mockMfaOverview = mockMfaOverview.map((u) =>
      !userId || u.user_id === userId
        ? { ...u, mfa_status: 'verified', verified_at: new Date().toISOString(), last_used_at: new Date().toISOString() }
        : u
    )
    return true
  }

  const { data, error } = await supabase.rpc('record_staff_mfa_enrolment', { p_user_id: userId || null })
  if (error) {
    throw new Error(error.message.replace(/^GATE:[^|]*\|/, ''))
  }
  const result = data as { success?: boolean }
  return Boolean(result?.success)
}
