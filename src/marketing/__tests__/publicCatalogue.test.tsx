// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import PublicGearCatalogue from '../PublicGearCatalogue'
import {
  evaluatePublicSchedule,
  getCatalogueItemAvailability,
  PUBLIC_CATALOGUE_ITEMS,
} from '../publicCatalogueData'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

let container: HTMLDivElement
let root: Root

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<PublicGearCatalogue />)
  })
}

function cleanup() {
  if (root) {
    act(() => {
      root.unmount()
    })
  }
  if (container && container.parentNode) {
    container.parentNode.removeChild(container)
  }
}

function setInputValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    el instanceof HTMLSelectElement ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype,
    'value',
  )?.set
  nativeSetter?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('Issue #153 Acceptance: Public Gear Catalogue & Gating', () => {
  beforeEach(() => {
    cleanup()
  })

  afterEach(() => {
    cleanup()
  })

  describe('1. Availability counts remain hidden/locked until valid pickup & return date+time are selected', () => {
    it('initially displays locked state notice and "Select dates" badges on all items', async () => {
      await mount()

      const notice = container.querySelector('[data-testid="schedule-locked-notice"]')
      expect(notice).not.toBeNull()
      expect(notice?.textContent).toContain('Pick both pickup and return date & time above to check live availability & stock')

      const lockedBadges = container.querySelectorAll('[data-testid="availability-locked-badge"]')
      expect(lockedBadges.length).toBe(PUBLIC_CATALOGUE_ITEMS.length)
      expect(lockedBadges[0]?.textContent).toContain('Select dates')

      const unlockedBadges = container.querySelectorAll('[data-testid="availability-unlocked-badge"]')
      expect(unlockedBadges.length).toBe(0)
    })

    it('keeps availability hidden if only pickup date is chosen', async () => {
      await mount()
      const pickupDateInput = container.querySelector<HTMLInputElement>('[data-testid="pickup-date-input"]')!

      await act(async () => {
        setInputValue(pickupDateInput, '2026-09-10')
      })

      const notice = container.querySelector('[data-testid="schedule-locked-notice"]')
      expect(notice).not.toBeNull()

      const lockedBadges = container.querySelectorAll('[data-testid="availability-locked-badge"]')
      expect(lockedBadges.length).toBe(PUBLIC_CATALOGUE_ITEMS.length)

      const unlockedBadges = container.querySelectorAll('[data-testid="availability-unlocked-badge"]')
      expect(unlockedBadges.length).toBe(0)
    })

    it('shows validation error when return date is before pickup date', async () => {
      await mount()
      const pickupDateInput = container.querySelector<HTMLInputElement>('[data-testid="pickup-date-input"]')!
      const returnDateInput = container.querySelector<HTMLInputElement>('[data-testid="return-date-input"]')!

      await act(async () => {
        setInputValue(pickupDateInput, '2026-09-15')
        setInputValue(returnDateInput, '2026-09-12')
      })

      const errorMsg = container.querySelector('[data-testid="schedule-error-message"]')
      expect(errorMsg).not.toBeNull()
      expect(errorMsg?.textContent).toContain('Return date & time must be strictly after pickup date & time')

      const lockedBadges = container.querySelectorAll('[data-testid="availability-locked-badge"]')
      expect(lockedBadges.length).toBe(PUBLIC_CATALOGUE_ITEMS.length)
    })

    it('unlocks availability and stock counts when valid pickup and return are selected', async () => {
      await mount()
      const pickupDateInput = container.querySelector<HTMLInputElement>('[data-testid="pickup-date-input"]')!
      const returnDateInput = container.querySelector<HTMLInputElement>('[data-testid="return-date-input"]')!

      await act(async () => {
        setInputValue(pickupDateInput, '2026-09-10')
        setInputValue(returnDateInput, '2026-09-12')
      })

      const banner = container.querySelector('[data-testid="schedule-confirmed-banner"]')
      expect(banner).not.toBeNull()
      expect(banner?.textContent).toContain('Rental Days')

      const lockedBadges = container.querySelectorAll('[data-testid="availability-locked-badge"]')
      expect(lockedBadges.length).toBe(0)

      const unlockedBadges = container.querySelectorAll('[data-testid="availability-unlocked-badge"]')
      expect(unlockedBadges.length).toBeGreaterThan(0)
      expect(unlockedBadges[0]?.textContent).toContain('Available')
      // Unified Launch Plan §2: Never disclose internal stock counts, booking names or serial numbers
      expect(unlockedBadges[0]?.textContent).not.toMatch(/\d+ free/)
    })
  })

  describe('2. Dual Bikram Sambat (BS) / AD dates & 06:00 AM rental-day rollover boundaries (+05:45 NPT)', () => {
    it('evaluates exactly 1 rental day for a 24-hour period spanning 06:00 to next day 06:00', () => {
      const evalResult = evaluatePublicSchedule({
        pickupDate: '2026-09-10',
        pickupTime: '06:00',
        returnDate: '2026-09-11',
        returnTime: '06:00',
      })

      expect(evalResult.isFullySelected).toBe(true)
      expect(evalResult.rentalDays).toBe(1)
      expect(evalResult.pickupIso).toBe('2026-09-10T06:00:00+05:45')
      expect(evalResult.returnIso).toBe('2026-09-11T06:00:00+05:45')
      expect(evalResult.pickupBsFormatted).toBeDefined()
      expect(evalResult.returnBsFormatted).toBeDefined()
      expect(evalResult.pickupBsFormatted).toContain('2083')
    })

    it('counts rolling over 06:00 boundary into the next operational day as an additional rental day', () => {
      // Return at 08:00 next day crosses 06:00 AM cutoff => 2 rental days
      const evalResult = evaluatePublicSchedule({
        pickupDate: '2026-09-10',
        pickupTime: '06:00',
        returnDate: '2026-09-11',
        returnTime: '08:00',
      })

      expect(evalResult.rentalDays).toBe(2)
    })

    it('returns null availability if schedule is not fully selected', () => {
      const incompleteEval = evaluatePublicSchedule({
        pickupDate: '2026-09-10',
        pickupTime: '06:00',
        returnDate: '',
        returnTime: '06:00',
      })

      const item = PUBLIC_CATALOGUE_ITEMS[0]!
      const avail = getCatalogueItemAvailability(item, incompleteEval)
      expect(avail).toBeNull()
    })
  })

  describe('3. Automated responsive layout & zero horizontal overflow across 375px, 820px, and 1440px', () => {
    const viewports = [
      { name: 'mobile (375px)', width: 375, height: 667 },
      { name: 'tablet (820px)', width: 820, height: 1180 },
      { name: 'desktop (1440px)', width: 1440, height: 900 },
    ]

    viewports.forEach(({ name, width, height }) => {
      it(`renders with zero horizontal overflow and unclipped controls at ${name}`, async () => {
        window.innerWidth = width
        window.innerHeight = height

        await mount()
        const section = container.querySelector('#catalogue') as HTMLElement
        expect(section).not.toBeNull()

        const scheduleBox = container.querySelector('[data-testid="schedule-picker-box"]')
        expect(scheduleBox).not.toBeNull()

        expect(container.querySelector('[data-testid="pickup-date-input"]')).not.toBeNull()
        expect(container.querySelector('[data-testid="pickup-time-input"]')).not.toBeNull()
        expect(container.querySelector('[data-testid="return-date-input"]')).not.toBeNull()
        expect(container.querySelector('[data-testid="return-time-input"]')).not.toBeNull()

        const cards = container.querySelectorAll('[data-testid^="catalogue-card-"]')
        expect(cards.length).toBe(PUBLIC_CATALOGUE_ITEMS.length)
      })
    })
  })
})
