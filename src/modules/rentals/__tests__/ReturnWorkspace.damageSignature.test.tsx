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
import { completeReturn } from '../../../actions/rentals'
import type { CompleteReturnInput } from '../../../actions/rentals/returnRental'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const bookingId = '11111111-1111-4111-8111-111111111111'
const unitId = '22222222-2222-4222-8222-222222222221'

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
const buttons = () => [...host.querySelectorAll<HTMLButtonElement>('button')]
const complete = () => buttons().find(button => /^Complete (Session|Return)$/.test(button.textContent?.trim() ?? ''))!
async function flush() {
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); await vi.dynamicImportSettled() })
}
async function click(el: HTMLElement) {
  await act(async () => { el.click() })
  await flush()
}
async function type(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')!.set!.call(input, value)
  await act(async () => input.dispatchEvent(new Event('input', { bubbles: true })))
  await flush()
}

beforeAll(async () => { await loadMockClient() })
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.clearAllMocks()
  vi.mocked(fetchOperationEvidence).mockResolvedValue({ files: 1, filesByUnit: { [unitId]: 1 } })
  vi.mocked(fetchReturnQuantityFacts).mockResolvedValue(new Map([['camera-line', 0]]))
  vi.mocked(completeReturn).mockResolvedValue({
    success: true, bookingId, sessionId: 'session-1', sessionClosed: true, lines: 1,
    movements: 1, damageFindings: 0, unitsReset: 0, queued: 0,
    stage: { from: 'On Rent', to: 'Returned' }, stageHeldBy: [],
  })
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

describe('Return damage signature and refusal (T2-19, B19, R-39)', () => {
  it('clean return (0 flags) requires NO signature and completes immediately (R-39)', async () => {
    saveFloorScan('return', bookingId, {
      marks: {
        'assignment-1': { state: 'Returned', condition: 'Good' },
      },
      scanLog: [], sessionNotes: '', returningName: 'Courier',
      sigReturning: null,
      sigWarehouse: null,
    })

    await act(async () => root.render(
      <MemoryRouter><ToastProvider><ReturnWorkspace bookingNo="BK-T2-19" /></ToastProvider></MemoryRouter>,
    ))
    await flush()

    // Clean return notice displayed
    expect(host.textContent).toContain('Clean return — 0 flagged items. No signature is required (R-39).')
    expect(complete().disabled).toBe(false)

    // Complete session with no signature
    await click(complete())
    expect(completeReturn).toHaveBeenCalledTimes(1)
    const callInput = vi.mocked(completeReturn).mock.calls[0]?.[0] as CompleteReturnInput
    expect(callInput.signatures).toBeUndefined()
    expect(callInput.signatureRefused).toBeUndefined()
  })

  it('flagged return requires returning person signature under flagged items (B19)', async () => {
    saveFloorScan('return', bookingId, {
      marks: {
        'assignment-1': { state: 'Returned', condition: 'Damaged', damageDescription: 'Lens element scratched' },
      },
      scanLog: [], sessionNotes: '', returningName: 'Courier',
      sigReturning: null,
      sigWarehouse: null,
    })

    await act(async () => root.render(
      <MemoryRouter><ToastProvider><ReturnWorkspace bookingNo="BK-T2-19" /></ToastProvider></MemoryRouter>,
    ))
    await flush()

    // Flagged items banner & attestation shown
    expect(host.textContent).toContain('Flagged Items Detected (1)')
    expect(host.textContent).toContain('Lens element scratched')
    expect(host.textContent).toContain('returned by Courier for Kathmandu Films; the flagged items are as shown')
    expect(complete().disabled).toBe(true)

    // Check gate failure explanation
    expect(host.textContent).toContain('At least one item is flagged damaged or missing')

    // Unmount and remount with returning person signature captured
    await act(async () => root.render(null))
    saveFloorScan('return', bookingId, {
      marks: {
        'assignment-1': { state: 'Returned', condition: 'Damaged', damageDescription: 'Lens element scratched' },
      },
      scanLog: [], sessionNotes: '', returningName: 'Courier',
      sigReturning: { name: 'Prakash Client', atIso: '2026-10-25T12:00:00Z' },
      sigWarehouse: null,
    })

    await act(async () => root.render(
      <MemoryRouter><ToastProvider><ReturnWorkspace bookingNo="BK-T2-19" /></ToastProvider></MemoryRouter>,
    ))
    await flush()

    expect(complete().disabled).toBe(false)
    await click(complete())
    expect(completeReturn).toHaveBeenCalledTimes(1)
    const callInput = vi.mocked(completeReturn).mock.calls[0]?.[0] as CompleteReturnInput
    expect(callInput.signatures).toEqual([
      expect.objectContaining({
        role: 'Returning person',
        signerName: 'Prakash Client',
        isRequired: true,
      }),
    ])
  })

  it('allows staff to record refusal when person refuses to sign with reason ≥10 chars', async () => {
    saveFloorScan('return', bookingId, {
      marks: {
        'assignment-1': { state: 'Returned', condition: 'Damaged', damageDescription: 'Cracked viewfinder' },
      },
      scanLog: [], sessionNotes: '', returningName: 'Courier',
      sigReturning: null,
      sigWarehouse: null,
    })

    await act(async () => root.render(
      <MemoryRouter><ToastProvider><ReturnWorkspace bookingNo="BK-T2-19" /></ToastProvider></MemoryRouter>,
    ))
    await flush()

    expect(complete().disabled).toBe(true)

    // Tick "Client refused to sign"
    const checkbox = host.querySelector<HTMLInputElement>('input[aria-label="Client refused to sign"]')!
    expect(checkbox).not.toBeNull()
    await click(checkbox)

    const refusalTextarea = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Refusal reason"]')!
    expect(refusalTextarea).not.toBeNull()

    // Reason under 10 chars is blocked
    await type(refusalTextarea, 'Disagreed')
    expect(complete().disabled).toBe(true)
    expect(host.textContent).toContain('9/10 chars min')

    // Reason >= 10 chars unblocks completion
    await type(refusalTextarea, 'Client courier refused to sign damage form and walked out')
    expect(complete().disabled).toBe(false)

    // Complete session with refusal
    await click(complete())
    expect(completeReturn).toHaveBeenCalledTimes(1)
    const callInput = vi.mocked(completeReturn).mock.calls[0]?.[0] as CompleteReturnInput
    expect(callInput.signatureRefused).toBe(true)
    expect(callInput.signatureRefusalReason).toBe('Client courier refused to sign damage form and walked out')
  })
})
