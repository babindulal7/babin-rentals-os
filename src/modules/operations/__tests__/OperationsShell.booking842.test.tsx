// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../../../components/ui/Toast'
import OperationsShell from '../OperationsShell'
import { loadMockClient } from '../../../lib/supabase'
import { fetchOperationEvidence } from '../../../lib/queries/operationEvidence'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const B842_ID = '84284284-8428-4842-8842-842842842842'

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'warehouse-1', name: 'Ram Thapa', role: 'Warehouse', isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

vi.mock('../../../lib/queries/bookings', () => ({
  fetchFloorBooking: async (ref: string) => ({
    id: B842_ID,
    bookingNo: ref,
    stage: 'Booked',
    clientName: 'Annapurna College of Media',
    project: 'Kathmandu Street Food Series',
    pickupAtAd: '2026-08-01T00:15:00.000Z',
    returnAtAd: '2026-08-03T00:15:00.000Z',
    actualReturnAtAd: null,
    deliveryType: 'Client Pickup',
    isCancelled: false,
    isClosed: false,
    linesPresence: 'present',
    lines: [
      {
        id: 'l-1',
        qty: 1,
        lineType: 'Equipment',
        description: 'DJI RS 3 Pro Gimbal',
        productId: 'p-1',
        productName: 'DJI RS 3 Pro Gimbal',
        trackingMode: 'Serialised',
        parentLineId: null,
        sortOrder: 1,
        unitsPresence: 'present',
        units: [
          {
            id: 'u-1',
            assetId: 'a-1',
            serial: 'SN-GIM-01',
            assetTag: 'TAG-GIM-01',
            unitState: 'Ready',
            isRequired: true,
            packed: false,
            damaged: false,
            location: 'A1',
          },
        ],
      },
      {
        id: 'l-2',
        qty: 2,
        lineType: 'Equipment',
        description: 'Sony MDR-7506 Headphones',
        productId: 'p-2',
        productName: 'Sony MDR-7506 Headphones',
        trackingMode: 'Serialised',
        parentLineId: null,
        sortOrder: 2,
        unitsPresence: 'present',
        units: [
          {
            id: 'u-2a',
            assetId: 'a-2a',
            serial: 'SN-HP-01',
            assetTag: 'TAG-HP-01',
            unitState: 'Ready',
            isRequired: true,
            packed: false,
            damaged: false,
            location: 'A2',
          },
          {
            id: 'u-2b',
            assetId: 'a-2b',
            serial: 'SN-HP-02',
            assetTag: 'TAG-HP-02',
            unitState: 'Ready',
            isRequired: true,
            packed: false,
            damaged: false,
            location: 'A2',
          },
        ],
      },
      {
        id: 'l-3',
        qty: 1,
        lineType: 'Equipment',
        description: 'RED Komodo 6K',
        productId: 'p-3',
        productName: 'RED Komodo 6K',
        trackingMode: 'Serialised',
        parentLineId: null,
        sortOrder: 3,
        unitsPresence: 'present',
        units: [
          {
            id: 'u-3',
            assetId: 'a-3',
            serial: 'SN-KOM-01',
            assetTag: 'TAG-KOM-01',
            unitState: 'Ready',
            isRequired: true,
            packed: false,
            damaged: false,
            location: 'B1',
          },
        ],
      },
      {
        id: 'l-4',
        qty: 1,
        lineType: 'Equipment',
        description: 'DZOFilm Vespid 35mm',
        productId: 'p-4',
        productName: 'DZOFilm Vespid 35mm',
        trackingMode: 'Serialised',
        parentLineId: null,
        sortOrder: 4,
        unitsPresence: 'present',
        units: [
          {
            id: 'u-4',
            assetId: 'a-4',
            serial: 'SN-DZO-01',
            assetTag: 'TAG-DZO-01',
            unitState: 'Ready',
            isRequired: true,
            packed: false,
            damaged: false,
            location: 'B2',
          },
        ],
      },
    ],
  }),
}))

vi.mock('../../../lib/queries/operationTaskFacts', () => ({
  fetchOperationTaskFacts: async () => ({ total: 0, resetDone: 0, cleaningPending: 0, qcPending: 0, problems: 0 }),
}))

vi.mock('../../../lib/queries/operationEvidence', () => ({
  fetchOperationEvidence: vi.fn(async () => ({ files: 0, filesByUnit: {} })),
}))

vi.mock('../../rentals/actions/RentalMoreActions', () => ({ RentalMoreActions: () => null }))
vi.mock('../../../lib/floorPresence', () => ({ useFloorPresence: () => ({ presenceBanner: null }) }))
vi.mock('../../../lib/queries/serviceDue', () => ({ readServiceDue: async () => new Map() }))
vi.mock('../../../lib/acousticFeedback', () => ({
  playScanSuccess: vi.fn(),
  playScanError: vi.fn(),
  playCaseComplete: vi.fn(),
  playDamageAlert: vi.fn(),
  unlockAudioContext: vi.fn(),
}))

let root: Root
let host: HTMLDivElement

async function flush(rounds = 10) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
  }
}

const buttons = () => [...document.querySelectorAll<HTMLButtonElement>('button')]
const button = (text: string) => buttons().find((item) => item.textContent?.trim() === text)

beforeAll(async () => {
  await loadMockClient()
})

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.mocked(fetchOperationEvidence).mockResolvedValue({ files: 0, filesByUnit: {} })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  document.body.innerHTML = ''
  localStorage.clear()
  sessionStorage.clear()
})

describe('OperationsShell with Booking 842', () => {
  it('enables Confirm Packing & Next once items packed, kit verified, and photo uploaded', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ToastProvider>
            <OperationsShell isOpen bookingNo="842" bookingStatus="Booked" initialJob="Pack" onClose={() => {}} />
          </ToastProvider>
        </MemoryRouter>,
      )
    })
    await act(async () => { await vi.dynamicImportSettled() })
    await flush()

    // Step 1: Click Quick Pack All
    const quickPack = button('Quick Pack All') ?? button('Quick Pack') ?? button('Mark Pending Packed')
    expect(quickPack).toBeTruthy()
    await act(async () => {
      quickPack?.click()
    })
    await flush()

    // Step 2: Click Verify All on Cinema Kit Checklist
    const verifyAll = button('Verify All') ?? button('Verify All Kit Accessories')
    expect(verifyAll).toBeTruthy()
    await act(async () => {
      verifyAll?.click()
    })
    await flush()

    // Step 3: Mock evidence photo = 1
    vi.mocked(fetchOperationEvidence).mockResolvedValue({ files: 1, filesByUnit: {} })
    const refreshEvidence = button('Refresh saved evidence')
    expect(refreshEvidence).toBeTruthy()
    await act(async () => {
      refreshEvidence?.click()
    })
    await flush()

    // Now inspect Confirm Packing & Next button
    const confirmBtn = button('Confirm Packing & Next')
    expect(confirmBtn).toBeTruthy()
    expect(confirmBtn?.disabled).toBe(false)
  })
})
