import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isMonitoringEnabled, captureError, installGlobalErrorHandlers } from '../monitoring'

describe('monitoring.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports disabled when VITE_SENTRY_DSN is unset (default repo state)', () => {
    expect(isMonitoringEnabled()).toBe(false)
  })

  it('captureError is synchronous, safe, and never throws even on arbitrary inputs', () => {
    expect(() => captureError(new Error('Sample error'))).not.toThrow()
    expect(() => captureError('plain string error')).not.toThrow()
    expect(() => captureError(null)).not.toThrow()
    expect(() => captureError(undefined)).not.toThrow()
    expect(() => captureError({ code: 'PGRST116', message: 'Row not found' })).not.toThrow()

    // Circular object in context should not throw
    const circular: Record<string, unknown> = { a: 1 }
    circular.self = circular
    expect(() => captureError(new Error('Crash with circular context'), circular)).not.toThrow()
  })

  it('installGlobalErrorHandlers is safe to invoke and no-ops when monitoring is disabled', () => {
    expect(() => installGlobalErrorHandlers()).not.toThrow()
    expect(() => installGlobalErrorHandlers()).not.toThrow()
  })
})
