// @vitest-environment jsdom
/**
 * # Who is offered "Approve closing"
 *
 * The control is absent — not disabled — for a role the database refuses
 * (`DailyClosing.tsx`). `daily_closings_finance_insert` is
 * `auth_is_finance_or_admin()`, which 0117 narrowed to Owner, Admin, Manager,
 * Accounts; until 18 Oct the screen still offered the button to Coordinator,
 * and Postgres refused the INSERT at the last step (§15.2 N-3).
 *
 * RULING 2026-10-18: Coordinator reads the closing and is not offered the sign-off.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { Paisa } from '../../../lib/money'
import type { DailyClosing as ClosingFigures } from '../../../lib/queries/closing'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const auth = vi.hoisted(() => ({ role: 'Owner' as string }))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'USR-REAL', name: 'Tester', role: auth.role, isSharedDevice: false } }),
}))

const rs = (n: number) => (n * 100) as Paisa

const FIGURES: ClosingFigures = {
  dayAd: '2026-10-18',
  pickupsCount: 3,
  returnsCount: 2,
  newCount: 1,
  collected: {
    cash: rs(2000),
    bank: rs(0),
    card: rs(0),
    other: rs(0),
    digitalWallets: rs(0),
    unclassified: rs(0),
    total: rs(2000),
  },
  receivablesTotal: rs(0),
  depositsHeld: rs(0),
  dayBoundaryNote: 'Movement counts use the operational day.',
}

vi.mock('../../../lib/queries/closing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/queries/closing')>()),
  fetchDailyClosing: vi.fn(async () => FIGURES),
}))

/* The write is not under test here; it must never be reached by mounting. */
vi.mock('../../../actions/finance/approveDailyClosing', () => ({ approveDailyClosing: vi.fn() }))

const { default: DailyClosing } = await import('../DailyClosing')

const roots: Array<{ root: Root; container: HTMLElement }> = []

async function mount(): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push({ root, container })
  await act(async () => {
    root.render(
      <StrictMode>
        <MemoryRouter>
          <DailyClosing embedded />
        </MemoryRouter>
      </StrictMode>,
    )
  })
  return container
}

const approveButton = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('button')).find((b) => /Approve closing/.test(b.textContent ?? ''))

beforeEach(() => {
  auth.role = 'Owner'
})

afterEach(async () => {
  for (const { root, container } of roots.splice(0)) {
    await act(async () => root.unmount())
    container.remove()
  }
})

describe('Daily Closing — the approve control follows closing.approve', () => {
  it('shows a Coordinator the figures and no approve control', async () => {
    auth.role = 'Coordinator'
    const c = await mount()

    // Loaded, not restricted: the Coordinator still reads the closing.
    expect(c.textContent).toContain('Counted cash')
    expect(c.textContent).not.toContain('Your role cannot view daily closings')

    // …and is offered nothing to sign, nor the hint that precedes signing.
    expect(approveButton(c)).toBeUndefined()
    expect(c.textContent).not.toContain('Count the drawer before signing')
  })

  it.each(['Owner', 'Admin', 'Manager', 'Accounts'])('offers %s the approve control', async (role) => {
    auth.role = role
    const c = await mount()
    expect(approveButton(c)).toBeDefined()
  })
})
