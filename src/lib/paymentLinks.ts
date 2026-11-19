/**
 * T7-15 payment-link cryptographic model.
 *
 * This module is NOT a payment processor and does not write any database row.
 * A trusted server/RPC must derive user authorization, write the token hash,
 * check real booking balance, and atomically consume intent at settlement.
 * Never use this module as the only authorization/settlement check.
 */
import type { SystemRole } from '../types/database'
import { isMoneyRole } from './mfaBoundary'

export interface PaymentLinkIntent {
  linkId: string
  bookingId: string
  amountPaisa: number
  /** SHA-256 digest only; do not store or log the raw bearer token. */
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
  customDurationHours?: number
  currentTime?: Date
}
export interface VerifyPaymentLinkResult {
  valid: boolean
  code?: 'EXPIRED' | 'ALREADY_PAID' | 'INVALID_TOKEN' | 'ZERO_BALANCE' | 'NOT_PENDING' | 'BACKEND_REQUIRED'
  message?: string
  paymentIntent?: PaymentLinkIntent
}

/** UI visibility only. Must be repeated on backend using authenticated claims. */
export function canGeneratePaymentLink(role: SystemRole): boolean { return isMoneyRole(role) }
const toHex = (data: Uint8Array): string => Array.from(data, b => b.toString(16).padStart(2, '0')).join('')
async function digest(token: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return toHex(new Uint8Array(hash))
}

/**
 * Generate an opaque high-entropy bearer token and hash on the trusted server.
 * Intentionally fails in browsers and without explicit server-authorized context.
 * Do not interpret a returned draft as a persisted, payable payment link.
 */
export async function generatePaymentLink(
  params: GenerateLinkParams,
  trustedServerContext = false,
): Promise<{ success: boolean; error?: string; linkIntent?: PaymentLinkIntent; publicUrl?: string }> {
  if (!trustedServerContext || typeof window !== 'undefined') {
    return { success: false, error: 'BACKEND_REQUIRED: payment links must be issued by an authenticated server.' }
  }
  if (!canGeneratePaymentLink(params.creatorRole) || !params.creatorUserId) {
    return { success: false, error: 'Financial role and authenticated server actor required.' }
  }
  if (!params.bookingId || !Number.isSafeInteger(params.balanceDuePaisa) || params.balanceDuePaisa <= 0) {
    return { success: false, error: 'Positive, current booking balance required.' }
  }
  const hours = params.customDurationHours ?? 48
  if (!Number.isFinite(hours) || hours <= 0 || hours > 48) {
    return { success: false, error: 'Payment link lifetime must be between 0 and 48 hours.' }
  }
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) {
    return { success: false, error: 'Secure random generator unavailable; refusing to issue a token.' }
  }
  const rawToken = toHex(crypto.getRandomValues(new Uint8Array(32)))
  const tokenHash = await digest(rawToken)
  const now = params.currentTime ?? new Date()
  if (!Number.isFinite(now.getTime())) return { success: false, error: 'Invalid timestamp.' }
  const linkId = crypto.randomUUID()
  const intent: PaymentLinkIntent = {
    linkId, bookingId: params.bookingId, amountPaisa: params.balanceDuePaisa,
    tokenHash, status: 'pending', createdBy: params.creatorUserId,
    createdAtUtc: now.toISOString(),
    expiresAtUtc: new Date(now.getTime() + hours * 3600000).toISOString(),
  }
  return {
    success: true, linkIntent: intent,
    // Token must be transferred securely to the intended client only, never logged.
    publicUrl: 'https://book.babinrentals.com/pay/' + encodeURIComponent(linkId) + '?token=' + rawToken,
  }
}

/**
 * Verifies high-entropy token digest and state at a point in time.
 * Server must additionally re-check the current balance and atomically settle
 * pending -> paid with a UNIQUE provider event/idempotency key.
 */
export async function verifyPaymentLink(
  intent: PaymentLinkIntent, presentedToken: string,
  currentTime = new Date(), trustedServerContext = false,
): Promise<VerifyPaymentLinkResult> {
  if (!trustedServerContext || typeof window !== 'undefined') return { valid: false, code: 'BACKEND_REQUIRED' }
  if (!globalThis.crypto?.subtle) return { valid: false, code: 'BACKEND_REQUIRED' }
  if (!presentedToken || await digest(presentedToken) !== intent.tokenHash) return { valid: false, code: 'INVALID_TOKEN' }
  if (intent.status === 'paid') return { valid: false, code: 'ALREADY_PAID' }
  if (intent.status !== 'pending') return { valid: false, code: 'NOT_PENDING' }
  if (!Number.isSafeInteger(intent.amountPaisa) || intent.amountPaisa <= 0) return { valid: false, code: 'ZERO_BALANCE' }
  if (!Number.isFinite(currentTime.getTime()) || !Number.isFinite(Date.parse(intent.expiresAtUtc)) || currentTime.getTime() >= Date.parse(intent.expiresAtUtc)) {
    return { valid: false, code: 'EXPIRED' }
  }
  return { valid: true, paymentIntent: intent }
}
