// @vitest-environment jsdom
/**
 * Settings and its panes — the five states, driven from the reads the page
 * really makes:
 *
 *  - the page load (`readSettings` + `applyLanguage`, via `useSettingsLoad`);
 *  - Staff Directory's read (`fetchStaffDirectory`);
 *  - Device PIN's status check (`staffPinStatus`).
 *
 * Restricted is two different gates here and both are pinned: the money-only
 * Financial sections are absent for a money-blind role (Law 6), and the Staff
 * Directory is refused to a non-Owner without its read being sent.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../../../components/ui/Toast'
import { canViewMoney } from '../../../lib/rbac'
import type { SystemRole } from '../../../types/database'
import type { PinStatus } from '../../../lib/auth'
import type { StaffDirectoryResult, StaffDirectoryRow } from '../../../lib/queries/staff'
import { OFFLINE_REASON } from '../../../lib/queries/useLoad'

const state = vi.hoisted(() => ({
  role: 'Owner' as SystemRole,
  language: null as null | (() => Promise<void>),
  pin: (() => Promise.resolve({ hasPin: false })) as () => Promise<PinStatus>,
  staff: (() => Promise.resolve({ kind: 'ok', rows: [] })) as () => Promise<StaffDirectoryResult>,
}))

vi.mock('../../../lib/settingsSync', async () => {
  const store = await import('../../../lib/settingsStore')
  return {
    hydrateSharedSettings: () => Promise.resolve(),
    saveSettings: async (p: Parameters<typeof store.writeSettings>[0]) => store.writeSettings(p),
    resetSharedSettings: () => Promise.resolve(),
  }
})

vi.mock('../../../lib/settingsStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/settingsStore')>()
  return { ...actual, readSettings: vi.fn(actual.readSettings) }
})

vi.mock('../../../lib/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/i18n')>()
  return { ...actual, applyLanguage: (code: Parameters<typeof actual.applyLanguage>[0]) => (state.language ? state.language() : actual.applyLanguage(code)) }
})

vi.mock('../../../lib/moneyVisibility', async () => {
  const rbac = await import('../../../lib/rbac')
  return { useCanViewMoney: () => rbac.canViewMoney(state.role) }
})

const staffPinStatus = vi.fn(() => state.pin())
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Shrestha', role: state.role, isSharedDevice: false },
    loading: false,
    isLocked: false,
    staffPinStatus,
    setStaffPin: () => Promise.resolve({ error: null }),
    revokeOwnStaffPin: () => Promise.resolve({ error: null }),
    verifyStaffPin: () => Promise.resolve({ ok: false, reason: 'no_pin' }),
    requestPasswordReset: () => Promise.resolve({ error: null }),
  }),
}))

const fetchStaffDirectory = vi.fn(() => state.staff())
vi.mock('../../../lib/queries/staff', () => ({
  fetchStaffDirectory: () => fetchStaffDirectory(),
  revokeStaffPinFor: () => Promise.resolve({ error: null }),
  recordPasswordResetRequest: () => Promise.resolve({ error: null }),
  setStaffRole: () => Promise.resolve({ error: null }),
  setStaffActive: () => Promise.resolve({ error: null }),
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

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { default: Settings } = await import('../Settings')
const { readSettings } = await import('../../../lib/settingsStore')

let container: HTMLDivElement
let root: Root

async function mount(search = '') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/settings${search}`]}>
        <ToastProvider>
          <Settings />
        </ToastProvider>
      </MemoryRouter>,
    )
  })
}

const text = () => container.textContent ?? ''
/** The section chooser in whichever shape the width draws it: desktop nav, tablet tabs or the phone list. */
const sections = () =>
  container.querySelector('nav[aria-label="Settings sections"], [role="tablist"][aria-label="Settings sections"], .app-settings-mobile-list')
const button = (label: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)
async function click(el: Element | undefined) {
  if (!el) throw new Error('control not rendered')
  await act(async () => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}

const sampleRow: StaffDirectoryRow = {
  id: 'u-9',
  fullName: 'Ramesh Thapa',
  employeeCode: 'EMP-003',
  email: 'warehouse@babinrentals.com',
  primaryRole: 'Warehouse',
  department: 'Operations',
  branchCode: 'BR-KTM-01',
  branchName: 'Kathmandu',
  isActive: true,
  hasPin: false,
  pinLockedUntil: null,
  hasAuthAccount: true,
  lastSignInAt: '2026-08-23T16:45:24Z',
}

beforeEach(() => {
  window.localStorage.clear()
  state.role = 'Owner'
  state.language = null
  state.pin = () => Promise.resolve({ hasPin: false })
  state.staff = () => Promise.resolve({ kind: 'ok', rows: [] })
  staffPinStatus.mockClear()
  fetchStaffDirectory.mockClear()
  vi.mocked(readSettings).mockClear()
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true })
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('Settings page — load states', () => {
  it('Loading: shows the skeleton and no section until the stored values arrive', async () => {
    state.language = () => new Promise(() => {})
    await mount()
    expect(text()).toContain('Loading settings')
    expect(sections()).toBeNull()
  })

  it('Error: a failing read draws the inline banner, and Retry renders the page', async () => {
    vi.mocked(readSettings).mockImplementationOnce(() => {
      throw new Error('SecurityError: The operation is insecure.')
    })
    await mount()
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
    expect(text()).toContain('Settings could not be read.')
    expect(text()).toContain('The operation is insecure.')

    await click(button('Retry'))
    expect(text()).not.toContain('Settings could not be read.')
    expect(sections()).not.toBeNull()
  })

  it('Empty (no results): a search that matches no section says so and offers Clear search', async () => {
    await mount()
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Search settings"]')
    expect(input).not.toBeNull()
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'zzqx')
      input!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(text()).toContain('No settings match this search')
    expect(text()).toContain('“zzqx”')
    /* The default section's fields must not stand in for a match. */
    expect(text()).not.toContain('Tax & fiscal year')

    await click(button('Clear search'))
    expect(text()).not.toContain('No settings match this search')
  })

  it('Restricted (money): a money-blind role gets no Financial section at all', async () => {
    state.role = 'Warehouse'
    expect(canViewMoney('Warehouse')).toBe(false)
    await mount('?tab=business')
    expect(text()).not.toContain('Tax & fiscal year')
    expect(text()).not.toContain('Deposit rules')
  })

  it('…while a money role on the same tab does', async () => {
    await mount('?tab=business')
    expect(text()).toContain('Tax & fiscal year')
  })
})

describe('Settings ▸ People ▸ Staff Directory — read states', () => {
  it('Restricted: a non-Owner is refused and the read is never sent', async () => {
    state.role = 'Manager'
    await mount('?tab=people')
    expect(text()).toContain('Access restricted')
    expect(text()).toContain('Requires Owner')
    expect(fetchStaffDirectory).not.toHaveBeenCalled()
  })

  it('Empty (nothing yet): a directory with no staff is not a filtered empty', async () => {
    await mount('?tab=people')
    expect(text()).toContain('No staff accounts yet')
    expect(text()).not.toContain('No staff match this search')
    expect(button('Clear filters')).toBeUndefined()
  })

  it('Empty (no results): rows exist but the default filter hides them', async () => {
    state.staff = () => Promise.resolve({ kind: 'ok', rows: [{ ...sampleRow, isActive: false }] })
    await mount('?tab=people')
    expect(text()).toContain('No staff match this search')
    expect(button('Clear filters')).toBeDefined()
  })

  it('Error: a failing query draws the banner with Retry, and Retry re-reads', async () => {
    state.staff = () => Promise.resolve({ kind: 'error', message: 'staff_directory_v: 500' })
    await mount('?tab=people')
    expect(text()).toContain('Could not load the staff directory')
    expect(text()).toContain('staff_directory_v: 500')

    state.staff = () => Promise.resolve({ kind: 'ok', rows: [sampleRow] })
    await click(button('Retry'))
    expect(fetchStaffDirectory).toHaveBeenCalledTimes(2)
    expect(text()).toContain('Ramesh Thapa')
  })

  it('Offline: the same failure while offline is worded as offline', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false })
    state.staff = () => Promise.resolve({ kind: 'error', message: 'Failed to fetch' })
    await mount('?tab=people')
    expect(text()).toContain(OFFLINE_REASON)
    expect(text()).not.toContain('Failed to fetch')
  })
})

describe('Settings ▸ System ▸ Device PIN — status check', () => {
  it('a failed check says it could not check, with Retry — not a bare "Not set"', async () => {
    state.pin = () => Promise.resolve({ hasPin: false, unavailable: 'function staff_pin_status() does not exist' })
    await mount('?tab=system')
    expect(text()).toContain('Could not check the PIN.')
    expect(text()).toContain('staff_pin_status() does not exist')
    expect(text()).not.toContain('Not set')
    expect(button('Set a PIN')).toBeDefined()

    state.pin = () => Promise.resolve({ hasPin: true })
    const calls = staffPinStatus.mock.calls.length
    await click(button('Retry'))
    expect(staffPinStatus.mock.calls.length).toBe(calls + 1)
    expect(text()).toContain('PIN active')
  })

  it('a successful "no PIN" still reads Not set', async () => {
    await mount('?tab=system')
    expect(text()).toContain('Not set')
    expect(text()).not.toContain('Could not check the PIN.')
  })
})
