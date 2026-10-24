// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { DisplayDensityProvider, useDisplayDensity } from '../displayDensity'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

describe('displayDensity', () => {
  let host: HTMLDivElement

  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset['density']
    host = document.createElement('div')
    document.body.appendChild(host)
  })

  afterEach(() => {
    host.remove()
    localStorage.clear()
    vi.restoreAllMocks()
  })

  function DensityProbe() {
    const { density, toggleDensity } = useDisplayDensity()
    return (
      <button onClick={toggleDensity} data-testid="density-btn">
        {density}
      </button>
    )
  }

  it('defaults to comfortable on phone (< 768px)', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390)
    const root = createRoot(host)
    try {
      act(() => {
        root.render(
          <DisplayDensityProvider>
            <DensityProbe />
          </DisplayDensityProvider>
        )
      })
      expect(host.textContent).toBe('comfortable')
      expect(document.documentElement.dataset['density']).toBe('comfortable')
    } finally {
      act(() => root.unmount())
    }
  })

  it('defaults to compact on tablet boundary (768px)', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(768)
    const root = createRoot(host)
    try {
      act(() => {
        root.render(
          <DisplayDensityProvider>
            <DensityProbe />
          </DisplayDensityProvider>
        )
      })
      expect(host.textContent).toBe('compact')
      expect(document.documentElement.dataset['density']).toBe('compact')
    } finally {
      act(() => root.unmount())
    }
  })

  it('defaults to compact on desktop (1280px)', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1280)
    const root = createRoot(host)
    try {
      act(() => {
        root.render(
          <DisplayDensityProvider>
            <DensityProbe />
          </DisplayDensityProvider>
        )
      })
      expect(host.textContent).toBe('compact')
      expect(document.documentElement.dataset['density']).toBe('compact')
    } finally {
      act(() => root.unmount())
    }
  })

  it('preserves saved user preference from localStorage', () => {
    localStorage.setItem('br-display-density', 'comfortable')
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1920)
    const root = createRoot(host)
    try {
      act(() => {
        root.render(
          <DisplayDensityProvider>
            <DensityProbe />
          </DisplayDensityProvider>
        )
      })
      expect(host.textContent).toBe('comfortable')
    } finally {
      act(() => root.unmount())
    }
  })

  it('allows manual toggle and updates localStorage & dataset', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1280)
    const root = createRoot(host)
    try {
      act(() => {
        root.render(
          <DisplayDensityProvider>
            <DensityProbe />
          </DisplayDensityProvider>
        )
      })
      expect(host.textContent).toBe('compact')

      act(() => {
        host.querySelector<HTMLButtonElement>('[data-testid="density-btn"]')?.click()
      })

      expect(host.textContent).toBe('comfortable')
      expect(document.documentElement.dataset['density']).toBe('comfortable')
      expect(localStorage.getItem('br-display-density')).toBe('comfortable')
    } finally {
      act(() => root.unmount())
    }
  })
})
