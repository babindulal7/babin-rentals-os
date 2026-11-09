import { supabase } from './supabase'
import { applyLanguage } from './i18n'
import { canEnable, NEPALI_UNAVAILABLE } from './languageReadiness'
import { getLanguagePreference, setLanguagePreference } from './languagePreferenceStore'
import { captureError } from './monitoring'

/** Auth metadata is self-owned preference data, never an authorization source. */
export function hydrateUserLanguage(userId: string | null, metadata?: Record<string, unknown>): void {
  const preferred = metadata?.staff_language === 'ne' ? 'ne' : 'en'
  const lang = userId && canEnable(preferred) ? preferred : 'en'
  setLanguagePreference(userId, lang)
  void applyLanguage(lang).catch(cause => {
    if (getLanguagePreference().userId !== userId) return
    setLanguagePreference(userId, 'en')
    captureError(cause instanceof Error ? cause : new Error('Could not load language'), { where: 'languagePreferences.hydrate' })
    void applyLanguage('en')
  })
}

export async function saveUserLanguage(lang: 'en' | 'ne'): Promise<void> {
  if (!canEnable(lang)) throw new Error(NEPALI_UNAVAILABLE)
  const { userId } = getLanguagePreference()
  if (!userId) throw new Error('Sign in to change your language.')
  // updateUser writes only the authenticated account; the caller supplies no target id.
  const { data, error } = await supabase.auth.updateUser({ data: { staff_language: lang } })
  if (error) throw new Error(error.message)
  if (getLanguagePreference().userId !== userId) return
  if (data.user?.id !== userId) throw new Error('Your session changed. Try again after signing in.')
  setLanguagePreference(userId, lang)
  await applyLanguage(lang)
}
