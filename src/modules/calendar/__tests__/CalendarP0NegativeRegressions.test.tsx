// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import Calendar, { RescheduleModal } from '../Calendar'
import {
  buildResourceTimeline,
  RESOURCE_CATALOGUE,
  ARCHIVED_RESOURCE_CATALOGUE,
  type Bar,
} from '../../../lib/queries/calendar'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { mockDates } = vi.hoisted(() => ({
  mockDates: {
    baseDay: new Date('2026-08-01T00:00:00.000Z'),
    addDays: (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000),
  },
}))

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
    capabilities: ['manage_bookings', 'schedule_rentals'],
    logout: vi.fn(),
    lockNow: vi.fn(),
    hasPin: false,
  }),
}))

vi.mock('../../../lib/syncContext', () => ({
  useSync: () => ({ status: 'synced', pendingCount: 0 }),
}))

const mockShowSuccessToast = vi.fn()
const mockShowErrorToast = vi.fn()

vi.mock('../../../components/ui/Toast', () => ({
  useToast: () => ({
    showSuccessToast: mockShowSuccessToast,
    showErrorToast: mockShowErrorToast,
  }),
}))

vi.mock('../../../lib/queries/calendar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/queries/calendar')>()
  return {
    ...actual,
    calendarWindow: vi.fn().mockReturnValue({
      dateRange: { column: 'pickup_at', fromAd: '2026-08-01', toAd: '2026-08-07' },
    }),
    fetchCalendarBars: vi.fn().mockResolvedValue({
      rows: [
        {
          id: 'bk-901',
          kind: 'Reserved',
          label: 'BK-901',
          bookingNo: 'BK-901',
          sub: 'Kathmandu Docs',
          client: 'Kathmandu Docs',
          from: mockDates.baseDay,
          to: mockDates.addDays(mockDates.baseDay, 2),
        },
      ],
      total: 1,
    }),
    railBookingCounts: vi.fn().mockResolvedValue({}),
    railInvoiceCounts: vi.fn().mockResolvedValue({}),
  }
})

describe('P0 Negative Regression 1: Authoritative Resource Allocation & Half-Open Conflict Semantics', () => {
  const { baseDay, addDays } = mockDates

  it('fails closed in production: returns [] when RESOURCE_CATALOGUE has no authoritative records', () => {
    // Assert production RESOURCE_CATALOGUE contains 0 fabricated lanes
    expect(RESOURCE_CATALOGUE).toEqual([])
    const lanes = buildResourceTimeline([])
    expect(lanes).toEqual([])
  })

  it('no physical assignment without authoritative unit ID (unassigned bookings remain unassigned)', () => {
    const unassignedBars: Bar[] = [
      {
        id: 'bk-unassigned-1',
        kind: 'Reserved',
        label: 'BK-701',
        bookingNo: 'BK-701',
        from: baseDay,
        to: addDays(baseDay, 2),
      },
      {
        id: 'bk-unassigned-2',
        kind: 'Reserved',
        label: 'BK-702',
        bookingNo: 'BK-702',
        from: addDays(baseDay, 1),
        to: addDays(baseDay, 3),
      },
    ]

    // Even when reference catalogue is available, bars without matching unitId/resourceId are never allocated
    const lanes = buildResourceTimeline(unassignedBars, 'All', ARCHIVED_RESOURCE_CATALOGUE)
    const assignedLanes = lanes.filter((l) => l.bars.length > 0)
    expect(assignedLanes.length).toBe(0)
  })

  it('overlapping bookings for different units do not conflict', () => {
    const multiUnitBars: Bar[] = [
      {
        id: 'bk-unit1',
        kind: 'Reserved',
        label: 'BK-U1',
        bookingNo: 'BK-U1',
        unitId: 'SN-FX6-001',
        resourceId: 'res-fx6',
        from: baseDay,
        to: addDays(baseDay, 3),
      },
      {
        id: 'bk-unit2',
        kind: 'Reserved',
        label: 'BK-U2',
        bookingNo: 'BK-U2',
        unitId: 'SN-KMD-0201',
        resourceId: 'res-komodo',
        from: baseDay,
        to: addDays(baseDay, 3),
      },
    ]

    const lanes = buildResourceTimeline(multiUnitBars, 'All', ARCHIVED_RESOURCE_CATALOGUE)
    const conflictBars = lanes.flatMap((l) => l.bars).filter((b) => b.kind === 'Conflict')
    expect(conflictBars.length).toBe(0)
  })

  it('same physical unit with overlapping half-open intervals does trigger conflict', () => {
    const overlappingSameUnitBars: Bar[] = [
      {
        id: 'bk-overlap-1',
        kind: 'Reserved',
        label: 'BK-O1',
        bookingNo: 'BK-O1',
        unitId: 'SN-FX6-001',
        resourceId: 'res-fx6',
        from: baseDay,
        to: addDays(baseDay, 3),
      },
      {
        id: 'bk-overlap-2',
        kind: 'On Rent',
        label: 'BK-O2',
        bookingNo: 'BK-O2',
        unitId: 'SN-FX6-001',
        resourceId: 'res-fx6',
        from: addDays(baseDay, 1),
        to: addDays(baseDay, 4),
      },
    ]

    const lanes = buildResourceTimeline(overlappingSameUnitBars, 'All', ARCHIVED_RESOURCE_CATALOGUE)
    const fx6Lane = lanes.find((l) => l.id === 'res-fx6')
    const conflictBars = fx6Lane?.bars.filter((b) => b.kind === 'Conflict') ?? []
    expect(conflictBars.length).toBe(1)
    expect(conflictBars[0]?.sub).toContain('Double Booking')
    expect(conflictBars[0]?.dot).toBe('danger')
  })

  it('back-to-back assignments on the same physical unit do NOT conflict (strict half-open [from, to))', () => {
    // Booking 1: Day 0 to Day 2
    // Booking 2: Day 2 to Day 4
    // Day 2 is the exact handover instant — they do NOT overlap
    const backToBackBars: Bar[] = [
      {
        id: 'bk-b2b-1',
        kind: 'Reserved',
        label: 'BK-B2B-1',
        bookingNo: 'BK-B2B-1',
        unitId: 'SN-FX6-001',
        resourceId: 'res-fx6',
        from: baseDay,
        to: addDays(baseDay, 2),
      },
      {
        id: 'bk-b2b-2',
        kind: 'Reserved',
        label: 'BK-B2B-2',
        bookingNo: 'BK-B2B-2',
        unitId: 'SN-FX6-001',
        resourceId: 'res-fx6',
        from: addDays(baseDay, 2),
        to: addDays(baseDay, 4),
      },
    ]

    const lanes = buildResourceTimeline(backToBackBars, 'All', ARCHIVED_RESOURCE_CATALOGUE)
    const fx6Lane = lanes.find((l) => l.id === 'res-fx6')
    const conflictBars = fx6Lane?.bars.filter((b) => b.kind === 'Conflict') ?? []
    expect(conflictBars.length).toBe(0)
    expect(fx6Lane?.bars.length).toBe(2)
  })

  it('no fabricated crew, vehicles, serials or capacities appear in production', () => {
    const lanes = buildResourceTimeline([
      {
        id: 'bk-any',
        kind: 'Reserved',
        label: 'BK-999',
        bookingNo: 'BK-999',
        from: baseDay,
        to: addDays(baseDay, 2),
      },
    ])
    expect(lanes.length).toBe(0)
  })
})

describe('P0 Negative Regression 2: Reschedule Persistence Integrity & Fail-Closed Guarding', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mockShowSuccessToast.mockClear()
    mockShowErrorToast.mockClear()
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('no success without persistent command (button disabled and fails closed)', () => {
    const testBar: Bar = {
      id: 'bk-test-1',
      kind: 'Reserved',
      label: 'BK-TEST-1',
      bookingNo: 'BK-TEST-1',
      from: mockDates.baseDay,
      to: mockDates.addDays(mockDates.baseDay, 2),
    }

    const mockOnSuccess = vi.fn()
    const mockOnClose = vi.fn()

    act(() => {
      root.render(
        <MemoryRouter>
          <RescheduleModal
            bar={testBar}
            allBars={[testBar]}
            onClose={mockOnClose}
            onSuccess={mockOnSuccess}
            // onPersistCommand is omitted: must fail closed!
          />
        </MemoryRouter>,
      )
    })

    // The Confirm button must be disabled
    const confirmBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Confirm Date Adjustment'),
    )
    expect(confirmBtn).toBeDefined()
    expect(confirmBtn?.disabled).toBe(true)

    // Clicking does not call onSuccess or onClose
    act(() => {
      confirmBtn?.click()
    })
    expect(mockOnSuccess).not.toHaveBeenCalled()
    expect(mockOnClose).not.toHaveBeenCalled()
  })

  it('no timer-only approval: rejected persistence command shows error and does NOT close dialog or fire success', async () => {
    const testBar: Bar = {
      id: 'bk-test-2',
      kind: 'Reserved',
      label: 'BK-TEST-2',
      bookingNo: 'BK-TEST-2',
      from: mockDates.baseDay,
      to: mockDates.addDays(mockDates.baseDay, 2),
    }

    const mockOnSuccess = vi.fn()
    const mockOnClose = vi.fn()
    const mockRejectCommand = vi.fn().mockRejectedValue(new Error('Concurrency collision: reservation lock failed'))

    act(() => {
      root.render(
        <MemoryRouter>
          <RescheduleModal
            bar={testBar}
            allBars={[testBar]}
            onClose={mockOnClose}
            onSuccess={mockOnSuccess}
            onPersistCommand={mockRejectCommand}
          />
        </MemoryRouter>,
      )
    })

    const confirmBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Confirm Date Adjustment'),
    )
    expect(confirmBtn?.disabled).toBe(false)

    await act(async () => {
      confirmBtn?.click()
    })

    // Command was called
    expect(mockRejectCommand).toHaveBeenCalled()

    // Must NOT have called onSuccess or onClose
    expect(mockOnSuccess).not.toHaveBeenCalled()
    expect(mockOnClose).not.toHaveBeenCalled()

    // Error must be displayed inline
    expect(container.textContent).toContain('Reschedule Failed')
    expect(container.textContent).toContain('Concurrency collision: reservation lock failed')
  })

  it('successful authorized command readback permits success and closes modal', async () => {
    const testBar: Bar = {
      id: 'bk-test-3',
      kind: 'Reserved',
      label: 'BK-TEST-3',
      bookingNo: 'BK-TEST-3',
      from: mockDates.baseDay,
      to: mockDates.addDays(mockDates.baseDay, 2),
    }

    const mockOnSuccess = vi.fn()
    const mockOnClose = vi.fn()
    const mockResolveCommand = vi.fn().mockResolvedValue(undefined)

    act(() => {
      root.render(
        <MemoryRouter>
          <RescheduleModal
            bar={testBar}
            allBars={[testBar]}
            onClose={mockOnClose}
            onSuccess={mockOnSuccess}
            onPersistCommand={mockResolveCommand}
          />
        </MemoryRouter>,
      )
    })

    const confirmBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Confirm Date Adjustment'),
    )

    await act(async () => {
      confirmBtn?.click()
    })

    expect(mockResolveCommand).toHaveBeenCalled()
    expect(mockOnSuccess).toHaveBeenCalledWith(
      'BK-TEST-3',
      expect.any(Date),
      expect.any(Date),
    )
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('guards direct in-calendar reschedule in Calendar UI and routes staff to Rentals Hub lifecycle', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/calendar?view=day&d=2026-08-01']}>
          <Calendar />
        </MemoryRouter>,
      )
    })

    const movementBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('BK-901'),
    )
    expect(movementBtn).toBeDefined()

    await act(async () => {
      movementBtn?.click()
    })

    const rescheduleBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Reschedule'),
    )
    expect(rescheduleBtn).toBeDefined()

    await act(async () => {
      rescheduleBtn?.click()
    })

    // Reschedule modal opens with Lifecycle Guard and Open in Rentals Hub
    expect(container.textContent).toContain('Lifecycle Guard')
    expect(container.textContent).toContain('In-calendar direct rescheduling is disabled')
    expect(container.textContent).toContain('Open in Rentals Hub')

    const confirmBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Confirm Date Adjustment'),
    )
    // The button must be disabled in production Calendar (fail closed)
    expect(confirmBtn?.disabled).toBe(true)
  })
})
