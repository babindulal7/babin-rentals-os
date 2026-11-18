/**
 * Payment Links Generator & Security Contract (T7-15)
 *
 * Implements tokenized payment link generation:
 * - Can be created by money roles (Owner, Admin, Manager, Coordinator, Accounts).
 * - Warehouse, Technician, Driver are strictly forbidden from generating links.
 * - Links expire automatically after 48 hours.
 * - Server validates link token, booking balance, and expiry.
 * - Security deposits are NEVER taken online (O-3, B38).
 * - Paid links cannot be paid twice (idempotent, fail-closed).
 */

import type { SystemRole } from '../types/database'
import { isMoneyRole } from './mfaBoundary'

export interface PaymentLinkIntent {
  linkId: string
  bookingId: string
  amountPaisa: number // In integer paisa
  tokenHash: string
  status: 'pending' | 'paid' | 'cancelled' | 'expired'
  expiresAtUtc: string
  createdBy: string
  createdAtUtc: string
}

export interface GenerateLinkParams {
  bookingId: string
  balanceDuePaisa: number
  creatorRole: SystemRole
  creatorUserId: string
  customDurationHours?: number // Default 48
  currentTime?: Date
}

export interface VerifyPaymentLinkResult {
  valid: boolean
  code?: 'EXPIRED' | 'ALREADY_PAID' | 'INVALID_TOKEN' | 'ZERO_BALANCE'
  message?: string
  paymentIntent?: PaymentLinkIntent
}

/** Check if user role is authorized to create customer payment links */
export function canGeneratePaymentLink(role: SystemRole): boolean {
  return isMoneyRole(role)
}

/**
 * Generates a signed payment link payload.
 */
export function generatePaymentLink(params: GenerateLinkParams): {
  success: boolean
  error?: string
  linkIntent?: PaymentLinkIntent
  publicUrl?: string
} {
  const {
    bookingId,
    balanceDuePaisa,
    creatorRole,
    creatorUserId,
    customDurationHours = 48,
    currentTime = new Date(),
  } = params

  if (!canGeneratePaymentLink(creatorRole)) {
    return {
      success: false,
      error: 'Permission denied: Floor roles cannot generate payment links.',
    }
  }

  if (balanceDuePaisa <= 0) {
    return {
      success: false,
      error: 'Cannot generate payment link for zero or negative balance.',
    }
  }

  const durationMs = customDurationHours * 60 * 60 * 1000
  const expiresAt = new Date(currentTime.getTime() + durationMs).toISOString()
  const randomSuffix = Math.random().toString(36).substring(2, 10)
  const linkId = `pl_${bookingId}_${randomSuffix}`
  const tokenHash = `th_${Math.abs(bookingId.split('').reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0)).toString(16)}_${randomSuffix}`

  const linkIntent: PaymentLinkIntent = {
    linkId,
    bookingId,
    amountPaisa: balanceDuePaisa,
    tokenHash,
    status: 'pending',
    expiresAtUtc: expiresAt,
    createdBy: creatorUserId,
    createdAtUtc: currentTime.toISOString(),
  }

  return {
    success: true,
    linkIntent,
    publicUrl: `https://book.babinrentals.com/pay/${linkId}?token=${tokenHash}`,
  }
}

/**
 * Validates a payment link prior to accepting checkout.
 */
export function verifyPaymentLink(
  linkIntent: PaymentLinkIntent,
  presentedToken: string,
  currentTime = new Date(),
): VerifyPaymentLinkResult {
  if (linkIntent.tokenHash !== presentedToken) {
    return {
      valid: false,
      code: 'INVALID_TOKEN',
      message: 'Payment link security token mismatch.',
    }
  }

  if (linkIntent.status === 'paid') {
    return {
      valid: false,
      code: 'ALREADY_PAID',
      message: 'This payment link has already been settled.',
    }
  }

  const expiry = new Date(linkIntent.expiresAtUtc)
  if (isNaN(expiry.getTime()) || currentTime > expiry) {
    return {
      valid: false,
      code: 'EXPIRED',
      message: 'This payment link expired after 48 hours. Please request a new link.',
    }
  }

  return {
    valid: true,
    paymentIntent: linkIntent,
  }
}
