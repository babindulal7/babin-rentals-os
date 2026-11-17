import { describe, it, expect } from 'vitest'
import {
  evaluateAwayMode,
  assertCanAcceptOnlineBooking,
  canConfigureAwayMode,
  type AwayModeConfig,
} from '../awayMode'

describe('T7-14 Away Mode Engine and Server Denial Contract', () => {
  const baseConfig: AwayModeConfig = {
    isAway: true,
    publicMessage: 'Closed for Tihar festival holidays. Reopening next week!',
    resumeDate: '2026-11-20T06:00:00+05:45',
    updatedBy: 'owner-id',
    updatedAt: '2026-11-17T00:00:00Z',
  }

  it('blocks booking submission while Away mode is active prior to resumeDate', () => {
    const testDate = new Date('2026-11-18T10:00:00+05:45')
    const result = evaluateAwayMode(baseConfig, testDate)

    expect(result.isAwayActive).toBe(true)
    expect(result.canSubmitRequests).toBe(false)
    expect(result.displayNotice?.message).toContain('Tihar festival')

    const serverCheck = assertCanAcceptOnlineBooking(baseConfig, testDate)
    expect(serverCheck.allowed).toBe(false)
    expect(serverCheck.code).toBe('AWAY_MODE_ACTIVE')
  })

  it('automatically disengages Away mode after resumeDate passes', () => {
    const testDateAfter = new Date('2026-11-20T07:00:00+05:45')
    const result = evaluateAwayMode(baseConfig, testDateAfter)

    expect(result.isAwayActive).toBe(false)
    expect(result.canSubmitRequests).toBe(true)

    const serverCheck = assertCanAcceptOnlineBooking(baseConfig, testDateAfter)
    expect(serverCheck.allowed).toBe(true)
  })

  it('allows requests when Away mode is toggled off', () => {
    const offConfig: AwayModeConfig = { ...baseConfig, isAway: false }
    const result = evaluateAwayMode(offConfig, new Date())

    expect(result.isAwayActive).toBe(false)
    expect(result.canSubmitRequests).toBe(true)

    const serverCheck = assertCanAcceptOnlineBooking(offConfig, new Date())
    expect(serverCheck.allowed).toBe(true)
  })

  it('restricts Away mode configuration to Owner, Admin, and Manager', () => {
    expect(canConfigureAwayMode('Owner')).toBe(true)
    expect(canConfigureAwayMode('Admin')).toBe(true)
    expect(canConfigureAwayMode('Manager')).toBe(true)
    expect(canConfigureAwayMode('Coordinator')).toBe(false)
    expect(canConfigureAwayMode('Warehouse')).toBe(false)
    expect(canConfigureAwayMode('Technician')).toBe(false)
    expect(canConfigureAwayMode('Driver')).toBe(false)
  })
})
