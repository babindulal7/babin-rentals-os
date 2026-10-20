// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { DatePresets, DEFAULT_PRESETS } from '../DatePresets'
import { getBusinessToday, kathmanduCivil } from '../../../../lib/bs'
import { rentalDaysBetween } from '../../../../lib/rentalDays'

function todayIso(): string {
  return new Date(kathmanduCivil(getBusinessToday())).toISOString().slice(0, 10)
}

describe('DatePresets', () => {
  it('selects only the actual billable duration when the calendar-date span differs', async () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    try {
      await act(async () => root.render(<DatePresets outDate="2026-10-19" returnDate="2026-10-20" days={2} onPick={vi.fn()} />))
      const selected = host.querySelectorAll('[aria-label="Rental duration"] [aria-pressed="true"]')
      expect(selected).toHaveLength(1)
      expect(selected[0]?.textContent).toBe('2 days')
    } finally { await act(async () => root.unmount()) }
  })
  it.each([1, 2, 3])('%i-day preset produces that many 06:00 rental days at the default times', async days => {
    const host = document.createElement('div')
    const root = createRoot(host)
    const onPick = vi.fn()
    try {
      await act(async () => root.render(<DatePresets outDate="2026-10-19" days={2} onPick={onPick} />))
      const button = [...host.querySelectorAll<HTMLButtonElement>('[aria-label="Rental duration"] button')].find(b => b.textContent === `${days} day${days > 1 ? 's' : ''}`)!
      await act(async () => button.click())
      const [pickup, ret] = onPick.mock.calls[0] as [string, string]
      expect(rentalDaysBetween(`${pickup}T09:00:00+05:45`, `${ret}T18:00:00+05:45`)).toBe(days)
    } finally { await act(async () => root.unmount()) }
  })
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
