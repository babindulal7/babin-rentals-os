// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { FloorOfflineStatus } from '../../../components/ui/FloorOfflineStatus'
import PackingWorkspace from '../PackingWorkspace'
import { ToastProvider } from '../../../components/ui/Toast'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const mockSyncState = {
  status: 'synced' as 'synced' | 'syncing' | 'offline' | 'error',
  pendingCount: 0,
  lastSyncTime: new Date(Date.now() - 30_000), // 30s ago
  syncAll: vi.fn(async () => {}),
  refreshPendingCount: vi.fn(async () => {}),
}

vi.mock('../../../lib/syncContext', () => ({
  useSync: () => mockSyncState,
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-floor-1', name: 'Ramesh Shrestha', role: 'Warehouse' },
    loading: false,
    isLocked: false,
  }),
}))

vi.mock('../../../lib/queries/bookings', () => ({
  fetchFloorBooking: async () => ({
    id: '00000000-0000-0000-0000-000000000001',
    bookingNo: 'BK-9999',
    stage: 'Booked',
    clientName: 'Kathmandu Films',
    project: 'Music Video',
    pickupAtAd: '2026-10-27T10:00:00.000Z',
    returnAtAd: '2026-10-28T18:00:00.000Z',
    actualReturnAtAd: null,
    deliveryType: 'Client Pickup',
    isCancelled: false,
    isClosed: false,
    linesPresence: 'present',
    lines: [
      {
        id: 'line-1',
        qty: 1,
        lineType: 'Equipment',
        description: 'Heavy Duty Tripod',
        productId: 'prod-1',
        productName: 'Heavy Duty Tripod',
        trackingMode: 'Serialised',
        parentLineId: null,
        sortOrder: 1,
        unitsPresence: 'present',
        units: [
          {
            id: 'unit-1',
            unitId: 'unit-1',
            barcode: 'A7S3-01',
            serialNumber: 'SN-001',
            serial: 'SN-001',
            packed: true,
            packedAtAd: '2026-10-27T10:05:00.000Z',
            handedOver: false,
            handedOverAtAd: null,
            returned: false,
            returnedAtAd: null,
          },
        ],
      },
    ],
  }),
}))

vi.mock('../../operations/useOperationEvidence', () => ({
  useOperationEvidence: () => ({
    loading: false,
    evidence: { files: 1, filesByUnit: {} },
    error: null,
  }),
}))

vi.mock('../../../lib/queries/operationEvidence', () => ({
  fetchOperationEvidence: async () => ({
    files: 1,
    filesByUnit: {},
  }),
}))

describe('T2-10 Floor Offline UI & Confirm Button Safety Gates', () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mockSyncState.status = 'synced'
    mockSyncState.pendingCount = 0
    mockSyncState.lastSyncTime = new Date(Date.now() - 30_000)
    vi.stubGlobal('navigator', { onLine: true })
  })

  afterEach(() => {
    if (root && container) {
      act(() => {
        root?.unmount()
      })
      container.remove()
      container = null
      root = null
    }
    vi.unstubAllGlobals()
  })

  it('renders synced status and last flush time when online and outbox is clear', () => {
    act(() => {
      root!.render(<FloorOfflineStatus verb="pack" />)
    })

    expect(container!.textContent).toContain('Floor Outbox Synced')
    expect(container!.textContent).toContain('Last flush:')
    expect(container!.textContent).toContain('30s ago')
  })

  it('renders offline warning and shows queued count in offline mode', () => {
    vi.stubGlobal('navigator', { onLine: false })
    mockSyncState.status = 'offline'
    mockSyncState.pendingCount = 5

    act(() => {
      root!.render(<FloorOfflineStatus verb="pack" />)
    })

    expect(container!.textContent).toContain('Offline Mode (Airplane / Network Dropped)')
    expect(container!.textContent).toContain('5 scan/ticks queued in outbox')
    expect(container!.textContent).toContain('Custody completion requires connection')
  })

  it('disables Complete Packing button and shows "Needs connection to complete" when offline', async () => {
    // 1. In offline mode
    vi.stubGlobal('navigator', { onLine: false })

    await act(async () => {
      root!.render(
        <ToastProvider>
          <MemoryRouter>
            <PackingWorkspace bookingNo="BK-9999" />
          </MemoryRouter>
        </ToastProvider>,
      )
    })

    // Allow mock booking to load and state to settle
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    const buttons = Array.from(container!.querySelectorAll('button'))
    const completeBtn = buttons.find((btn) => btn.textContent?.includes('Needs connection to complete'))

    expect(completeBtn).toBeDefined()
    expect(completeBtn?.disabled).toBe(true)
    expect(completeBtn?.textContent).toContain('Needs connection to complete')
  })

  it('enables Complete Packing button with "Complete Packing" when online and checklist is ready', async () => {
    // 1. In online mode
    vi.stubGlobal('navigator', { onLine: true })

    await act(async () => {
      root!.render(
        <ToastProvider>
          <MemoryRouter>
            <PackingWorkspace bookingNo="BK-9999" />
          </MemoryRouter>
        </ToastProvider>,
      )
    })

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    // Open More menu to access Quick Pack All (R-10.7)
    const moreBtn = Array.from(container!.querySelectorAll('button')).find((btn) =>
      btn.getAttribute('aria-label')?.includes('More packing actions'),
    )
    if (moreBtn) {
      await act(async () => {
        moreBtn.click()
      })
    }
    const packAllBtn = Array.from(document.body.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Quick Pack All'),
    )
    expect(packAllBtn).toBeDefined()
    await act(async () => {
      packAllBtn?.click()
    })

    const buttons = Array.from(container!.querySelectorAll('button'))
    const completeBtn = buttons.find((btn) => btn.textContent?.includes('Complete Packing'))

    expect(completeBtn).toBeDefined()
    expect(completeBtn?.disabled).toBe(false)
  })
})
