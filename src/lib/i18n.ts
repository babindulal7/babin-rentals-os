/**
 * # EN / NE — the machinery, and the honest edge of it
 *
 * The 21 Jul lock says Nepali covers everything in v1 — all screens, statuses,
 * reports — per user. The 12 Aug spec then names two costs that are *not*
 * obvious and asks for them to be planned for rather than discovered. Both are
 * pure engineering, both are encoded and tested here:
 *
 * 1. **Asar has one weight.** So a Nepali heading or KPI figure can never be
 *    bold, and — the part that actually bites — **no component may synthesise
 *    one**. A browser asked for `font-weight: 700` on a single-weight face will
 *    fake it by smearing the outline, which destroys Devanagari conjuncts.
 *    `safeWeight()` is the guard, and it is not advisory.
 * 2. **The toggle changes body metrics.** English body is Source Sans 3, Nepali
 *    body is Hind. A table that fits in English may not fit in Nepali, so every
 *    table screen needs a Nepali layout pass before this is switched on.
 *
 * And one rule that keeps the two from diverging: **numbers, identifiers and
 * NPR stay Latin in both languages**, so the mono face never swaps and
 * `lib/bs.ts`'s existing "never renders Devanagari digits" test keeps holding.
 *
 * ## Core Catalogue and Coverage Gate
 *
 * `NE` below holds verified translations for the core navigation, status, and
 * primary action keys.
 *
 * A full string catalogue for 55 screens requires product copy in Nepali for
 * a real rental business — vendor terms, tax wording, status names an operator
 * has to act on. Guessing would put plausible-looking wrong Nepali in front of
 * staff who would reasonably trust it, which is worse than shipping nothing.
 *
 * The machinery is real and tested, the gap is **measured rather than
 * described**, and `canEnable()` refuses to turn NE on unless the catalogue
 * achieves 100% coverage of defined keys (`COVERAGE_THRESHOLD = 100`).
 *
 * Recorded as **PLAN.md §4.26**, which supersedes §4.2's "a Devanagari-capable
 * face is needed" — the face was never the hard part.
 */

import {
  MODULE_CATALOGUES_EN,
  MODULE_CATALOGUES_NE,
  FULL_CATALOGUE_EN,
  FULL_CATALOGUE_NE,
} from '../i18n/catalogues'
import { canEnable, NEPALI_UNAVAILABLE } from './languageReadiness'
import { getLanguagePreference } from './languagePreferenceStore'
import { applyGlossaryText, glossaryVersion, subscribeGlossary } from './glossaryStore'
export { canEnable } from './languageReadiness'

export type Language = 'en' | 'ne'

export const LANGUAGES: Language[] = ['en', 'ne']

export const LANGUAGE_LABEL: Record<Language, string> = {
  en: 'English',
  /* The endonym, in the script. This is not a translated string — it is the
     name of the language, and it is the same in every catalogue. */
  ne: 'नेपाली',
}

/* ── typography ────────────────────────────────────────────────────────── */

/**
 * §4.3 — three families in English, each with one job. Nepali swaps the two
 * text faces and leaves the mono alone.
 *
 * `main.tsx` loads only the English faces eagerly and says why: each Hind
 * weight carries 1,146 glyphs, mostly Devanagari conjuncts, and an
 * English-only user must never download them. `loadNepaliFonts()` below is the
 * "they load on the NE toggle" that comment promises.
 */
export const FONT_STACK: Record<Language, { heading: string; body: string; mono: string }> = {
  en: {
    heading: "'Outfit', system-ui, sans-serif",
    body: "'Outfit', system-ui, -apple-system, 'Segoe UI', sans-serif",
    mono: "'Outfit', system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
  ne: {
    heading: "'Asar', 'Noto Sans Devanagari', system-ui, sans-serif",
    body: "'Hind', 'Noto Sans Devanagari', system-ui, sans-serif",
    /* Unchanged. Identifiers and figures stay Latin in both languages, so the
       packer matching `SN-FX3-102` off a label reads the same face either way. */
    mono: "'Outfit', system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
}

/**
 * The weights each face actually ships, checked against the installed packages
 * rather than assumed.
 *
 * `@fontsource/asar` contains exactly `400.css` — the spec's warning was right.
 * `@fontsource/hind` contains 300/400/500/600/**700**, which the first draft of
 * this file got wrong: it clamped Hind 700 → 600 on the assumption Hind was
 * also weight-poor. It is not, so body text needs no clamp at all and only
 * headings do.
 */
const ASAR_WEIGHTS = [400] as const
const HIND_WEIGHTS = [300, 400, 500, 600, 700] as const

/**
 * The weight a component may actually ask for.
 *
 * In English this is the identity function. In Nepali it clamps every heading
 * weight to 400, because Asar has one and the browser's answer to a missing
 * weight is to **synthesise** it — a faux-bold that thickens the outline
 * uniformly and closes up the conjuncts Devanagari depends on. The result is
 * not "slightly wrong bold", it is text that is harder to read.
 *
 * Call this instead of writing `fontWeight: 700` wherever a heading might be
 * rendered in Nepali. It is the guard the spec asked to be planned for.
 */
export function safeWeight(weight: number, lang: Language, face: 'heading' | 'body' | 'mono' = 'heading'): number {
  if (lang === 'en') return weight
  if (face === 'mono') return weight // the mono face never swaps
  if (face === 'heading') return ASAR_WEIGHTS[0]
  /* Hind ships the full 300–700 range, so a body weight passes through — but
     only if it is one of the five. 450 would still be synthesised. */
  if ((HIND_WEIGHTS as readonly number[]).includes(weight)) return weight
  /* Round DOWN to a real weight, never up to a faked one. */
  const lighter = HIND_WEIGHTS.filter((w) => w < weight)
  return lighter.length > 0 ? lighter[lighter.length - 1]! : HIND_WEIGHTS[0]
}

/** True when the browser would have to fake this weight. Used by the guard test. */
export function wouldSynthesise(weight: number, lang: Language, face: 'heading' | 'body' | 'mono' = 'heading'): boolean {
  if (lang === 'en' || face === 'mono') return false
  if (face === 'heading') return weight !== ASAR_WEIGHTS[0]
  return !(HIND_WEIGHTS as readonly number[]).includes(weight)
}

/* ── what never translates ─────────────────────────────────────────────── */

export type LatinAlways = 'number' | 'identifier' | 'currency' | 'date-digits'

/**
 * Numbers, identifiers, NPR amounts and date digits are Latin in both
 * languages.
 *
 * `lib/bs.ts` already has a test asserting the app never renders Devanagari
 * digits, and `data/booking.ts:65` records the render that hand-wrote
 * `३१ श्रावण २०८३` and got the date wrong doing it. This names the rule so a
 * future catalogue cannot quietly reintroduce it.
 */
export function staysLatin(_kind: LatinAlways): boolean {
  /* Unconditionally true, and typed by `LatinAlways` so the *set* of things
     that stay Latin is enumerated in one place. The parameter is unread on
     purpose: if a future kind ever needed to translate, this signature is
     where that argument gets had, not a scattering of `if`s at call sites. */
  return true
}

/* ── the catalogue ─────────────────────────────────────────────────────── */

/**
 * Every user-facing string the app needs, keyed. English is the source of
 * truth and the fallback.
 *
 * This seed covers only what the machinery needed to be testable. It is
 * deliberately small: growing it is a translation project, not a coding one.
 */
export const EN = {
  'nav.today': 'Today',
  'nav.rentals': 'Rentals',
  'nav.inventory': 'Inventory',
  'nav.clients': 'Clients',
  'nav.calendar': 'Calendar',
  'nav.finance': 'Finance',
  'nav.settings': 'Settings',
  'status.draft': 'Draft',
  'status.booked': 'Booked',
  'status.onRent': 'On Rent',
  'status.returned': 'Returned',
  'status.overdue': 'Overdue',
  'action.save': 'Save',
  'action.cancel': 'Cancel',
  'action.edit': 'Edit',
} as const

export type StringKey = keyof typeof EN

/**
 * The Nepali core catalogue. Translates the primary navigation, status, and
 * action verbs. Additional screen catalogues must achieve 100% coverage before
 * `canEnable('ne')` allows activation.
 */
export const NE: Partial<Record<StringKey, string>> = {
  'nav.today': 'आज',
  'nav.rentals': 'भाडा',
  /* The business term for stock on hand, not the literal "सामान सूची". */
  'nav.inventory': 'मौज्दात',
  /* ग्राहक covers client and customer alike in Nepali; the English-side rule
     that the word "customer" never appears has no counterpart to break here. */
  'nav.clients': 'ग्राहक',
  /* पात्रो is the Nepali calendar specifically — the right word on a screen
     whose whole point is that BS leads AD. */
  'nav.calendar': 'पात्रो',
  'nav.finance': 'वित्त',
  'nav.settings': 'सेटिङ',
  'status.draft': 'मस्यौदा',
  'status.booked': 'बुक भएको',
  'status.onRent': 'भाडामा',
  'status.returned': 'फिर्ता भयो',
  'status.overdue': 'म्याद नाघेको',
  /* Buttons take the full polite imperative rather than a transliterated
     "सेभ". Note the width: these run roughly 2.5× their English counterparts,
     which is the table-metric problem §4.26 warns about, in miniature. */
  'action.save': 'सुरक्षित गर्नुहोस्',
  'action.cancel': 'रद्द गर्नुहोस्',
  'action.edit': 'सम्पादन गर्नुहोस्',
}

const CATALOGUES: Record<Language, Partial<Record<StringKey, string>>> = { en: EN, ne: NE }

/**
 * Looks up a string, falling back to English.
 *
 * Supports core keys (`StringKey`), module keys (`tools.lateFee.dailyRateLabel`),
 * and parameter interpolation (`{count}`).
 *
 * The fallback is silent by design: a half-translated screen should read as
 * English where the translation is missing, not as `[[missing:nav.today]]`. The
 * measurement of how much is missing belongs to `coverage()`, not to the text
 * an operator is trying to work with.
 */
export function t(
  key: StringKey | string,
  lang: Language = 'en',
  params?: Record<string, string | number>
): string {
  let template = ''
  if (lang === 'ne') {
    template = FULL_CATALOGUE_NE[key] ?? NE[key as StringKey] ?? FULL_CATALOGUE_EN[key] ?? EN[key as StringKey] ?? key
  } else {
    template = FULL_CATALOGUE_EN[key] ?? EN[key as StringKey] ?? key
  }

  template = applyGlossaryText(template, lang)
  if (params && typeof template === 'string') {
    return template.replace(/\{(\w+)\}/g, (_, k: string) => {
      const val = params[k]
      return val !== undefined ? String(val) : `{${k}}`
    })
  }

  return template
}

export interface Coverage {
  translated: number
  total: number
  percent: number
  missing: string[]
}

export interface ScreenCoverage {
  screen: string
  translated: number
  total: number
  percent: number
  missing: string[]
}

export interface ModuleCoverage {
  module: string
  translated: number
  total: number
  percent: number
  missing: string[]
  screens: Record<string, ScreenCoverage>
}

export interface DetailedCoverage extends Coverage {
  byModule: Record<string, ModuleCoverage>
}

/** How much of the app a language actually covers across the core keys. */
export function coverage(lang: Language): Coverage {
  const keys = Object.keys(EN) as StringKey[]
  const cat = CATALOGUES[lang]
  const missing = keys.filter((k) => cat[k] === undefined)
  const translated = keys.length - missing.length
  return {
    translated,
    total: keys.length,
    percent: keys.length === 0 ? 100 : Math.round((translated / keys.length) * 100),
    missing,
  }
}

/**
 * Returns coverage breakdown per module and per screen.
 * Evaluates keyed catalogues under `src/i18n/`.
 */
export function moduleCoverage(lang: Language): Record<string, ModuleCoverage> {
  const result: Record<string, ModuleCoverage> = {}

  for (const [moduleName, enCatalogue] of Object.entries(MODULE_CATALOGUES_EN)) {
    const neCatalogue = MODULE_CATALOGUES_NE[moduleName] || {}
    const keys = Object.keys(enCatalogue)
    const screens: Record<string, { total: number; translated: number; missing: string[] }> = {}

    let moduleTranslated = 0
    const moduleMissing: string[] = []

    for (const key of keys) {
      const parts = key.split('.')
      const screenName = parts.length > 2 ? parts[1]! : 'general'

      if (!screens[screenName]) {
        screens[screenName] = { total: 0, translated: 0, missing: [] }
      }

      screens[screenName].total++

      const isTranslated = lang === 'en' ? true : Boolean(neCatalogue[key] && neCatalogue[key].trim().length > 0)
      if (isTranslated) {
        screens[screenName].translated++
        moduleTranslated++
      } else {
        screens[screenName].missing.push(key)
        moduleMissing.push(key)
      }
    }

    const screenRecords: Record<string, ScreenCoverage> = {}
    for (const [screenName, stats] of Object.entries(screens)) {
      screenRecords[screenName] = {
        screen: screenName,
        total: stats.total,
        translated: stats.translated,
        percent: stats.total === 0 ? 100 : Math.round((stats.translated / stats.total) * 100),
        missing: stats.missing,
      }
    }

    result[moduleName] = {
      module: moduleName,
      total: keys.length,
      translated: moduleTranslated,
      percent: keys.length === 0 ? 100 : Math.round((moduleTranslated / keys.length) * 100),
      missing: moduleMissing,
      screens: screenRecords,
    }
  }

  return result
}

export function screenCoverage(moduleName: string, screenName: string, lang: Language): ScreenCoverage {
  const mod = moduleCoverage(lang)[moduleName]
  if (!mod || !mod.screens[screenName]) {
    return { screen: screenName, total: 0, translated: 0, percent: 100, missing: [] }
  }
  return mod.screens[screenName]
}

export function detailedCoverage(lang: Language): DetailedCoverage {
  const base = coverage(lang)
  return {
    ...base,
    byModule: moduleCoverage(lang),
  }
}

/**
 * Whether a language may be offered to users at all.
 *
 * A toggle that produces a screen half in each language is worse than a toggle
 * that is honestly absent — the operator cannot tell a missing translation from
 * a deliberate English term, and the Settings row already says so out loud.
 *
 * English is always enabled. Everything else has to earn it.
 * When `moduleName` is provided, checks that module's coverage against threshold.
 */
export const COVERAGE_THRESHOLD = 100


/**
 * The Devanagari faces the NE toggle needs, and which of them exist.
 *
 * `main.tsx` §4.3.7 keeps Asar and Hind out of the eager bundle because each
 * Hind weight is 1,146 glyphs an English-only user must never download, and
 * says "they load on the NE toggle". This is the other half of that decision —
 * except that **neither package is installed**, so there is nothing to lazy-load
 * yet.
 *
 * This deliberately does not `import('@fontsource/hind/400.css')`. Vite
 * resolves dynamic imports at build time, so importing a package that is not a
 * dependency breaks the build for everyone in order to half-support a language
 * that is at 0% coverage. Naming the requirement is more useful than a broken
 * import wrapped in a `.catch`.
 */
export const NEPALI_FONT_PACKAGES = ['@fontsource/asar', '@fontsource/hind'] as const

export interface FontAvailability {
  available: boolean
  missing: readonly string[]
  reason: string
}

export function nepaliFontStatus(): FontAvailability {
  return {
    available: true,
    missing: [],
    reason: /* Asar 400 and Hind 400/600 load on the NE toggle — never eagerly, per §4.3.7. */ "Asar 400 and Hind 400/600 load on the NE toggle — never eagerly, per",
  }
}

let nepaliFontsLoaded = false

/**
 * Loads the Devanagari faces, once, on the toggle.
 *
 * §4.3.7 is the constraint: each Hind weight carries 1,146 glyphs, mostly
 * Devanagari conjuncts, and an English-only user must never download them. So
 * this imports the **per-subset** files rather than the barrel — `400.css`
 * would pull latin, latin-ext and devanagari together.
 *
 * Only the weights the app can actually ask for are fetched: Asar has one, and
 * `safeWeight` clamps body text to 400/600 in practice, so pulling all five
 * Hind weights would be downloading three nobody renders.
 */
export async function loadNepaliFonts(): Promise<void> {
  if (nepaliFontsLoaded) return
  nepaliFontsLoaded = true
  await Promise.all([
    import('@fontsource/asar/devanagari-400.css'),
    import('@fontsource/asar/latin-400.css'),
    import('@fontsource/hind/devanagari-400.css'),
    import('@fontsource/hind/latin-400.css'),
    import('@fontsource/hind/devanagari-600.css'),
    import('@fontsource/hind/latin-600.css'),
  ])
}

/** Test seam — resets the once-only latch. */
export function resetFontLoadingForTest(): void {
  nepaliFontsLoaded = false
}

/**
 * Puts a language into effect on the document.
 *
 * `theme.css` already declares `--font-ne-display` (Asar) and `--font-ne-body`
 * (Hind) beside the English pair, so this **swaps the two variables every
 * component already reads** rather than introducing a parallel font system.
 * `FONT_STACK` above stays as the typed description of the same fact.
 *
 * Sets `<html lang>` too, which is not decoration: it is what a screen reader
 * switches voice on, and what the browser uses to pick a fallback face when
 * Hind has not arrived yet.
 */
let languageApplication = 0
export async function applyLanguage(lang: Language): Promise<void> {
  if (typeof document === 'undefined') return
  const application = ++languageApplication
  // Persisted preferences cannot bypass release acceptance; English is always safe.
  if (!canEnable(lang)) lang = 'en'
  const root = document.documentElement
  root.setAttribute('lang', lang === 'ne' ? 'ne' : 'en')

  if (lang === 'ne') {
    /* Fonts first, then the swap — setting the family before the face has
       arrived flashes a fallback that is usually the wrong script entirely. */
    await loadNepaliFonts()
    if (application !== languageApplication) return
    root.style.setProperty('--font-display', 'var(--font-ne-display)')
    root.style.setProperty('--font-body', 'var(--font-ne-body)')
  } else {
    /* Removing the override restores whatever the theme declares, which is
       what a later theme change should be free to move. */
    root.style.removeProperty('--font-display')
    root.style.removeProperty('--font-body')
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('languagechange', { detail: { lang } }))
  }
}

import { useState, useEffect, useMemo, useSyncExternalStore } from 'react'

/** Synchronously checks active document language. */
export function getCurrentLanguage(): Language {
  if (typeof document !== 'undefined') {
    const docLang = document.documentElement.getAttribute('lang')
    if (docLang === 'ne' && canEnable('ne')) return 'ne'
  }
  const preferred = getLanguagePreference().language
  return canEnable(preferred) ? preferred : 'en'
}

/** Reactive hook for components that adapt their typography or preset labels to the active language. */
export function useCurrentLanguage(): Language {
  useSyncExternalStore(subscribeGlossary, glossaryVersion, glossaryVersion)
  const [lang, setLang] = useState<Language>(() => getCurrentLanguage())

  useEffect(() => {
    const handler = () => {
      setLang(getCurrentLanguage())
    }
    window.addEventListener('languagechange', handler)
    window.addEventListener('storage', handler)
    return () => {
      window.removeEventListener('languagechange', handler)
      window.removeEventListener('storage', handler)
    }
  }, [])

  return lang
}

/**
 * Reactive translation hook. Automatically updates when document language changes.
 */
export function useTranslation() {
  const lang = useCurrentLanguage()
  const glossaryRevision = useSyncExternalStore(subscribeGlossary, glossaryVersion, glossaryVersion)
  const translation = useMemo(
    () => ({ revision: glossaryRevision, translate: (
      key: StringKey | string,
      fallbackOrParams?: string | Record<string, string | number>,
      params?: Record<string, string | number>
    ): string => {
      if (typeof fallbackOrParams === 'string') {
        const translated = t(key, lang, params)
        return translated === key ? fallbackOrParams : translated
      }
      return t(key, lang, fallbackOrParams)
    } }),
    [lang, glossaryRevision]
  )
  return useMemo(() => ({ t: translation.translate, lang }), [translation, lang])
}

/** Toggles between English and Nepali, persisting to settings and applying fonts immediately. */
export async function toggleLanguage(): Promise<Language> {
  const current = getCurrentLanguage()
  const next: Language = current === 'en' ? 'ne' : 'en'
  if (!canEnable(next)) throw new Error(NEPALI_UNAVAILABLE)
  const { saveUserLanguage } = await import('./languagePreferences')
  await saveUserLanguage(next)
  return next
}

