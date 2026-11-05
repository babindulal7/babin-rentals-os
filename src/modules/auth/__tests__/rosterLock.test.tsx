// @vitest-environment jsdom
/**
 * Roster Lock Screen tests for T1-15 "Switch user with name + PIN".
 * Tests the shared-device flow:
 * - Lists enrolled staff members on the lock screen (<= 15)
 * - Tap name -> 4-digit PIN pad
 * - Back button returns to roster
 * - Correct PIN switches user session and unlocks
 * - Locked account indicates lockout time and refuses switch
 * - Wrong PIN shows attempt count and fails closed
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import ScreenLock from '../ScreenLock'
import type { RosterEntry, SwitchOutcome } from '../../../lib/auth'

const mockSwitchUser = vi.fn(async (_userId: string, _pin: string): Promise<SwitchOutcome> => ({ success: true }))
const mockVerifyStaffPin = vi.fn(async (_pin: string) => ({ ok: true }))
const mockLogout = vi.fn()
const mockForgetThisDevice = vi.fn()
const onUnlock = vi.fn()

const sampleRoster: RosterEntry[] = [
  {
    userId: 'u-babin',
    name: 'Babin Dulal',
    initials: 'BD',
    avatarTone: 'var(--accent-blue)',
    hasPin: true,
    lastSeen: 3000,
  },
  {
    userId: 'u-sita',
    name: 'Sita Sharma',
    initials: 'SS',
    avatarTone: 'var(--accent-green)',
    hasPin: true,
    lastSeen: 2000,
  },
  {
    userId: 'u-ramesh',
    name: 'Ramesh Adhikari',
    initials: 'RA',
    avatarTone: 'var(--accent-amber)',
    hasPin: true,
    lastSeen: 1000,
    lockedUntil: new Date(Date.now() + 15 * 60_000).toISOString(),
  },
]

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-babin', name: 'Babin Dulal', role: 'Owner', isSharedDevice: true },
    roster: sampleRoster,
    verifyStaffPin: mockVerifyStaffPin,
    switchUser: mockSwitchUser,
    logout: mockLogout,
    forgetThisDevice: mockForgetThisDevice,
    isLocked: true,
    setLocked: vi.fn(),
  }),
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

let container: HTMLDivElement
let root: Root | null = null

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(<ScreenLock onUnlock={onUnlock} />)
  })
}

function digit(n: string): HTMLButtonElement {
  const el = container.querySelector<HTMLButtonElement>(`button[aria-label="Digit ${n}"]`)
  if (!el) throw new Error(`no key for digit ${n}`)
  return el
}

async function enter(pin: string) {
  for (const ch of pin) {
    await act(async () => {
      digit(ch).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
  }
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20))
  })
}

const text = () => container.textContent ?? ''

beforeEach(() => {
  mockSwitchUser.mockClear().mockResolvedValue({ success: true, userId: 'u-sita' })
  mockVerifyStaffPin.mockClear().mockResolvedValue({ ok: true })
  mockLogout.mockClear()
  mockForgetThisDevice.mockClear()
  onUnlock.mockClear()
})

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount()
    })
    root = null
  }
  container?.remove()
})

describe('RosterLock — shared device lock and user switching', () => {
  it('renders the roster list of enrolled staff members', async () => {
    await mount()

    expect(text()).toContain('Who is working?')
    expect(text()).toContain('Babin Dulal')
    expect(text()).toContain('Sita Sharma')
    expect(text()).toContain('Ramesh Adhikari')
    expect(text()).toContain('Active session')
    expect(text()).toContain('Locked until')
  })

  it('tapping an unlocked staff member opens their 4-digit PIN pad', async () => {
    await mount()

    const sitaBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Unlock as Sita Sharma"]')
    expect(sitaBtn).toBeTruthy()

    await act(async () => {
      sitaBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(text()).toContain('Signed in as Sita Sharma')
    expect(text()).toContain('Enter your PIN to resume this session')
    expect(Array.from(container.querySelectorAll('button')).some(button => button.textContent?.trim() === 'Back')).toBe(true)
    // 4 dots for 4-digit PIN pad
    const digit1 = container.querySelector('button[aria-label="Digit 1"]')
    expect(digit1).toBeTruthy()
  })

  it('clicking "Back" returns from PIN pad to the roster', async () => {
    await mount()

    const sitaBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Unlock as Sita Sharma"]')
    await act(async () => {
      sitaBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(text()).toContain('Signed in as Sita Sharma')

    const backBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'Back',
    )
    expect(backBtn).toBeTruthy()

    await act(async () => {
      backBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(text()).toContain('Who is working?')
    expect(text()).toContain('Babin Dulal')
    expect(text()).toContain('Sita Sharma')
  })

  it('tapping a locked-out staff member displays an inline warning and does not open PIN pad', async () => {
    await mount()

    const rameshBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Unlock as Ramesh Adhikari"]')
    expect(rameshBtn).toBeTruthy()

    await act(async () => {
      rameshBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Stays on roster and shows warning
    expect(text()).toContain('Who is working?')
    expect(text()).toContain('This account is locked until')
  })

  it('entering 4-digit PIN calls switchUser and onUnlock on success', async () => {
    await mount()

    const sitaBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Unlock as Sita Sharma"]')
    await act(async () => {
      sitaBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await enter('1234')

    expect(mockSwitchUser).toHaveBeenCalledWith('u-sita', '1234')
    expect(onUnlock).toHaveBeenCalledTimes(1)
  })

  it('fails closed on incorrect PIN during switch', async () => {
    mockSwitchUser.mockResolvedValue({ success: false, error: 'Incorrect PIN' })
    await mount()

    const sitaBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Unlock as Sita Sharma"]')
    await act(async () => {
      sitaBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await enter('9999')

    expect(mockSwitchUser).toHaveBeenCalledWith('u-sita', '9999')
    expect(onUnlock).not.toHaveBeenCalled()
    expect(text()).toContain('Incorrect PIN')
  })

  it('offers "Sign in with another account" to sign out', async () => {
    await mount()

    const otherBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Sign in with another account'),
    )
    expect(otherBtn).toBeTruthy()

    await act(async () => {
      otherBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(mockLogout).toHaveBeenCalledTimes(1)
  })

  it('offers "Forget this device" for Owner/Admin and only forgets after an explicit confirm', async () => {
    // The lock screen sits above the modal layer, so the confirmation is inline — never a
    // browser-native window.confirm (the shell lint forbids it).
    const nativeConfirm = vi.spyOn(window, 'confirm')

    await mount()

    const findButton = (label: string, root: ParentNode = container) =>
      Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim() === label)
    const click = async (el: Element | undefined) => {
      expect(el).toBeTruthy()
      await act(async () => {
        el!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
    }

    // 1st tap asks; it must not forget anything yet.
    await click(findButton('Forget this device'))
    const confirmation = container.querySelector('[role="alertdialog"]')
    expect(confirmation).not.toBeNull()
    expect(mockForgetThisDevice).not.toHaveBeenCalled()

    // Cancel backs out and restores the original button.
    await click(findButton('Cancel', confirmation!))
    expect(container.querySelector('[role="alertdialog"]')).toBeNull()
    expect(mockForgetThisDevice).not.toHaveBeenCalled()

    // Ask again, then confirm: exactly one forget.
    await click(findButton('Forget this device'))
    await click(findButton('Forget device', container.querySelector('[role="alertdialog"]')!))
    expect(mockForgetThisDevice).toHaveBeenCalledTimes(1)
    expect(nativeConfirm).not.toHaveBeenCalled()
  })
})
