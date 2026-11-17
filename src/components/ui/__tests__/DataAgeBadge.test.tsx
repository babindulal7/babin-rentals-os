// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { DataAgeBadge, formatRelativeAge } from '../DataAgeBadge'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('DataAgeBadge — Phase 9 operational data age tracking (PLAN.md §4.27)', () => {
  let host: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    vi.useFakeTimers()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount()
      })
    }
    if (host && host.parentNode) {
      host.parentNode.removeChild(host)
    }
    root = null
    host = null
    vi.useRealTimers()
  })

  describe('formatRelativeAge', () => {
    it('formats durations under 45s as "Just now"', () => {
      expect(formatRelativeAge(0)).toBe('Just now')
      expect(formatRelativeAge(30_000)).toBe('Just now')
      expect(formatRelativeAge(44_000)).toBe('Just now')
    })

    it('formats minute ranges accurately', () => {
      expect(formatRelativeAge(60_000)).toBe('1m ago')
      expect(formatRelativeAge(5 * 60_000)).toBe('5m ago')
      expect(formatRelativeAge(59 * 60_000)).toBe('59m ago')
    })

    it('formats hour ranges accurately', () => {
      expect(formatRelativeAge(60 * 60_000)).toBe('1h ago')
      expect(formatRelativeAge(3 * 3_600_000)).toBe('3h ago')
    })

    it('formats day ranges accurately', () => {
      expect(formatRelativeAge(24 * 3_600_000)).toBe('1d ago')
      expect(formatRelativeAge(3 * 86_400_000)).toBe('3d ago')
    })
  })

  describe('component rendering', () => {
    it('renders "No cache" when loadedAt is undefined or null', () => {
      act(() => {
        root!.render(<DataAgeBadge />)
      })
      expect(host!.textContent).toContain('No cache')
    })

    it('shows invalid timestamps as a warning and offers an accessible refresh', () => {
      const onRefresh = vi.fn()
      act(() => {
        root!.render(<DataAgeBadge loadedAt="not-a-date" quietWhenFresh onRefresh={onRefresh} />)
      })
      expect(host!.textContent).toContain('Time unavailable')
      expect(host!.textContent).not.toContain('Updated')
      expect(host!.textContent).not.toContain('Invalid Date')
      const button = host!.querySelector('button[aria-label="Refresh data"]') as HTMLButtonElement
      expect(button).not.toBeNull()
      expect(button.style.minWidth).toBe('44px')
      expect(button.style.minHeight).toBe('44px')
      act(() => {
        button.click()
      })
      expect(onRefresh).toHaveBeenCalledTimes(1)
    })

    it('treats invalid Date and NaN values as unknown, not fresh', () => {
      for (const loadedAt of [new Date('invalid'), Number.NaN]) {
        act(() => {
          root!.render(<DataAgeBadge loadedAt={loadedAt} />)
        })
        expect(host!.textContent).toContain('Time unavailable')
        expect(host!.textContent).not.toContain('Updated')
      }
    })

    it('accepts the Unix epoch as a valid stale timestamp rather than no cache', () => {
      vi.setSystemTime(60 * 60 * 1000)
      act(() => {
        root!.render(<DataAgeBadge loadedAt={0} staleThresholdMs={1000} />)
      })
      expect(host!.textContent).toContain('Stale · 1h ago')
      expect(host!.textContent).not.toContain('No cache')
    })

    it('renders fresh age with "Updated Just now" when newly loaded', () => {
      const now = Date.now()
      vi.setSystemTime(now)
      act(() => {
        root!.render(<DataAgeBadge loadedAt={now} />)
      })
      expect(host!.textContent).toContain('Updated Just now')
    })

    it('marks data as "Stale" once the staleThresholdMs is crossed', () => {
      const start = Date.now()
      vi.setSystemTime(start)
      act(() => {
        root!.render(<DataAgeBadge loadedAt={start} staleThresholdMs={10 * 60 * 1000} />)
      })
      expect(host!.textContent).toContain('Updated Just now')

      // Advance past 10 minutes
      vi.setSystemTime(start + 11 * 60 * 1000)
      act(() => {
        root!.render(<DataAgeBadge loadedAt={start} staleThresholdMs={10 * 60 * 1000} />)
      })
      expect(host!.textContent).toContain('Stale · 11m ago')
    })

    it('renders accessible refresh button with 44px hit target (Law 15)', () => {
      const onRefresh = vi.fn()
      act(() => {
        root!.render(<DataAgeBadge loadedAt={Date.now()} onRefresh={onRefresh} />)
      })

      const btn = host!.querySelector('button[aria-label="Refresh data"]') as HTMLButtonElement
      expect(btn).not.toBeNull()
      expect(btn.style.minWidth).toBe('44px')
      expect(btn.style.minHeight).toBe('44px')

      act(() => {
        btn.click()
      })
      expect(onRefresh).toHaveBeenCalledTimes(1)
    })
  })

  /* RULING 2026-10-15: the phone/tablet header. Healthy freshness takes no width;
     an abnormal state keeps its words (Law 11). */
  describe('quietWhenFresh', () => {
    it('renders only the Refresh button for fresh data, with the age in its tooltip', () => {
      const now = Date.now()
      vi.setSystemTime(now)
      act(() => {
        root!.render(<DataAgeBadge loadedAt={now} onRefresh={() => {}} quietWhenFresh />)
      })
      expect(host!.textContent).not.toContain('Updated')
      const btn = host!.querySelector('button[aria-label="Refresh data"]') as HTMLButtonElement
      expect(btn).not.toBeNull()
      expect(btn.title).toContain('updated just now')
    })

    it('still says Stale in words once the threshold is crossed', () => {
      const start = Date.now()
      vi.setSystemTime(start + 11 * 60 * 1000)
      act(() => {
        root!.render(<DataAgeBadge loadedAt={start} staleThresholdMs={10 * 60 * 1000} onRefresh={() => {}} quietWhenFresh />)
      })
      expect(host!.textContent).toContain('Stale · 11m ago')
    })

    it('still says Offline in words when the device is offline', () => {
      const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
      act(() => {
        root!.render(<DataAgeBadge loadedAt={Date.now()} onRefresh={() => {}} quietWhenFresh />)
      })
      expect(host!.textContent).toContain('Offline ·')
      onLine.mockRestore()
    })

    it('draws nothing before the first load instead of a "No cache" chip', () => {
      act(() => {
        root!.render(<DataAgeBadge quietWhenFresh />)
      })
      expect(host!.textContent).toBe('')
    })
  })
})
