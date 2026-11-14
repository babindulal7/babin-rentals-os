// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import ReturnWorkspace from '../ReturnWorkspace'
import { ToastProvider } from '../../../components/ui/Toast'
import { loadMockClient } from '../../../lib/supabase'
import { fetchReturnQuantityFacts } from '../../../lib/queries/returnQuantityFacts'
import { loadFloorScan, saveFloorScan } from '../../../lib/floorScanStorage'
import { completeReturn } from '../../../actions/rentals'
import type { CompleteReturnInput } from '../../../actions/rentals/returnRental'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
const bookingId = '11111111-1111-4111-8111-111111111111'
let receivedBefore = 0
vi.mock('../../../lib/auth', () => ({ useAuth: () => ({ user: { id: 'operator', name: 'Operator', role: 'Warehouse' }, loading: false, isLocked: false }) }))
vi.mock('../../../lib/queries/returnQuantityFacts', () => ({ fetchReturnQuantityFacts: vi.fn() }))
vi.mock('../../../lib/queries/operationEvidence', () => ({ fetchOperationEvidence: async () => ({ files: 0, filesByUnit: {} }) }))
vi.mock('../../../lib/floorPresence', () => ({ useFloorPresence: () => ({ presenceBanner: null }) }))
vi.mock('../../../lib/acousticFeedback', () => ({ playScanSuccess: vi.fn(), playScanError: vi.fn(), playCaseComplete: vi.fn(), playDamageAlert: vi.fn(), unlockAudioContext: vi.fn() }))
vi.mock('../../../actions/rentals', () => ({ completeReturn: vi.fn() }))
vi.mock('../../../lib/queries/bookings', () => ({ fetchFloorBooking: async () => ({
  id: bookingId, bookingNo: 'BK-Q', stage: 'On Rent', clientName: 'Film Crew', project: null,
  pickupAtAd: '2026-10-24T00:15:00Z', returnAtAd: '2026-10-26T00:15:00Z', actualReturnAtAd: null,
  deliveryType: 'Client Pickup', isCancelled: false, isClosed: false, linesPresence: 'present',
  lines: [{ id: 'quantity-line', qty: 5, lineType: 'Equipment', description: 'Audio cables', productId: 'product', productName: 'Audio cables',
    trackingMode: 'Quantity', parentLineId: null, sortOrder: 1, unitsPresence: 'present', units: [] }],
}) }))

let host: HTMLDivElement
let root: Root
const confirmed = vi.fn()
const buttons = () => [...host.querySelectorAll<HTMLButtonElement>('button'), ...document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
const button = (label: string) => {
  let found = buttons().find(item => item.textContent?.trim() === label)
  if (!found) {
    const more = host.querySelector<HTMLButtonElement>('button[aria-label="More return actions"]')
    if (more) {
      act(() => {
        more.click()
      })
      found = buttons().find(item => item.textContent?.trim() === label)
    }
  }
  if (!found) throw new Error(`No ${label} button`)
  return found
}
const confirm = () => buttons().find(item => /^Complete (Session|Return)$/.test(item.textContent?.trim() ?? ''))!
const quantity = () => host.querySelector<HTMLInputElement>('[aria-label="Received quantity for Audio cables"]')!
async function flush() { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); await vi.dynamicImportSettled() }) }
async function click(item: HTMLElement) { await act(async () => item.click()); await flush() }
async function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  await act(async () => input.dispatchEvent(new Event('input', { bubbles: true })))
  await flush()
}
function signatureDraft() {
  saveFloorScan('return', bookingId, { marks: {}, scanLog: [], sessionNotes: '', returningName: 'Courier',
    sigReturning: { name: 'Courier', atIso: '2026-10-25T00:15:00Z' }, sigWarehouse: { name: 'Operator', atIso: '2026-10-25T00:16:00Z' } })
}
async function mount() {
  await act(async () => root.render(<MemoryRouter><ToastProvider><ReturnWorkspace bookingNo="BK-Q" onConfirmSuccess={confirmed} /></ToastProvider></MemoryRouter>))
  await flush()
}
async function inspectGood() {
  const group = host.querySelector('[aria-label="Condition of Audio cables"]')!
  const good = [...group.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(item => item.textContent === 'Good')!
  await click(good)
}

beforeAll(async () => { await loadMockClient() })
beforeEach(() => {
  receivedBefore = 0; localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks()
  vi.mocked(fetchReturnQuantityFacts).mockImplementation(async () => new Map([['quantity-line', receivedBefore]]))
  vi.mocked(completeReturn).mockImplementation(async (input) => {
    receivedBefore += input.lines?.[0]?.qty ?? 0
    return { success: true, bookingId, sessionId: 'session', sessionClosed: true, lines: 1, movements: 1,
      unitsReset: 0, damageFindings: 0, queued: 0,
      stage: receivedBefore === 5 ? { from: 'On Rent', to: 'Returned' } : null,
      stageHeldBy: receivedBefore === 5 ? [] : ['quantity-line'] }
  })
  Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true })
  window.matchMedia = vi.fn((media: string) => ({ matches: false, media, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() })) as unknown as typeof window.matchMedia
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); localStorage.clear(); sessionStorage.clear() })

describe('Return quantity receipts per session', () => {
  it('records two receipts of 2 then 3, using the verified remaining quantity on reopen', async () => {
    signatureDraft(); await mount()
    expect(host.textContent).toContain('Previously received: 0 · Remaining: 5 of 5')
    await click(button('Mark Returned'))
    expect(quantity().value).toBe('5')
    expect(host.querySelector('[aria-label="Condition of Audio cables"] [aria-checked="true"]')).toBeNull()
    await type(quantity(), '2'); await inspectGood()
    expect(confirm().textContent?.trim()).toBe('Complete Session')
    expect(confirm().disabled).toBe(false)
    await click(confirm())
    expect(vi.mocked(completeReturn).mock.calls[0]?.[0].lines?.[0]?.qty).toBe(2)
    expect(confirmed).toHaveBeenCalledTimes(1)
    expect(loadFloorScan('return', bookingId)).toBeNull()

    await act(async () => root.render(null))
    signatureDraft(); await mount()
    expect(host.textContent).toContain('Previously received: 2 · Remaining: 3 of 5')
    await click(button('Mark Returned'))
    expect(quantity().value).toBe('3')
    expect(host.querySelector('[aria-label="Condition of Audio cables"] [aria-checked="true"]')).toBeNull()
    await inspectGood(); await click(confirm())
    const payloads = vi.mocked(completeReturn).mock.calls.map(([input]) => input as CompleteReturnInput)
    expect(payloads.map(input => input.lines?.[0]?.qty)).toEqual([2, 3])
    expect(receivedBefore).toBe(5)
  })

  it.each(['0', '1.5', '6', ''])('blocks invalid per-session received quantity %s', async (value) => {
    signatureDraft(); await mount(); await click(button('Mark Returned')); await inspectGood()
    await type(quantity(), value)
    expect(quantity().getAttribute('aria-invalid')).toBe('true')
    expect(confirm().disabled).toBe(true)
    expect(completeReturn).not.toHaveBeenCalled()
  })

  it('refuses an unreadable receipt history and enables intake only after Retry verifies it', async () => {
    vi.mocked(fetchReturnQuantityFacts).mockRejectedValueOnce(new Error('Receipt history unavailable.'))
    await mount()
    expect(host.textContent).toContain('Receipt history unavailable.')
    expect(button('Mark Returned').disabled).toBe(true)
    expect(button('Check In All Clean').disabled).toBe(true)
    expect(confirm().disabled).toBe(true)
    await click(button('Retry return quantities'))
    expect(button('Mark Returned').disabled).toBe(false)
    expect(host.textContent).toContain('Remaining: 5 of 5')
  })

  it('retains the per-pass quantity draft, and Start Fresh clears it from storage', async () => {
    await mount(); await click(button('Mark Returned')); await type(quantity(), '2')
    await act(async () => root.render(null)); await mount()
    expect(quantity().value).toBe('2')
    expect(host.textContent).toContain('Restored in-progress return session')
    await click(button('Start Fresh'))
    expect(loadFloorScan('return', bookingId)).toBeNull()
    expect(quantity()).toBeNull()
    expect(completeReturn).not.toHaveBeenCalled()
  })

  it.each([2, 4, 5])('reconciles a committed %s-item receipt after a lost response and reload with the identical attempt', async (qty) => {
    const committed = new Set<string>()
    vi.mocked(completeReturn).mockImplementation(async input => {
      if (!committed.has(input.clientUuid!)) {
        committed.add(input.clientUuid!)
        receivedBefore += input.lines?.[0]?.qty ?? 0
        throw new Error('Receipt committed; response lost')
      }
      return { success: true, bookingId, sessionId: 'saved-session', sessionClosed: true, lines: 0,
        movements: 0, unitsReset: 0, damageFindings: 0, queued: 0, stage: null, stageHeldBy: [] }
    })
    signatureDraft(); await mount(); await click(button('Mark Returned'))
    await type(quantity(), String(qty)); await inspectGood(); await click(confirm())
    const original = vi.mocked(completeReturn).mock.calls[0]![0]
    expect(receivedBefore).toBe(qty)
    expect(loadFloorScan<{ completionAttempt: { input: CompleteReturnInput } }>('return', bookingId)?.payload.completionAttempt.input).toEqual(original)
    await act(async () => root.render(null)); await mount()
    expect(confirm().disabled).toBe(false)
    await click(confirm())
    expect(vi.mocked(completeReturn).mock.calls[1]![0]).toEqual(original)
    expect(receivedBefore).toBe(qty)
    expect(confirmed).toHaveBeenCalledTimes(1)
    expect(loadFloorScan('return', bookingId)).toBeNull()
  })

  it('refuses edited attempted details instead of issuing another receipt identity', async () => {
    vi.mocked(completeReturn).mockRejectedValue(new Error('Network response unavailable'))
    signatureDraft(); await mount(); await click(button('Mark Returned'))
    await type(quantity(), '2'); await inspectGood(); await click(confirm())
    await type(quantity(), '3')
    expect(confirm().disabled).toBe(true)
    expect(completeReturn).toHaveBeenCalledTimes(1)
    await type(quantity(), '2')
    expect(confirm().disabled).toBe(false)
  })
})
