// @vitest-environment jsdom
/**
 * Payment Reminders on Client Detail — T5-08, W18b.
 *
 * Staff can pause payment reminders for a client with a required reason.
 * Paused clients get nothing; pending reminders are cancelled.
 * Resuming re-schedules reminders.
 * Client/anonymous roles cannot pause reminders.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../../../components/ui/Toast'
import { CLIENTS_DATA } from '../../../data/clients'

const session = vi.hoisted(() => ({
  role: 'Coordinator' as string,
  paused: false,
  pauseReason: null as string | null,
}))

const pauseSpy = vi.hoisted(() => ({
  pauseFn: vi.fn(async (_clientId: string, _reason: string): Promise<boolean> => true),
  resumeFn: vi.fn(async (_clientId: string): Promise<boolean> => true),
}))

const EMPTY_LIST = {
  rows: [] as never[],
  loading: false,
  error: null,
  isEmpty: true,
  isFiltered: false,
  total: 0,
  refetch: () => {},
}

vi.mock('../../../lib/moneyVisibility', () => ({ useCanViewMoney: () => true }))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-coord', name: 'Ram Coordinator', role: session.role, isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))
vi.mock('../../../lib/queries/useClients', async () => {
  const { CLIENTS_DATA: DATA } = await import('../../../data/clients')
  return {
    useClientProfile: () => ({
      ...EMPTY_LIST,
      rows: [
        {
          id: 'uuid-client-1',
          record: {
            ...DATA[0]!,
            remindersPaused: session.paused,
            remindersPausedReason: session.pauseReason,
          },
          deactivatedAtAd: null,
        },
      ],
      isEmpty: false,
      total: 1,
    }),
  }
})
vi.mock('../../../lib/queries/useList', () => ({ useList: () => EMPTY_LIST }))
vi.mock('../../../lib/supabase', () => ({ supabase: {}, newClientUuid: () => 'key-reminders' }))
vi.mock('../../../lib/queries/finance', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../../lib/queries/finance')
  return {
    ...actual,
    pauseClientReminders: (id: string, reason: string) => pauseSpy.pauseFn(id, reason),
    resumeClientReminders: (id: string) => pauseSpy.resumeFn(id),
  }
})

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

const { default: ClientDetail } = await import('../ClientDetail')

const CODE = CLIENTS_DATA[0]!.id

let container: HTMLDivElement
let root: Root

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/clients/${CODE}`]}>
        <ToastProvider>
          <Routes>
            <Route path="/clients/:id" element={<ClientDetail />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    )
  })
}

const dialog = () => document.body.querySelector('[role="dialog"]')

async function openOverflowMenu() {
  const btn = container.querySelector('button[aria-label="More actions"]') as HTMLButtonElement | null
  if (btn) {
    await act(async () => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
  }
}

function findButton(label: string, scope: ParentNode = document.body): HTMLButtonElement | null {
  const btns = [...scope.querySelectorAll('button')].filter((b) => b.textContent?.trim().includes(label))
  return (btns[0] as HTMLButtonElement) ?? null
}

async function typeReason(value: string) {
  const el = dialog()?.querySelector('textarea')
  if (!el) throw new Error('no reason textarea in the dialog')
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(el, value)
  await act(async () => {
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

describe('ClientDetail — payment reminders pause / resume (T5-08, W18b)', () => {
  beforeEach(() => {
    session.role = 'Coordinator'
    session.paused = false
    session.pauseReason = null
    pauseSpy.pauseFn.mockClear()
    pauseSpy.resumeFn.mockClear()
  })

  afterEach(async () => {
    if (root) {
      await act(async () => root.unmount())
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container)
    }
    document.body.innerHTML = ''
  })

  it('renders "Pause Payment Reminders" in overflow menu for staff roles', async () => {
    await mount()
    await openOverflowMenu()
    const pauseItem = findButton('Pause Payment Reminders')
    expect(pauseItem).not.toBeNull()
  })

  it('denies "Pause Payment Reminders" in overflow menu for Client role', async () => {
    session.role = 'Client'
    await mount()
    await openOverflowMenu()
    const pauseItem = findButton('Pause Payment Reminders')
    expect(pauseItem).toBeNull()
  })

  it('opening pause dialog requires a non-empty reason to submit', async () => {
    await mount()
    await openOverflowMenu()
    const pauseItem = findButton('Pause Payment Reminders')
    await act(async () => {
      pauseItem?.click()
    })

    const d = dialog()
    expect(d).not.toBeNull()

    const submitBtn = findButton('Pause Reminders', d!)
    expect(submitBtn).not.toBeNull()
    expect(submitBtn?.disabled).toBe(true)

    // Type a reason
    await typeReason('Client requested grace period')

    expect(submitBtn?.disabled).toBe(false)

    // Click submit
    await act(async () => {
      submitBtn!.click()
    })

    expect(pauseSpy.pauseFn).toHaveBeenCalledTimes(1)
    expect(pauseSpy.pauseFn).toHaveBeenCalledWith(
      expect.any(String),
      'Client requested grace period',
    )
  })

  it('renders "Reminders Paused" badge and warning banner when paused', async () => {
    session.paused = true
    session.pauseReason = 'Staff paused: agreement with owner'
    await mount()

    const alerts = [...document.body.querySelectorAll('[role="alert"]')]
    const hasPauseBanner = alerts.some((a) =>
      a.textContent?.includes('Payment reminders paused') &&
      a.textContent?.includes('Staff paused: agreement with owner')
    )
    expect(hasPauseBanner).toBe(true)

    await openOverflowMenu()
    const resumeItem = findButton('Resume Payment Reminders')
    expect(resumeItem).not.toBeNull()

    await act(async () => {
      resumeItem?.click()
    })

    const d = dialog()
    expect(d).not.toBeNull()

    const resumeBtn = findButton('Resume Reminders', d!)
    expect(resumeBtn).not.toBeNull()
    expect(resumeBtn?.disabled).toBe(false)

    await act(async () => {
      resumeBtn!.click()
    })

    expect(pauseSpy.resumeFn).toHaveBeenCalledTimes(1)
  })
})
