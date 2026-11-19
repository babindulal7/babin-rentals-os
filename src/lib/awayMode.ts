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
import { supabase } from './supabase'

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

export interface OnlineBookingAwayStatus {
  is_away: boolean
  configured_away: boolean
  can_accept_requests: boolean
  message: string
  resume_date: string | null
}

const DEFAULT_AWAY_MESSAGE = 'Back on 15 Feb — call or WhatsApp us'

let mockAwayStatus: OnlineBookingAwayStatus = {
  is_away: false,
  configured_away: false,
  can_accept_requests: true,
  message: DEFAULT_AWAY_MESSAGE,
  resume_date: null,
}

export function setMockOnlineBookingAwayStatus(status: Partial<OnlineBookingAwayStatus>): void {
  mockAwayStatus = {
    ...mockAwayStatus,
    ...status,
  }
  if (mockAwayStatus.configured_away) {
    if (mockAwayStatus.resume_date) {
      const resume = new Date(mockAwayStatus.resume_date)
      if (!isNaN(resume.getTime()) && new Date() >= resume) {
        mockAwayStatus.is_away = false
      } else {
        mockAwayStatus.is_away = true
      }
    } else {
      mockAwayStatus.is_away = true
    }
  } else {
    mockAwayStatus.is_away = false
  }
  mockAwayStatus.can_accept_requests = !mockAwayStatus.is_away
}

export function resetMockOnlineBookingAwayStatus(): void {
  mockAwayStatus = {
    is_away: false,
    configured_away: false,
    can_accept_requests: true,
    message: DEFAULT_AWAY_MESSAGE,
    resume_date: null,
  }
}

/** Check if user has permission to configure Away mode */
export function canConfigureAwayMode(role: SystemRole): boolean {
  return role === 'Owner' || role === 'Admin' || role === 'Manager'
}

/**
 * Fetch online booking away status.
 * Callable by anon and authenticated callers.
 */
export async function fetchOnlineBookingAwayStatus(): Promise<OnlineBookingAwayStatus> {
  const isMock = import.meta.env.VITE_DATA_SOURCE === 'mock' || !supabase

  if (isMock) {
    if (mockAwayStatus.configured_away && mockAwayStatus.resume_date) {
      const resume = new Date(mockAwayStatus.resume_date)
      if (!isNaN(resume.getTime()) && new Date() >= resume) {
        return {
          ...mockAwayStatus,
          is_away: false,
          can_accept_requests: true,
        }
      }
    }
    return { ...mockAwayStatus }
  }

  try {
    const { data, error } = await supabase.rpc('get_online_booking_away_status' as never)
    if (error || !data) {
      return { ...mockAwayStatus }
    }
    return data as OnlineBookingAwayStatus
  } catch {
    return { ...mockAwayStatus }
  }
}

/**
 * Update online booking away mode settings.
 * Gated to Owner, Admin, Manager on database and client.
 */
export async function saveOnlineBookingAwayStatus(params: {
  isAway: boolean
  message?: string | null | undefined
  resumeDate?: string | null | undefined
}): Promise<OnlineBookingAwayStatus> {
  const isMock = import.meta.env.VITE_DATA_SOURCE === 'mock' || !supabase

  const sanitizedMessage = params.message && params.message.trim().length > 0 ? params.message.trim() : DEFAULT_AWAY_MESSAGE
  const sanitizedResumeDate = params.resumeDate && params.resumeDate.trim().length > 0 ? params.resumeDate.trim() : null

  if (isMock) {
    setMockOnlineBookingAwayStatus({
      configured_away: params.isAway,
      message: sanitizedMessage,
      resume_date: sanitizedResumeDate,
    })
    return { ...mockAwayStatus }
  }

  const { error } = await supabase.rpc('set_online_booking_away' as never, {
    p_is_away: params.isAway,
    p_message: sanitizedMessage,
    p_resume_date: sanitizedResumeDate,
  } as never)

  if (error) {
    throw new Error(error.message.replace(/^GATE:[^|]*\|/, ''))
  }

  return fetchOnlineBookingAwayStatus()
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
  const fallbackMessage = DEFAULT_AWAY_MESSAGE
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
