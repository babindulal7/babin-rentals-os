/** Account state only. Never inherit another person's device language. */
let activeUserId: string | null = null
let language: 'en' | 'ne' = 'en'

export function setLanguagePreference(userId: string | null, value: 'en' | 'ne'): void {
  activeUserId = userId
  language = userId ? value : 'en'
}

export function getLanguagePreference(): { userId: string | null; language: 'en' | 'ne' } {
  return { userId: activeUserId, language }
}
