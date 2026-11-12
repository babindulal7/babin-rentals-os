// @vitest-environment jsdom
/* RULING 2026-11-10: G-2 — Glass finish is removed; saved 'glass' and
   'glass-light' migrate cleanly to 'dark' and 'light' on load while
   'high-contrast' remains untouched. */
import { describe, it, expect, beforeEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider, useTheme } from '../theme'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function mount() {
  let api: ReturnType<typeof useTheme> | null = null
  function Probe() {
    api = useTheme()
    return null
  }
  const el = document.createElement('div')
  const root = createRoot(el)
  act(() => root.render(<ThemeProvider><Probe /></ThemeProvider>))
  return { get: () => api!, unmount: () => act(() => root.unmount()) }
}

const html = document.documentElement

describe('Theme Glass removal & migration (G-2)', () => {
  beforeEach(() => {
    localStorage.clear()
    delete html.dataset['style']
    html.dataset['theme'] = 'light'
  })

  it('migrates saved "glass" mode to "dark" without data-style', () => {
    localStorage.setItem('br-theme-mode', 'glass')
    const t = mount()
    expect(t.get().mode).toBe('dark')
    expect(t.get().theme).toBe('dark')
    expect(html.dataset['theme']).toBe('dark')
    expect(html.dataset['style']).toBeUndefined()
    expect(localStorage.getItem('br-theme-mode')).toBe('dark')
    t.unmount()
  })

  it('migrates saved "glass-light" mode to "light" without data-style', () => {
    localStorage.setItem('br-theme-mode', 'glass-light')
    const t = mount()
    expect(t.get().mode).toBe('light')
    expect(t.get().theme).toBe('light')
    expect(html.dataset['theme']).toBe('light')
    expect(html.dataset['style']).toBeUndefined()
    expect(localStorage.getItem('br-theme-mode')).toBe('light')
    t.unmount()
  })

  it('preserves high-contrast mode untouched', () => {
    localStorage.setItem('br-theme-mode', 'high-contrast')
    const t = mount()
    expect(t.get().mode).toBe('high-contrast')
    expect(t.get().theme).toBe('high-contrast')
    expect(html.dataset['theme']).toBe('high-contrast')
    t.unmount()
  })

  it('switches cleanly between light and dark via choose() and cycles via toggle()', () => {
    const t = mount()
    act(() => t.get().choose('dark'))
    expect(t.get().mode).toBe('dark')
    expect(html.dataset['theme']).toBe('dark')
    expect(html.dataset['style']).toBeUndefined()

    act(() => t.get().choose('light'))
    expect(t.get().mode).toBe('light')
    expect(html.dataset['theme']).toBe('light')

    act(() => t.get().toggle())
    expect(t.get().mode).toBe('dark')
    act(() => t.get().toggle())
    expect(t.get().mode).toBe('high-contrast')
    act(() => t.get().toggle())
    expect(t.get().mode).toBe('light')
    t.unmount()
  })
})
