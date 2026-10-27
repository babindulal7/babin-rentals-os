// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../../../components/ui/Toast'
import HandoverWorkspace from '../HandoverWorkspace'
import { SignOnGlassModal } from '../modals/SignOnGlassModal'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const CLIENT_A = 'client-uuid-001'

let mockIdDocA: any = null
let mockCollectorsA: any[] = []

vi.mock('../../../lib/queries/clients', () => ({
  fetchClientIdDocument: vi.fn().mockImplementation(async (clientId: string) => {
    if (clientId === CLIENT_A) return mockIdDocA
    return null
  }),
  fetchClientCollectors: vi.fn().mockImplementation(async (clientId: string) => {
    if (clientId === CLIENT_A) return mockCollectorsA
    return []
  }),
  hasClientIdOnFile: vi.fn().mockImplementation(async (clientId: string) => {
    if (clientId === CLIENT_A) return Boolean(mockIdDocA)
    return false
  }),
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Staff', role: 'Warehouse', isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

vi.mock('../../../lib/queries/operationEvidence', () => ({
  fetchOperationEvidence: async () => ({ files: 1, filesByUnit: {} }),
}))

vi.mock('../../../lib/queries/collateral', () => ({
  hasHeldCollateral: async () => false,
}))

vi.mock('../../../lib/queries/bookings', () => ({
  fetchFloorBooking: async (ref: string) => ({
    id: 'booking-uuid-999',
    bookingNo: ref,
    clientId: CLIENT_A,
    clientName: 'Sagarmatha Pictures',
    stage: 'Packed',
    project: 'Commercial',
    pickupAtAd: '2026-07-16T00:15:00.000Z',
    returnAtAd: '2026-07-19T00:15:00.000Z',
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
        description: 'Sony FX3',
        productId: 'prod-1',
        productName: 'Sony FX3',
        trackingMode: 'Serialised',
        parentLineId: null,
        sortOrder: 1,
        unitsPresence: 'present',
        units: [{ id: 'unit-1', assetId: 'asset-1', serial: 'FX3-001', location: null, damaged: false, packed: true }],
      },
    ],
  }),
}))

describe('HandoverWorkspace: T2-12 Client Collectors & ID on File', () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    if (root && container) {
      act(() => {
        root!.unmount()
      })
      container.remove()
    }
    container = null
    root = null
    mockIdDocA = null
    mockCollectorsA = []
    vi.clearAllMocks()
  })

  async function mount() {
    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/rentals/B-999/handover']}>
          <ToastProvider>
            <Routes>
              <Route path="/rentals/:bookingNo/handover" element={<HandoverWorkspace />} />
            </Routes>
          </ToastProvider>
        </MemoryRouter>,
      )
    })
    // Give async promises a tick to resolve
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
  }

  it('renders inline warning and Add ID on File button for first-time client without ID (W50)', async () => {
    mockIdDocA = null
    mockCollectorsA = []
    await mount()

    const text = container?.textContent ?? ''
    expect(text).toContain('First-time client — one government ID must be recorded on file before handover (Ruling W50)')
    expect(text).toContain('+ Add ID on File')
  })

  it('renders "ID on file ✓" with masked number and marks Government ID verified for repeat client (W50, W51)', async () => {
    mockIdDocA = {
      id: 'doc-1',
      clientUuid: 'cu-1',
      clientId: CLIENT_A,
      idType: 'citizenship_card',
      idNumber: '••••-••••-1234',
      evidenceFileId: null,
      expiryDate: null,
      verifiedAt: '2026-07-01T00:00:00.000Z',
      verifiedBy: 'u-1',
      notes: null,
      createdAt: '2026-07-01T00:00:00.000Z',
    }
    mockCollectorsA = []
    await mount()

    const text = container?.textContent ?? ''
    expect(text).toContain('ID on file ✓')
    expect(text).toContain('Citizenship Card')
    expect(text).toContain('••••-••••-1234')
    expect(text).toContain('No expiry (Nepali citizenship)')

    // Government ID Verified line is checked
    const idCheck = container?.querySelector('input[type="checkbox"][aria-label="Government ID Verified"]') as HTMLInputElement
    expect(idCheck?.checked).toBe(true)
  })

  it('renders known collectors for 1-tap selection and verifies booking authorization upon selection (W28, W34)', async () => {
    mockIdDocA = {
      id: 'doc-1',
      clientUuid: 'cu-1',
      clientId: CLIENT_A,
      idType: 'citizenship_card',
      idNumber: '••••-••••-1234',
      evidenceFileId: null,
      expiryDate: null,
      verifiedAt: '2026-07-01T00:00:00.000Z',
      verifiedBy: 'u-1',
      notes: null,
      createdAt: '2026-07-01T00:00:00.000Z',
    }
    mockCollectorsA = [
      {
        id: 'col-1',
        clientUuid: 'cu-c1',
        clientId: CLIENT_A,
        name: 'Sita Gurung',
        phone: '+9779811223344',
        roleTitle: '1st AC',
        idType: 'driving_licence',
        idNumber: '••••-••••-7654',
        evidenceFileId: null,
        isActive: true,
        createdAt: '2026-07-01T00:00:00.000Z',
      },
    ]
    await mount()

    const text = container?.textContent ?? ''
    expect(text).toContain('Sita Gurung (1st AC)')
    expect(text).toContain('+ Add Collector')

    // Since collectors were loaded, first collector was selected, so bookingAuthVerified is true
    const authCheck = container?.querySelector('input[type="checkbox"][aria-label="Booking Authorization Verified"]') as HTMLInputElement
    expect(authCheck?.checked).toBe(true)
  })

  it('renders quick collector selection chips in SignOnGlassModal', async () => {
    const onSignComplete = vi.fn()
    const collectors = [
      { id: 'col-1', name: 'Sita Gurung', roleTitle: '1st AC', phone: '+9779811223344' },
      { id: 'col-2', name: 'Ram Thapa', roleTitle: 'Driver', phone: '+9779800000000' },
    ]

    await act(async () => {
      root!.render(
        <ToastProvider>
          <SignOnGlassModal
            isOpen={true}
            onClose={() => {}}
            role="receiver"
            defaultName="Sagarmatha Pictures"
            bookingNo="B-999"
            clientName="Sagarmatha Pictures"
            collectors={collectors}
            onSignComplete={onSignComplete}
          />
        </ToastProvider>,
      )
    })

    const text = container?.textContent ?? ''
    expect(text).toContain('Authorized Collector (1 Tap):')
    expect(text).toContain('Sagarmatha Pictures (Client)')
    expect(text).toContain('Sita Gurung (1st AC)')
    expect(text).toContain('Ram Thapa (Driver)')

    // Click Sita Gurung chip
    const sitaButton = Array.from(container?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.includes('Sita Gurung'),
    )
    expect(sitaButton).toBeDefined()

    await act(async () => {
      sitaButton!.click()
    })

    const nameInput = container?.querySelector('input#signer-name') as HTMLInputElement
    expect(nameInput?.value).toBe('Sita Gurung')
  })
})
