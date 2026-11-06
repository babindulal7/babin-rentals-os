// @vitest-environment jsdom
/**
 * **Evidence Workspace — HO-09 and HO-10, driven.**
 *
 * Both items are invisible to a module test, because both are about what the
 * rendered page CLAIMS:
 *
 *  · **HO-09** — the booking head was a set of literals (`v: 'Booked'`,
 *    `new Date('2026-07-16')`, `16 Jul 2026`, `data/booking`'s seeded client),
 *    so one booking's schedule and stage appeared above every booking number.
 *    It is `fetchFloorBooking` now, and these assertions mock that seam with a
 *    booking that agrees with NONE of the old literals — a different stage, a
 *    different client, different dates — so a re-introduced literal fails
 *    rather than coincidentally matching.
 *  · **HO-10** — seven bulk buttons rendered enabled from an array with no
 *    handler; `Remove` wrote local state under copy promising retention and an
 *    Archived filter; `Clear all filters` left the category filter set.
 *
 * Environment pragma per `vitest.config.ts`, which keeps the suite on `node`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { formatAd } from '../../../lib/bs'
import type { FloorBooking } from '../../../lib/queries/bookings'
import type { SavedEvidenceFile } from '../../../lib/queries/evidence'

vi.mock('../../../lib/device', async (orig) => ({
  ...(await orig<typeof import('../../../lib/device')>()),
  useViewport: () => 'desktop' as const,
}))

/* `useAuth` throws outside an `AuthProvider`, and none of these assertions is
   about sign-in — stubbed at the boundary the other workspace suites stub. */
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'USR-REAL', name: 'Tester', role: 'Owner', isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

/**
 * Deliberately NOT the seed's booking. `data/booking`'s `BOOKING` is B-715,
 * `Booked`, Himalayan Films Pvt. Ltd., 16–19 Jul 2026 — every one of which
 * this screen used to print regardless of the route. This answer disagrees
 * with all four, so any surviving literal shows up as a failure.
 */
const PICKUP_ISO = '2026-08-03T00:15:00.000Z'
const RETURN_ISO = '2026-08-06T00:15:00.000Z'

const FLOOR: FloorBooking = {
  id: '22222222-2222-4222-8222-222222222222',
  bookingNo: 'B-812',
  stage: 'Packed',
  clientName: 'Sagarmatha Media',
  project: 'Everest Series',
  pickupAtAd: PICKUP_ISO,
  returnAtAd: RETURN_ISO,
  actualReturnAtAd: null,
  deliveryType: 'Delivery',
  isCancelled: false,
  isClosed: false,
  linesPresence: 'present',
  lines: [],
}

let answer: FloorBooking | null = FLOOR

vi.mock('../../../lib/queries/bookings', async (orig) => ({
  ...(await orig<typeof import('../../../lib/queries/bookings')>()),
  fetchFloorBooking: async () => answer,
}))

let evidenceAnswer: SavedEvidenceFile[] | Error = []

vi.mock('../../../lib/queries/evidence', async (orig) => {
  const actual = await orig<typeof import('../../../lib/queries/evidence')>()
  return {
    ...actual,
    fetchBookingEvidenceFiles: vi.fn(async () => {
      if (evidenceAnswer instanceof Error) throw evidenceAnswer
      return evidenceAnswer
    }),
  }
})

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

/* jsdom ships no `matchMedia`; `useCapability()` — which `Unavailable` calls to
   choose between hover and long-press — asks for four of them. */
window.matchMedia = ((query: string) =>
  ({
    matches: query.includes('hover: hover'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList) as typeof window.matchMedia

const { default: EvidenceWorkspace } = await import('../EvidenceWorkspace')

/*
 * The default 5s is not enough for the FIRST mount in this file on a cold
 * module graph — `lib/queries/bookings` pulls the supabase client, the
 * settings store and the operational-day engine behind it, and transforming
 * that tree took ~50s on the machine this was written on. The assertions
 * themselves are synchronous once the read has landed.
 */
vi.setConfig({ testTimeout: 120_000 })

let container: HTMLDivElement
let root: Root

async function mountAt(bookingNo: string) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/rentals/${bookingNo}/evidence`]}>
        <Routes>
          <Route path="/rentals/:bookingNo/evidence" element={<EvidenceWorkspace />} />
        </Routes>
      </MemoryRouter>,
    )
  })
  /*
   * The read resolves in an effect. Flush until `PageBody`'s loading state has
   * cleared rather than for a fixed number of microtasks: a fixed count let
   * the first test in the file assert against the skeleton while every later
   * one passed, which is a harness artefact reading as a screen defect — and
   * a green suite that only sometimes rendered the thing under test is worse
   * than a red one.
   */
  for (let i = 0; i < 200 && text().includes('Loading'); i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  }
  expect(text()).not.toContain('Loading')
}

const text = () => container.textContent ?? ''
const buttons = () => [...container.querySelectorAll('button')]
const byText = (label: string) => buttons().filter((b) => (b.textContent ?? '').trim() === label)
const click = async (el: HTMLElement) => {
  await act(async () => {
    el.click()
  })
}

const MOCK_SAVED_FILE: SavedEvidenceFile = {
  id: 'ev-test-1',
  referenceId: 'ref-test-1',
  storagePath: 'evidence/booking/real_photo.jpg',
  filename: 'real_photo.jpg',
  fileSizeBytes: 204800,
  category: 'Packing',
  operationStage: 'Packing',
  createdAt: '2026-11-06T10:00:00.000Z',
  itemId: 'item-uuid-1',
  matchState: 'Matched',
  matchedSerial: 'CAM-FX3-001',
}

beforeEach(() => {
  answer = FLOOR
  evidenceAnswer = []
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('HO-09 & UX-04 — the booking head is read, and real evidence is isolated from sample fixtures', () => {
  it('shows the query stage, not the literal "Booked"', async () => {
    await mountAt('B-812')
    expect(text()).toContain('Packed')
    // The literal this screen carried on every booking.
    expect(text()).not.toContain('Booked')
  })

  it('shows the query client and booking number, not data/booking seed', async () => {
    await mountAt('B-812')
    expect(text()).toContain('Sagarmatha Media')
    expect(text()).toContain('B-812')
    expect(text()).not.toContain('Himalayan Films')
    expect(text()).not.toContain('B-715')
  })

  it('shows the query dates, and the hardcoded 16 Jul / 19 Jul 2026 pair is gone', async () => {
    await mountAt('B-812')
    expect(text()).toContain(formatAd(new Date(PICKUP_ISO)))
    expect(text()).toContain(formatAd(new Date(RETURN_ISO)))
    expect(text()).not.toContain('16/7/2026')
    expect(text()).not.toContain('19/7/2026')
  })

  it('counts the rental days through lib/rentalDays, not a fourth copy of the rule', async () => {
    await mountAt('B-812')
    // 3 Aug 06:00 → 6 Aug 06:00 Kathmandu is exactly three elapsed days.
    expect(text()).toContain('3 Days')
  })

  it('renders an absence rather than a seed value when the read has none', async () => {
    answer = { ...FLOOR, clientName: null, pickupAtAd: null, returnAtAd: null, deliveryType: null }
    await mountAt('B-812')
    expect(text()).toContain('—')
    expect(text()).not.toContain('Himalayan Films')
    expect(text()).not.toContain('16/7/2026')
    // No day count can be derived from two missing instants, and none is shown.
    expect(text()).not.toContain('3 Days')
  })

  it('shows clean empty state when booking has 0 evidence files, without sample photos or fake pipeline', async () => {
    evidenceAnswer = []
    await mountAt('B-812')
    expect(text()).toContain('No evidence photos uploaded yet')
    expect(text()).toContain('No evidence photos have been uploaded for booking B-812 yet')
    // Sample fixtures and fake pipeline are NOT on the real booking page
    expect(text()).not.toContain('IMG_0001.JPG')
    expect(text()).not.toContain('The photographs below are not')
    expect(text()).not.toContain('A fixed illustration of the four steps')
  })

  it('renders real saved evidence files and updates counts', async () => {
    evidenceAnswer = [MOCK_SAVED_FILE]
    await mountAt('B-812')
    expect(text()).toContain('real_photo.jpg')
    expect(text()).toContain('Item CAM-FX3-001')
    expect(text()).toContain('Total Photos')
    expect(text()).toContain('1')
  })

  it('an unresolved booking reaches none of the sample gallery', async () => {
    answer = null
    await mountAt('B-9001')
    expect(text()).toContain('No booking matches B-9001')
    expect(text()).not.toContain('IMG_0001.JPG')
    expect(text()).not.toContain('Sony FX3')
  })

  it('allows viewing sample demo only when explicitly toggled', async () => {
    evidenceAnswer = []
    await mountAt('B-812')
    expect(text()).not.toContain('IMG_0001.JPG')
    const toggle = byText('View Sample Layout Demo')
    expect(toggle.length).toBe(1)
    await click(toggle[0] as HTMLButtonElement)
    expect(text()).toContain("The photographs below are not B-812's")
    expect(text()).toContain('IMG_0001.JPG')
  })
})

describe('UX-05 — Fail-closed error handling for evidence file queries', () => {
  it('displays error banner with retry option on query failure and recovers on retry', async () => {
    evidenceAnswer = new Error('Database connection failed')
    await mountAt('B-812')
    expect(text()).toContain('Failed to load evidence files')
    expect(text()).toContain('Database connection failed')
    const retryBtn = byText('Retry')
    expect(retryBtn.length).toBe(1)

    // Recovery
    evidenceAnswer = [MOCK_SAVED_FILE]
    await click(retryBtn[0] as HTMLButtonElement)
    for (let i = 0; i < 50 && !text().includes('real_photo.jpg'); i++) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })
    }
    expect(text()).toContain('real_photo.jpg')
    expect(text()).not.toContain('Failed to load evidence files')
  })
})

describe('HO-10 — the controls state what they do', () => {
  beforeEach(() => {
    evidenceAnswer = [MOCK_SAVED_FILE]
  })

  /** Tick the first gallery card so §9's bulk bar appears. */
  async function selectOnePhoto() {
    const box = container.querySelector('input[type="checkbox"]')
    expect(box).not.toBeNull()
    await click(box as HTMLInputElement)
  }

  it('every bulk action renders disabled and carries a reason', async () => {
    await mountAt('B-812')
    await selectOnePhoto()
    expect(text()).toContain('1 selected')

    for (const label of ['Assign Product', 'Assign Category', 'Download', 'Export ZIP', 'Generate PDF', 'Rotate', 'Remove']) {
      const found = byText(label)
      expect(found.length, `${label} should render`).toBeGreaterThan(0)
      for (const b of found) expect(b.disabled, `${label} must be disabled`).toBe(true)
    }

    const reasons = [...container.querySelectorAll('[aria-disabled]')].map((el) => el.getAttribute('aria-label') ?? '')
    expect(reasons.some((r) => r.includes('no zip library'))).toBe(true)
    expect(reasons.some((r) => r.includes('no PDF library'))).toBe(true)
  })

  it('the removal control is named for what it does, and nothing is labelled an enabled Remove', async () => {
    await mountAt('B-812')
    expect(byText('Hide on This Screen').length).toBe(1)
    expect(byText('Hide on This Screen')[0]?.disabled).toBe(false)
    expect(buttons().filter((b) => (b.textContent ?? '').trim() === 'Remove' && !b.disabled).length).toBe(0)
  })

  it('the retention promise survives, marked as not built', async () => {
    await mountAt('B-812')
    await click(byText('Hide on This Screen')[0] as HTMLButtonElement)
    expect(text()).toContain('This hides the card in your browser. Nothing is recorded.')
    expect(text()).toContain('Removing evidence is not available yet')

    await click(byText('Hide it')[0] as HTMLButtonElement)
    expect(text()).toContain('Hidden on this screen (1)')
    expect(text()).toContain('These changes are local to this session')
    expect(text()).not.toContain('Retained and audited.')
  })

  it('actually removes the card from the gallery — including when the note is left blank', async () => {
    await mountAt('B-812')
    const before = container.querySelectorAll('input[type="checkbox"]').length
    expect(before).toBeGreaterThan(0)

    await click(byText('Hide on This Screen')[0] as HTMLButtonElement)
    await click(byText('Hide it')[0] as HTMLButtonElement)

    expect(text()).toContain('Hidden on this screen (1)')
    const after = container.querySelectorAll('input[type="checkbox"]').length
    expect(after).toBe(before - 1)
  })

  it('the empty state clears the filter it names and says which one stays', async () => {
    await mountAt('B-812')
    // Damage holds no files for this mock, so the gallery empties.
    const damage = buttons().find((b) => (b.textContent ?? '').startsWith('Damage'))
    await click(damage as HTMLButtonElement)
    await click(byText('Unmatched')[0] as HTMLButtonElement)

    expect(text()).toContain('No Unmatched evidence files under Damage')
    expect(text()).toContain('stays on Damage')
    const action = byText('Show all match states')
    expect(action.length).toBe(1)

    await click(action[0] as HTMLButtonElement)
    expect(text()).toContain('No evidence files are filed under Damage')
    expect(byText('Show all match states').length).toBe(0)
  })
})
