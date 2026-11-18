import { describe, it, expect } from 'vitest'
import {
  canViewSignInHistory,
  evaluateNewDeviceAlert,
} from '../loginAudit'

describe('T1-18 Server-Derived Sign-In Audit & Alert Engine', () => {
  it('enforces least-privilege access: Owner/Admin allowed, Manager/Coordinator/Floor denied', () => {
    expect(canViewSignInHistory('Owner')).toBe(true)
    expect(canViewSignInHistory('Admin')).toBe(true)
    expect(canViewSignInHistory('Manager')).toBe(false)
    expect(canViewSignInHistory('Coordinator')).toBe(false)
    expect(canViewSignInHistory('Accounts')).toBe(false)
    expect(canViewSignInHistory('Warehouse')).toBe(false)
    expect(canViewSignInHistory('Technician')).toBe(false)
    expect(canViewSignInHistory('Driver')).toBe(false)
  })

  it('triggers an alert on first-seen device for Owner or Admin', () => {
    const knownDevices = new Set(['dev-laptop-01'])

    // First seen device for Owner -> send alert
    const outcome = evaluateNewDeviceAlert('Owner', 'dev-iphone-new', knownDevices)
    expect(outcome.shouldSendEmail).toBe(true)
    expect(outcome.recipientRole).toBe('Owner')

    // Same device again -> do NOT spam
    knownDevices.add('dev-iphone-new')
    const outcomeRepeat = evaluateNewDeviceAlert('Owner', 'dev-iphone-new', knownDevices)
    expect(outcomeRepeat.shouldSendEmail).toBe(false)
    expect(outcomeRepeat.reason).toContain('already known')
  })

  it('does not send new-device email alerts for Coordinator or Manager', () => {
    const knownDevices = new Set<string>()
    const outcomeCoord = evaluateNewDeviceAlert('Coordinator', 'dev-any', knownDevices)
    expect(outcomeCoord.shouldSendEmail).toBe(false)
    expect(outcomeCoord.reason).toContain('restricted to Owner and Admin')
  })
})
