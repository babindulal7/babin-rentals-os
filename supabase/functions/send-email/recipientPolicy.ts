/**
 * Fail-closed policy for the Resend transactional Edge Function.
 * No caller-supplied email address can redirect a server-built message.
 * This module is deliberately dependency-free for Vitest and Deno.
 */
const SENDER_ROLES = new Set(['Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts'])

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isAuthorizedEmailSender(role: unknown): boolean {
  return typeof role === 'string' && SENDER_ROLES.has(role)
}

export function resolveBoundRecipientEmail(
  serverRecipient: unknown,
  callerRecipient: unknown
): string {
  if (typeof serverRecipient !== 'string' || !EMAIL_RE.test(serverRecipient.trim())) {
    throw new Error('A valid recipient email must be resolved from the server.')
  }

  const resolved = serverRecipient.trim()

  if (callerRecipient !== undefined && callerRecipient !== null) {
    if (
      typeof callerRecipient !== 'string' ||
      !EMAIL_RE.test(callerRecipient.trim()) ||
      callerRecipient.trim().toLowerCase() !== resolved.toLowerCase()
    ) {
      throw new Error('The requested recipient does not match the server-resolved recipient.')
    }
  }

  return resolved
}
