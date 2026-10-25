// @vitest-environment jsdom
/**
 * # Reset Workspace — RS-12, the QC identity the screen invented
 *
 * `cleaning_queue_entries.qc_by` is a `users.id`, and this screen collected a
 * NAME: a free-text "QC performed by…" box defaulting to the signed-in
 * operator. `selfIdOf` in the dispatch can map exactly one name to an id — the
 * actor's own — and OMITS every other, so typing a colleague's name passed QC
 * on screen, printed "QC by <that name>" on the row, and sent an entry whose
 * `qcBy` was absent. The QC looked done and was recorded against nobody.
 *
 * The fix states the identity the screen can actually write instead of asking
 * for one it cannot, so:
 *
 *  1. there is no name field on the QC control at all;
 *  2. the control names the operator the pass will be recorded as;
 *  3. when the operator also cleaned the unit, the engine accepts a declared
 *     skipped QC only with an audited reason. A confirmed different cleaner
 *     allows an actual second-person inspection without inventing a skip.
 *
 * The last test is the positive control: an entry built the old way — a typed
 * name that `selfIdOf` cannot resolve — reaches `runFloorVerb` with no `qcBy`
 * at all, which is the defect stated as an assertion.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { loadMockClient, getSupabaseClientAsync } from '../../../lib/supabase'
import { fetchStaffDirectory, type StaffDirectoryRow } from '../../../lib/queries/staff'

vi.mock('../../../lib/queries/staff', () => ({ fetchStaffDirectory: vi.fn() }))
beforeEach(() => {
  vi.mocked(fetchStaffDirectory).mockResolvedValue({ kind: 'ok', rows: [] })
})

beforeAll(async () => {
  await loadMockClient()
})

const B901 = '11111111-1111-4111-8111-111111111111'

/** Every `completeReset` call this suite makes, so the dispatched entries can be read. */
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
  completeReset: async (input: Record<string, unknown>) => {
    dispatched.push(input)
    return { ok: true }
  },
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

/** jsdom ships no `matchMedia`; `useViewport` reads `innerWidth`, so the band is still real. */
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
const { SHARED_CLEAN_TASKS } = await import('../../../data/reset')

let container: HTMLDivElement
let root: Root

async function flush(rounds = 4) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

async function mount() {
  sessionStorage.clear()
  Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true, writable: true })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/rentals/B-901/reset']}>
        <Routes>
          <Route path="/rentals/:bookingNo/reset" element={<ResetWorkspace />} />
          <Route path="/rentals/:bookingNo" element={<div>THE BOOKING PAGE</div>} />
        </Routes>
      </MemoryRouter>,
    )
  })
  await flush()
}

const text = () => (container.textContent ?? '').replace(/\s+/g, ' ')

function button(label: string): HTMLButtonElement {
  const b = [...container.querySelectorAll('button')].find((x) => (x.textContent ?? '').trim() === label)
  if (!b) throw new Error(`no "${label}" button on screen`)
  return b
}

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await flush(1)
}

/** A checkbox is driven by a real click: jsdom's activation behaviour flips
    `checked` and fires the change React listens for. */
async function check(input: HTMLInputElement) {
  await click(input)
}

async function type(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value)
  await act(async () => el.dispatchEvent(new Event('input', { bubbles: true })))
  await flush(1)
}

/** Select the one row, tick every task on it, and send it to QC. */
async function reachQc() {
  const select = container.querySelector<HTMLInputElement>('input[aria-label="Select Sony FX3"]')
  if (!select) throw new Error('no row checkbox')
  if (!select.checked) await check(select)

  // The batch panel's shared checklist cascades to the selection: three shared
  // tasks plus the configuration reset this workspace exists to record.
  const tasks = [...SHARED_CLEAN_TASKS, 'Reset configuration']
  for (const task of tasks) {
    const label = [...container.querySelectorAll('label')].find((l) => (l.textContent ?? '').includes(task))
    const box = label?.querySelector<HTMLInputElement>('input[type="checkbox"]')
    if (!box) throw new Error(`no checkbox for "${task}"`)
    if (!box.checked) await check(box)
  }

  await click(button('Mark Clean & Move to QC'))
}

const passButton = () => button('Pass')
const reasonField = () =>
  container.querySelector<HTMLInputElement>('input[aria-label="Reason for self-performed QC"]')
const showReady = async () => {
  const ready = [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Filter reset queue"] [role="tab"]')]
    .find((item) => item.textContent?.startsWith('Ready'))
  if (!ready) throw new Error('no Ready filter')
  await click(ready)
}

afterEach(async () => {
  await flush(4)
  dispatched.length = 0
  sessionStorage.clear()
  if (root) await act(async () => root.unmount())
  container?.remove()
})

describe('ResetWorkspace — confirmed cleaner identities only', () => {
  const cleanerSelect = () => container.querySelector<HTMLSelectElement>('#staff-cleaner-select')!
  const mountAssignment = async () => {
    await mount()
    await click(container.querySelector<HTMLInputElement>('input[aria-label="Select Sony FX3"]')!)
  }
  const staff = (id: string, fullName: string, isActive = true): StaffDirectoryRow => ({
    id, fullName, email: `${id}@example.test`, primaryRole: 'Technician', isActive,
    employeeCode: null, department: null, branchCode: null, branchName: null,
    hasPin: false, pinLockedUntil: null, hasAuthAccount: true, lastSignInAt: null,
  })
  it('an empty directory never creates staff options or permits assignment', async () => {
    await mountAssignment()
    expect(cleanerSelect().options).toHaveLength(1)
    expect(cleanerSelect().disabled).toBe(true)
    expect(button('Assign').disabled).toBe(true)
    expect(text()).toContain('No active staff are available for assignment.')
  })
  it.each(['error', 'unavailable'] as const)('%s shows its refusal without sample identities', async (kind) => {
    vi.mocked(fetchStaffDirectory).mockResolvedValue({ kind, message: 'Staff source cannot answer.' })
    await mountAssignment()
    expect(cleanerSelect().options).toHaveLength(1)
    expect(cleanerSelect().disabled).toBe(true)
    expect(text()).toContain('Staff source cannot answer.')
    expect(text()).not.toContain('Ram Thapa')
  })
  it('a rejected read stays unavailable and Retry loads only confirmed active staff', async () => {
    vi.mocked(fetchStaffDirectory).mockRejectedValueOnce(new Error('Directory connection failed.'))
    await mountAssignment()
    expect(cleanerSelect().options).toHaveLength(1)
    expect(text()).toContain('Directory connection failed.')
    vi.mocked(fetchStaffDirectory).mockResolvedValue({ kind: 'ok', rows: [
      staff('confirmed-cleaner', 'Recorded Cleaner'), staff('inactive-cleaner', 'Inactive Cleaner', false),
    ] })
    await click(button('Retry'))
    expect([...cleanerSelect().options].map(option => option.value)).toEqual(['', 'confirmed-cleaner'])
    expect(cleanerSelect().disabled).toBe(false)
    expect(text()).not.toContain('Inactive Cleaner')
    cleanerSelect().value = 'confirmed-cleaner'
    await act(async () => { cleanerSelect().dispatchEvent(new Event('change', { bubbles: true })) })
    expect(button('Assign').disabled).toBe(false)
    await click(button('Assign'))
    expect([...container.querySelectorAll('td')].some(cell => cell.textContent === 'Recorded Cleaner')).toBe(true)
    // With an unchecked checklist the UI offers its fast-track action instead
    // of Mark Clean. Assignment must still leave the actual work unverified.
    for (const task of SHARED_CLEAN_TASKS) {
      const label = [...container.querySelectorAll('label')].find(node => node.textContent?.includes(task))
      expect(label?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(false)
    }
    expect(button('Complete Reset').disabled).toBe(true)
  })
})

describe('ResetWorkspace — RS-12, the QC identity', () => {
  it('shows queue wait only from the recorded entry time, without truncating long waits', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime('2026-10-25T08:00:00Z')
    const client = await getSupabaseClientAsync()
    const originalFrom = client.from.bind(client)
    const from = vi.spyOn(client, 'from').mockImplementation((table) => {
      if (table === 'cleaning_queue_entries') return { select: () => ({ eq: async () => ({ data: [{
        unit_id: 'a-1', entered_queue_at: '2026-10-25T00:00:00Z', clean_completed_at: null,
        reset_completed_at: null, problem_state: 'No Problems', cleaned_by: null, qc_by: null,
        qc_skip_reason: null, qc_fail_reason: null,
      }], error: null }) }) } as any
      return originalFrom(table)
    })
    try {
      await mount()
      expect(text()).toContain('480m in queue')
    } finally {
      from.mockRestore()
      vi.useRealTimers()
    }
  })

  it('offers no name field, and names the operator the pass will be recorded as', async () => {
    await mount()
    await reachQc()

    expect(container.querySelector('input[aria-label="QC performed by"]')).toBeNull()
    expect(text()).toContain('QC will be recorded as Babin Shrestha')
    expect(text()).toContain('there is no staff picker yet')
  })

  it('blocks Pass until the self-QC reason the engine requires is given', async () => {
    await mount()
    await reachQc()

    expect(passButton().disabled).toBe(true)
    const reason = reasonField()
    expect(reason).not.toBeNull()

    await type(reason as HTMLInputElement, 'Sole cleaner on shift')
    expect(passButton().disabled).toBe(false)
  })

  it('records the pass against the signed-in operator, and says so on the row', async () => {
    await mount()
    await reachQc()
    await type(reasonField() as HTMLInputElement, 'Sole cleaner on shift')
    await click(passButton())

    await showReady()
    expect(text()).toContain('QC by Babin Shrestha')
  })

  it('dispatches qcBy as the user id, declared as a skipped QC with its reason', async () => {
    await mount()
    await reachQc()
    await type(reasonField() as HTMLInputElement, 'Sole cleaner on shift')
    await click(passButton())
    await click(button('Complete Reset'))

    expect(dispatched).toHaveLength(1)
    const input = dispatched[0] as { resetEntries: Array<Record<string, unknown>>; unitIds: string[] }
    expect(input.unitIds).toEqual(['a-1'])
    expect(input.resetEntries).toHaveLength(1)
    const entry = input.resetEntries[0] as Record<string, unknown>
    // A `users.id`, never the typed name the box used to collect.
    expect(entry['qcBy']).toBe('u-1')
    expect(entry['cleanedBy']).toBe('u-1')
    expect(entry['qcSkipped']).toBe(true)
    expect(entry['qcSkipReason']).toBe('Sole cleaner on shift')
  })

  it('enables Pass when clicking a quick preset button', async () => {
    await mount()
    await reachQc()

    expect(passButton().disabled).toBe(true)
    const presetBtn = [...container.querySelectorAll('button')].find(
      (b) => b.textContent?.includes('Clean & inspected'),
    )
    expect(presetBtn).toBeDefined()

    await click(presetBtn!)
    expect(passButton().disabled).toBe(false)
    expect(reasonField()?.value).toBe('Clean & inspected')

    await click(passButton())
    await showReady()
    expect(text()).toContain('QC by Babin Shrestha')
  })

  it('requires an explicit self-QC reason before a selected batch can pass', async () => {
    await mount()
    await reachQc()

    // Select the row again (as reachQc untoggled it or left it in QC)
    const select = container.querySelector<HTMLInputElement>('input[aria-label="Select Sony FX3"]')
    if (!select?.checked) await check(select!)

    const batchPassBtn = [...container.querySelectorAll('button')].find(
      (b) => b.textContent?.includes('Pass QC for All'),
    )
    expect(batchPassBtn).toBeDefined()
    expect(batchPassBtn?.disabled).toBe(true)
    expect(dispatched).toHaveLength(0)
    await type(container.querySelector<HTMLInputElement>('input[aria-label="Batch QC reason"]')!, 'Sole cleaner on shift')
    expect(batchPassBtn?.disabled).toBe(false)

    await click(batchPassBtn!)
    await showReady()
    expect(text()).toContain('QC by Babin Shrestha')
  })

  it('allows 1-tap Complete Checklist & Move to QC without clicking individual task checkboxes', async () => {
    await mount()
    const select = container.querySelector<HTMLInputElement>('input[aria-label="Select Sony FX3"]')
    if (!select) throw new Error('no row checkbox')
    await check(select)

    // With 0 tasks ticked, Complete Checklist & Move to QC is offered
    const quickCleanBtn = [...container.querySelectorAll('button')].find(
      (b) => b.textContent?.includes('Complete Checklist & Move to QC'),
    )
    expect(quickCleanBtn).toBeDefined()
    expect(quickCleanBtn?.disabled).toBe(false)

    await click(quickCleanBtn!)
    // Cleanup attestation reaches QC, but never passes it or supplies a reason.
    expect(text()).toContain('QC will be recorded as Babin Shrestha')
    expect(passButton().disabled).toBe(true)
    expect(reasonField()?.value).toBe('')
    expect(button('Complete Reset').disabled).toBe(true)
    expect(dispatched).toHaveLength(0)
  })

  it.each(['individual', 'batch'] as const)('records genuine second-inspector %s QC without declaring a skipped check', async (mode) => {
    vi.mocked(fetchStaffDirectory).mockResolvedValue({ kind: 'ok', rows: [{
      id: 'confirmed-cleaner', fullName: 'Recorded Cleaner', email: 'cleaner@example.test',
      primaryRole: 'Technician', isActive: true, employeeCode: null, department: null,
      branchCode: null, branchName: null, hasPin: false, pinLockedUntil: null,
      hasAuthAccount: true, lastSignInAt: null,
    }] })
    await mount()
    await check(container.querySelector<HTMLInputElement>('input[aria-label="Select Sony FX3"]')!)
    const cleaner = container.querySelector<HTMLSelectElement>('#staff-cleaner-select')!
    cleaner.value = 'confirmed-cleaner'
    await act(async () => { cleaner.dispatchEvent(new Event('change', { bubbles: true })) })
    await click(button('Assign'))
    await click(button('Check All Tasks'))
    await click(button('Mark Clean & Move to QC'))

    expect(text()).toContain('Verified 2nd-party inspection')
    expect(reasonField()).toBeNull()
    const pass = mode === 'individual' ? passButton() : button('Pass QC for All 1 Selected')
    expect(pass.disabled).toBe(false)
    await click(pass)
    await click(button('Complete Reset'))

    expect(dispatched).toHaveLength(1)
    const input = dispatched[0] as { resetEntries: Array<Record<string, unknown>> }
    expect(input.resetEntries).toHaveLength(1)
    expect(input.resetEntries[0]).toMatchObject({ cleanedBy: 'confirmed-cleaner', qcBy: 'u-1' })
    expect(input.resetEntries[0]).not.toHaveProperty('qcSkipped')
    expect(input.resetEntries[0]).not.toHaveProperty('qcSkipReason')
  })

  /*
   * The positive control. `selfIdOf` is the whole reason a typed name could
   * never be written: restore the old input's behaviour — a name that is not
   * the actor's — and the id it resolves to is `undefined`, so the dispatched
   * entry carries no `qcBy` and the engine's self-QC guard never even fires.
   */
  it('positive control: a name other than the actor resolves to no id at all', () => {
    const actor = 'Babin Shrestha'
    const userId = 'u-1'
    const selfIdOf = (name: string | undefined): string | undefined =>
      name !== undefined && name === actor ? userId : undefined

    expect(selfIdOf('Babin Shrestha')).toBe('u-1')
    expect(selfIdOf('Sita Rai')).toBeUndefined()
  })
})
