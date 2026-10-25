// @vitest-environment jsdom
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceActions } from '../OperationsShell'
import { useFloorViewport } from '../floorPanelContext'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

let dirty = false
let mockError: string | null = null
let mockBlocked: string | null = null
let mockProgress: { done: number; total: number } | undefined
const completionCalls = vi.fn()

type MockProps = {
  bookingNo?: string
  onConfirmSuccess?: () => void
  onRegisterActions?: (actions: WorkspaceActions) => void
}

function MockWorkspace({ bookingNo, onConfirmSuccess, onRegisterActions }: MockProps) {
  useEffect(() => {
    onRegisterActions?.({
      canComplete: mockBlocked === null,
      blockedReason: mockBlocked,
      dispatching: false,
      isDirty: dirty,
      label: 'Confirm Action',
      complete: () => { completionCalls(); onConfirmSuccess?.() },
      error: mockError,
      progress: mockProgress,
    })
  }, [onConfirmSuccess, onRegisterActions])
  const band = useFloorViewport()
  return <div data-band={band}>Workspace for {bookingNo}{mockError && <div role="alert">{mockError}</div>}</div>
}

let mockStage = 'Booked'

vi.mock('../../rentals/PackingWorkspace', () => ({ default: MockWorkspace }))
vi.mock('../../rentals/HandoverWorkspace', () => ({ default: MockWorkspace }))
vi.mock('../../rentals/ReturnWorkspace', () => ({ default: MockWorkspace }))
vi.mock('../../rentals/ResetWorkspace', () => ({ default: MockWorkspace }))
vi.mock('../../rentals/actions/RentalMoreActions', () => ({
  RentalMoreActions: () => <button aria-label="Booking actions">Booking actions</button>,
}))

vi.mock('../../../lib/queries/bookings', () => ({
  fetchFloorBooking: vi.fn().mockImplementation(async () => ({
    id: 'b-715',
    bookingNo: 'B-715',
    stage: mockStage,
    clientName: 'Himalayan Films',
    pickupAtAd: '2026-09-20',
    returnAtAd: '2026-09-25',
    deliveryType: 'pickup',
    isCancelled: false,
    isClosed: false,
    linesPresence: 'present',
    lines: [
      {
        id: 'l-1',
        qty: 2,
        units: [
          { id: 'u-1', packed: true, unit_state: 'Available', damaged: false, released_at: null },
          { id: 'u-2', packed: false, unit_state: 'Available', damaged: false, released_at: null },
        ],
      },
    ],
  })),
}))

vi.mock('../../../lib/device', async (orig) => ({
  ...(await orig<typeof import('../../../lib/device')>()),
  useViewport: () => 'tablet' as const,
}))
vi.mock('../../../lib/queries/operationTaskFacts', () => ({ fetchOperationTaskFacts: vi.fn(async () => ({ total: 2, resetDone: 0, cleaningPending: 2, qcPending: 2, problems: 0 })) }))

const { default: OperationsShell } = await import('../OperationsShell')
const { fetchFloorBooking } = await import('../../../lib/queries/bookings')
const fetchFloor = vi.mocked(fetchFloorBooking)
const originalFetch = fetchFloor.getMockImplementation()!

let container: HTMLDivElement
let root: Root

/** The stage the header's progress bar marks as open (RULING 2026-10-25: the subtitle no longer names it). */
const openStage = () =>
  container.querySelector('nav[aria-label="Operation stage"] button[aria-current="step"]')?.getAttribute('aria-label') ?? ''

async function mount(
  onClose = vi.fn(),
  status: 'Quote' | 'Booked' | 'Packed' | 'On Rent' | 'Returned' | 'Closed' = 'Booked',
  initialJob: 'Pack' | 'Handover' | 'Return' | 'Reset' = 'Pack',
) {
  mockStage = status
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter>
        <OperationsShell
          bookingNo="B-715"
          bookingStatus={status}
          initialJob={initialJob}
          isOpen
          onClose={onClose}
        />
      </MemoryRouter>,
    )
  })
  for (let index = 0; index < 3; index += 1) {
    await act(async () => {
      await Promise.resolve()
    })
  }
  return onClose
}

beforeEach(() => {
  dirty = false
  mockError = null
  mockBlocked = null
  mockProgress = undefined
  completionCalls.mockClear()
  fetchFloor.mockReset().mockImplementation(originalFetch)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('why Confirm is disabled', () => {
  it('says what is still needed beside a disabled Confirm, and nothing once it can complete', async () => {
    mockBlocked = 'Every item packed or marked missing (+2 more)'
    await mount(vi.fn(), 'Booked', 'Pack')
    const confirm = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Confirm Packing & Next')
    expect(confirm?.hasAttribute('disabled')).toBe(true)
    expect(container.ownerDocument.body.textContent).toContain('Still needed: Every item packed or marked missing (+2 more)')
    await act(async () => root.unmount())
    container.remove()
    mockBlocked = null
    await mount(vi.fn(), 'Booked', 'Pack')
    expect(container.ownerDocument.body.textContent).not.toContain('Still needed')
  })

  it('lifts toasts to just above the footer while a job is open, and restores them on close', async () => {
    await mount(vi.fn(), 'Booked', 'Pack')
    // jsdom has no layout, so the footer's top is 0 and the lift is the whole window height + 12px;
    // what matters is that it is measured from the footer (not a fixed 104px) and cleaned up.
    expect(document.documentElement.style.getPropertyValue('--toast-bottom')).toBe(`${window.innerHeight + 12}px`)
    await act(async () => root.unmount())
    expect(document.documentElement.style.getPropertyValue('--toast-bottom')).toBe('')
    root = createRoot(container)
  })
})

describe('the room the workspace has', () => {
  const rect = (width: number) => ({ width, height: 100, top: 0, left: 0, right: width, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  const bandAt = async (width: number | null) => {
    const spy = width === null ? null : vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => rect(width))
    await mount(vi.fn(), 'Booked', 'Pack')
    const band = container.querySelector('[data-band]')?.getAttribute('data-band')
    spy?.mockRestore()
    return band
  }
  it('gives a sheet narrower than two columns need the one-column layout', async () => {
    expect(await bandAt(780)).toBe('phone')
  })
  it('leaves a wide sheet on the window-width layout', async () => {
    expect(await bandAt(1100)).toBe('tablet')
  })
  it('says nothing when there is no layout to measure (width 0)', async () => {
    expect(await bandAt(null)).toBe('tablet')
  })
})

describe('panel layout', () => {
  it('reports unsaved work to its host, and clears it on unmount', async () => {
    dirty = true
    const seen: boolean[] = []
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root.render(
        <MemoryRouter>
          <OperationsShell bookingNo="B-715" bookingStatus="Booked" isOpen layout="panel" onClose={vi.fn()} onDirtyChange={(d) => seen.push(d)} />
        </MemoryRouter>,
      )
    })
    for (let i = 0; i < 3; i += 1) await act(async () => { await Promise.resolve() })
    expect(container.querySelector('.operations-shell__panel')).not.toBeNull()
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(seen).toContain(true)
    await act(async () => root.unmount())
    expect(seen[seen.length - 1]).toBe(false)
    root = createRoot(container)
  })
})

describe('Task 5 — Operations popup navigation and state', () => {
  it('does not invent Reset completion from a Closed booking', async () => {
    await mount(vi.fn(), 'Closed', 'Reset')
    expect(container.querySelector('button[aria-current="step"]')?.getAttribute('aria-label')).toContain('Read only')
    expect(container.textContent).toContain('Cleaning pending: 2')
    expect(container.textContent).not.toContain('Completed ✓')
  })

  it('ignores a late status read for the previously selected booking', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof fetchFloorBooking>>) => void
    fetchFloor.mockReturnValueOnce(new Promise(r => { resolve = r }))
    await mount(vi.fn(), 'Booked', 'Pack')
    const next = { ...(await originalFetch('B-715'))!, id:'b-716', bookingNo:'B-716', stage:'Booked' }
    fetchFloor.mockResolvedValueOnce(next)
    await act(async () => root.render(<MemoryRouter><OperationsShell bookingNo="B-716" bookingStatus="Booked" initialJob="Pack" isOpen onClose={vi.fn()} /></MemoryRouter>))
    await act(async () => { resolve({ ...next, id:'b-715', bookingNo:'B-715', stage:'Returned' }); await Promise.resolve() })
    expect(container.textContent).toContain('Operations · B-716')
    expect(container.textContent).toContain('Status: Booked')
    expect(container.querySelector('button[aria-label^="Cleaning & Reset"]')?.hasAttribute('disabled')).toBe(true)
  })
  it('keeps a committed partial Return On Rent and does not unlock Reset', async () => {
    await mount(vi.fn(), 'On Rent', 'Return')
    const confirm = [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Confirm Return session')
    await act(async () => confirm?.click())
    expect(container.textContent).toContain('Status: On Rent')
    expect(openStage()).toContain('Return & Inspection')
    expect(container.querySelector('button[aria-label^="Cleaning & Reset"]')?.hasAttribute('disabled')).toBe(true)
    expect(container.querySelector('button[aria-current="step"]')?.getAttribute('aria-label')).toContain('Return & Inspection')
  })

  it('does not advance after a committed session if authoritative refresh fails', async () => {
    await mount(vi.fn(), 'On Rent', 'Return')
    fetchFloor.mockRejectedValueOnce(new Error('Booking could not be read'))
    const confirm = [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Confirm Return session')
    await act(async () => confirm?.click())
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Booking could not be read')
    expect(container.querySelector('button[aria-label^="Cleaning & Reset"]')?.hasAttribute('disabled')).toBe(true)
    expect([...container.querySelectorAll('button')].find(b => b.textContent === 'Retry booking status')).toBeDefined()
    mockStage = 'Returned'
    await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'Retry booking status')?.click())
    expect(container.textContent).toContain('Status: Returned')
    expect(openStage()).toContain('Cleaning & Reset')
    expect(completionCalls).toHaveBeenCalledTimes(1)
  })

  it('blocks confirmation when the initial booking read fails, with a visible retry', async () => {
    fetchFloor.mockRejectedValueOnce(new Error('Network unavailable'))
    await mount(vi.fn(), 'Booked', 'Pack')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Network unavailable')
    const confirm = [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Confirm Packing & Next')
    expect(confirm?.disabled).toBe(true)
    expect(completionCalls).not.toHaveBeenCalled()
  })

  it('accepts only one completion while its persisted status read is pending', async () => {
    await mount(vi.fn(), 'Booked', 'Pack')
    let resolve!: (value: Awaited<ReturnType<typeof fetchFloorBooking>>) => void
    const pendingRead = new Promise<Awaited<ReturnType<typeof fetchFloorBooking>>>(r => { resolve = r })
    fetchFloor.mockReturnValueOnce(pendingRead)
    const confirm = [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Confirm Packing & Next')
    await act(async () => { confirm?.click(); confirm?.click() })
    expect(completionCalls).toHaveBeenCalledTimes(1)
    mockStage = 'Packed'
    await act(async () => { resolve(await originalFetch('B-715')); await pendingRead })
  })

  it.each([null, 'Ready'])('refuses an absent or unsupported persisted stage (%s)', async (stage) => {
    const booking = await originalFetch('B-715')
    fetchFloor.mockResolvedValueOnce(stage === null ? null : { ...booking!, stage })
    await mount(vi.fn(), 'Booked', 'Pack')
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
    const confirm = [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Confirm Packing & Next')
    expect(confirm?.disabled).toBe(true)
    expect(completionCalls).not.toHaveBeenCalled()
  })

  it('does not consume stage shortcuts from a nested dialog', async () => {
    await mount(vi.fn(), 'On Rent', 'Return')
    const nested = document.createElement('div')
    nested.setAttribute('role', 'dialog')
    nested.setAttribute('aria-modal', 'true')
    const button = document.createElement('button')
    nested.append(button)
    container.append(nested)
    await act(async () => button.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true })))
    expect(container.querySelector('button[aria-current="step"]')?.getAttribute('aria-label')).toContain('Return & Inspection')
    nested.remove()
  })

  it('shows a workspace error once, without repeating it in the modal footer', async () => {
    mockError = 'Handover could not be recorded'
    await mount(vi.fn(), 'Packed', 'Handover')
    expect([...container.querySelectorAll('[role="alert"]')].filter((el) => el.textContent === mockError)).toHaveLength(1)
  })

  it('Packing shows Close (left) and Confirm Packing & Next (right)', async () => {
    await mount(vi.fn(), 'Booked', 'Pack')
    const buttons = [...container.querySelectorAll('button')]
    const closeBtn = buttons.find((b) => b.textContent?.trim() === 'Close')
    const confirmBtn = buttons.find((b) => b.textContent?.trim() === 'Confirm Packing & Next')

    expect(closeBtn).toBeDefined()
    expect(confirmBtn).toBeDefined()
    expect(container.textContent).toContain('Workspace for B-715')
  })

  it('Confirm Packing & Next advances to Handover with live status Packed', async () => {
    await mount(vi.fn(), 'Booked', 'Pack')
    const confirmBtn = [...container.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Confirm Packing & Next',
    )
    mockStage = 'Packed'
    await act(async () => confirmBtn?.click())

    expect(container.textContent).toContain('Status: Packed')

    expect(openStage()).toContain('Handover')
    const leftBtn = [...container.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === '← Packing',
    )
    const nextBtn = [...container.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Confirm Handover & Next',
    )
    expect(leftBtn).toBeDefined()
    expect(nextBtn).toBeDefined()
  })

  it('Handover ← Packing navigates back to Packing without closing the popup', async () => {
    const onClose = await mount(vi.fn(), 'Packed', 'Handover')
    const leftBtn = [...container.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === '← Packing',
    )
    expect(leftBtn).toBeDefined()

    await act(async () => leftBtn?.click())

    expect(onClose).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Status: Packed')
    expect(openStage()).toContain('Packing')
    expect([...container.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Close')).toBe(true)
  })

  it('Handover dirty state protection prompts discard warning when going back', async () => {
    dirty = true
    const onClose = await mount(vi.fn(), 'Packed', 'Handover')
    const leftBtn = [...container.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === '← Packing',
    )

    await act(async () => leftBtn?.click())

    expect(onClose).not.toHaveBeenCalled()
    expect(container.textContent).toContain('You have unsaved changes.')
    expect(container.textContent).toContain('Discard changes and go back to Packing?')

    const discardBtn = [...container.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Discard & Go Back',
    )
    expect(discardBtn).toBeDefined()

    await act(async () => discardBtn?.click())

    // Navigated back to packing, modal remains open
    expect(onClose).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Status: Packed')
    expect(openStage()).toContain('Packing')
  })

  it('Return & Inspection shows ← Handover and Confirm Return session', async () => {
    await mount(vi.fn(), 'On Rent', 'Return')
    const buttons = [...container.querySelectorAll('button')]
    const leftBtn = buttons.find((b) => b.textContent?.trim() === '← Handover')
    const confirmBtn = buttons.find((b) => b.textContent?.trim() === 'Confirm Return session')

    expect(leftBtn).toBeDefined()
    expect(confirmBtn).toBeDefined()
    expect(confirmBtn?.style.minHeight).toBe('56px')
    expect(container.querySelectorAll('nav[aria-label="Operation stage"] button')).toHaveLength(4)
  })

  it('Cleaning & Reset shows ← Return & Inspection and Confirm Reset (no & Next)', async () => {
    await mount(vi.fn(), 'Returned', 'Reset')
    const buttons = [...container.querySelectorAll('button')]
    const leftBtn = buttons.find((b) => b.textContent?.trim() === '← Return & Inspection')
    const confirmBtn = buttons.find((b) => b.textContent?.trim() === 'Confirm Reset')

    expect(leftBtn).toBeDefined()
    expect(confirmBtn).toBeDefined()
    expect(buttons.some((b) => b.textContent?.includes('Confirm Reset & Next'))).toBe(false)
  })

  it('protects unsaved changes on Close and closes only after discard confirmation', async () => {
    dirty = true
    const onClose = await mount(vi.fn(), 'Booked', 'Pack')
    expect(onClose).not.toHaveBeenCalled()

    const closeBtn = [...container.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Close',
    )
    await act(async () => closeBtn?.click())

    expect(onClose).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Discard unsaved operations work?')
    expect(container.textContent).toContain('You have changes that have not been saved.')

    const discardBtn = [...container.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Discard Changes',
    )
    await act(async () => discardBtn?.click())

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('keeps completed previous stages accessible for viewing', async () => {
    // When booking is On Rent, Packing is already completed
    await mount(vi.fn(), 'On Rent', 'Return')
    const packTab = [...container.querySelectorAll<HTMLButtonElement>('nav[aria-label="Operation stage"] button')].find(
      (b) => b.getAttribute('aria-label')?.startsWith('Packing'),
    )
    expect(packTab).toBeDefined()
    expect(packTab?.hasAttribute('disabled')).toBe(false)

    // Clicking completed Packing tab switches to Packing view
    await act(async () => packTab?.click())
    expect(container.textContent).toContain('Status: On Rent')
    expect(openStage()).toContain('Packing')
    // Primary button indicates completed
    const completedBtn = [...container.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Completed ✓',
    )
    expect(completedBtn).toBeDefined()
  })

  it('locks future stages and displays prerequisite reason when blocked', async () => {
    // At Booked stage, Return and Reset are locked
    await mount(vi.fn(), 'Booked', 'Pack')
    const stageTabs = [...container.querySelectorAll('nav[aria-label="Operation stage"] button')]
    const returnTab = stageTabs.find((b) => b.textContent?.includes('Return'))
    const resetTab = stageTabs.find((b) => b.getAttribute('aria-label')?.includes('Reset'))

    expect(returnTab?.hasAttribute('disabled')).toBe(true)
    expect(resetTab?.hasAttribute('disabled')).toBe(true)
    // One lock icon and the words, not a 🔒 emoji beside a lock icon (8 Oct 2026).
    for (const tab of [returnTab, resetTab]) {
      expect(tab?.textContent).toContain('Not open yet')
      expect(tab?.textContent).not.toContain('🔒')
      expect(tab?.querySelectorAll('svg.tabler-icon-lock')).toHaveLength(1)
    }
  })

  it('renders booking context summary details', async () => {
    await mount(vi.fn(), 'Booked', 'Pack')
    expect(container.textContent).toContain('Himalayan Films')
    expect(container.querySelector('summary')?.textContent).toBe('Booking details')
    expect(container.textContent).toContain('B-715')
    expect(container.textContent).toContain('Pickup')
    expect(container.textContent?.match(/Himalayan Films/g)).toHaveLength(1)
    expect(container.textContent).toContain('20/9/2026')
  })

  it('switches between unlocked stages using 1-4 number keys', async () => {
    await mount(vi.fn(), 'On Rent', 'Pack')
    expect(container.textContent).toContain('Status: On Rent')
    expect(openStage()).toContain('Packing')

    // Press '2' to switch to Handover
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }))
    })
    expect(container.textContent).toContain('Status: On Rent')
    expect(openStage()).toContain('Handover')

    // Press '3' to switch to Return
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '3' }))
    })
    expect(container.textContent).toContain('Status: On Rent')
    expect(openStage()).toContain('Return & Inspection')
  })
})

describe('RULING 2026-10-25 — the stage progress bar lives in the header', () => {
  const stage = (name: string) =>
    [...container.querySelectorAll<HTMLButtonElement>('nav[aria-label="Operation stage"] button')].find((b) =>
      b.getAttribute('aria-label')?.startsWith(name),
    )
  const fillOf = (button: HTMLButtonElement | undefined) =>
    button?.querySelector<HTMLElement>('.operations-shell__stage-fill')?.style.transform

  it('is inside the modal header, not the scrolling body', async () => {
    await mount()
    expect(container.querySelector('.app-modal__header nav[aria-label="Operation stage"]')).not.toBeNull()
    expect(container.querySelector('.app-modal__content nav[aria-label="Operation stage"]')).toBeNull()
    expect(container.querySelectorAll('nav[aria-label="Operation stage"] button')).toHaveLength(4)
  })

  it('shows the live count of the open stage and fills in proportion to it', async () => {
    mockProgress = { done: 1, total: 2 }
    await mount()
    const pack = stage('Packing')
    expect(pack?.querySelector('.operations-shell__stage-count')?.textContent).toBe('1/2')
    expect(pack?.getAttribute('aria-label')).toContain('1/2')
    expect(fillOf(pack)).toBe('scaleX(0.5)')
  })

  it('draws a completed stage full and a stage that is not open yet empty', async () => {
    await mount(vi.fn(), 'Packed', 'Handover')
    expect(fillOf(stage('Packing'))).toBe('scaleX(1)')
    expect(stage('Packing')?.getAttribute('data-state')).toBe('done')
    expect(fillOf(stage('Return'))).toBe('scaleX(0)')
    expect(stage('Return')?.hasAttribute('disabled')).toBe(true)
  })

  it('does not invent a count when the workspace has reported none', async () => {
    await mount()
    expect(container.querySelector('.operations-shell__stage-count')).toBeNull()
    expect(fillOf(stage('Packing'))).toBe('scaleX(0)')
  })

  it('leaves the subtitle with the booking status only — the bar names the stage', async () => {
    await mount(vi.fn(), 'Packed', 'Handover')
    const header = container.querySelector('.app-modal__header')?.textContent ?? ''
    expect(header).toContain('Status: Packed')
    expect(header).not.toContain('Handover · Status')
  })
})
