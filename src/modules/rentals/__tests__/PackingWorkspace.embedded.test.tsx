// @vitest-environment jsdom
/**
 * RULING 2026-10-25 — inside the Operations popup the stage progress bar lives in the
 * header, so the Packing workspace does not say the same things again below it.
 * The full-page route (`!embedded`) is unchanged, and is the control here.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../../../components/ui/Toast'
import PackingWorkspace from '../PackingWorkspace'
import type { OperationWorkspaceActions } from '../../operations/operationWorkspaceActions'
import { loadMockClient } from '../../../lib/supabase'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

beforeAll(async () => {
  await loadMockClient()
})

const B901_ID = '11111111-1111-4111-8111-111111111111'

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Shrestha', role: 'Owner', isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

vi.mock('../../../lib/queries/bookings', () => ({
  fetchFloorBooking: async (ref: string) => ({
    id: B901_ID,
    bookingNo: ref,
    stage: 'Booked',
    clientName: 'Himalayan Films Pvt. Ltd.',
    project: 'Film Shoot',
    pickupAtAd: '2026-07-16T00:15:00.000Z',
    returnAtAd: '2026-07-19T00:15:00.000Z',
    actualReturnAtAd: null,
    deliveryType: 'Client Pickup',
    isCancelled: false,
    isClosed: false,
    linesPresence: 'present',
    lines: [
      {
        id: 'l-1',
        qty: 1,
        lineType: 'Equipment',
        description: 'Sony FX3 Cinema Line Camera',
        productId: 'p-1',
        productName: 'Sony FX3 Cinema Line Camera',
        trackingMode: 'Serialised',
        parentLineId: null,
        sortOrder: 1,
        unitsPresence: 'present',
        units: [
          {
            id: 'u-1',
            assetId: 'a-1',
            serial: 'SN-FX3-001',
            assetTag: 'EQ000001-U01',
            unitState: 'Ready',
            isRequired: true,
            packed: false,
            damaged: false,
            location: 'A2-01',
          },
        ],
      },
    ],
  }),
}))

vi.mock('../../../actions/rentals/index', () => ({
  packRental: vi.fn().mockResolvedValue({ stage: 'Packed', version: 2, at: '2026-07-16T00:15:00.000Z' }),
}))

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
  localStorage.clear()
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
  localStorage.clear()
})

async function mountEmbedded(onRegisterActions: (actions: OperationWorkspaceActions) => void) {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <ToastProvider>
          <PackingWorkspace bookingNo="B-901" embedded onRegisterActions={onRegisterActions} />
        </ToastProvider>
      </MemoryRouter>,
    )
  })
  await flush()
}

describe('PackingWorkspace inside the Operations popup (embedded)', () => {
  it('reports its live unit count to the host instead of drawing its own progress row', async () => {
    const register = vi.fn()
    await mountEmbedded(register)

    const reported = register.mock.calls.map(([actions]) => actions as OperationWorkspaceActions)
    expect(reported.length).toBeGreaterThan(0)
    expect(reported[reported.length - 1]?.progress).toEqual({ done: 0, total: 1 })

    const text = document.body.textContent ?? ''
    expect(text).toContain('Packing Checklist')
    expect(text).not.toContain('Packing Progress')
    expect(text).not.toContain('units pending')
  })

  it('does not repeat the counts or the empty cards in the rail', async () => {
    await mountEmbedded(vi.fn())
    const text = document.body.textContent ?? ''

    expect(text).toContain('Blockers')
    expect(text).not.toContain('Bundle Summary')
    expect(text).not.toContain('Units packed')
    expect(text).not.toContain('No missing items.')
    expect(text).not.toContain('operation_sessions.notes')
  })
})

describe('PackingWorkspace as a full page (not embedded) is unchanged', () => {
  it('still draws its own progress row and summaries', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/rentals/B-901/pack']}>
          <ToastProvider>
            <Routes>
              <Route path="/rentals/:bookingNo/pack" element={<PackingWorkspace />} />
            </Routes>
          </ToastProvider>
        </MemoryRouter>,
      )
    })
    await flush()
    const text = document.body.textContent ?? ''

    expect(text).toContain('Packing Progress')
    expect(text).toContain('Bundle Summary')
    expect(text).toContain('Units packed')
    expect(text).toContain('No missing items.')
  })
})
