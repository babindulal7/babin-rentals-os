// @vitest-environment jsdom
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceActions } from '../OperationsShell'
import OperationsShell from '../OperationsShell'
import BookingOperationsMenu from '../../rentals/BookingOperationsMenu'
import { OperationsWorkspaceProvider } from '../OperationsWorkspaceContext'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

let mockDirty = false
let mockBlocked: string | null = null
let mockError: string | null = null
const mockComplete = vi.fn()
const mockFocusBlocker = vi.fn()

interface MockProps {
  bookingNo?: string
  onConfirmSuccess?: () => void
  onRegisterActions?: (actions: WorkspaceActions) => void
}

function MockWorkspace({ bookingNo, onConfirmSuccess, onRegisterActions }: MockProps) {
  useEffect(() => {
    onRegisterActions?.({
      canComplete: mockBlocked === null,
      blockedReason: mockBlocked,
      dispatching: false,
      isDirty: mockDirty,
      label: 'Confirm Action',
      complete: () => {
        mockComplete()
        onConfirmSuccess?.()
      },
      error: mockError,
      focusBlocker: mockFocusBlocker,
    })
  }, [onConfirmSuccess, onRegisterActions])

  return (
    <div className="mock-workspace" data-booking={bookingNo}>
      <input id="operations-command-input" className="floor-scanner-input" placeholder="Scan barcode" />
      <div id="handover-receiver-sig" data-blocker-target="signature" tabIndex={-1}>Signature Pad</div>
      <div data-blocker-target="photo" tabIndex={-1}>Photo Uploader</div>
      <div data-blocker-target="condition" tabIndex={-1}>Condition Selector</div>
    </div>
  )
}

let mockBookingStage = 'Booked'

vi.mock('../../rentals/PackingWorkspace', () => ({ default: MockWorkspace }))
vi.mock('../../rentals/HandoverWorkspace', () => ({ default: MockWorkspace }))
vi.mock('../../rentals/ReturnWorkspace', () => ({ default: MockWorkspace }))
vi.mock('../../rentals/ResetWorkspace', () => ({ default: MockWorkspace }))
vi.mock('../../rentals/actions/RentalMoreActions', () => ({
  RentalMoreActions: () => <button aria-label="Booking actions">Booking actions</button>,
}))

vi.mock('../../../lib/queries/bookings', () => ({
  fetchFloorBooking: vi.fn().mockImplementation(async (bookingNo: string) => ({
    id: 'b-999',
    bookingNo,
    stage: mockBookingStage,
    clientName: 'Sagarmatha Productions',
    pickupAtAd: '2026-10-24T09:00:00Z',
    returnAtAd: '2026-10-28T18:00:00Z',
    deliveryType: 'pickup',
    isCancelled: false,
    isClosed: false,
    linesPresence: 'present',
    lines: [
      {
        id: 'l-1',
        qty: 1,
        units: [{ id: 'u-1', packed: true, unit_state: 'Available', damaged: false, released_at: null }],
      },
    ],
  })),
}))

vi.mock('../../../lib/queries/operationTaskFacts', () => ({
  fetchOperationTaskFacts: vi.fn(async () => ({
    total: 2,
    resetDone: 1,
    cleaningPending: 1,
    qcPending: 0,
    problems: 0,
  })),
}))

vi.mock('../../../lib/device', async (orig) => ({
  ...(await orig<typeof import('../../../lib/device')>()),
  useViewport: () => 'desktop' as const,
}))

let mockUserRole = 'Warehouse'
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Rabin Dulal', role: mockUserRole, branchId: 'br-main' },
    isAuthenticated: true,
    loading: false,
    isLocked: false,
  }),
}))

describe('Quick Operations Pop-up UX (v1.2 Spec)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    mockDirty = false
    mockBlocked = null
    mockError = null
    mockBookingStage = 'Booked'
    mockUserRole = 'Warehouse'
    mockComplete.mockClear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  describe('1-click stage opening via BookingOperationsMenu', () => {
    it('opens Pack in 1-click for Booked status', async () => {
      mockBookingStage = 'Booked'
      await act(async () => {
        root.render(
          <MemoryRouter>
            <OperationsWorkspaceProvider>
              <BookingOperationsMenu bookingNo="BK-101" bookingStatus="Booked" />
            </OperationsWorkspaceProvider>
          </MemoryRouter>
        )
      })

      const quickBtn = container.querySelector<HTMLButtonElement>('.booking-operations__quick')
      expect(quickBtn).not.toBeNull()
      expect(quickBtn?.textContent).toContain('Packing')

      await act(async () => {
        quickBtn?.click()
      })

      // The Operations modal opens directly
      expect(container.querySelector('[role="dialog"]')).not.toBeNull()
      expect(container.textContent).toContain('Operations · BK-101')
      const activeStage = container.querySelector<HTMLButtonElement>('.operations-shell__stage[aria-current="step"]')
      expect(activeStage?.textContent).toContain('Pack')
    })

    it('opens Handover in 1-click for Packed status', async () => {
      mockBookingStage = 'Packed'
      await act(async () => {
        root.render(
          <MemoryRouter>
            <OperationsWorkspaceProvider>
              <BookingOperationsMenu bookingNo="BK-102" bookingStatus="Packed" />
            </OperationsWorkspaceProvider>
          </MemoryRouter>
        )
      })

      const quickBtn = container.querySelector<HTMLButtonElement>('.booking-operations__quick')
      expect(quickBtn).not.toBeNull()
      expect(quickBtn?.textContent).toContain('Handover')

      await act(async () => {
        quickBtn?.click()
      })

      expect(container.querySelector('[role="dialog"]')).not.toBeNull()
      const activeStage = container.querySelector<HTMLButtonElement>('.operations-shell__stage[aria-current="step"]')
      expect(activeStage?.textContent).toContain('Hand')
    })

    it('opens Return in 1-click for On Rent status', async () => {
      mockBookingStage = 'On Rent'
      await act(async () => {
        root.render(
          <MemoryRouter>
            <OperationsWorkspaceProvider>
              <BookingOperationsMenu bookingNo="BK-103" bookingStatus="On Rent" />
            </OperationsWorkspaceProvider>
          </MemoryRouter>
        )
      })

      const quickBtn = container.querySelector<HTMLButtonElement>('.booking-operations__quick')
      expect(quickBtn).not.toBeNull()
      expect(quickBtn?.textContent).toContain('Return')

      await act(async () => {
        quickBtn?.click()
      })

      expect(container.querySelector('[role="dialog"]')).not.toBeNull()
      const activeStage = container.querySelector<HTMLButtonElement>('.operations-shell__stage[aria-current="step"]')
      expect(activeStage?.textContent).toContain('Return')
    })

    it('opens Reset in 1-click for Returned status', async () => {
      mockBookingStage = 'Returned'
      await act(async () => {
        root.render(
          <MemoryRouter>
            <OperationsWorkspaceProvider>
              <BookingOperationsMenu bookingNo="BK-104" bookingStatus="Returned" />
            </OperationsWorkspaceProvider>
          </MemoryRouter>
        )
      })

      const quickBtn = container.querySelector<HTMLButtonElement>('.booking-operations__quick')
      expect(quickBtn).not.toBeNull()
      expect(quickBtn?.textContent).toContain('Cleaning')

      await act(async () => {
        quickBtn?.click()
      })

      expect(container.querySelector('[role="dialog"]')).not.toBeNull()
      const activeStage = container.querySelector<HTMLButtonElement>('.operations-shell__stage[aria-current="step"]')
      expect(activeStage?.textContent).toContain('Reset')
    })
  })

  describe('Sticky footer, blocker hints, and blocker jump link', () => {
    it('displays human-readable blocker and provides jump button to focus blocker', async () => {
      mockBlocked = 'Client signature is required before handover'
      mockBookingStage = 'Packed'

      await act(async () => {
        root.render(
          <MemoryRouter>
            <OperationsShell
              bookingNo="BK-201"
              bookingStatus="Packed"
              isOpen={true}
              onClose={() => {}}
              initialJob="Handover"
            />
          </MemoryRouter>
        )
      })

      const blockerText = container.querySelector('.operations-shell__blocked')
      expect(blockerText).not.toBeNull()
      expect(blockerText?.textContent).toContain('Still needed: Client signature is required before handover')

      const jumpBtn = container.querySelector<HTMLButtonElement>('.operations-shell__blocked-jump')
      expect(jumpBtn).not.toBeNull()
      expect(jumpBtn?.getAttribute('aria-label')).toContain('Jump to Client signature is required before handover')

      await act(async () => {
        jumpBtn?.click()
      })

      expect(mockFocusBlocker).toHaveBeenCalledWith(expect.any(HTMLElement))
    })

    it('primary confirm button is disabled while blocker is present and enables when resolved', async () => {
      mockBlocked = 'Scan remaining 1 item'
      mockBookingStage = 'Booked'

      await act(async () => {
        root.render(
          <MemoryRouter>
            <OperationsShell
              bookingNo="BK-202"
              bookingStatus="Booked"
              isOpen={true}
              onClose={() => {}}
              initialJob="Pack"
            />
          </MemoryRouter>
        )
      })

      const confirmBtn = container.querySelector<HTMLButtonElement>('.operations-shell__footer button.ui-button--primary')
      expect(confirmBtn).not.toBeNull()
      expect(confirmBtn?.disabled).toBe(true)

      // When blocker clears
      mockBlocked = null
      await act(async () => {
        root.render(
          <MemoryRouter>
            <OperationsShell
              bookingNo="BK-202"
              bookingStatus="Booked"
              isOpen={true}
              onClose={() => {}}
              initialJob="Pack"
            />
          </MemoryRouter>
        )
      })

      expect(confirmBtn?.disabled).toBe(false)
    })
  })

  describe('Keyboard navigation & shortcut handling', () => {
    it('focuses scanner input when "/" is pressed outside input fields', async () => {
      mockBookingStage = 'Booked'

      await act(async () => {
        root.render(
          <MemoryRouter>
            <OperationsShell
              bookingNo="BK-301"
              bookingStatus="Booked"
              isOpen={true}
              onClose={() => {}}
              initialJob="Pack"
            />
          </MemoryRouter>
        )
      })

      const scannerInput = container.querySelector<HTMLInputElement>('.floor-scanner-input')
      expect(scannerInput).not.toBeNull()
      const focusSpy = vi.spyOn(scannerInput!, 'focus')

      // Press "/" on window
      const event = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true })
      window.dispatchEvent(event)

      expect(event.defaultPrevented).toBe(true)
      expect(focusSpy).toHaveBeenCalled()
    })

    it('switches between unlocked stages using numeric keys 1-4', async () => {
      // Stage is On Rent, so Pack (1), Handover (2), and Return (3) are unlocked
      mockBookingStage = 'On Rent'

      await act(async () => {
        root.render(
          <MemoryRouter>
            <OperationsShell
              bookingNo="BK-302"
              bookingStatus="On Rent"
              isOpen={true}
              onClose={() => {}}
              initialJob="Return"
            />
          </MemoryRouter>
        )
      })

      let activeStage = container.querySelector('.operations-shell__stage[aria-current="step"]')
      expect(activeStage?.textContent).toContain('Return')

      // Press '1' to switch to Pack
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true, cancelable: true }))
      })

      activeStage = container.querySelector('.operations-shell__stage[aria-current="step"]')
      expect(activeStage?.textContent).toContain('Pack')
    })
  })

  describe('Dirty-state protection dialog', () => {
    it('prompts confirmation when closing or switching with unsaved changes', async () => {
      mockDirty = true
      mockBookingStage = 'Booked'
      const onCloseSpy = vi.fn()

      await act(async () => {
        root.render(
          <MemoryRouter>
            <OperationsShell
              bookingNo="BK-401"
              bookingStatus="Booked"
              isOpen={true}
              onClose={onCloseSpy}
              initialJob="Pack"
            />
          </MemoryRouter>
        )
      })

      // Attempt to close via Close button (Prev on first step triggers close)
      const closeBtn = container.querySelector<HTMLButtonElement>('.operations-shell__footer button.ui-button--secondary')
      expect(closeBtn).not.toBeNull()

      await act(async () => {
        closeBtn?.click()
      })

      // Confirmation dialog should appear and onClose should NOT have been called yet
      expect(onCloseSpy).not.toHaveBeenCalled()
      expect(container.textContent).toContain('Discard unsaved operations work?')

      // Click Keep Editing / Stay Here
      const stayBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Keep Editing'
      )
      expect(stayBtn).not.toBeUndefined()
      await act(async () => {
        stayBtn?.click()
      })
      expect(onCloseSpy).not.toHaveBeenCalled()

      // Click close again, then Discard Changes
      await act(async () => {
        closeBtn?.click()
      })
      const discardBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Discard Changes'
      )
      expect(discardBtn).not.toBeUndefined()
      await act(async () => {
        discardBtn?.click()
      })
      expect(onCloseSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('Role-based money blindness (Law 6 & Law 17)', () => {
    it('renders zero currency symbols, paisa, or rates for Warehouse role', async () => {
      mockUserRole = 'Warehouse'
      mockBookingStage = 'Booked'

      await act(async () => {
        root.render(
          <MemoryRouter>
            <OperationsShell
              bookingNo="BK-501"
              bookingStatus="Booked"
              isOpen={true}
              onClose={() => {}}
              initialJob="Pack"
            />
          </MemoryRouter>
        )
      })

      const text = container.textContent ?? ''
      expect(text).not.toContain('Rs')
      expect(text).not.toContain('NPR')
      expect(text).not.toContain('रु')
      expect(text).not.toContain('paisa')
      expect(text).not.toContain('Deposit')
      expect(text).not.toContain('Total:')
    })
  })
})
