// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import ReturnWorkspace from '../ReturnWorkspace'
import { ToastProvider } from '../../../components/ui/Toast'
import { loadMockClient } from '../../../lib/supabase'
import { fetchOperationEvidence } from '../../../lib/queries/operationEvidence'
import { saveFloorScan } from '../../../lib/floorScanStorage'
import { completeReturn } from '../../../actions/rentals'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const bookingId = '11111111-1111-4111-8111-111111111111'
const firstUnit = '22222222-2222-4222-8222-222222222221'
const secondUnit = '22222222-2222-4222-8222-222222222222'
let photoCounts: Record<string, number> = {}

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: '33333333-3333-4333-8333-333333333333', name: 'Operator', role: 'Warehouse' }, loading: false, isLocked: false }),
}))
vi.mock('../../../lib/queries/operationEvidence', () => ({ fetchOperationEvidence: vi.fn() }))
vi.mock('../../../lib/floorPresence', () => ({ useFloorPresence: () => ({ presenceBanner: null }) }))
vi.mock('../../../lib/acousticFeedback', () => ({
  playScanSuccess: vi.fn(), playScanError: vi.fn(), playCaseComplete: vi.fn(),
  playDamageAlert: vi.fn(), unlockAudioContext: vi.fn(),
}))
vi.mock('../../../actions/rentals', () => ({ completeReturn: vi.fn() }))
vi.mock('../../../lib/queries/bookings', () => ({ fetchFloorBooking: async () => ({
  id: bookingId, bookingNo: 'BK-DAMAGE', stage: 'On Rent', clientName: 'Film Crew', project: null,
  pickupAtAd: '2026-10-24T00:15:00Z', returnAtAd: '2026-10-26T00:15:00Z', actualReturnAtAd: null,
  deliveryType: 'Client Pickup', isCancelled: false, isClosed: false, linesPresence: 'present',
  lines: [{
    id: 'camera-line', qty: 2, lineType: 'Equipment', description: 'FX3', productId: 'camera-product',
    productName: 'FX3', trackingMode: 'Serialised', parentLineId: null, sortOrder: 1, unitsPresence: 'present',
    units: [
      { id: 'assignment-1', assetId: firstUnit, serial: 'FX3-01', assetTag: 'CAM-01',
        unitState: 'Picked Up', isRequired: true, packed: true, damaged: false, location: 'Rack A' },
      { id: 'assignment-2', assetId: secondUnit, serial: 'FX3-02', assetTag: 'CAM-02',
        unitState: 'Picked Up', isRequired: true, packed: true, damaged: false, location: 'Rack A' },
    ],
  }],
}) }))

let host: HTMLDivElement
let root: Root
const buttons = () => [...host.querySelectorAll<HTMLButtonElement>('button')]
const complete = () => buttons().find(button => /^Complete (Session|Return)$/.test(button.textContent?.trim() ?? ''))!
async function flush() {
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); await vi.dynamicImportSettled() })
}
async function refresh() {
  const button = buttons().find(item => item.textContent?.includes('Refresh saved evidence'))
  if (!button) throw new Error('No evidence refresh button')
  await act(async () => { button.click() })
  await flush()
}

beforeAll(async () => { await loadMockClient() })
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.clearAllMocks()
  photoCounts = {}
  vi.mocked(fetchOperationEvidence).mockImplementation(async () => ({
    files: Object.values(photoCounts).reduce((sum, count) => sum + count, 0),
    filesByUnit: { ...photoCounts },
  }))
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

describe('Return damage evidence for individual units (T2-18)', () => {
  it('requires a saved damage photo for BOTH flagged units, not one shared booking photo', async () => {
    saveFloorScan('return', bookingId, {
      marks: {
        'assignment-1': { state: 'Returned', condition: 'Damaged', damageDescription: 'Front element scratch' },
        'assignment-2': { state: 'Returned', condition: 'Damaged', damageDescription: 'Loose lens mount' },
      },
      scanLog: [], sessionNotes: '', returningName: 'Courier',
      sigReturning: { name: 'Courier', atIso: '2026-10-25T00:15:00Z' },
      sigWarehouse: { name: 'Operator', atIso: '2026-10-25T00:16:00Z' },
    })
    await act(async () => root.render(
      <MemoryRouter><ToastProvider><ReturnWorkspace bookingNo="BK-DAMAGE" /></ToastProvider></MemoryRouter>,
    ))
    await flush()

    expect(host.querySelector('button[aria-label="Take / Upload Damage Photo for FX3 · unit 1"]')).not.toBeNull()
    expect(host.querySelector('button[aria-label="Take / Upload Damage Photo for FX3 · unit 2"]')).not.toBeNull()
    expect(complete().disabled).toBe(true)
    expect(completeReturn).not.toHaveBeenCalled()

    photoCounts = { [firstUnit]: 1 }
    await refresh()
    expect(host.textContent).toContain('1 damaged/lost item without a description or a counted photo')
    expect(complete().disabled).toBe(true)

    photoCounts = { [firstUnit]: 1, [secondUnit]: 1 }
    await refresh()
    expect(complete().disabled).toBe(false)
    expect(completeReturn).not.toHaveBeenCalled()
  })
})
