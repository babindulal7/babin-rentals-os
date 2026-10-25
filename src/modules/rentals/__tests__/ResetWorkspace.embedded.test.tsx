// @vitest-environment jsdom
/**
 * RULING 2026-10-25 — inside the Operations popup the Reset workspace does not draw its four
 * queue-state tiles (Waiting / Cleaning / QC / Ready): the filter chips directly under them
 * already carry the same four counts, and the header's stage bar carries the progress.
 * The full-page route (`!embedded`) keeps the tiles and is the control here.
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

const B901 = '11111111-1111-4111-8111-111111111111'

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Shrestha', role: 'Warehouse', isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

vi.mock('../../../lib/queries/bookings', () => ({
  fetchFloorBooking: async (ref: string) => ({
    id: B901,
    bookingNo: ref,
    stage: 'Returned',
    clientName: 'Himalayan Films Pvt. Ltd.',
    project: 'Film Shoot',
    pickupAtAd: '2026-07-16T00:15:00.000Z',
    returnAtAd: '2026-07-19T00:15:00.000Z',
    actualReturnAtAd: '2026-07-19T04:00:00.000Z',
    deliveryType: 'Client Pickup',
    isCancelled: false,
    isClosed: false,
    linesPresence: 'present',
    lines: [
      {
        id: 'l-1',
        qty: 1,
        lineType: 'Equipment',
        description: 'Sony FX3',
        productId: 'p-1',
        productName: 'Sony FX3',
        trackingMode: 'Serialised',
        parentLineId: null,
        sortOrder: 1,
        unitsPresence: 'present',
        units: [
          {
            id: 'u-1',
            assetId: 'a-1',
            serial: 'SN102',
            assetTag: 'EQ000001-U01',
            unitState: 'Returned',
            isRequired: true,
            packed: true,
            damaged: false,
            location: 'A2-01',
          },
        ],
      },
    ],
  }),
}))

vi.mock('../../../actions/rentals/index', () => ({
  completeReset: async () => ({ ok: true }),
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

async function flush(rounds = 4) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

beforeEach(() => {
  sessionStorage.clear()
  Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true, writable: true })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => {
    root.unmount()
  })
  container.remove()
  document.body.innerHTML = ''
})

const text = () => (container.textContent ?? '').replace(/\s+/g, ' ')

describe('ResetWorkspace inside the Operations popup (embedded)', () => {
  it('does not draw the four queue-state tiles, and keeps the filter chips that carry the counts', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ResetWorkspace bookingNo="B-901" embedded />
        </MemoryRouter>,
      )
    })
    await flush()

    expect(text()).toContain('Needs action')
    expect(text()).toContain('Reset Queue')
    expect(text()).not.toContain('Quality check')
    expect(text()).not.toContain('Ready to rent')
  })

  it('still reports its live unit count to the host', async () => {
    const register = vi.fn()
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ResetWorkspace bookingNo="B-901" embedded onRegisterActions={register} />
        </MemoryRouter>,
      )
    })
    await flush()

    const reported = register.mock.calls.map(([actions]) => actions as OperationWorkspaceActions)
    expect(reported.length).toBeGreaterThan(0)
    expect(reported[reported.length - 1]?.progress?.total).toBe(1)
  })
})

describe('ResetWorkspace as a full page (not embedded) is unchanged', () => {
  it('still draws the four queue-state tiles', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/rentals/B-901/reset']}>
          <Routes>
            <Route path="/rentals/:bookingNo/reset" element={<ResetWorkspace />} />
          </Routes>
        </MemoryRouter>,
      )
    })
    await flush()

    expect(text()).toContain('Quality check')
    expect(text()).toContain('Ready to rent')
  })
})
