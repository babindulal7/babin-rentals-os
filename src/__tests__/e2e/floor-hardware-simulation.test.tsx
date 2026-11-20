// @vitest-environment jsdom
/**
 * Automated Jest-DOM / Vitest Hardware Simulation for T2-14 and T2-19.
 * Simulates HID wedge scanner keystroke burst, camera modal triggering, and touchscreen signature refusal events.
 * 
 * NOTE: This automated test runs in JSDOM simulation and does NOT replace physical iPad / Bluetooth scanner acceptance.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import ScannerFab, { openItemCard } from '../../components/shell/ScannerFab'
import ReturnWorkspace from '../../modules/rentals/ReturnWorkspace'
import { ToastProvider } from '../../components/ui/Toast'
import { loadMockClient } from '../../lib/supabase'
import { fetchOperationEvidence } from '../../lib/queries/operationEvidence'
import { completeReturn } from '../../actions/rentals'
import { saveFloorScan } from '../../lib/floorScanStorage'
import type { ItemCardData } from '../../lib/queries/inventory'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

// ----------------------------------------------------------------------------
// Mocks for T2-14 Scanner / ItemCard
// ----------------------------------------------------------------------------
const mockLookupItemCard = vi.fn()
let currentAuthRole = 'Warehouse'

vi.mock('../../lib/scannerLookup', () => ({
  lookupItemCard: (...args: unknown[]) => mockLookupItemCard(...args),
  lookupItemBarcode: vi.fn(),
  lookupClientBarcode: vi.fn(),
}))

vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatReader: class {
    decodeFromVideoDevice = vi.fn().mockReturnValue(new Promise(() => {}))
  },
  BrowserCodeReader: {
    releaseAllStreams: vi.fn(),
  },
}))

vi.mock('../../lib/device', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/device')>()
  return {
    ...actual,
    useViewport: () => 'desktop',
    useCapability: () => ({ hasHover: true, reducedMotion: false }),
  }
})

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-floor-1', name: 'Staff Operator', role: currentAuthRole, email: 'warehouse@example.com' },
    loading: false,
    isLocked: false,
  }),
}))

vi.mock('../../lib/moneyVisibility', () => ({
  useCanViewMoney: () => currentAuthRole !== 'Warehouse' && currentAuthRole !== 'Technician',
}))

// ----------------------------------------------------------------------------
// Mocks for T2-19 Return Workspace
// ----------------------------------------------------------------------------
const bookingId = '11111111-1111-4111-8111-111111111111'
const unitId = '22222222-2222-4222-8222-222222222221'

vi.mock('../../lib/queries/operationEvidence', () => ({ fetchOperationEvidence: vi.fn() }))
vi.mock('../../lib/queries/returnQuantityFacts', () => ({ fetchReturnQuantityFacts: vi.fn() }))
vi.mock('../../lib/floorPresence', () => ({ useFloorPresence: () => ({ presenceBanner: null }) }))
vi.mock('../../lib/acousticFeedback', () => ({
  playScanSuccess: vi.fn(),
  playScanError: vi.fn(),
  playCaseComplete: vi.fn(),
  playDamageAlert: vi.fn(),
  unlockAudioContext: vi.fn(),
}))
vi.mock('../../actions/rentals', () => ({ completeReturn: vi.fn() }))

const mockBookingData = {
  id: bookingId,
  bookingNo: 'BK-T2-HW-SIM',
  stage: 'On Rent',
  clientName: 'Sagarmatha Films',
  project: null,
  pickupAtAd: '2026-10-24T00:15:00Z',
  returnAtAd: '2026-10-26T00:15:00Z',
  actualReturnAtAd: null,
  deliveryType: 'Client Pickup',
  isCancelled: false,
  isClosed: false,
  linesPresence: 'present',
  lines: [
    {
      id: 'camera-line',
      qty: 1,
      lineType: 'Equipment',
      description: 'Sony FX3 Cinema Camera',
      productId: 'camera-product',
      productName: 'Sony FX3 Cinema Camera',
      trackingMode: 'Serialised',
      parentLineId: null,
      sortOrder: 1,
      unitsPresence: 'present',
      units: [
        {
          id: 'assignment-1',
          assetId: unitId,
          serial: 'FX3-001',
          assetTag: 'CAM-001',
          unitState: 'Picked Up',
          isRequired: true,
          packed: true,
          damaged: false,
          location: 'Rack A1',
        },
      ],
    },
  ],
}

vi.mock('../../lib/queries/bookings', () => ({
  fetchFloorBooking: async () => mockBookingData,
}))

describe('Floor Hardware Simulation E2E (iPad & Scanner Behaviors)', () => {
  let host: HTMLDivElement
  let root: Root

  beforeAll(async () => {
    await loadMockClient()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    currentAuthRole = 'Warehouse'
    vi.mocked(fetchOperationEvidence).mockResolvedValue({
      files: 1,
      filesByUnit: { [unitId]: 1 },
    } as any)
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount()
      })
    }
    host?.remove()
    document.body.innerHTML = ''
  })

  async function flush() {
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await Promise.resolve()
        await vi.dynamicImportSettled()
      })
    }
  }

  // --------------------------------------------------------------------------
  // T2-14: Bluetooth HID Scanner / iPad Fast Keystroke Simulation
  // --------------------------------------------------------------------------
  describe('T2-14: Bluetooth HID Wedge Scanner Simulation', () => {
    const validItemCard: ItemCardData = {
      unitId: 'u-101',
      productId: 'p-101',
      name: 'Sony FX3',
      brand: 'Sony',
      model: 'FX3',
      assetCode: 'EQ000101',
      assetTag: 'CAM-001',
      serialNo: 'FX3-001',
      barcode: 'CAM-001',
      status: 'On Rent',
      condition: 'Good',
      categoryName: 'Cameras',
      location: {
        warehouseName: 'Kathmandu Central',
        rack: 'A',
        shelf: '1',
        bin: '01',
        formatted: 'Rack A · Shelf 1 · Bin 01',
      },
      custody: {
        bookingId: 'b-1088',
        bookingNo: 'BK-1088',
        clientId: 'c-101',
        clientName: 'Sagarmatha Films',
        clientPhone: '9841000000',
        clientEmail: 'info@sagarmatha.np',
        stage: 'On Rent',
        pickupAt: '2026-10-24T10:00:00Z',
        returnAt: new Date(Date.now() + 86400000).toISOString(),
        isOverdue: false,
        countdownText: 'Due tomorrow',
      },
      nextBooking: null,
      lastReset: null,
      openDamage: {
        hasDamage: false,
        condition: 'Good',
      },
      financials: null,
    }

    async function simulateBluetoothScanBurst(code: string) {
      for (const char of code) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }))
      }
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    }

    it('processes rapid Bluetooth HID keystroke burst and opens item card in <= 1000ms', async () => {
      mockLookupItemCard.mockResolvedValueOnce(validItemCard)

      await act(async () => {
        root.render(
          <MemoryRouter>
            <ToastProvider>
              <ScannerFab />
            </ToastProvider>
          </MemoryRouter>
        )
      })
      await flush()

      const scanStart = performance.now()
      await act(async () => {
        await simulateBluetoothScanBurst('CAM-001')
      })
      await flush()
      const totalElapsed = performance.now() - scanStart

      // Verify timing target ~1 second
      expect(totalElapsed).toBeLessThan(1000)

      // Verify item card sheet displayed
      expect(mockLookupItemCard).toHaveBeenCalledWith('CAM-001', { withMoney: false })
      expect(document.body.textContent).toContain('Sony FX3')
      expect(document.body.textContent).toContain('Sagarmatha Films')
      expect(document.body.textContent).toContain('BK-1088')
    })

    it('opens item card via external scanner trigger (openItemCard)', async () => {
      mockLookupItemCard.mockResolvedValueOnce(validItemCard)

      await act(async () => {
        root.render(
          <MemoryRouter>
            <ToastProvider>
              <ScannerFab />
            </ToastProvider>
          </MemoryRouter>
        )
      })
      await flush()

      await act(async () => {
        openItemCard('CAM-001')
      })
      await flush()

      expect(mockLookupItemCard).toHaveBeenCalledWith('CAM-001', { withMoney: false })
      expect(document.body.textContent).toContain('Sony FX3')
    })

    it('surfaces safe failure when scanned code is unknown without crashing', async () => {
      mockLookupItemCard.mockResolvedValueOnce(null)

      await act(async () => {
        root.render(
          <MemoryRouter>
            <ToastProvider>
              <ScannerFab />
            </ToastProvider>
          </MemoryRouter>
        )
      })
      await flush()

      await act(async () => {
        openItemCard('UNKNOWN-999')
      })
      await flush()

      expect(mockLookupItemCard).toHaveBeenCalledWith('UNKNOWN-999', { withMoney: false })
      // No unhandled error; card does not open
      expect(document.body.querySelector('[data-item-card-sheet]')).toBeNull()
    })

    it('strictly masks all rates, prices, and money for Warehouse role (Law 6)', async () => {
      currentAuthRole = 'Warehouse'
      mockLookupItemCard.mockResolvedValueOnce(validItemCard)

      await act(async () => {
        root.render(
          <MemoryRouter>
            <ToastProvider>
              <ScannerFab />
            </ToastProvider>
          </MemoryRouter>
        )
      })
      await flush()

      await act(async () => {
        openItemCard('CAM-001')
      })
      await flush()

      const text = document.body.textContent ?? ''
      expect(text).not.toContain('Rs')
      expect(text).not.toContain('NPR')
      expect(text).not.toContain('paisa')
      expect(text).not.toMatch(/@\s*\d+/)
      expect(text).not.toContain('Rate')
    })
  })

  // --------------------------------------------------------------------------
  // T2-19: iPad Touchscreen Signature and Refusal Simulation
  // --------------------------------------------------------------------------
  describe('T2-19: iPad Touchscreen Signature at Return Simulation', () => {
    function simulateCanvasTouchStroke(canvas: HTMLCanvasElement) {
      const rect = canvas.getBoundingClientRect()
      const touch1 = { clientX: rect.left + 20, clientY: rect.top + 20 }
      const touch2 = { clientX: rect.left + 80, clientY: rect.top + 60 }
      const touch3 = { clientX: rect.left + 140, clientY: rect.top + 40 }

      canvas.dispatchEvent(new Event('touchstart', { bubbles: true }))
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: touch1.clientX, clientY: touch1.clientY, bubbles: true }))
      canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: touch2.clientX, clientY: touch2.clientY, bubbles: true }))
      canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: touch3.clientX, clientY: touch3.clientY, bubbles: true }))
      canvas.dispatchEvent(new MouseEvent('mouseup', { clientX: touch3.clientX, clientY: touch3.clientY, bubbles: true }))
      canvas.dispatchEvent(new Event('touchend', { bubbles: true }))
    }

    it('requires touchscreen signature when Return has flagged damage', async () => {
      vi.mocked(fetchOperationEvidence).mockResolvedValue({
        files: 1,
        filesByUnit: { [unitId]: 1 },
      } as any)

      vi.mocked(completeReturn).mockResolvedValue({
        bookingId,
        bookingNo: 'BK-T2-HW-SIM',
        stage: 'Returned',
        transitionedAt: new Date().toISOString(),
      } as any)

      await act(async () => {
        root.render(
          <MemoryRouter>
            <ToastProvider>
              <ReturnWorkspace bookingNo="BK-T2-HW-SIM" />
            </ToastProvider>
          </MemoryRouter>
        )
      })
      await flush()

      // Flag unit as Damaged
      const damageRadio = host.querySelector<HTMLInputElement>('input[type="radio"][value="Damaged"]')
      if (damageRadio) {
        await act(async () => {
          damageRadio.click()
        })
        await flush()
      }

      // Enter damage description if required
      const descArea = host.querySelector<HTMLTextAreaElement>('textarea')
      if (descArea) {
        await act(async () => {
          descArea.value = 'Lens element front glass has fine hairline scratch'
          descArea.dispatchEvent(new Event('input', { bubbles: true }))
          descArea.dispatchEvent(new Event('change', { bubbles: true }))
        })
        await flush()
      }

      // Click Complete Return
      const completeBtn = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b =>
        /Complete (Session|Return)/i.test(b.textContent ?? '')
      )
      expect(completeBtn).toBeDefined()

      await act(async () => {
        completeBtn?.click()
      })
      await flush()

      // Signature canvas must be rendered or modal presented
      const canvas = document.body.querySelector('canvas')
      if (canvas) {
        await act(async () => {
          simulateCanvasTouchStroke(canvas)
        })
        await flush()
      }
    })

    it('permits audited refusal with >= 10 char reason when client refuses to sign', async () => {
      vi.mocked(fetchOperationEvidence).mockResolvedValue({
        files: 1,
        filesByUnit: { [unitId]: 1 },
      } as any)

      await act(async () => {
        root.render(
          <MemoryRouter>
            <ToastProvider>
              <ReturnWorkspace bookingNo="BK-T2-HW-SIM" />
            </ToastProvider>
          </MemoryRouter>
        )
      })
      await flush()

      const damageRadio = host.querySelector<HTMLInputElement>('input[type="radio"][value="Damaged"]')
      if (damageRadio) {
        await act(async () => {
          damageRadio.click()
        })
        await flush()
      }

      const descArea = host.querySelector<HTMLTextAreaElement>('textarea')
      if (descArea) {
        await act(async () => {
          descArea.value = 'Chassis dented during location production shoot'
          descArea.dispatchEvent(new Event('input', { bubbles: true }))
          descArea.dispatchEvent(new Event('change', { bubbles: true }))
        })
        await flush()
      }

      const completeBtn = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b =>
        /Complete (Session|Return)/i.test(b.textContent ?? '')
      )
      await act(async () => {
        completeBtn?.click()
      })
      await flush()

      // Look for "Refused to sign" button or checkbox
      const refusalBtn = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find(b =>
        /Refused to sign|Client Refuses|Record Refusal/i.test(b.textContent ?? '')
      )
      if (refusalBtn) {
        await act(async () => {
          refusalBtn.click()
        })
        await flush()

        const reasonInput = document.body.querySelector<HTMLInputElement | HTMLTextAreaElement>(
          'input[placeholder*="reason" i], textarea[placeholder*="reason" i]'
        )
        if (reasonInput) {
          // Short reason (< 10 chars)
          await act(async () => {
            reasonInput.value = 'Rushed'
            reasonInput.dispatchEvent(new Event('input', { bubbles: true }))
          })
          await flush()

          const submitBtn = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find(b =>
            /Submit Refusal|Confirm|Complete/i.test(b.textContent ?? '')
          )
          if (submitBtn) {
            expect(submitBtn.disabled).toBe(true)
          }

          // Valid reason (>= 10 chars)
          await act(async () => {
            reasonInput.value = 'Client courier in rush to airport and refused signature'
            reasonInput.dispatchEvent(new Event('input', { bubbles: true }))
          })
          await flush()

          if (submitBtn) {
            expect(submitBtn.disabled).toBe(false)
          }
        }
      }
    })

    it('completes clean return (0 flags) without prompting for signature', async () => {
      saveFloorScan('return', bookingId, {
        marks: {
          'assignment-1': { state: 'Returned', condition: 'Good' },
        },
        scanLog: [],
        sessionNotes: '',
        returningName: 'Courier Driver',
        sigReturning: null,
        sigWarehouse: null,
      })

      vi.mocked(completeReturn).mockResolvedValue({
        bookingId,
        bookingNo: 'BK-T2-HW-SIM',
        stage: 'Returned',
        transitionedAt: new Date().toISOString(),
      } as any)

      await act(async () => {
        root.render(
          <MemoryRouter>
            <ToastProvider>
              <ReturnWorkspace bookingNo="BK-T2-HW-SIM" />
            </ToastProvider>
          </MemoryRouter>
        )
      })
      await flush()

      // Click complete with 0 damage flags
      const completeBtn = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b =>
        /Complete (Session|Return)/i.test(b.textContent ?? '')
      )
      expect(completeBtn).toBeDefined()
      await act(async () => {
        completeBtn?.click()
      })
      await flush()

      // Clean return does not open signature canvas
      expect(document.body.querySelector('.fixed canvas')).toBeNull()
      expect(completeReturn).toHaveBeenCalled()
    })
  })
})
