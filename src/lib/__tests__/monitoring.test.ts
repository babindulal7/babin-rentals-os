import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  isMonitoringEnabled,
  captureError,
  installGlobalErrorHandlers,
  sanitizeTelemetryString,
  sanitizeContext,
  toReferenceCode,
  formatStaffErrorMessage,
  triggerSyntheticTestError,
} from '../monitoring'

describe('monitoring.ts — Safe Error Monitoring (T1-08)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports disabled when VITE_SENTRY_DSN is unset (default repo state)', () => {
    expect(isMonitoringEnabled()).toBe(false)
  })

  it('captureError returns a stable eventId and referenceCode, and never throws on arbitrary inputs', () => {
    const res1 = captureError(new Error('Sample error'))
    expect(res1).not.toBeNull()
    expect(res1?.eventId).toMatch(/^[a-f0-9]{32}$/)
    expect(res1?.referenceCode).toMatch(/^REF-[A-F0-9]{8}$/)

    expect(() => captureError('plain string error')).not.toThrow()
    expect(() => captureError(null)).not.toThrow()
    expect(() => captureError(undefined)).not.toThrow()
    expect(() => captureError({ code: 'PGRST116', message: 'Row not found' })).not.toThrow()

    // Circular object in context should not throw
    const circular: Record<string, unknown> = { a: 1 }
    circular.self = circular
    expect(() => captureError(new Error('Crash with circular context'), circular)).not.toThrow()
  })

  it('toReferenceCode extracts a consistent 8-character prefix code', () => {
    const eventId = '8e4a2b1c9f3d4e5a6b7c8d9e0f1a2b3c'
    expect(toReferenceCode(eventId)).toBe('REF-8E4A2B1C')
    expect(toReferenceCode('')).toBe('REF-UNKNOWN')
  })

  describe('PII and Financial Telemetry Redaction', () => {
    it('redacts email addresses', () => {
      const raw = 'Failed to send invoice to accountant@productionhouse.np'
      expect(sanitizeTelemetryString(raw)).toBe('Failed to send invoice to [EMAIL_REDACTED]')
    })

    it('redacts Nepali and international mobile phone numbers', () => {
      const raw1 = 'Driver dispatched to +977-9841234567 for pickup'
      expect(sanitizeTelemetryString(raw1)).toBe('Driver dispatched to [PHONE_REDACTED] for pickup')

      const raw2 = 'Receiver phone 9812345678 not answering'
      expect(sanitizeTelemetryString(raw2)).toBe('Receiver phone [PHONE_REDACTED] not answering')
    })

    it('redacts bearer tokens and JWTs', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisSignature'
      const raw = `Authorization failure with Bearer ${jwt}`
      expect(sanitizeTelemetryString(raw)).toBe('Authorization failure with Bearer [TOKEN_REDACTED]')
    })

    it('redacts financial rupee amounts', () => {
      expect(sanitizeTelemetryString('Total invoice balance Rs. 65,000 pending')).toBe('Total invoice balance [MONEY_REDACTED] pending')
      expect(sanitizeTelemetryString('Deposit amount NPR 25000 received')).toBe('Deposit amount [MONEY_REDACTED] received')
      expect(sanitizeTelemetryString('Overdue रू ५००००')).toBe('Overdue [MONEY_REDACTED]')
    })

    it('sanitizes context bags by redacting sensitive keys and sanitizing values', () => {
      const context = {
        bookingId: '00000000-0000-0000-0000-000000000001',
        itemCount: 4,
        client_name: 'Himalayan Films',
        phone: '+977-9800000000',
        email: 'billing@himalayan.test',
        amount: 85000,
        notes: 'Deposit of Rs. 10000 collected',
      }
      const safe = sanitizeContext(context)
      expect(safe?.bookingId).toBe('00000000-0000-0000-0000-000000000001')
      expect(safe?.itemCount).toBe(4)
      expect(safe?.client_name).toBe('[REDACTED]')
      expect(safe?.phone).toBe('[REDACTED]')
      expect(safe?.email).toBe('[REDACTED]')
      expect(safe?.amount).toBe('[REDACTED]')
      expect(safe?.notes).toBe('Deposit of [MONEY_REDACTED] collected')
    })
  })

  it('scrubs nested financial fields and cycle references before telemetry leaves the browser', () => {
    const nested: Record<string, unknown> = {
      status: 'Packed',
      detail: {
        total_paisa: 125000,
        client_name: 'Sensitive Client',
        note: 'Call ram@example.com at 9812345678',
      },
    }
    nested['self'] = nested
    const cleaned = sanitizeContext(nested)
    expect(cleaned?.['self']).toBe('[Circular]')
    expect(cleaned?.['detail']).toEqual({
      total_paisa: '[REDACTED]',
      client_name: '[REDACTED]',
      note: 'Call [EMAIL_REDACTED] at [PHONE_REDACTED]',
    })
  })

  describe('User-Facing Error Message Sanitization (formatStaffErrorMessage)', () => {
    it('masks raw database errors and constraint violations to a safe plain line', () => {
      const dbErrors = [
        new Error('GATE:gate.booking_lines.money_blind_insert: Permission denied'),
        new Error('relation "public.staff_directory_v" does not exist'),
        new Error('new row for relation "bookings" violates check constraint "bookings_booking_no_is_digits"'),
        new Error('PGRST116: JSON object requested, multiple (or no) rows returned'),
        new Error('PostgresError: 42501 permission denied for table invoices'),
      ]

      for (const err of dbErrors) {
        const staffMsg = formatStaffErrorMessage(err, 'REF-TEST1234')
        expect(staffMsg.line).toBe('An unexpected database or server constraint stopped this action.')
        expect(staffMsg.line).not.toContain('GATE:')
        expect(staffMsg.line).not.toContain('violates')
        expect(staffMsg.line).not.toContain('42501')
        expect(staffMsg.referenceCode).toBe('REF-TEST1234')
      }
    })

    it('returns sanitized error messages for regular UI errors without leaking PII', () => {
      const err = new Error('Could not contact client at ram@example.com on phone 9841234567')
      const staffMsg = formatStaffErrorMessage(err, 'REF-ABC12345')
      expect(staffMsg.line).toBe('Could not contact client at [EMAIL_REDACTED] on phone [PHONE_REDACTED]')
      expect(staffMsg.referenceCode).toBe('REF-ABC12345')
    })
  })

  describe('Synthetic Staging Test Event Fixture', () => {
    it('triggerSyntheticTestError produces a safe synthetic event without leaking client data', () => {
      const synthetic = triggerSyntheticTestError()
      expect(synthetic).not.toBeNull()
      expect(synthetic?.eventId).toMatch(/^[a-f0-9]{32}$/)
      expect(synthetic?.referenceCode).toMatch(/^REF-[A-F0-9]{8}$/)
    })
  })

  it('installGlobalErrorHandlers is safe to invoke and no-ops when monitoring is disabled', () => {
    expect(() => installGlobalErrorHandlers()).not.toThrow()
    expect(() => installGlobalErrorHandlers()).not.toThrow()
  })
})
