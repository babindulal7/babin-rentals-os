import { describe, it, expect } from 'vitest'
import { captureError, installGlobalErrorHandlers, sanitizeContext } from '../monitoring'

describe('captureError', () => {
  it('returns void and never throws when DSN is unset', () => {
    expect(() => captureError(new Error('Test error'))).not.toThrow()
    expect(() => captureError('A raw string refusal')).not.toThrow()
    expect(() => captureError(null)).not.toThrow()
    expect(() => captureError(undefined)).not.toThrow()
  })

  it('safely handles circular context objects without throwing', () => {
    const circular: Record<string, unknown> = { key: 'value' }
    circular['self'] = circular

    expect(() => captureError(new Error('Circular test'), circular)).not.toThrow()
  })

  it('safely handles Supabase error objects with code and message', () => {
    const pgrstError = {
      code: '23P01',
      message: 'conflicting key value violates exclusion constraint "inventory_reservations_no_double_booking"',
      details: 'Key (unit_id, rental_window)=(...) overlaps.',
      hint: null,
    }
    expect(() => captureError(pgrstError, { table: 'inventory_reservations' })).not.toThrow()
  })
})

describe('sanitizeContext (PII & Money Scrubber)', () => {
  it('returns undefined for undefined or non-object context', () => {
    expect(sanitizeContext(undefined)).toBeUndefined()
  })

  it('redacts sensitive keys including client names, phone, email, and rupee balances', () => {
    const raw = {
      booking_id: 'bk-1234',
      client_name: 'Babin Dulal',
      phone: '9841234567',
      total_paisa: 500000,
      daily_rate: 1500,
      status: 'Active',
    }
    const clean = sanitizeContext(raw)
    expect(clean).toEqual({
      booking_id: 'bk-1234',
      client_name: '[REDACTED]',
      phone: '[REDACTED]',
      total_paisa: '[REDACTED]',
      daily_rate: '[REDACTED]',
      status: 'Active',
    })
  })

  it('redacts inline Nepali phone numbers and emails inside arbitrary text values', () => {
    const raw = {
      note: 'Driver called 9851012345 but client emailed babin@example.com for reschedule',
      unit_code: 'CAM-01',
    }
    const clean = sanitizeContext(raw)
    expect(clean).toEqual({
      note: 'Driver called [REDACTED] but client emailed [REDACTED] for reschedule',
      unit_code: 'CAM-01',
    })
  })

  it('safely scrubs circular nested objects without throwing', () => {
    const circular: Record<string, unknown> = { unit: 'SONY-FX3' }
    circular['self'] = circular

    const clean = sanitizeContext(circular)
    expect(clean).toEqual({
      unit: 'SONY-FX3',
      self: '[Circular]',
    })
  })
})

describe('installGlobalErrorHandlers', () => {
  it('never throws and honors no-op policy when DSN is unset', () => {
    expect(() => installGlobalErrorHandlers()).not.toThrow()
    // Repeated call should safely no-op
    expect(() => installGlobalErrorHandlers()).not.toThrow()
  })
})
