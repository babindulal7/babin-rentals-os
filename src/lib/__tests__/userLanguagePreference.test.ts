// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  getUserLanguage,
  setUserLanguage,
  languageCodeOf,
  readSettings,
} from '../settingsStore'
import { applyLanguage, getCurrentLanguage } from '../i18n'

describe('T6-09 · Switch it on — per-user language preference on shared device (iPad)', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.clear()
    }
  })

  it('allows two staff on one shared device (iPad) to each keep their own language', async () => {
    const staffRamId = 'usr-ram-floor-01'
    const staffSarahId = 'usr-sarah-coord-02'

    // 1. Staff Ram chooses Nepali
    setUserLanguage(staffRamId, 'नेपाली')
    expect(getUserLanguage(staffRamId)).toBe('नेपाली')
    expect(languageCodeOf(getUserLanguage(staffRamId))).toBe('ne')
    expect(readSettings(staffRamId).language).toBe('नेपाली')

    // 2. Staff Sarah chooses English on the same device
    setUserLanguage(staffSarahId, 'English')
    expect(getUserLanguage(staffSarahId)).toBe('English')
    expect(languageCodeOf(getUserLanguage(staffSarahId))).toBe('en')
    expect(readSettings(staffSarahId).language).toBe('English')

    // 3. Verify neither user's preference overwrote the other
    expect(getUserLanguage(staffRamId)).toBe('नेपाली')
    expect(getUserLanguage(staffSarahId)).toBe('English')

    // 4. Verify applyLanguage transitions cleanly between the two staff
    await applyLanguage(languageCodeOf(getUserLanguage(staffRamId)))
    expect(getCurrentLanguage()).toBe('ne')

    await applyLanguage(languageCodeOf(getUserLanguage(staffSarahId)))
    expect(getCurrentLanguage()).toBe('en')
  })
})
