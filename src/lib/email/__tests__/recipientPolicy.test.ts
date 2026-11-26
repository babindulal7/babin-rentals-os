import { describe, it, expect } from 'vitest'
import {
  isAuthorizedEmailSender,
  resolveBoundRecipientEmail,
} from '../../../../supabase/functions/send-email/recipientPolicy'

describe('Resend server recipient policy', () => {
  it('permits only authorized staff roles', () => {
    for (const role of ['Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts']) {
      expect(isAuthorizedEmailSender(role)).toBe(true)
    }
    for (const role of ['Warehouse', 'Technician', 'Driver', 'Client', 'Accountant', '', null]) {
      expect(isAuthorizedEmailSender(role)).toBe(false)
    }
  })

  it('uses the server-resolved recipient, not a freeform destination', () => {
    expect(resolveBoundRecipientEmail(' client@example.com ', undefined)).toBe('client@example.com')
    expect(resolveBoundRecipientEmail('CLIENT@example.com', 'client@example.com')).toBe('CLIENT@example.com')
  })

  it('refuses redirecting rental details to an unrelated email address', () => {
    expect(() => resolveBoundRecipientEmail('client@example.com', 'attacker@example.com'))
      .toThrow('does not match')
  })

  it('does not fallback to actor email or synthetic recipient', () => {
    for (const serverRecipient of ['', null, undefined, 'invalid']) {
      expect(() => resolveBoundRecipientEmail(serverRecipient, 'operator@example.com'))
        .toThrow('resolved from the server')
    }
  })

  it('rejects malformed caller recipients', () => {
    expect(() => resolveBoundRecipientEmail('client@example.com', 'not-an-email'))
      .toThrow('does not match')
  })
})
