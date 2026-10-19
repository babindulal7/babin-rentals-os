// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true
import { DatePresets, DEFAULT_PRESETS } from '../DatePresets'
import { getBusinessToday, kathmanduCivil } from '../../../../lib/bs'

function todayIso(): string {
  return new Date(kathmanduCivil(getBusinessToday())).toISOString().slice(0, 10)
}

describe('DatePresets', () => {
  it('includes 2 days preset between 1 day and 3 days', () => {
    const labels = DEFAULT_PRESETS.map((p) => p.label)
    expect(labels).toEqual(['1 day', '2 days', '3 days', '1 week'])
    expect(DEFAULT_PRESETS.find((p) => p.label === '2 days')?.days).toBe(2)
  })

  it('renders quick presets and highlights active start and duration pills', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const onPick = vi.fn()
    const today = todayIso()

    try {
      await act(async () => {
        root.render(
          <DatePresets
            outDate={today}
            days={2}
            onPick={onPick}
          />
        )
      })

      // Start pill for 'Today' should be active
      const todayBtn = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Today')
      expect(todayBtn).toBeDefined()
      expect(todayBtn?.getAttribute('aria-pressed')).toBe('true')
      expect(todayBtn?.className).toContain('is-active')

      // Duration pill for '2 days' should be active
      const twoDaysBtn = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === '2 days')
      expect(twoDaysBtn).toBeDefined()
      expect(twoDaysBtn?.getAttribute('aria-pressed')).toBe('true')
      expect(twoDaysBtn?.className).toContain('is-active')

      // 1 day should not be active
      const oneDayBtn = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === '1 day')
      expect(oneDayBtn?.getAttribute('aria-pressed')).toBe('false')

      // Clicking 3 days calls onPick
      const threeDaysBtn = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === '3 days')
      await act(async () => {
        threeDaysBtn?.click()
      })
      expect(onPick).toHaveBeenCalledTimes(1)
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })
})
