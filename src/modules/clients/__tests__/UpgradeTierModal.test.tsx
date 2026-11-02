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
  outcome: { fail: null as string | null, hold: null as Promise<void> | null },
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
    if (state.outcome.hold) await state.outcome.hold
    if (state.outcome.fail) throw new Error(state.outcome.fail)
    return { client_id: input['clientDbId'], plan_level: input['planLevel'] }
  }),
}))
vi.mock('../../../actions/clients/renewMembership', () => ({
  NOTE_MAX: 500,
  renewMembership: vi.fn(async (input: Record<string, unknown>, ctx: Record<string, unknown>) => {
    state.calls.push({ input: { ...input, isRenewal: true }, ctx })
    if (state.outcome.hold) await state.outcome.hold
    if (state.outcome.fail) throw new Error(state.outcome.fail)
    return { client_id: input['clientDbId'], plan_level: input['planLevel'], is_renewal: true }
  }),
}))

/* The dialog reads the live membership row itself (id, plan, join date, fee).
   One row per test by default: a recorded fee, so legacy cases behave as the
   dialog has always behaved; a test sets `membershipRow.data = null` or a
   feeless row to pin the honesty paths. */
const membershipRow = vi.hoisted(() => ({
  data: null as Record<string, unknown> | null,
  /** Set to keep the read in flight and pin the "still loading" state. */
  hold: null as Promise<void> | null,
}))
vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            maybeSingle: async () => {
              if (membershipRow.hold) await membershipRow.hold
              return { data: membershipRow.data, error: null }
            },
          }),
        }),
      }),
    }),
  },
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { UpgradeTierModal } = await import('../modals/UpgradeTierModal')

const plan = (id: string, level: string, label: string, annualFee: number | null, credit: number | null, pct: number | null, order: number) => ({
  id, level, label, annualFee, termMonths: 12, defaultCreditLimit: credit, individualDiscountPct: pct, displayOrder: order,
})
const PLANS = [
  plan('plan-academy', 'Academy', 'Access Member', 6_000_000, 5_000_000, 5, 1),
  plan('plan-creator', 'Creator', 'Partner', 15_000_000, 25_000_000, 10, 2),
  plan('plan-elite', 'Elite', 'Elite Member', null, null, null, 3),
]

const client = { id: 'C-0042', dbId: '11111111-1111-4111-8111-111111111111', name: 'Asha Rai', membership: 'Creator' } as unknown as ClientRecord

let root: Root | undefined
let host: HTMLDivElement | undefined
let onClose = vi.fn()
let onSuccess = vi.fn()

async function mount(over: { hasMembership?: boolean; client?: ClientRecord; initialMode?: 'change' | 'renew' } = {}) {
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
        initialMode={over.initialMode}
      />,
    )
  })
  // The dialog reads the live membership row itself; flush that read so every
  // assertion sees one settled state. (With no row the pending note stays up.)
  if (over.hasMembership ?? true) {
    for (let i = 0; i < 10; i++) {
      await act(async () => {})
      if (!document.body.textContent?.includes('Reading the current membership')) break
    }
  }
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
const feeBox = () => document.body.querySelector<HTMLInputElement>('input[aria-label="Negotiated fee"]')
async function typeFee(value: string) {
  await act(async () => {
    const el = feeBox()
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(el, value)
    el?.dispatchEvent(new Event('input', { bubbles: true }))
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
  state.outcome.hold = null
  state.toasts = []
  state.online = true
  membershipRow.data = { id: 'membership-fixture', plan_id: 'row-plan-not-in-options', join_date: '2026-01-01', fee_paid: 1200000 }
  membershipRow.hold = null
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

  it('refuses offline before starting a membership write', async () => {
    state.online = false
    await mount({ hasMembership: false })
    await click('Activate Membership')
    expect(state.calls).toHaveLength(0)
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('Connect to update client membership.')
    expect(onSuccess).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it.each(['', 'C-0042'])('refuses an unavailable database client identity (%s)', async (dbId) => {
    await mount({ hasMembership: false, client: { ...client, dbId } })
    await click('Activate Membership')
    expect(state.calls).toHaveLength(0)
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('saved client identity is unavailable')
    expect(onSuccess).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('allows one pending write and keeps its inputs and Cancel locked until confirmation', async () => {
    let release: (() => void) | undefined
    state.outcome.hold = new Promise<void>((resolve) => { release = resolve })
    await mount({ hasMembership: false })
    await act(async () => {
      button('Activate Membership')!.click()
      button('Activate Membership')!.click()
    })
    expect(state.calls).toHaveLength(1)
    expect(select()!.disabled).toBe(true)
    expect(note()!.disabled).toBe(true)
    expect(button('Cancel')!.disabled).toBe(true)
    await click('Cancel')
    expect(onClose).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
    await act(async () => { release?.() })
    expect(onSuccess).toHaveBeenCalledWith('Academy')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('renewing a membership (Ruling D23)', () => {
  it('allows renewal on the current plan when checkbox is checked', async () => {
    await mount()
    await choose('Creator')
    expect(button('Apply Tier Change')!.hasAttribute('disabled')).toBe(true)

    const checkbox = document.body.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    expect(checkbox).not.toBeNull()
    await act(async () => {
      checkbox.click()
    })

    expect(text()).toContain('Renew Membership')
    expect(text()).toContain('Charges the full plan fee, starts a new term from today')
    expect(button('Renew Membership')!.hasAttribute('disabled')).toBe(false)

    await click('Renew Membership')
    expect(state.calls).toHaveLength(1)
    expect(state.calls[0]!.input).toMatchObject({
      clientDbId: client.dbId,
      clientCode: 'C-0042',
      planLevel: 'Creator',
      isRenewal: true,
    })
    expect(state.toasts).toEqual(["Asha Rai's Creator membership has been renewed for a new term."])
    expect(onSuccess).toHaveBeenCalledWith('Creator')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('opens directly in renewal mode when initialMode is renew', async () => {
    await mount({ initialMode: 'renew' })
    expect(text()).toContain('Renew Membership')
    expect(text()).toContain('Asha Rai is renewing their Creator plan.')
    expect(select()!.value).toBe('Creator')
    expect(button('Renew Membership')!.hasAttribute('disabled')).toBe(false)

    await click('Renew Membership')
    expect(state.calls).toHaveLength(1)
    expect(state.calls[0]!.input).toMatchObject({
      clientDbId: client.dbId,
      planLevel: 'Creator',
      isRenewal: true,
    })
  })
})

describe('pricing honesty (D22 gate parity)', () => {
  it('shows the working from the recorded membership fee, and never prices a withheld fee as zero', async () => {
    await mount()
    await choose('Academy')
    expect(text()).toContain('Credit for unused days (Ruling D22)')
    expect(text()).toContain('Current plan fee:')
    expect(text()).toContain('12,000')
    await choose('Elite')
    // The custom fee is not negotiated here, so there is no price to show —
    // and certainly not a made-up zero.
    expect(text()).not.toContain('Credit for unused days (Ruling D22)')
    expect(text()).not.toMatch(/Rs\s?0\b/)
    expect(button('Apply Tier Change')!.hasAttribute('disabled')).toBe(true)
    expect(text()).toContain('Negotiated fee (NPR)')
  })

  it('asks for the negotiated fee on the custom-fee plan and sends it in paisa', async () => {
    await mount({ hasMembership: false })
    await choose('Elite')
    expect(button('Activate Membership')!.hasAttribute('disabled')).toBe(true)
    await typeFee('25,000')
    expect(text()).toContain('The negotiated fee is recorded with this change.')
    expect(button('Activate Membership')!.hasAttribute('disabled')).toBe(false)
    await click('Activate Membership')
    expect(state.calls).toHaveLength(1)
    expect(state.calls[0]!.input['feePaid']).toBe(2_500_000)
  })

  it('refuses an unparsable or negative negotiated fee inline, and sends nothing', async () => {
    await mount({ hasMembership: false })
    await choose('Elite')
    await typeFee('-5')
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('valid non-negative')
    expect(button('Activate Membership')!.hasAttribute('disabled')).toBe(true)
    await click('Activate Membership')
    expect(state.calls).toHaveLength(0)
  })

  it('says when the current membership has no fee basis, and does not send an unpriceable change', async () => {
    membershipRow.data = { id: 'membership-fixture', plan_id: 'row-plan-not-in-options', join_date: '2026-01-01', fee_paid: null }
    await mount()
    await choose('Academy')
    expect(text()).toContain('never recorded')
    expect(text()).not.toContain('Credit for unused days (Ruling D22)')
    expect(button('Apply Tier Change')!.hasAttribute('disabled')).toBe(true)
    await click('Apply Tier Change')
    expect(state.calls).toHaveLength(0)
  })

  it('says plainly that it is reading the membership while the recorded row is still loading, and does not price from a guess', async () => {
    membershipRow.hold = new Promise<void>(() => {})
    await mount()
    await choose('Academy')
    expect(text()).toContain('Reading the current membership')
    expect(text()).not.toContain('Credit for unused days (Ruling D22)')
    expect(button('Apply Tier Change')!.hasAttribute('disabled')).toBe(true)
  })

  it('prices a custom-fee renewal from the recorded fee, and asks for one when nothing is on record', async () => {
    const eliteClient = { ...client, membership: 'Elite' } as ClientRecord
    membershipRow.data = { id: 'membership-fixture', plan_id: 'plan-elite', join_date: '2026-01-01', fee_paid: 2_500_000 }
    await mount({ initialMode: 'renew', client: eliteClient })
    expect(text()).toContain('The fee already on record is charged')
    expect(text()).toContain('25,000')
    expect(button('Renew Membership')!.hasAttribute('disabled')).toBe(false)
    await click('Renew Membership')
    expect(state.calls).toHaveLength(1)
    expect(state.calls[0]!.input).toMatchObject({ planLevel: 'Elite', isRenewal: true })
    expect(state.calls[0]!.input).not.toHaveProperty('feePaid')

    // With nothing on record the renewal cannot be priced — it waits for a fee.
    await act(async () => root?.unmount())
    host?.remove()
    document.body.innerHTML = ''
    membershipRow.data = { id: 'membership-fixture', plan_id: 'plan-elite', join_date: '2026-01-01', fee_paid: null }
    await mount({ initialMode: 'renew', client: eliteClient })
    expect(text()).toContain('record it below to price this renewal')
    expect(button('Renew Membership')!.hasAttribute('disabled')).toBe(true)
  })
})
