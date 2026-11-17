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
