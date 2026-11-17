// @vitest-environment jsdom
/**
 * Ruling D5 (§4.65a / MAY_BRIEF_DECISIONS.md) — Reset "Needed next"
 *
 * In the Reset queue, a unit whose next reservation pickup is within 4 hours ⭐ (Settings ▸ Operations)
 * shows a "Needed next · pickup 10:30" badge (icon + text, never colour alone) and sorts to the top;
 * the rest stay first-in, first-out.
 *
 * Done when:
 * 1. Mock data with a pickup in 3 h sorts first and renders the badge.
 * 2. At 5 h it does not show badge and does not sort first under default (4 h).
 * 3. Settings change takes effect (e.g. changing threshold to 6 h promotes 5 h unit; threshold 2 h demotes 3 h unit).
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { loadMockClient } from '../../../lib/supabase'
import { fetchStaffDirectory } from '../../../lib/queries/staff'
import { writeSettings, resetSettings } from '../../../lib/settingsStore'

const upcomingState = vi.hoisted(() => ({ fail: false }))

vi.mock('../../../lib/queries/staff', () => ({ fetchStaffDirectory: vi.fn() }))
beforeEach(() => {
  vi.mocked(fetchStaffDirectory).mockResolvedValue({ kind: 'ok', rows: [] })
})

beforeAll(async () => {
  await loadMockClient()
})

const B_RESET = '33333333-3333-4333-8333-333333333333'

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Shrestha', role: 'Warehouse', isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

// Current fixed simulated reference time
const BASE_TIME = Date.parse('2026-10-26T06:00:00.000Z')

// Unit 1: pickup in 5 hours (11:00 UTC = 16:45 NPT)
const PICKUP_5H = new Date(BASE_TIME + 5 * 3600 * 1000).toISOString()
// Unit 2: pickup in 3 hours (09:00 UTC = 14:45 NPT)
const PICKUP_3H = new Date(BASE_TIME + 3 * 3600 * 1000).toISOString()

vi.mock('../../../lib/queries/bookings', () => ({
  fetchFloorBooking: async (ref: string) => ({
    id: B_RESET,
    bookingNo: ref,
    stage: 'Returned',
    clientName: 'Kathmandu Visuals',
    project: 'Feature Film',
    pickupAtAd: '2026-10-20T00:15:00.000Z',
    returnAtAd: '2026-10-25T00:15:00.000Z',
    actualReturnAtAd: '2026-10-25T04:00:00.000Z',
    deliveryType: 'Client Pickup',
    isCancelled: false,
    isClosed: false,
    linesPresence: 'present',
    lines: [
      {
        id: 'line-1',
        qty: 1,
        lineType: 'Equipment',
        description: 'Alpha Camera (Pickup in 5h)',
        productId: 'prod-1',
        productName: 'Alpha Camera',
        trackingMode: 'Serialised',
        parentLineId: null,
        sortOrder: 1,
        unitsPresence: 'present',
        units: [
          {
            id: 'unit-1',
            assetId: 'asset-alpha',
            serialNumber: 'SN-ALPHA-01',
            barcode: 'BC-ALPHA-01',
          },
        ],
      },
      {
        id: 'line-2',
        qty: 1,
        lineType: 'Equipment',
        description: 'Beta Camera (Pickup in 3h)',
        productId: 'prod-2',
        productName: 'Beta Camera',
        trackingMode: 'Serialised',
        parentLineId: null,
        sortOrder: 2,
        unitsPresence: 'present',
        units: [
          {
            id: 'unit-2',
            assetId: 'asset-beta',
            serialNumber: 'SN-BETA-02',
            barcode: 'BC-BETA-02',
          },
        ],
      },
    ],
  }),
}))

vi.mock('../../../lib/queries/reset', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/queries/reset')>()
  return {
    ...actual,
    getNextReservationsForUnits: async () => {
      if (upcomingState.fail) throw new Error('Network connection lost')
      return {
      'asset-alpha': { pickupAt: PICKUP_5H, bookingNo: 'BK-5H' },
      'asset-beta': { pickupAt: PICKUP_3H, bookingNo: 'BK-3H' },
      }
    },
    // Anchor Date.now() in isNeededNext default parameter to BASE_TIME
    isNeededNext: (pickupAtIso: string, thresholdHours: number = 4, nowMs: number = BASE_TIME) =>
      actual.isNeededNext(pickupAtIso, thresholdHours, nowMs),
  }
})

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
  upcomingState.fail = false
  resetSettings()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

const flush = async (n = 4) => {
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

async function mount() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/rentals/${B_RESET}/reset`]}>
        <Routes>
          <Route path="/rentals/:id/reset" element={<ResetWorkspace />} />
        </Routes>
      </MemoryRouter>,
    )
  })
  await flush(6)
}

describe('Reset Workspace — Ruling D5 "Needed next"', () => {
  it('sorts unit needed in 3h to the top with "Needed next" badge, while 5h unit does not show badge under default 4h setting', async () => {
    await mount()

    const rows = container.querySelectorAll('.floor-table-row')
    expect(rows.length).toBe(2)

    // Beta Camera (3h) must sort first because it is needed next (within 4h)
    const firstRowText = rows[0]?.textContent ?? ''
    const secondRowText = rows[1]?.textContent ?? ''

    expect(firstRowText).toContain('Beta Camera')
    expect(firstRowText).toContain('Needed next · pickup 14:45')

    // Alpha Camera (5h) must sort second and NOT have the badge
    expect(secondRowText).toContain('Alpha Camera')
    expect(secondRowText).not.toContain('Needed next')
  })

  it('promotes the 5h unit when settings threshold is increased to 6h', async () => {
    // Change setting to 6 hours
    writeSettings({ resetNeededNextHours: 6 })

    await mount()

    const rows = container.querySelectorAll('.floor-table-row')
    expect(rows.length).toBe(2)

    // Both are now within 6 hours. Beta (3h) is earlier than Alpha (5h), so Beta still sorts first,
    // but now Alpha ALSO carries the "Needed next" badge!
    const firstRowText = rows[0]?.textContent ?? ''
    const secondRowText = rows[1]?.textContent ?? ''

    expect(firstRowText).toContain('Beta Camera')
    expect(firstRowText).toContain('Needed next · pickup 14:45')

    expect(secondRowText).toContain('Alpha Camera')
    expect(secondRowText).toContain('Needed next · pickup 16:45')
  })

  it('updates urgency badges when the setting changes while Reset stays open', async () => {
    await mount()
    let rows = container.querySelectorAll('.floor-table-row')
    expect(rows[1]?.textContent).not.toContain('Needed next')

    await act(async () => { writeSettings({ resetNeededNextHours: 6 }) })
    await flush(6)
    rows = container.querySelectorAll('.floor-table-row')
    expect(rows[1]?.textContent).toContain('Needed next · pickup 16:45')

    await act(async () => { writeSettings({ resetNeededNextHours: 2 }) })
    await flush(6)
    rows = container.querySelectorAll('.floor-table-row')
    expect(rows[0]?.textContent).not.toContain('Needed next')
    expect(rows[1]?.textContent).not.toContain('Needed next')
  })

  it('shows persistent unknown-priority warning rather than false emptiness on lookup failure', async () => {
    upcomingState.fail = true
    await mount()
    expect(container.textContent).toContain('Upcoming bookings could not be checked')
    expect(container.textContent).toContain('Network connection lost')
    expect(container.textContent).toContain('Priority order is unknown')
    upcomingState.fail = false
  })

  it('demotes the 3h unit when settings threshold is lowered to 2h', async () => {
    // Change setting to 2 hours
    writeSettings({ resetNeededNextHours: 2 })

    await mount()

    const rows = container.querySelectorAll('.floor-table-row')
    expect(rows.length).toBe(2)

    // Neither is within 2 hours, so neither has the badge and original order (Alpha then Beta) is kept
    const firstRowText = rows[0]?.textContent ?? ''
    const secondRowText = rows[1]?.textContent ?? ''

    expect(firstRowText).toContain('Alpha Camera')
    expect(firstRowText).not.toContain('Needed next')

    expect(secondRowText).toContain('Beta Camera')
    expect(secondRowText).not.toContain('Needed next')
  })
})
