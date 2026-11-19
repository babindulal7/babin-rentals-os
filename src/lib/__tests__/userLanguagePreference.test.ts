// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { readSettings, languageCodeOf } from '../settingsStore'
import { setLanguagePreference, getLanguagePreference } from '../languagePreferenceStore'
import { applyLanguage, getCurrentLanguage } from '../i18n'

describe('T6-09 shared-device language boundary', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setLanguagePreference(null, 'en')
  })

  it('persists per-user language preference and isolates two staff on one iPad (T6-09)', async () => {
    // Ram prefers Nepali
    setLanguagePreference('ram', 'ne')
    expect(getLanguagePreference()).toEqual({ userId: 'ram', language: 'ne' })
    expect(readSettings().language).toBe('नेपाली')
    await applyLanguage(languageCodeOf(readSettings().language))
    expect(getCurrentLanguage()).toBe('ne')

    // Sarah signs in on the same iPad and keeps English
    setLanguagePreference('sarah', 'en')
    expect(getLanguagePreference()).toEqual({ userId: 'sarah', language: 'en' })
    expect(readSettings().language).toBe('English')
    await applyLanguage(languageCodeOf(readSettings().language))
    expect(getCurrentLanguage()).toBe('en')

    // Unauthenticated fallback defaults to English
    setLanguagePreference(null, 'ne')
    expect(getLanguagePreference()).toEqual({ userId: null, language: 'en' })
    expect(readSettings().language).toBe('English')
  })
})
