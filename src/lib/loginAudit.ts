/**
 * Server-Derived Sign-In Audit & New-Device Notification Engine (T1-18)
 *
 * Implements:
 * - Server-derived event processing (never trust client timestamps or IPs).
 * - Role-based read access (Owner/Admin allowed; Manager, Coordinator, Floor denied).
 * - First-seen device deduplicated notification logic.
 * - Sanitization of sensitive data (no tokens or PINs stored).
 */

import type { SystemRole } from '../types/database'
import { supabase, IS_MOCK } from './supabase'

export type SignInEventType =
  | 'successful_signin'
  | 'failed_signin'
  | 'pin_switch'
  | 'new_device_detected'

export interface ServerSignInEvent {
  id: string
  userId: string
  userRole: SystemRole
  eventType: SignInEventType
  ipAddress: string
  userAgent: string
  deviceHash: string
  serverTimestampUtc: string
}

export interface RecentSignInEvent {
  id: string
  user_id: string
  full_name: string
  role: SystemRole
  device_hash: string
  user_agent: string | null
  ip_address: string | null
  kind: 'sign-in' | 'failed' | 'pin_switch' | 'new_device'
  metadata: Record<string, unknown>
  created_at: string
}

export interface DeviceAlertOutcome {
  shouldSendEmail: boolean
  recipientRole?: 'Owner' | 'Admin'
  reason?: string
}

/** Check if viewer role can access sign-in audit history */
export function canViewSignInHistory(viewerRole: SystemRole): boolean {
  return viewerRole === 'Owner' || viewerRole === 'Admin'
}

/**
 * Fetch recent sign-in history via get_recent_sign_in_events RPC (B22).
 * Restricted to Owner and Admin.
 */
export async function fetchRecentSignInEvents(limit = 50): Promise<RecentSignInEvent[]> {
  if (IS_MOCK) {
    return [
      {
        id: 'mock-evt-1',
        user_id: '00000000-0000-0000-0000-000000000101',
        full_name: 'Babin Joshi',
        role: 'Owner',
        device_hash: 'dev-macbook-pro-m2',
        user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0 Safari/537.36',
        ip_address: '27.34.20.18',
        kind: 'sign-in',
        metadata: { os: 'macOS', browser: 'Chrome' },
        created_at: new Date().toISOString(),
      },
      {
        id: 'mock-evt-2',
        user_id: '00000000-0000-0000-0000-000000000102',
        full_name: 'Suman Admin',
        role: 'Admin',
        device_hash: 'dev-ipad-counter-01',
        user_agent: 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Safari/604.1',
        ip_address: '27.34.20.19',
        kind: 'new_device',
        metadata: { os: 'iPadOS', browser: 'Mobile Safari' },
        created_at: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: 'mock-evt-3',
        user_id: '00000000-0000-0000-0000-000000000101',
        full_name: 'Babin Joshi',
        role: 'Owner',
        device_hash: 'dev-macbook-pro-m2',
        user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        ip_address: '27.34.20.18',
        kind: 'pin_switch',
        metadata: { reason: 'screen_unlock' },
        created_at: new Date(Date.now() - 7200000).toISOString(),
      },
      {
        id: 'mock-evt-4',
        user_id: '00000000-0000-0000-0000-000000000102',
        full_name: 'Suman Admin',
        role: 'Admin',
        device_hash: 'dev-unknown-external',
        user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        ip_address: '103.10.28.5',
        kind: 'failed',
        metadata: { reason: 'invalid_credentials' },
        created_at: new Date(Date.now() - 86400000).toISOString(),
      },
    ]
  }

  const { data, error } = await supabase.rpc('get_recent_sign_in_events', { p_limit: limit })
  if (error) {
    throw new Error(error.message)
  }
  return (data as RecentSignInEvent[]) || []
}

/**
 * Record a sign-in event via record_sign_in_event RPC (B22 / B23).
 * Evaluates whether an alert should be emitted for new devices on Owner/Admin.
 */
export async function recordSignInEvent(params: {
  deviceHash: string
  userAgent?: string
  ipAddress?: string
  kind?: 'sign-in' | 'failed' | 'pin_switch' | 'new_device'
  metadata?: Record<string, unknown>
}): Promise<{ success: boolean; isNewDevice: boolean; shouldAlert: boolean }> {
  if (IS_MOCK) {
    return { success: true, isNewDevice: false, shouldAlert: false }
  }

  const { data, error } = await supabase.rpc('record_sign_in_event', {
    p_device_hash: params.deviceHash,
    p_user_agent: params.userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'),
    p_ip_address: params.ipAddress ?? '',
    p_kind: params.kind ?? 'sign-in',
    p_metadata: params.metadata ?? {},
  })

  if (error) {
    throw new Error(error.message)
  }

  const res = data as { success: boolean; is_new_device: boolean; should_alert: boolean }
  return {
    success: res.success,
    isNewDevice: res.is_new_device,
    shouldAlert: res.should_alert,
  }
}

/**
 * Evaluates whether a new-device email alert should be emitted.
 * Rules:
 * - Only emit for Owner or Admin.
 * - Exactly one email on first-seen device hash; repeated sign-ins from same device must NOT spam.
 */
export function evaluateNewDeviceAlert(
  userRole: SystemRole,
  deviceHash: string,
  knownDeviceHashesForUser: Set<string>,
): DeviceAlertOutcome {
  if (userRole !== 'Owner' && userRole !== 'Admin') {
    return {
      shouldSendEmail: false,
      reason: 'Device alerts are restricted to Owner and Admin accounts.',
    }
  }

  if (knownDeviceHashesForUser.has(deviceHash)) {
    return {
      shouldSendEmail: false,
      reason: 'Device already known and verified.',
    }
  }

  return {
    shouldSendEmail: true,
    recipientRole: userRole,
    reason: 'First-seen device detected for high-privilege account.',
  }
}
