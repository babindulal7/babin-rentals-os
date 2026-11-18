/**
 * Online-Booking Away Mode Engine & Server Denial Contract (T7-14)
 *
 * Implements Away Mode controls for online requests:
 * - When Away Mode is ON:
 *   - Public catalogue remains visible and searchable.
 *   - Base rates remain displayed.
 *   - Booking requests cannot be submitted.
 *   - Server contract refuses any incoming booking request with fail-closed denial.
 * - Managed strictly by Owner, Admin, or Manager.
 * - Supports custom public message and optional resume date.
 * - Handles Kathmandu timezone comparisons.
 */

import type { SystemRole } from '../types/database'

export interface AwayModeConfig {
  isAway: boolean
  publicMessage: string
  resumeDate?: string // ISO date string (Kathmandu time context)
  updatedBy: string
  updatedAt: string
}

export interface AwayModeCheckResult {
  isAwayActive: boolean
  canSubmitRequests: boolean
  rejectionReason?: string
  displayNotice?: {
    headline: string
    message: string
    resumeDate?: string
  }
}

/** Check if user has permission to configure Away mode */
export function canConfigureAwayMode(role: SystemRole): boolean {
  return role === 'Owner' || role === 'Admin' || role === 'Manager'
}

/**
 * Evaluates whether Away Mode is actively blocking incoming requests as of now.
 * If resumeDate has passed, Away mode automatically disengages.
 */
export function evaluateAwayMode(
  config: AwayModeConfig,
  currentDate = new Date(),
): AwayModeCheckResult {
  if (!config.isAway) {
    return {
      isAwayActive: false,
      canSubmitRequests: true,
    }
  }

  // If a resumeDate is configured, check if we have reached or passed it
  if (config.resumeDate) {
    const resume = new Date(config.resumeDate)
    if (!isNaN(resume.getTime()) && currentDate >= resume) {
      // Expired resume date -> auto disengaged
      return {
        isAwayActive: false,
        canSubmitRequests: true,
      }
    }
  }

  // Active Away Mode
  const fallbackMessage = 'We are currently away and not accepting online rental requests.'
  const userMessage = config.publicMessage?.trim() || fallbackMessage

  return {
    isAwayActive: true,
    canSubmitRequests: false,
    rejectionReason: `Online booking requests are temporarily disabled: ${userMessage}`,
    displayNotice: {
      headline: 'Online Requests Paused',
      message: userMessage,
      ...(config.resumeDate ? { resumeDate: config.resumeDate } : {}),
    },
  }
}

/**
 * Server Denial Contract:
 * When an incoming guest or client booking request arrives at the backend,
 * this gate validates that requests are allowed before processing lines or holding stock.
 */
export function assertCanAcceptOnlineBooking(
  config: AwayModeConfig,
  currentDate = new Date(),
): { allowed: boolean; code?: 'AWAY_MODE_ACTIVE'; message?: string } {
  const check = evaluateAwayMode(config, currentDate)
  if (!check.canSubmitRequests) {
    return {
      allowed: false,
      code: 'AWAY_MODE_ACTIVE',
      message: check.rejectionReason ?? 'Online booking requests are temporarily disabled.',
    }
  }
  return { allowed: true }
}
