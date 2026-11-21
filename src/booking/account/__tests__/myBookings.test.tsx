// @vitest-environment jsdom
/**
 * src/booking/account/__tests__/myBookings.test.tsx
 *
 * Tests for T7-08 · My bookings (Client Portal timeline, invoices, documents, pay balance).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import {
  mapStageToTimeline,
  fetchMyBookings,
  getMockClientBookings,
  viewClientDocument,
} from '../accountApi'
import { MyBookingsModal } from '../MyBookingsModal'

// Polyfill window.matchMedia if missing in jsdom
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}

describe('T7-08 · Client Timeline & Account API', () => {
  it('maps stages accurately to the 6-step client timeline (PERMISSIONS §7 P2)', () => {
    // 1. Request / Quote -> Step 1 (submitted)
    expect(mapStageToTimeline('Pending')).toEqual({ step: 'submitted', progress: 1 })
    expect(mapStageToTimeline('Under_Review')).toEqual({ step: 'submitted', progress: 1 })
    expect(mapStageToTimeline('Quote')).toEqual({ step: 'submitted', progress: 1 })

    // 2. Confirmed / Booked -> Step 2 (confirmed)
    expect(mapStageToTimeline('Booked')).toEqual({ step: 'confirmed', progress: 2 })
    expect(mapStageToTimeline('Confirmed')).toEqual({ step: 'confirmed', progress: 2 })

    // 3. Packed -> Step 3 (packed)
    expect(mapStageToTimeline('Packed')).toEqual({ step: 'packed', progress: 3 })

    // 4. On Rent -> Step 4 (on_rent)
    expect(mapStageToTimeline('On Rent')).toEqual({ step: 'on_rent', progress: 4 })

    // 5. Returned / Inspection -> Step 5 (returned)
    expect(mapStageToTimeline('Returned')).toEqual({ step: 'returned', progress: 5 })
    expect(mapStageToTimeline('Inspection')).toEqual({ step: 'returned', progress: 5 })

    // 6. Closed / Settled -> Step 6 (closed)
    expect(mapStageToTimeline('Closed')).toEqual({ step: 'closed', progress: 6 })
    expect(mapStageToTimeline('Settled')).toEqual({ step: 'closed', progress: 6 })
  })

  it('provides structured client bookings with lines, documents, and integer paisa', async () => {
    const bookings = await fetchMyBookings()
    expect(bookings.length).toBeGreaterThan(0)

    const activeBooking = bookings.find((b) => b.stage === 'Booked')
    expect(activeBooking).toBeDefined()
    expect(activeBooking?.booking_no).toBe('BK-2026-0881')
    expect(activeBooking?.timeline_progress).toBe(2)
    expect(activeBooking?.total_paisa).toBe(3600000)
    expect(activeBooking?.paid_paisa).toBe(1500000)
    expect(activeBooking?.balance_paisa).toBe(2100000)
    expect(activeBooking?.lines.length).toBe(3)
    expect(activeBooking?.documents.length).toBe(3)
  })

  it('triggers document view/download safely', () => {
    const mockBookings = getMockClientBookings()
    const bkg = mockBookings[0]!
    const doc = bkg.documents[0]!

    // Verify document trigger does not throw
    expect(() => viewClientDocument(doc, bkg)).not.toThrow()
  })
})

describe('T7-08 · MyBookingsModal UI', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('renders restricted signed-out state when user is null', async () => {
    await act(async () => {
      root.render(
        <MyBookingsModal
          isOpen={true}
          onClose={() => {}}
          user={null}
          onOpenAuth={() => {}}
        />,
      )
    })

    expect(container.textContent).toContain('Sign in to View Your Bookings')
    expect(container.textContent).toContain('Sign In with Email OTP')
  })

  it('renders bookings list, 6-step timeline, documents, and balance when user is signed in', async () => {
    await act(async () => {
      root.render(
        <MyBookingsModal
          isOpen={true}
          onClose={() => {}}
          user={{ id: 'test-user-id', email: 'director@film.np' }}
        />,
      )
    })

    // Header and title
    expect(container.textContent).toContain('My Bookings & Invoices')

    // Booking cards
    expect(container.textContent).toContain('BK-2026-0881')
    expect(container.textContent).toContain('Mountaineering Commercial Shoot')

    // Timeline steps rendered
    expect(container.textContent).toContain('Requested')
    expect(container.textContent).toContain('Confirmed')
    expect(container.textContent).toContain('Packed')
    expect(container.textContent).toContain('On Rent')
    expect(container.textContent).toContain('Returned')
    expect(container.textContent).toContain('Settled')

    // Equipment items
    expect(container.textContent).toContain('Sony FX3 Cinema Line Camera')

    // Financial balance and Pay Balance button
    expect(container.textContent).toContain('Pay Balance')

    // Verified documents
    expect(container.textContent).toContain('Formal Quote #QT-2026-0042')
    expect(container.textContent).toContain('Advance Payment Receipt #REC-0881')
  })

  it('filters bookings correctly when switching tabs', async () => {
    await act(async () => {
      root.render(
        <MyBookingsModal
          isOpen={true}
          onClose={() => {}}
          user={{ id: 'test-user-id', email: 'director@film.np' }}
        />,
      )
    })

    // Click "Completed" tab
    const completedTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Completed',
    )
    expect(completedTab).toBeDefined()

    await act(async () => {
      completedTab?.click()
    })

    // Completed booking visible, active booking hidden
    expect(container.textContent).toContain('BK-2026-0814')
    expect(container.textContent).not.toContain('BK-2026-0881')
  })
})
