import { useEffect, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { useCurrentLanguage } from '../../lib/i18n'
import { canEnable, NEPALI_UNAVAILABLE } from '../../lib/languageReadiness'
import { saveUserLanguage } from '../../lib/languagePreferences'

export function LanguagePreference() {
  const { user } = useAuth()
  const language = useCurrentLanguage()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  if (!user || user.role === 'Client') return null
  const ready = canEnable('ne')

  async function change(value: string) {
    setError(null)
    setSaving(true)
    try {
      await saveUserLanguage(value === 'ne' ? 'ne' : 'en')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your language. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby="my-language-label" style={{ padding: 'var(--sp-md)' }}>
      <label id="my-language-label" htmlFor="my-language">My language</label>
      <select id="my-language" value={language} disabled={!ready || saving || !online}
        aria-describedby="my-language-help" style={{ minHeight: 44, marginInline: 'var(--sp-sm)' }}
        onChange={event => { void change(event.target.value) }}>
        <option value="en">English</option>
        {ready && <option value="ne">नेपाली</option>}
      </select>
      <p id="my-language-help">{!ready ? NEPALI_UNAVAILABLE : !online
        ? 'Connect to save your account preference.' : saving ? 'Saving your language…' : 'Your language follows your account across devices.'}</p>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
