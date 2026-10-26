// @vitest-environment jsdom
/**
 * # Reset Workspace — Quantity-only reset recording
 *
 * Verifies that bookings with only quantity-tracked equipment:
 * 1. Present the gate "Quantity-only reset recording available"
 * 2. Can pass the gate once items are Ready or recorded as an exception
 * 3. Dispatch completeReset with lineIds and resetEntries (lineId)
 * 4. Do not block with "Quantity-only reset completion cannot be recorded by the current server contract"
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { loadMockClient } from '../../../lib/supabase'
import { fetchStaffDirectory } from '../../../lib/queries/staff'
import type { OperationWorkspaceActions } from '../../operations/operationWorkspaceActions'

vi.mock('../../../lib/queries/staff', () => ({ fetchStaffDirectory: vi.fn() }))
beforeEach(() => {
  vi.mocked(fetchStaffDirectory).mockResolvedValue({ kind: 'ok', rows: [] })
})

beforeAll(async () => {
  await loadMockClient()
})

const B902 = '22222222-2222-4222-8222-222222222222'

const dispatched: Array<Record<string, unknown>> = []

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Shrestha', role: 'Warehouse', isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

vi.mock('../../../lib/queries/bookings', () => ({
  fetchFloorBooking: async (ref: string) => ({
    id: B902,
    bookingNo: ref,
    stage: 'Returned',
    clientName: 'Kathmandu Grip & Light',
    project: 'Commercial Shoot',
    pickupAtAd: '2026-07-16T00:15:00.000Z',
    returnAtAd: '2026-07-19T00:15:00.000Z',
    actualReturnAtAd: '2026-07-19T04:00:00.000Z',
    deliveryType: 'Client Pickup',
    isCancelled: false,
    isClosed: false,
    linesPresence: 'present',
    lines: [
      {
        id: 'l-qty-1',
        qty: 3,
        lineType: 'Equipment',
        description: 'Sandbag 10kg',
        productId: 'p-sandbag',
        productName: 'Sandbag 10kg',
        trackingMode: 'Quantity',
        parentLineId: null,
        sortOrder: 1,
        unitsPresence: 'absent',
        units: [],
      },
    ],
  }),
}))

vi.mock('../../../actions/rentals/index', () => ({
  completeReset: async (input: Record<string, unknown>) => {
    dispatched.push(input)
    return { ok: true }
  },
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

const ResetWorkspace = (await import('../ResetWorkspace')).default

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  dispatched.length = 0
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

const flush = async (n = 2) => {
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

async function mount(onRegister?: (actions: OperationWorkspaceActions) => void) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/rentals/${B902}/reset`]}>
        <Routes>
          <Route
            path="/rentals/:id/reset"
            element={<ResetWorkspace {...(onRegister ? { onRegisterActions: onRegister } : {})} />}
          />
          <Route
            path="/rentals/*"
            element={<div>Booking Detail</div>}
          />
        </Routes>
      </MemoryRouter>,
    )
  })
  await flush()
}

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await flush(1)
}

async function check(input: HTMLInputElement) {
  await click(input)
}

async function type(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value)
  await act(async () => el.dispatchEvent(new Event('input', { bubbles: true })))
  await flush(1)
}

function button(textMatch: string): HTMLButtonElement {
  const btn = [...container.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    (b.textContent ?? '').includes(textMatch),
  )
  if (!btn) throw new Error(`button containing "${textMatch}" not found`)
  return btn
}

describe('ResetWorkspace — quantity-only bookings', () => {
  it('renders Gate 3 as "Quantity-only reset recording available", passes when items reach Ready, and dispatches lineIds', async () => {
    let actions: OperationWorkspaceActions | null = null
    await mount((a) => {
      actions = a
    })

    // Before working on the item, Gate 3 shows pending
    const gateCard = container.querySelector('#reset-gates')
    expect(gateCard).not.toBeNull()
    const gateRow = [...container.querySelectorAll('.floor-gate-row')].find((r) =>
      r.textContent?.includes('Quantity-only reset recording available'),
    )
    expect(gateRow).toBeDefined()
    expect(gateRow?.className).toContain('is-pending')

    // Select row
    const rowCheckbox = container.querySelector<HTMLInputElement>('input[type="checkbox"][aria-label*="Select"]')
      ?? container.querySelector<HTMLInputElement>('tbody input[type="checkbox"]')
    expect(rowCheckbox).not.toBeNull()
    await check(rowCheckbox!)

    // Move to QC via Complete Checklist & Move to QC
    const completeChecklistBtn = button('Complete Checklist & Move to QC')
    await click(completeChecklistBtn)

    // Select row again if deselected
    const selectAfterQc = container.querySelector<HTMLInputElement>('input[type="checkbox"][aria-label*="Select"]')
      ?? container.querySelector<HTMLInputElement>('tbody input[type="checkbox"]')
    if (selectAfterQc && !selectAfterQc.checked) {
      await check(selectAfterQc)
    }

    // Set batch QC reason
    const batchInput = container.querySelector<HTMLInputElement>('input[aria-label="Batch QC reason"]')
    if (batchInput) {
      await type(batchInput, 'Sole cleaner on shift')
      const passQcBtn = button('Pass QC for All')
      expect(passQcBtn.disabled).toBe(false)
      await click(passQcBtn)
    } else {
      // Per-row pass
      const passBtn = button('Pass')
      await click(passBtn)
    }

    // Gate 3 should now be passing
    const updatedGateRow = [...container.querySelectorAll('.floor-gate-row')].find((r) =>
      r.textContent?.includes('Quantity-only reset recording available'),
    )
    expect(updatedGateRow?.className).toContain('is-pass')
    expect((actions as unknown as OperationWorkspaceActions)?.canComplete).toBe(true)

    // Confirm that the unsupported error string is NOT rendered
    expect(container.textContent).not.toContain('Quantity-only reset completion cannot be recorded by the current server contract')

    // Click Complete Reset
    const completeBtn = button('Complete Reset')
    expect(completeBtn.disabled).toBe(false)
    await click(completeBtn)

    expect(dispatched.length).toBe(1)
    expect(dispatched[0]).toMatchObject({
      id: B902,
      lineIds: ['l-qty-1'],
      unitIds: [],
      resetEntries: [
        expect.objectContaining({
          lineId: 'l-qty-1',
        }),
      ],
    })
  })
})
