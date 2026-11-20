// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../languageReadiness', () => ({
  canEnable: () => false,
  NEPALI_UNAVAILABLE: 'Nepali will be available after all staff screens have been reviewed and checked.',
}))

import { readSettings, languageCodeOf } from '../settingsStore'
import { setLanguagePreference, getLanguagePreference } from '../languagePreferenceStore'
import { applyLanguage, getCurrentLanguage } from '../i18n'

describe('T6-09 shared-device language boundary', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setLanguagePreference(null, 'en')
  })

  it('ignores old account/device caches and keeps unapproved Nepali disabled across switches', async () => {
    window.localStorage.setItem('br.settings.language', 'नेपाली')
    window.localStorage.setItem('br.settings.user.ram.language', 'नेपाली')
    setLanguagePreference('ram', 'ne')
    expect(readSettings().language).toBe('English')
    await applyLanguage(languageCodeOf(readSettings().language))
    expect(getCurrentLanguage()).toBe('en')

    setLanguagePreference('sarah', 'en')
    expect(getLanguagePreference()).toEqual({ userId: 'sarah', language: 'en' })
    expect(readSettings().language).toBe('English')

    setLanguagePreference(null, 'ne')
    expect(getLanguagePreference()).toEqual({ userId: null, language: 'en' })
    expect(readSettings().language).toBe('English')
  })
})
