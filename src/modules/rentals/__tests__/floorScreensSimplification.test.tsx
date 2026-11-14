// @vitest-environment jsdom
// =============================================================================
// src/modules/rentals/__tests__/floorScreensSimplification.test.tsx
// Card E-4: Floor screens simplification (R-10.7)
// Ruling: "Pack, Handover, Return, Reset screens — Scan + list + 1 button;
//          everything else behind More. One primary verb per screen (56px).
//          Secondary actions move into one More menu. No gate, checklist or
//          evidence step is removed."
// =============================================================================

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, expect, it, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../../../components/ui/Toast'
import PackingWorkspace from '../PackingWorkspace'
import HandoverWorkspace from '../HandoverWorkspace'
import ReturnWorkspace from '../ReturnWorkspace'
import ResetWorkspace from '../ResetWorkspace'

import { fetchFloorBooking, type FloorBooking } from '../../../lib/queries/bookings'
import { loadMockClient } from '../../../lib/supabase'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const mockBooking: FloorBooking = {
  id: 'b-e4-test',
  bookingNo: 'BK-2026-0950',
  stage: 'Booked',
  clientName: 'Sita Films',
  project: 'Feature Film',
  deliveryType: 'Client Pickup',
  isCancelled: false,
  isClosed: false,
  actualReturnAtAd: null,
  pickupAtAd: '2026-11-20T06:00:00Z',
  returnAtAd: '2026-11-25T06:00:00Z',
  linesPresence: 'present' as const,
  lines: [
    {
      id: 'line-1',
      qty: 1,
      lineType: 'item',
      description: null,
      productId: 'eq-1',
      productName: 'Sony FX3 Cinema Camera',
      trackingMode: 'serialized',
      parentLineId: null,
      sortOrder: 1,
      unitsPresence: 'present',
      units: [
        {
          id: 'u-1',
          assetId: 'CAM-01',
          serial: 'SN-FX3-001',
          assetTag: 'CAM-01',
          unitState: 'Available',
          isRequired: true,
          packed: false,
          damaged: false,
          location: 'Shelf A',
        },
      ],
    },
  ],
}

vi.mock('../../../lib/queries/bookings', () => ({
  fetchFloorBooking: vi.fn().mockImplementation((_id: string) => Promise.resolve({
    ...mockBooking,
  })),
  fetchBookingForReturn: vi.fn().mockImplementation((_id: string) => Promise.resolve({
    ...mockBooking,
    stage: 'On Rent',
  })),
  fetchResetBooking: vi.fn().mockImplementation((_id: string) => Promise.resolve({
    ...mockBooking,
    stage: 'Returned',
  })),
}))

vi.mock('../../../lib/queries/serviceDue', () => ({
  readServiceDue: vi.fn().mockResolvedValue(new Map()),
}))

vi.mock('../../../lib/queries/returnIntakeFacts', () => ({
  fetchReturnQuantityFacts: vi.fn().mockResolvedValue({
    lines: [{ lineId: 'line-1', expectedQuantity: 1, returnedQuantity: 0, remainingQuantity: 1, itemName: 'Sony FX3' }],
    receipts: [],
  }),
}))

vi.mock('../../../lib/queries/evidence', () => ({
  fetchOperationEvidence: vi.fn().mockResolvedValue({ files: 1, filesByUnit: {} }),
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'usr-e4', name: 'Floor Operator', role: 'Warehouse' },
    logout: vi.fn(),
  }),
}))

describe('Card E-4: Floor screens simplification (R-10.7)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeAll(async () => {
    await loadMockClient()
  })

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mockBooking.stage = 'Booked'
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('Packing screen displays Scan HUD + list + single 56px Complete Packing verb + More menu', async () => {
    mockBooking.stage = 'Booked'
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/rentals/b-e4-test/pack']}>
          <ToastProvider>
            <Routes>
              <Route path="/rentals/:id/pack" element={<PackingWorkspace />} />
            </Routes>
          </ToastProvider>
        </MemoryRouter>
      )
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 60))
    })

    // 1. Scan HUD exists
    expect(container.querySelector('.floor-scanner-hud')).toBeTruthy()

    // 2. Primary verb Complete Packing is prominent (56px min-height)
    const buttons = Array.from(container.querySelectorAll('button'))
    const completeBtn = buttons.find((b) => b.textContent?.includes('Complete Packing'))
    expect(completeBtn).toBeDefined()
    expect(completeBtn?.style.minHeight).toBe('56px')

    // 3. Secondary actions are inside the More packing actions overflow menu
    const moreMenuTrigger = buttons.find((b) => b.getAttribute('aria-label') === 'More packing actions')
    expect(moreMenuTrigger).toBeDefined()
    expect(moreMenuTrigger?.getAttribute('aria-haspopup')).toBe('menu')

    await act(async () => {
      moreMenuTrigger?.click()
    })

    const menuItems = Array.from(document.body.querySelectorAll('[role="menuitem"]'))
    expect(menuItems.some((item) => item.textContent?.includes('Quick Pack All'))).toBe(true)
    expect(menuItems.some((item) => item.textContent?.includes('Mark Pending Packed'))).toBe(true)
  })

  it('Handover screen displays Scan bar + list + single 56px Complete Handover verb + More menu', async () => {
    vi.mocked(fetchFloorBooking).mockImplementation(() => Promise.resolve({
      ...mockBooking,
      stage: 'Packed',
    } as FloorBooking))

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/rentals/BK-2026-0950/handover']}>
          <ToastProvider>
            <Routes>
              <Route path="/rentals/:bookingNo/handover" element={<HandoverWorkspace />} />
            </Routes>
          </ToastProvider>
        </MemoryRouter>
      )
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 60))
    })

    // 1. Scan bar exists
    expect(container.querySelector('.floor-scanner-input-wrap')).toBeTruthy()

    // 2. Primary verb Complete Handover / Complete Session is prominent (56px min-height)
    const buttons = Array.from(container.querySelectorAll('button'))
    const completeBtn = buttons.find((b) => b.textContent?.includes('Complete Handover') || b.textContent?.includes('Complete Session'))
    expect(completeBtn).toBeDefined()
    expect(completeBtn?.style.minHeight).toBe('56px')

    // 3. More handover actions menu exists
    const moreMenuTrigger = buttons.find((b) => b.getAttribute('aria-label') === 'More handover actions')
    expect(moreMenuTrigger).toBeDefined()

    await act(async () => {
      moreMenuTrigger?.click()
    })

    const menuItems = Array.from(document.body.querySelectorAll('[role="menuitem"]'))
    expect(menuItems.some((item) => item.textContent?.includes('Mark Ready Picked Up'))).toBe(true)
    expect(menuItems.some((item) => item.textContent?.includes('Field Delivery'))).toBe(true)
  })

  it('Return screen displays Scan HUD + list + single 56px Complete Return verb + More menu', async () => {
    vi.mocked(fetchFloorBooking).mockImplementation(() => Promise.resolve({
      ...mockBooking,
      stage: 'On Rent',
    } as FloorBooking))

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/rentals/BK-2026-0950/return']}>
          <ToastProvider>
            <Routes>
              <Route path="/rentals/:bookingNo/return" element={<ReturnWorkspace />} />
            </Routes>
          </ToastProvider>
        </MemoryRouter>
      )
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 60))
    })

    // 1. Scan HUD exists
    expect(container.querySelector('.floor-scanner-hud')).toBeTruthy()

    // 2. Primary verb Complete Return / Complete Session is prominent (56px min-height)
    const buttons = Array.from(container.querySelectorAll('button'))
    const completeBtn = buttons.find((b) => b.textContent?.includes('Complete Return') || b.textContent?.includes('Complete Session'))
    expect(completeBtn).toBeDefined()
    expect(completeBtn?.style.minHeight).toBe('56px')

    // 3. More return actions menu exists
    const moreMenuTrigger = buttons.find((b) => b.getAttribute('aria-label') === 'More return actions')
    expect(moreMenuTrigger).toBeDefined()

    await act(async () => {
      moreMenuTrigger?.click()
    })

    const menuItems = Array.from(document.body.querySelectorAll('[role="menuitem"]'))
    expect(menuItems.some((item) => item.textContent?.includes('Check In All Clean'))).toBe(true)
  })

  it('Reset screen displays Search/Scan bar + queue list + single 56px Complete Reset verb + More menu', async () => {
    vi.mocked(fetchFloorBooking).mockImplementation(() => Promise.resolve({
      ...mockBooking,
      stage: 'Returned',
    } as FloorBooking))

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/rentals/BK-2026-0950/reset']}>
          <ToastProvider>
            <Routes>
              <Route path="/rentals/:bookingNo/reset" element={<ResetWorkspace />} />
            </Routes>
          </ToastProvider>
        </MemoryRouter>
      )
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 60))
    })

    // 1. Search/Scan bar exists
    expect(container.querySelector('input[aria-label="Search the reset queue"]')).toBeTruthy()

    // 2. Primary verb Complete Reset is prominent (56px min-height)
    const buttons = Array.from(container.querySelectorAll('button'))
    const completeBtn = buttons.find((b) => b.textContent?.includes('Complete Reset'))
    expect(completeBtn).toBeDefined()
    expect(completeBtn?.style.minHeight).toBe('56px')

    // 3. More reset actions menu exists
    const moreMenuTrigger = buttons.find((b) => b.getAttribute('aria-label') === 'More reset actions')
    expect(moreMenuTrigger).toBeDefined()

    await act(async () => {
      moreMenuTrigger?.click()
    })

    const menuItems = Array.from(document.body.querySelectorAll('[role="menuitem"]'))
    expect(menuItems.some((item) => item.textContent?.includes('Clean all → QC'))).toBe(true)
    expect(menuItems.some((item) => item.textContent?.includes('Select All Visible'))).toBe(true)
  })
})
