import { describe, it, expect } from 'vitest'
import { setLanguagePreference, getLanguagePreference } from '../languagePreferenceStore'

describe('languagePreferenceStore', () => {
  it('stores preference per user and resets to en when signed out', () => {
    setLanguagePreference('usr-1', 'ne')
    expect(getLanguagePreference()).toEqual({ userId: 'usr-1', language: 'ne' })

    setLanguagePreference(null, 'ne')
    expect(getLanguagePreference()).toEqual({ userId: null, language: 'en' })
  })
})
