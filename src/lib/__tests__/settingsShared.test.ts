// @vitest-environment jsdom
/**
 * G1 (RULING 2026-10-07) — shared settings. Two "devices" are two cache states
 * over the same stored rows: what the database holds wins over what this browser
 * once saved, and the day cut resolves location → org → default.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  readSettings,
  writeSettings,
  applyRemoteSettings,
  clearRemoteSettings,
  remoteSettingsLoaded,
  SETTINGS_DEFAULTS,
} from '../settingsStore'

beforeEach(() => {
  window.localStorage.clear()
  clearRemoteSettings()
})
afterEach(() => clearRemoteSettings())

describe('settingsStore — shared (database) values', () => {
  it('without shared settings it behaves as before (localStorage)', () => {
    writeSettings({ vatRatePercent: 10 })
    expect(remoteSettingsLoaded()).toBe(false)
    expect(readSettings().vatRatePercent).toBe(10)
  })

  it("the database value wins over this device's old local value", () => {
    writeSettings({ vatRatePercent: 10 })
    applyRemoteSettings({ vatRatePercent: 13.5 })
    expect(readSettings().vatRatePercent).toBe(13.5)
  })

  it('a key the database does not hold reads as the coded default, not a stale local value', () => {
    writeSettings({ paymentTermsDays: 90 })
    applyRemoteSettings({})
    expect(readSettings().paymentTermsDays).toBe(SETTINGS_DEFAULTS.paymentTermsDays)
  })

  it('device preferences stay on the device', () => {
    writeSettings({ density: 'Compact' })
    applyRemoteSettings({ density: 'Comfortable' })
    expect(readSettings().density).toBe('Compact')
  })

  it('operationalDayStart resolves location, then org, then default', () => {
    expect(readSettings().operationalDayStart).toBe('06:00')
    applyRemoteSettings({ operationalDayStart: '05:00' })
    expect(readSettings().operationalDayStart).toBe('05:00')
    applyRemoteSettings({ operationalDayStart: '05:00' }, { operationalDayStart: '07:30' })
    expect(readSettings().operationalDayStart).toBe('07:30')
  })

  it('no other key can be overridden by a location (R-07-03)', () => {
    applyRemoteSettings({ vatRatePercent: 13 }, { vatRatePercent: 5 })
    expect(readSettings().vatRatePercent).toBe(13)
  })

  it('a shared value that fails validation is dropped, never served', () => {
    applyRemoteSettings({ vatRatePercent: 400, operationalDayStart: '25:99' })
    expect(readSettings().vatRatePercent).toBe(SETTINGS_DEFAULTS.vatRatePercent)
    expect(readSettings().operationalDayStart).toBe('06:00')
  })

  it('subscribers hear when shared settings arrive', async () => {
    const { onSettingsChange } = await import('../settingsStore')
    const cb = vi.fn()
    const off = onSettingsChange(cb)
    applyRemoteSettings({ vatRatePercent: 12 })
    off()
    applyRemoteSettings({ vatRatePercent: 11 })
    expect(cb).toHaveBeenCalledTimes(1)
  })
})
