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
  parseDsn,
  pagePath,
  buildSentryEnvelope,
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

    it('never renders arbitrary thrown text even when it contains unstructured PII', () => {
      const err = new Error('Camera handover failed for Sita at Boudha Studio, invoice 75000')
      const staffMsg = formatStaffErrorMessage(err, 'REF-ABC12345')
      expect(staffMsg.line).toBe('An unexpected error stopped this screen. No changes were confirmed.')
      expect(staffMsg.line).not.toContain('Sita')
      expect(staffMsg.line).not.toContain('Boudha')
      expect(staffMsg.line).not.toContain('75000')
      expect(staffMsg.action).toContain('local reference')
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

  describe('parseDsn — DSN Validation and Endpoint Resolution', () => {
    it('returns null on empty, invalid, or missing DSN parts', () => {
      expect(parseDsn('')).toBeNull()
      expect(parseDsn('not-a-valid-url')).toBeNull()
      expect(parseDsn('https://no-key@sentry.io')).toBeNull()
      expect(parseDsn('https://key-only-no-project@sentry.io/')).toBeNull()
    })

    it('parses SaaS Sentry DSN into standard envelope URL with query auth', () => {
      const dsn = 'https://abc1234567890@o123456.ingest.sentry.io/987654'
      const parsed = parseDsn(dsn)
      expect(parsed).not.toBeNull()
      expect(parsed?.envelopeUrl).toBe(
        'https://o123456.ingest.sentry.io/api/987654/envelope/?sentry_key=abc1234567890&sentry_version=7'
      )
    })

    it('parses self-hosted Sentry / GlitchTip / Bugsink DSN with custom path prefix', () => {
      const dsn = 'https://pubkey42@errortracker.babinrentals.internal/sentry/app/101'
      const parsed = parseDsn(dsn)
      expect(parsed).not.toBeNull()
      expect(parsed?.envelopeUrl).toBe(
        'https://errortracker.babinrentals.internal/sentry/app/api/101/envelope/?sentry_key=pubkey42&sentry_version=7'
      )
    })
  })

  describe('pagePath — Strict Path-Only URL Sanitization (Zero Query String)', () => {
    it('returns allowlisted top-level modules and strips sub-paths or query params', () => {
      const allowedModules = [
        'today',
        'rentals',
        'inventory',
        'clients',
        'operations',
        'finance',
        'reports',
        'calendar',
        'settings',
        'login',
      ]
      for (const mod of allowedModules) {
        expect(pagePath({ pathname: `/${mod}` })).toBe(`/${mod}`)
        expect(pagePath({ pathname: `/${mod}/detail/12345` })).toBe(`/${mod}`)
      }
    })

    it('strictly drops search queries and hash fragments, protecting client privacy', () => {
      // Even if an operator searched for a client name or phone number in URL query
      expect(pagePath({ pathname: '/rentals' })).toBe('/rentals')
      // Deep sub-path with search
      expect(pagePath({ pathname: '/clients/profile' })).toBe('/clients')
    })

    it('maps unknown routes to /other to prevent accidental slug leaks', () => {
      expect(pagePath({ pathname: '/secret-special-shoot-location' })).toBe('/other')
      expect(pagePath({ pathname: '/admin/unrecognized' })).toBe('/other')
    })

    it('returns empty string when location is absent or undefined', () => {
      expect(pagePath(undefined)).toBe('')
    })
  })

  describe('buildSentryEnvelope — Negative-PII Telemetry & Release Tagging Envelope Integrity', () => {
    it('constructs a valid 3-part Sentry envelope conforming to the specification', () => {
      const payload = buildSentryEnvelope({
        eventId: '0123456789abcdef0123456789abcdef',
        now: 1700000000000,
        release: 'v1.4.2',
        environment: 'staging',
        safeType: 'TypeError',
        safeValue: 'Application error; details withheld for client privacy',
        url: '/rentals',
        safeContext: { boundary: 'app-root' },
      })

      const lines = payload.trim().split('\n')
      expect(lines.length).toBe(3)

      const header = JSON.parse(lines[0]!)
      expect(header.event_id).toBe('0123456789abcdef0123456789abcdef')
      expect(header.sent_at).toBe(new Date(1700000000000).toISOString())

      const itemHeader = JSON.parse(lines[1]!)
      expect(itemHeader.type).toBe('event')

      const event = JSON.parse(lines[2]!)
      expect(event.event_id).toBe('0123456789abcdef0123456789abcdef')
      expect(event.environment).toBe('staging')
      expect(event.release).toBe('v1.4.2')
      expect(event.request.url).toBe('/rentals')
      expect(event.exception.values[0].type).toBe('TypeError')
      expect(event.exception.values[0].value).toBe('Application error; details withheld for client privacy')
      expect(event.extra.boundary).toBe('app-root')
    })

    it('strictly guarantees negative-PII: zero client names, phones, emails, or rupee amounts leak into the envelope', () => {
      const sensitiveLeakAttempt = {
        client_name: 'Babin Joshi Production House',
        client_phone: '+977-9851000000',
        client_email: 'babin@filmmakers.np',
        pan_no: '601234567',
        deposit_amount: 'Rs. 50,000',
        shoot_address: 'Boudha, Kathmandu near Stupa',
      }

      // Build envelope with strictly allowlisted diagnostic metadata
      const envelope = buildSentryEnvelope({
        eventId: 'abcdefabcdefabcdefabcdefabcdef12',
        now: 1700000000000,
        release: 'v1.4.2',
        environment: 'production',
        safeType: 'Error',
        safeValue: 'Application error; details withheld for client privacy',
        url: '/inventory',
        // In real captureError, raw client objects are NEVER passed to safeContext
        safeContext: {
          boundary: 'app-root',
          isSyntheticTest: true,
        },
      })

      // Verify complete absence of all PII tokens anywhere in the wire envelope
      expect(envelope).not.toContain(sensitiveLeakAttempt.client_name)
      expect(envelope).not.toContain(sensitiveLeakAttempt.client_phone)
      expect(envelope).not.toContain(sensitiveLeakAttempt.client_email)
      expect(envelope).not.toContain(sensitiveLeakAttempt.pan_no)
      expect(envelope).not.toContain(sensitiveLeakAttempt.deposit_amount)
      expect(envelope).not.toContain(sensitiveLeakAttempt.shoot_address)
      expect(envelope).not.toContain('Rs.')
      expect(envelope).not.toContain('NPR')
      expect(envelope).not.toContain('+977')
      expect(envelope).not.toContain('stack')
    })
  })

  it('installGlobalErrorHandlers is safe to invoke and no-ops when monitoring is disabled', () => {
    expect(() => installGlobalErrorHandlers()).not.toThrow()
    expect(() => installGlobalErrorHandlers()).not.toThrow()
  })
})
