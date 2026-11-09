// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  ready: true,
  update: vi.fn(),
}))
vi.mock('../supabase', () => ({ supabase: { auth: { updateUser: state.update } } }))
vi.mock('../languageReadiness', () => ({
  canEnable: (lang: string) => lang === 'en' || state.ready,
  NEPALI_UNAVAILABLE: 'Nepali will be available after approval.',
}))

import { hydrateUserLanguage, saveUserLanguage } from '../languagePreferences'
import { getLanguagePreference } from '../languagePreferenceStore'
import { getCurrentLanguage } from '../i18n'
import { getSetting, applyRemoteSettings, isDeviceLocalKey } from '../settingsStore'

beforeEach(() => {
  state.ready = true
  state.update.mockReset()
  localStorage.clear()
  hydrateUserLanguage(null)
})

describe('language belongs to the authenticated account', () => {
  it('restores each account preference and defaults a new account to English', async () => {
    hydrateUserLanguage('a', { staff_language: 'ne' })
    expect(getLanguagePreference()).toEqual({ userId: 'a', language: 'ne' })
    hydrateUserLanguage('b', { staff_language: 'en' })
    expect(getCurrentLanguage()).toBe('en')
    hydrateUserLanguage('a', { staff_language: 'ne' })
    expect(getLanguagePreference().language).toBe('ne')
    hydrateUserLanguage('c')
    expect(getCurrentLanguage()).toBe('en')
    hydrateUserLanguage(null)
    expect(getLanguagePreference().userId).toBeNull()
    expect(getCurrentLanguage()).toBe('en')
    await Promise.resolve()
  })

  it('ignores legacy device and organisation language settings', () => {
    localStorage.setItem('br.settings.language', 'नेपाली')
    applyRemoteSettings([{ key: 'language', value: 'नेपाली', scope: 'org', location_id: null }])
    expect(isDeviceLocalKey('language')).toBe(false)
    expect(getSetting('language')).toBe('English')
    expect(getCurrentLanguage()).toBe('en')
  })

  it('persists to the signed-in account and reads the preference on a new session', async () => {
    hydrateUserLanguage('a')
    state.update.mockResolvedValue({ data: { user: { id: 'a' } }, error: null })
    await saveUserLanguage('ne')
    expect(state.update).toHaveBeenCalledWith({ data: { staff_language: 'ne' } })
    expect(getSetting('language')).toBe('नेपाली')
    hydrateUserLanguage(null)
    hydrateUserLanguage('a', { staff_language: 'ne' })
    expect(getLanguagePreference().language).toBe('ne')
  })

  it('keeps the prior choice on a refused save and blocks saving without a session', async () => {
    await expect(saveUserLanguage('en')).rejects.toThrow('Sign in')
    hydrateUserLanguage('a')
    state.update.mockResolvedValue({ data: { user: null }, error: { message: 'Network unavailable' } })
    await expect(saveUserLanguage('ne')).rejects.toThrow('Network unavailable')
    expect(getCurrentLanguage()).toBe('en')
  })

  it('never applies a late save response to a different account', async () => {
    hydrateUserLanguage('a')
    state.update.mockImplementation(async () => {
      hydrateUserLanguage('b')
      return { data: { user: { id: 'a' } }, error: null }
    })
    await saveUserLanguage('ne')
    expect(getLanguagePreference()).toEqual({ userId: 'b', language: 'en' })
  })

  it('refuses activation and ignores stale Nepali preferences before acceptance', async () => {
    state.ready = false
    hydrateUserLanguage('a', { staff_language: 'ne' })
    expect(getCurrentLanguage()).toBe('en')
    await expect(saveUserLanguage('ne')).rejects.toThrow('Nepali will be available')
    expect(state.update).not.toHaveBeenCalled()
  })
})
