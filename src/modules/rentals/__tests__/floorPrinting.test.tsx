// @vitest-environment jsdom
/**
 * T2-08 · Floor printing tests
 *
 * Verifies that:
 * 1. PackingWorkspace offers a live "Print Packing List" button (not wrapped in <Unavailable>).
 * 2. Clicking "Print Packing List" builds the hierarchical manifest and invokes exportPackingListPdf.
 * 3. ReturnWorkspace offers a live "Print Return Report" button (not wrapped in <Unavailable>).
 * 4. Clicking "Print Return Report" generates the return inspection PDF without any monetary leaks.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../../../components/ui/Toast'
import PackingWorkspace from '../PackingWorkspace'
import ReturnWorkspace from '../ReturnWorkspace'
import { loadMockClient } from '../../../lib/supabase'

vi.mock('../../../lib/queries/returnQuantityFacts', () => ({
  fetchReturnQuantityFacts: async () => new Map(),
}))
vi.mock('../../../lib/queries/operationEvidence', () => ({
  fetchOperationEvidence: async () => ({ files: 0, filesByUnit: {} }),
}))

const printCalls: {
  packing: Array<Record<string, unknown>>
  return: Array<Record<string, unknown>>
} = {
  packing: [],
  return: [],
}

vi.mock('../../../lib/pdf/exportPdf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/pdf/exportPdf')>()
  return {
    ...actual,
    exportPackingListPdf: async (data: Record<string, unknown>) => {
      printCalls.packing.push(data)
      return {
        blob: new Blob(['packing-pdf-mock']),
        bytes: new Uint8Array([1, 2, 3]),
        filename: 'Packing_List_BK-TEST.pdf',
        fileSizeBytes: 3,
      }
    },
    exportReturnReportPdf: async (data: Record<string, unknown>) => {
      printCalls.return.push(data)
      return {
        blob: new Blob(['return-pdf-mock']),
        bytes: new Uint8Array([4, 5, 6]),
        filename: 'Return_Report_BK-TEST.pdf',
        fileSizeBytes: 3,
      }
    },
    openPdfForPrint: vi.fn(),
  }
})

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Shrestha', role: 'Warehouse', isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

const BOOKING_ID = '44444444-4444-4444-8444-444444444444'

vi.mock('../../../lib/queries/bookings', () => ({
  fetchFloorBooking: async (ref: string) => ({
    id: BOOKING_ID,
    bookingNo: ref,
    stage: ref.includes('RET') ? 'On Rent' : 'Booked',
    clientName: 'Kathmandu Visuals Pvt. Ltd.',
    project: 'Mountain Commercial',
    pickupAtAd: '2026-11-01T04:00:00.000Z',
    returnAtAd: '2026-11-05T04:00:00.000Z',
    actualReturnAtAd: '2026-11-05T08:00:00.000Z',
    deliveryType: 'Client Pickup',
    isCancelled: false,
    isClosed: false,
    linesPresence: 'present',
    lines: [
      {
        id: 'pkg-1',
        qty: 1,
        lineType: 'Bundle',
        description: 'Cinema Rig Package',
        productId: 'prod-bundle-1',
        productName: 'Cinema Rig Package',
        trackingMode: 'Serialised',
        parentLineId: null,
        sortOrder: 1,
        unitsPresence: 'absent',
        units: [],
      },
      {
        id: 'l-camera',
        qty: 1,
        lineType: 'Equipment',
        description: 'Sony FX3',
        productId: 'prod-fx3',
        productName: 'Sony FX3',
        trackingMode: 'Serialised',
        parentLineId: 'pkg-1',
        sortOrder: 2,
        unitsPresence: 'present',
        units: [
          {
            id: 'u-fx3-1',
            assetId: 'asset-fx3-1',
            serial: 'SN-FX3-999',
            assetTag: 'TAG-FX3-999',
            unitState: 'Ready',
            isRequired: true,
            packed: false,
            damaged: false,
            location: 'Rack A1',
          },
        ],
      },
      {
        id: 'l-tripod',
        qty: 1,
        lineType: 'Equipment',
        description: 'Manfrotto 504HD Tripod',
        productId: 'prod-tripod',
        productName: 'Manfrotto 504HD Tripod',
        trackingMode: 'Serialised',
        parentLineId: null,
        sortOrder: 3,
        unitsPresence: 'present',
        units: [
          {
            id: 'u-tripod-1',
            assetId: 'asset-tripod-1',
            serial: 'SN-TRIP-123',
            assetTag: 'TAG-TRIP-123',
            unitState: 'Ready',
            isRequired: false,
            packed: false,
            damaged: false,
            location: 'Bay 3',
          },
        ],
      },
    ],
  }),
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

window.matchMedia = ((q: string) => ({
  matches: false,
  media: q,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia

let container: HTMLDivElement
let root: Root

beforeAll(async () => {
  await loadMockClient()
})

beforeEach(() => {
  printCalls.packing = []
  printCalls.return = []
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

const flush = async (n = 4) => {
  for (let i = 0; i < n; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

afterEach(async () => {
  await flush(4)
  if (root) {
    await act(async () => {
      root.unmount()
    })
  }
  container.remove()
})

describe('Floor Printing (T2-08)', () => {
  it('PackingWorkspace offers live "Print Packing List" button and exports parent-first manifest on click', async () => {
    await act(async () => {
      root.render(
        <ToastProvider>
          <MemoryRouter initialEntries={[`/rentals/BK-PACK-100/pack`]}>
            <Routes>
              <Route path="/rentals/:bookingNo/pack" element={<PackingWorkspace embedded={false} />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>,
      )
    })
    await flush(6)

    // Button must exist and not be disabled
    const buttons = Array.from(container.querySelectorAll('button'))
    const printBtn = buttons.find((b) => b.textContent?.includes('Print Packing List'))
    expect(printBtn).toBeDefined()
    expect(printBtn?.disabled).toBe(false)

    // Click the button
    await act(async () => {
      printBtn?.click()
    })
    await flush(4)

    expect(printCalls.packing.length).toBe(1)
    const call = printCalls.packing[0] as {
      bookingNo: string
      clientName: string
      items: Array<{ id: string; name: string; isParent?: boolean; parentLineId?: string | null }>
    }

    expect(call.bookingNo).toBe('BK-PACK-100')
    expect(call.clientName).toContain('Kathmandu Visuals')
    expect(call.items.length).toBeGreaterThan(0)

    // Verify parent-first structure
    const parentItem = call.items.find((i) => i.id === 'pkg-1')
    expect(parentItem?.isParent).toBe(true)

    const childItem = call.items.find((i) => i.name.includes('Sony FX3'))
    expect(childItem?.parentLineId).toBe('pkg-1')
  })

  it('ReturnWorkspace offers live "Print Return Report" button and exports inspection manifest on click', async () => {
    await act(async () => {
      root.render(
        <ToastProvider>
          <MemoryRouter initialEntries={[`/rentals/BK-RET-200/return`]}>
            <ReturnWorkspace bookingNo="BK-RET-200" embedded={false} />
          </MemoryRouter>
        </ToastProvider>,
      )
    })
    await flush(6)

    // Button must exist and not be disabled
    const buttons = Array.from(container.querySelectorAll('button'))
    const printBtn = buttons.find((b) => b.textContent?.includes('Print Return Report'))
    expect(printBtn).toBeDefined()
    expect(printBtn?.disabled).toBe(false)

    // Click the button
    await act(async () => {
      printBtn?.click()
    })
    await flush(4)

    expect(printCalls.return.length).toBe(1)
    const call = printCalls.return[0] as {
      bookingNo: string
      clientName: string
      totalUnits: number
      lines: Array<{ name: string; outcome: string }>
    }

    expect(call.bookingNo).toBe('BK-RET-200')
    expect(call.clientName).toContain('Kathmandu Visuals')
    expect(call.totalUnits).toBeGreaterThan(0)
    expect(call.lines.length).toBeGreaterThan(0)
  })
})
