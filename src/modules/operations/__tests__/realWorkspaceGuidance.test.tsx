// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import OperationsShell from '../OperationsShell'
import { OperationsWorkspaceProvider, useOperationsWorkspace } from '../OperationsWorkspaceContext'
import { ToastProvider } from '../../../components/ui/Toast'
import { loadFloorScan, saveFloorScan } from '../../../lib/floorScanStorage'
import { loadMockClient } from '../../../lib/supabase'
import { fetchOperationEvidence } from '../../../lib/queries/operationEvidence'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
let stage = 'Booked'
const bookingId = '11111111-1111-4111-8111-111111111111'
vi.mock('../../../lib/auth', () => ({ useAuth: () => ({ user: { id: 'operator', name: 'Floor Operator', role: 'Warehouse' }, loading: false, isLocked: false }) }))
vi.mock('../../../lib/queries/bookings', () => ({ fetchFloorBooking: async (bookingNo: string) => ({
  id: bookingId, bookingNo, stage, clientName: 'Film Crew', project: null,
  pickupAtAd: '2026-10-24T00:15:00Z', returnAtAd: '2026-10-26T00:15:00Z', actualReturnAtAd: null,
  deliveryType: 'Client Pickup', isCancelled: false, isClosed: false, linesPresence: 'present',
  lines: [{ id: 'line', qty: 1, lineType: 'Equipment', description: 'Tripod', productId: 'product', productName: 'Tripod',
    trackingMode: 'Serialised', parentLineId: null, sortOrder: 1, unitsPresence: 'present',
    units: [{ id: 'unit', assetId: 'asset', serial: 'TRI-01', assetTag: 'EQ-01', unitState: 'Ready', isRequired: true, packed: false, damaged: false, location: 'A1' }] }],
}) }))
vi.mock('../../../lib/queries/operationTaskFacts', () => ({ fetchOperationTaskFacts: async () => ({ total: 1, resetDone: 0, cleaningPending: 1, qcPending: 1, problems: 0 }) }))
vi.mock('../../../lib/queries/operationEvidence', () => ({ fetchOperationEvidence: vi.fn(async () => ({ files: 0, filesByUnit: {} })) }))
vi.mock('../../rentals/actions/RentalMoreActions', () => ({ RentalMoreActions: () => null }))
vi.mock('../../../lib/floorPresence', () => ({ useFloorPresence: () => ({ presenceBanner: null }) }))
vi.mock('../../../lib/queries/serviceDue', () => ({ readServiceDue: async () => new Map() }))
vi.mock('../../../lib/acousticFeedback', () => ({ playScanSuccess: vi.fn(), playScanError: vi.fn(), playCaseComplete: vi.fn(), playDamageAlert: vi.fn(), unlockAudioContext: vi.fn() }))

let root: Root
let host: HTMLDivElement
const buttons = () => [...document.querySelectorAll<HTMLButtonElement>('button')]
const button = (text: string) => buttons().find(item => item.textContent?.trim() === text)
async function flush() { for (let i = 0; i < 10; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)) }) }
async function click(item: HTMLElement | null | undefined) { expect(item, document.body.textContent ?? '').toBeTruthy(); await act(async () => { item?.click(); await vi.dynamicImportSettled() }); await flush() }
async function mount(job: 'Pack' | 'Handover' | 'Return' | 'Reset') {
  await act(async () => root.render(<MemoryRouter><ToastProvider><OperationsShell isOpen bookingNo="BK-1" bookingStatus={stage as 'Booked'} initialJob={job} layout="panel" onClose={() => {}} /></ToastProvider></MemoryRouter>))
  await act(async () => { await vi.dynamicImportSettled() })
  await flush()
}
beforeAll(async () => { await loadMockClient() })
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); stage = 'Booked'
  vi.mocked(fetchOperationEvidence).mockResolvedValue({ files: 0, filesByUnit: {} })
  Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true })
  window.matchMedia = vi.fn((media: string) => ({ matches: false, media, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() })) as unknown as typeof window.matchMedia
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); document.body.innerHTML = ''; localStorage.clear(); sessionStorage.clear() })

describe('real embedded workspace guidance and draft boundaries', () => {
  it('starts Packing at Pending and jumps to its actual evidence action without inventing a photo', async () => {
    await mount('Pack')
    expect(document.querySelector('[aria-label="Filter packing checklist items"] [aria-selected="true"]')?.textContent).toContain('Pending')
    await click(button('Quick Pack All') ?? button('Quick Pack'))
    expect(loadFloorScan<{ marks: Record<string, unknown> }>('pack', bookingId)?.payload.marks).toHaveProperty('unit')
    await click(button('(Jump)'))
    expect(document.activeElement?.textContent).toBe('Refresh saved evidence')
    expect(document.body.textContent).toContain('0 saved booking photo(s)')
    expect(button('Take Photo')).toBeUndefined()
    expect(document.querySelector<HTMLButtonElement>('.operations-shell__footer .ui-button--primary')?.disabled).toBe(true)
  })

  it('uses saved evidence and blocks Confirm again if its refresh cannot be verified', async () => {
    vi.mocked(fetchOperationEvidence).mockResolvedValue({ files: 1, filesByUnit: {} })
    await mount('Pack')
    await click(button('Quick Pack All') ?? button('Quick Pack'))
    expect(document.body.textContent).toContain('1 saved booking photo(s)')
    expect(document.querySelector<HTMLButtonElement>('.operations-shell__footer .ui-button--primary')?.disabled).toBe(false)

    vi.mocked(fetchOperationEvidence).mockRejectedValueOnce(new Error('Saved photo read failed.'))
    await click(button('Refresh saved evidence'))
    expect(document.body.textContent).toContain('Saved photo read failed.')
    expect(document.querySelector<HTMLButtonElement>('.operations-shell__footer .ui-button--primary')?.disabled).toBe(true)
    expect(document.body.textContent).not.toContain('1 saved booking photo(s)')
  })

  it('Handover Jump focuses the actual receiver verification action', async () => {
    stage = 'Packed'; await mount('Handover')
    await click(button('(Jump)'))
    expect(document.activeElement?.textContent).toBe('Verify Both')
    expect(document.activeElement?.closest('#handover-receiver-verification')).toBeTruthy()
    expect(document.querySelector<HTMLButtonElement>('.operations-shell__footer .ui-button--primary')?.disabled).toBe(true)
  })

  it('receipt leaves condition unchosen, and Jump reveals the real hidden condition control', async () => {
    stage = 'On Rent'; await mount('Return')
    expect(document.querySelector('[aria-label="Filter return checklist items"] [aria-selected="true"]')?.textContent).toContain('Outstanding')
    await click(button('Mark Returned'))
    const group = document.querySelector('[role="radiogroup"][aria-label="Condition of Tripod"]')
    expect(group).toBeTruthy()
    expect(group?.querySelector('[aria-checked="true"]')).toBeNull()
    const outstanding = [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Filter return checklist items"] [role="tab"]')].find(item => item.textContent?.startsWith('Outstanding'))
    await click(outstanding)
    expect(document.querySelector('[aria-label="Condition of Tripod"]')).toBeNull()
    await click(button('(Jump)'))
    expect(document.activeElement?.getAttribute('role')).toBe('radio')
    expect(document.activeElement?.closest('[aria-label="Condition of Tripod"]')).toBeTruthy()
  })

  it('real provider Discard clears a Packing draft before another booking opens', async () => {
    function Launcher() { const operations = useOperationsWorkspace(); return <><button onClick={() => operations.openOperations('BK-1', 'Booked', 'Pack')}>Open first</button><button onClick={() => operations.openOperations('BK-2', 'Booked', 'Pack')}>Open second</button></> }
    await act(async () => root.render(<MemoryRouter><ToastProvider><OperationsWorkspaceProvider><Launcher /></OperationsWorkspaceProvider></ToastProvider></MemoryRouter>))
    await click(button('Open first'))
    await click(button('Quick Pack All') ?? button('Quick Pack'))
    expect(loadFloorScan('pack', bookingId)).not.toBeNull()
    await click(button('Open second'))
    await click(button('Discard changes'))
    expect(loadFloorScan('pack', bookingId)).toBeNull()
    expect(document.body.textContent).not.toContain('Restored in-progress packing session')
  })

  it('Discard clears a real Return draft so receipt and signatures do not revive on reopen', async () => {
    stage = 'On Rent'
    saveFloorScan('return', bookingId, {
      marks: { unit: { state: 'Returned', condition: 'Good' } }, scanLog: [],
      sessionNotes: 'Uncommitted return note', returningName: 'Courier',
      sigReturning: { name: 'Courier', atIso: '2026-10-24T00:15:00Z' }, sigWarehouse: null,
    })
    await mount('Return')
    expect(document.body.textContent).toContain('Restored in-progress return session')
    await click(document.querySelector<HTMLButtonElement>('[aria-label="Close panel (Esc)"]'))
    await click(buttons().find(item => /^Discard changes$/i.test(item.textContent?.trim() ?? '')))
    expect(loadFloorScan('return', bookingId)).toBeNull()
    await act(async () => root.render(null))
    await mount('Return')
    expect(document.body.textContent).not.toContain('Restored in-progress return session')
    expect(document.querySelector<HTMLTextAreaElement>('[aria-label="Return session notes"]')?.value).toBe('')
  })

  it('does not trust a cached Reset completion or automatically pass QC', async () => {
    stage = 'Returned'; sessionStorage.setItem(`reset_completed:${bookingId}`, 'true')
    await mount('Reset')
    expect(document.body.textContent).not.toContain('m in queue')
    expect(document.querySelector('[aria-label="Filter reset queue"] [aria-selected="true"]')?.textContent).toContain('Needs action')
    await click(button('Clean all → QC'))
    expect(document.querySelector('[data-operation-target="reset-next"]')?.textContent).toContain('QC')
    await click(button('(Jump)'))
    expect(['Reason for self-performed QC', 'I am alone on shift']).toContain(
      document.activeElement?.getAttribute('aria-label')
    )
    expect(button('Quick Pass to Ready')).toBeUndefined()
    expect(document.querySelector<HTMLButtonElement>('.operations-shell__footer .ui-button--primary')?.disabled).toBe(true)
  })
})
