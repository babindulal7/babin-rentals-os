import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { readLocal, writeLocal, onMediaChange } from './safeStorage'

// RULING 2026-11-10: G-2 — Glass and glass-light removed. Saved glass values migrate to dark/light.
export type ThemeMode = 'system' | 'dark' | 'light' | 'high-contrast'
export type ResolvedTheme = 'dark' | 'light' | 'high-contrast'
export type ThemeChoice = 'light' | 'dark'

interface ThemeCtx {
  mode: ThemeMode
  theme: ResolvedTheme
  setMode: (mode: ThemeMode) => void
  choose: (choice: ThemeChoice) => void
  toggle: () => void
}

const Ctx = createContext<ThemeCtx>({
  mode: 'system',
  theme: 'light',
  setMode: () => {},
  choose: () => {},
  toggle: () => {},
})

const KEY = 'br-theme-mode'

/** Migrates legacy saved theme preferences (G-2: glass -> dark, glass-light -> light). */
export function migrateThemeMode(saved: string | null): ThemeMode {
  if (saved === 'glass') return 'dark'
  if (saved === 'glass-light') return 'light'
  if (saved === 'dark' || saved === 'light' || saved === 'high-contrast' || saved === 'system') {
    return saved
  }
  return 'light'
}

const getSystemTheme = (): ResolvedTheme => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

export function ThemeProvider({ children, initial = 'light' }: { children: ReactNode; initial?: ResolvedTheme }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    /*
     * DESIGN_DIRECTION_SPEC_v4.2 §2 — DEFAULT THEME = LIGHT.
     * Supersedes the 24 Aug dark-first ruling. Both themes stay; per-user toggle persists.
     */
    if (typeof window === 'undefined') return 'light'
    /* `readLocal`, not `localStorage.getItem` — this runs inside ThemeProvider's
       useState initializer, which is ABOVE every ErrorBoundary in the tree, and
       WebKit throws SecurityError on the property access under Lockdown Mode or
       "Block All Cookies". Unguarded, a preference lookup blanked the whole app
       on Apple devices. See `safeStorage.ts`. */
    return migrateThemeMode(readLocal(KEY))
  })

  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => {
    const sys = getSystemTheme()
    return sys || initial
  })

  useEffect(() => {
    /* `MediaQueryList.addEventListener` is Safari 14+; 13 and earlier have only
       `addListener`, and calling the modern one there throws — in a mount
       effect above every ErrorBoundary, which is a blank page on an older iPad
       rather than a theme that fails to follow the system. */
    return onMediaChange('(prefers-color-scheme: dark)', (matches) =>
      setSystemTheme(matches ? 'dark' : 'light'),
    )
  }, [])

  const theme: ResolvedTheme = mode === 'system' ? systemTheme : mode

  useEffect(() => {
    document.documentElement.dataset['theme'] = theme
    delete document.documentElement.dataset['style']
    /* A device that cannot remember the theme still gets the theme. */
    writeLocal(KEY, mode)
  }, [mode, theme])

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode)
  }, [])

  const choose = useCallback((choice: ThemeChoice) => {
    setModeState(choice)
  }, [])

  const toggle = useCallback(() => {
    setModeState((m) => {
      const current = m === 'system' ? systemTheme : m
      if (current === 'light') return 'dark'
      if (current === 'dark') return 'high-contrast'
      return 'light'
    })
  }, [systemTheme])

  /* Consumers of `useTheme` are mounted above every route; an unmemoized value
     object re-renders all of them on any provider render. */
  const value = useMemo(
    () => ({ mode, theme, setMode, choose, toggle }),
    [mode, theme, setMode, choose, toggle],
  )

  return (
    <Ctx.Provider value={value}>
      {children}
    </Ctx.Provider>
  )
}

export const useTheme = () => useContext(Ctx)

