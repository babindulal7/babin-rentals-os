// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import ReturnWorkspace from '../ReturnWorkspace'
import { ToastProvider } from '../../../components/ui/Toast'
import { loadMockClient } from '../../../lib/supabase'
import { fetchOperationEvidence } from '../../../lib/queries/operationEvidence'
import { fetchReturnQuantityFacts } from '../../../lib/queries/returnQuantityFacts'
import { saveFloorScan } from '../../../lib/floorScanStorage'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const bookingId = '11111111-1111-4111-8111-111111111111'
const unitId = '22222222-2222-4222-8222-222222222221'

/** The banner shown only when nothing is outstanding and nothing is flagged. */
const CLEAN_BANNER = 'Clean return — 0 flagged items. No signature is required.'
/** The neutral status shown while at least one row is still outstanding. */
const NEUTRAL_LINE = 'Clean return appears once every item is checked in and none is outstanding.'

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: '33333333-3333-4333-8333-333333333333', name: 'Operator', role: 'Warehouse' }, loading: false, isLocked: false }),
}))
vi.mock('../../../lib/queries/operationEvidence', () => ({ fetchOperationEvidence: vi.fn() }))
vi.mock('../../../lib/queries/returnQuantityFacts', () => ({ fetchReturnQuantityFacts: vi.fn() }))
vi.mock('../../../lib/floorPresence', () => ({ useFloorPresence: () => ({ presenceBanner: null }) }))
vi.mock('../../../lib/acousticFeedback', () => ({
  playScanSuccess: vi.fn(), playScanError: vi.fn(), playCaseComplete: vi.fn(),
  playDamageAlert: vi.fn(), unlockAudioContext: vi.fn(),
}))
vi.mock('../../../actions/rentals', () => ({ completeReturn: vi.fn() }))
vi.mock('../../../lib/queries/bookings', () => ({ fetchFloorBooking: async () => ({
  id: bookingId, bookingNo: 'BK-T2-19', stage: 'On Rent', clientName: 'Kathmandu Films', project: null,
  pickupAtAd: '2026-10-24T00:15:00Z', returnAtAd: '2026-10-26T00:15:00Z', actualReturnAtAd: null,
  deliveryType: 'Client Pickup', isCancelled: false, isClosed: false, linesPresence: 'present',
  lines: [{
    id: 'camera-line', qty: 1, lineType: 'Equipment', description: 'Sony FX3', productId: 'camera-product',
    productName: 'Sony FX3', trackingMode: 'Serialised', parentLineId: null, sortOrder: 1, unitsPresence: 'present',
    units: [
      { id: 'assignment-1', assetId: unitId, serial: 'FX3-01', assetTag: 'CAM-01',
        unitState: 'Picked Up', isRequired: true, packed: true, damaged: false, location: 'Rack A' },
    ],
  }],
}) }))

let host: HTMLDivElement
let root: Root

async function flush() {
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); await vi.dynamicImportSettled() })
}

async function renderReturn() {
  await act(async () => root.render(
    <MemoryRouter><ToastProvider><ReturnWorkspace bookingNo="BK-T2-19" /></ToastProvider></MemoryRouter>,
  ))
  await flush()
}

beforeAll(async () => { await loadMockClient() })
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.clearAllMocks()
  vi.mocked(fetchOperationEvidence).mockResolvedValue({ files: 1, filesByUnit: { [unitId]: 1 } })
  vi.mocked(fetchReturnQuantityFacts).mockResolvedValue(new Map([['camera-line', 0]]))
  Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true })
  window.matchMedia = vi.fn((media: string) => ({
    matches: false, media, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  localStorage.clear()
  sessionStorage.clear()
})

describe('Return clean-return line (sweep-A-floor-9, T2-19, R-39)', () => {
  it('with an item still outstanding and no flags, Clean return is not shown', async () => {
    saveFloorScan('return', bookingId, {
      marks: {},
      scanLog: [], sessionNotes: '', returningName: 'Courier',
      sigReturning: null,
      sigWarehouse: null,
    })

    await renderReturn()

    expect(host.textContent).not.toContain(CLEAN_BANNER)
    expect(host.textContent).toContain(NEUTRAL_LINE)
  })

  it('with every item checked in and no flags, Clean return is shown', async () => {
    saveFloorScan('return', bookingId, {
      marks: { 'assignment-1': { state: 'Returned', condition: 'Good' } },
      scanLog: [], sessionNotes: '', returningName: 'Courier',
      sigReturning: null,
      sigWarehouse: null,
    })

    await renderReturn()

    expect(host.textContent).toContain(CLEAN_BANNER)
    expect(host.textContent).not.toContain(NEUTRAL_LINE)
  })

  it('with a flagged item, neither the clean banner nor the neutral line is shown', async () => {
    saveFloorScan('return', bookingId, {
      marks: { 'assignment-1': { state: 'Returned', condition: 'Damaged', damageDescription: 'Lens element scratched' } },
      scanLog: [], sessionNotes: '', returningName: 'Courier',
      sigReturning: null,
      sigWarehouse: null,
    })

    await renderReturn()

    expect(host.textContent).toContain('Flagged Items Detected (1)')
    expect(host.textContent).not.toContain(CLEAN_BANNER)
    expect(host.textContent).not.toContain(NEUTRAL_LINE)
  })
})
