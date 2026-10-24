// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import Calendar from '../Calendar'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

vi.mock('../../../lib/device', async (orig) => ({
  ...(await orig<typeof import('../../../lib/device')>()),
  useViewport: () => 'desktop' as const,
}))

vi.mock('../../../lib/moneyVisibility', () => ({
  useCanViewMoney: () => true,
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'usr-1', email: 'admin@babinrentals.com', role: 'Owner' },
    role: 'Owner',
    capabilities: [],
    logout: vi.fn(),
    lockNow: vi.fn(),
    hasPin: false,
  }),
}))

vi.mock('../../../lib/syncContext', () => ({
  useSync: () => ({ status: 'synced', pendingCount: 0 }),
}))

const { mockDay } = vi.hoisted(() => ({
  mockDay: new Date('2026-08-01T00:00:00.000Z'),
}))

vi.mock('../../../lib/queries/calendar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/queries/calendar')>()
  return {
    ...actual,
    calendarWindow: vi.fn().mockReturnValue({ dateRange: { column: 'pickup_at', fromAd: '2026-08-01', toAd: '2026-08-01' } }),
    fetchCalendarBars: vi.fn().mockResolvedValue({
      rows: [
        {
          id: 'bk-501',
          kind: 'Reserved',
          label: 'BK-501',
          bookingNo: 'BK-501',
          sub: 'Kathmandu Docs',
          client: 'Kathmandu Docs',
          from: mockDay,
          to: mockDay,
        },
      ],
      total: 1,
    }),
    railBookingCounts: vi.fn().mockResolvedValue({}),
    railInvoiceCounts: vi.fn().mockResolvedValue({}),
  }
})

describe('Calendar Operational Day View & Shift Cadence (Phase 5)', () => {
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

  it('renders Kathmandu 06:00-06:00 NPT operational day header and 5 operational shift slots in Day view', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/calendar?view=day&d=2026-08-01']}>
          <Calendar />
        </MemoryRouter>,
      )
    })

    // Assert Kathmandu operational day timing
    expect(container.textContent).toContain('Nepal Operational Day (06:00 NPT – 06:00 NPT +1)')

    // Assert the 5 shift slots
    expect(container.textContent).toContain('बिहानी प्रस्थान')
    expect(container.textContent).toContain('06:00 – 10:00 NPT')

    expect(container.textContent).toContain('मध्यान्ह हस्तान्तरण')
    expect(container.textContent).toContain('10:00 – 14:00 NPT')

    expect(container.textContent).toContain('अपरान्ह मर्मत तथा जाँच')
    expect(container.textContent).toContain('14:00 – 18:00 NPT')

    expect(container.textContent).toContain('साँझ फिर्ता संकलन')
    expect(container.textContent).toContain('18:00 – 22:00 NPT')

    expect(container.textContent).toContain('राती तयारी तथा ब्याट्री चार्ज')
    expect(container.textContent).toContain('22:00 – 06:00 NPT (+1)')
  })

  it('displays scheduled operations with touch targets >= 44px', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/calendar?view=day&d=2026-08-01']}>
          <Calendar />
        </MemoryRouter>,
      )
    })

    // Find the movement button
    const movementBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('BK-501'),
    )
    expect(movementBtn).toBeDefined()
    expect(movementBtn?.style.minHeight).toBe('44px')
  })

  it('selecting a scheduled event displays the Selected Event Panel with Reschedule button', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/calendar?view=day&d=2026-08-01']}>
          <Calendar />
        </MemoryRouter>,
      )
    })

    const movementBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('BK-501'),
    )
    expect(movementBtn).toBeDefined()

    await act(async () => {
      movementBtn?.click()
    })

    expect(container.textContent).toContain('SELECTED EVENT')
    expect(container.textContent).toContain('Kathmandu Docs')

    const rescheduleBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Reschedule'),
    )
    expect(rescheduleBtn).toBeDefined()

    // Click reschedule button to open RescheduleModal
    await act(async () => {
      rescheduleBtn?.click()
    })

    expect(container.textContent).toContain('Reschedule Booking BK-501')
    expect(container.textContent).toContain('PROPOSED PICKUP (AD)')
    expect(container.textContent).toContain('PROPOSED RETURN (AD)')
    expect(container.textContent).toContain('Confirm Date Adjustment')
  })
})
