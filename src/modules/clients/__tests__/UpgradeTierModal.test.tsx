// @vitest-environment jsdom
/**
 * RULING 2026-10-22 (Babin: "activate membership"). The dialog used to be a
 * blocked save over a hard-coded tier list. Pinned here: it offers only the LIVE
 * plans, says honestly whether the client has a membership, never shows a
 * withheld figure as zero, calls the action with a stable request key, and claims
 * success only after the action does.
 *
 * The plans hook, session and action are stubbed — the action is covered by
 * `actions/clients/__tests__/changeMembership.test.ts`, the SQL by L32.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClientRecord } from '../../../lib/queries/clients'

const state = vi.hoisted(() => ({
  plans: {
    rows: [] as unknown[],
    loading: false,
    error: null as string | null,
    isEmpty: false,
    refetch: vi.fn(),
  },
  calls: [] as Array<{ input: Record<string, unknown>; ctx: Record<string, unknown> }>,
  outcome: { fail: null as string | null },
  toasts: [] as string[],
  online: true,
}))

vi.mock('../../../lib/queries/useClients', () => ({ useMembershipPlans: () => state.plans }))
vi.mock('../../../lib/auth', () => ({ useAuth: () => ({ user: { id: 'u-1', role: 'Coordinator', name: 'Test' } }) }))
vi.mock('../../../lib/network', () => ({ useNetwork: () => state.online }))
vi.mock('../../../components/ui/Toast', () => ({ useToast: () => ({ showSuccessToast: (m: string) => state.toasts.push(m) }) }))
vi.mock('../../../actions/clients/changeMembership', () => ({
  NOTE_MAX: 500,
  changeMembership: vi.fn(async (input: Record<string, unknown>, ctx: Record<string, unknown>) => {
    state.calls.push({ input, ctx })
    if (state.outcome.fail) throw new Error(state.outcome.fail)
    return { client_id: input['clientDbId'], plan_level: input['planLevel'] }
  }),
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { UpgradeTierModal } = await import('../modals/UpgradeTierModal')

const plan = (level: string, label: string, credit: number | null, pct: number | null, order: number) => ({
  level, label, defaultCreditLimit: credit, individualDiscountPct: pct, displayOrder: order,
})
const PLANS = [
  plan('Academy', 'Access Member', 5_000_000, 5, 1),
  plan('Creator', 'Partner', 25_000_000, 10, 2),
  plan('Elite', 'Elite Member', null, null, 3),
]

const client = { id: 'C-0042', dbId: '11111111-1111-4111-8111-111111111111', name: 'Asha Rai', membership: 'Creator' } as unknown as ClientRecord

let root: Root | undefined
let host: HTMLDivElement | undefined
let onClose = vi.fn()
let onSuccess = vi.fn()

async function mount(over: { hasMembership?: boolean; client?: ClientRecord } = {}) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(
      <UpgradeTierModal
        isOpen
        onClose={onClose}
        onSuccess={onSuccess}
        client={over.client ?? client}
        hasMembership={over.hasMembership ?? true}
      />,
    )
  })
}

const text = () => document.body.textContent ?? ''
const select = () => document.body.querySelector<HTMLSelectElement>('select')
const note = () => document.body.querySelector<HTMLTextAreaElement>('textarea')
const button = (label: string) => [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes(label))

async function choose(level: string) {
  await act(async () => {
    const el = select()!
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
    setter.call(el, level)
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
async function type(value: string) {
  await act(async () => {
    const el = note()!
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function click(label: string) {
  await act(async () => {
    button(label)!.click()
  })
}

beforeEach(() => {
  state.plans = { rows: PLANS, loading: false, error: null, isEmpty: false, refetch: vi.fn() }
  state.calls = []
  state.outcome.fail = null
  state.toasts = []
  state.online = true
  onClose = vi.fn()
  onSuccess = vi.fn()
})

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  host?.remove()
  document.body.innerHTML = ''
  root = undefined
  host = undefined
})

describe('what it offers', () => {
  it('says "Activate Membership" for a client with none, and offers the first plan so it is one tap', async () => {
    await mount({ hasMembership: false })
    expect(text()).toContain('Activate Membership')
    expect(text()).toContain('Asha Rai has no membership yet.')
    expect(select()!.value).toBe('Academy')
    expect(button('Activate Membership')!.hasAttribute('disabled')).toBe(false)
  })

  it('says "Change Membership Plan" for a client who has one, and starts on a plan they are NOT on', async () => {
    await mount()
    expect(text()).toContain('Change Membership Plan')
    expect(text()).toContain('Asha Rai is on the Creator plan.')
    expect(select()!.value).toBe('Academy')
    const creator = [...select()!.options].find((o) => o.value === 'Creator')!
    expect(creator.textContent).toContain('(current)')
  })

  it('offers only the plans on file — never a tier the database does not have', async () => {
    state.plans.rows = [PLANS[0], PLANS[1]]
    await mount({ hasMembership: false })
    expect([...select()!.options].map((o) => o.value)).toEqual(['Academy', 'Creator'])
  })

  it('shows the selected plan\'s credit and discount from the plan, and never a withheld figure as zero', async () => {
    await mount({ hasMembership: false })
    expect(text()).toContain('Credit limit')
    expect(text()).toContain('50,000')
    expect(text()).toContain('5%')
    await choose('Elite')
    expect(text()).toContain('Negotiated')
    expect(text()).not.toMatch(/Rs\s?0\b/)
    expect(text()).toContain('Credit limit —')
  })

  it('states that no fee is recorded', async () => {
    await mount({ hasMembership: false })
    expect(text()).toContain('No fee is recorded by this change.')
  })
})

describe('states with nothing to apply', () => {
  it('will not apply the plan they are already on, and says why', async () => {
    await mount()
    await choose('Creator')
    expect(text()).toContain('already on the Creator plan')
    expect(button('Apply Tier Change')!.hasAttribute('disabled')).toBe(true)
  })

  it('says there is nothing to assign when no plan is on file', async () => {
    state.plans = { rows: [], loading: false, error: null, isEmpty: true, refetch: vi.fn() }
    await mount({ hasMembership: false })
    expect(text()).toContain('No membership plan is on file')
    expect(select()).toBeNull()
    expect(button('Activate Membership')!.hasAttribute('disabled')).toBe(true)
  })

  it('shows the database reason with a retry when the plans cannot be read', async () => {
    state.plans = { rows: [], loading: false, error: 'permission denied', isEmpty: false, refetch: vi.fn() }
    await mount({ hasMembership: false })
    expect(text()).toContain('Could not load the membership plans.')
    expect(text()).toContain('permission denied')
    await click('Retry')
    expect(state.plans.refetch).toHaveBeenCalled()
  })

  it('disables Apply while the plans load', async () => {
    state.plans = { rows: [], loading: true, error: null, isEmpty: false, refetch: vi.fn() }
    await mount({ hasMembership: false })
    expect(text()).toContain('Loading membership plans')
    expect(button('Activate Membership')!.hasAttribute('disabled')).toBe(true)
  })

  it('refuses a note over 500 characters inline and disables Apply', async () => {
    await mount({ hasMembership: false })
    await type('x'.repeat(501))
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('at most 500 characters')
    expect(button('Activate Membership')!.hasAttribute('disabled')).toBe(true)
  })
})

describe('applying', () => {
  it('calls the action with the client, plan, note and a request key, as the signed-in user', async () => {
    await mount({ hasMembership: false })
    await type('  Joined at the counter ')
    await click('Activate Membership')
    expect(state.calls).toHaveLength(1)
    const { input, ctx } = state.calls[0]!
    expect(input).toMatchObject({
      clientDbId: client.dbId,
      clientCode: 'C-0042',
      planLevel: 'Academy',
      note: 'Joined at the counter',
    })
    expect(String(input['clientUuid'])).toMatch(/^[0-9a-f-]{36}$/i)
    expect(ctx).toEqual({ userId: 'u-1', role: 'Coordinator', isOnline: true })
  })

  it('claims success only after the action confirms: toast, onSuccess with the plan, then close', async () => {
    await mount({ hasMembership: false })
    await click('Activate Membership')
    expect(state.toasts).toEqual(['Asha Rai is now on the Academy plan.'])
    expect(onSuccess).toHaveBeenCalledWith('Academy')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('words a move differently from an activation', async () => {
    await mount()
    await click('Apply Tier Change')
    expect(state.toasts).toEqual(['Asha Rai moved to the Academy plan.'])
  })

  it('on failure shows the reason inline, keeps the dialog open, and claims nothing', async () => {
    state.outcome.fail = 'That membership plan is retired and cannot be assigned.'
    await mount({ hasMembership: false })
    await click('Activate Membership')
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('retired and cannot be assigned')
    expect(onSuccess).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(state.toasts).toHaveLength(0)
  })

  it('retries the SAME request under the same key, and uses a NEW key once the request changes', async () => {
    state.outcome.fail = 'network hiccup'
    await mount({ hasMembership: false })
    await click('Activate Membership')
    await click('Activate Membership')
    expect(state.calls).toHaveLength(2)
    expect(state.calls[1]!.input['clientUuid']).toBe(state.calls[0]!.input['clientUuid'])
    await type('now with a note')
    await click('Activate Membership')
    expect(state.calls[2]!.input['clientUuid']).not.toBe(state.calls[0]!.input['clientUuid'])
  })

  it('passes the real connection state to the action', async () => {
    state.online = false
    await mount({ hasMembership: false })
    await click('Activate Membership')
    expect(state.calls[0]!.ctx['isOnline']).toBe(false)
  })
})
