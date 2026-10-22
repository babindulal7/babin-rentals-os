// @vitest-environment jsdom
/**
 * RULING 2026-10-22 (Babin: "activate membership"). The client page offers the
 * membership action only to the roles the database lets write `client_memberships`
 * — Owner, Admin, Manager, Coordinator — and words it from the TRUTH about the
 * client: "Activate" when there is no live membership, "Change" when there is.
 * Accounts can see money but have "no membership edits" (PERMISSIONS A5), so a
 * money gate would have shown them the button; this pins that it does not.
 *
 * Mocks follow `ClientDetail.block.test.tsx`; the dialog and the action have their
 * own tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../../../components/ui/Toast'
import { CLIENTS_DATA } from '../../../data/clients'

const session = vi.hoisted(() => ({ role: 'Coordinator' as string, membershipKnown: false }))

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
    user: { id: 'u-1', name: 'Babin Shrestha', role: session.role, isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))
vi.mock('../../../lib/queries/useClients', async () => {
  const { CLIENTS_DATA: DATA } = await import('../../../data/clients')
  return {
    useClientProfile: () => ({
      ...EMPTY_LIST,
      rows: [{ id: 'uuid-fixture', record: { ...DATA[0]!, dbId: 'uuid-fixture' }, membershipKnown: session.membershipKnown, deactivatedAtAd: null }],
      isEmpty: false,
      total: 1,
    }),
    useMembershipPlans: () => ({
      ...EMPTY_LIST,
      rows: [{ level: 'Academy', label: 'Access Member', defaultCreditLimit: 5_000_000, individualDiscountPct: 5, displayOrder: 1 }],
      isEmpty: false,
      total: 1,
    }),
  }
})
vi.mock('../../../lib/queries/useList', () => ({ useList: () => EMPTY_LIST }))
vi.mock('../../../lib/supabase', () => ({ supabase: {}, newClientUuid: () => 'key-one' }))

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
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20))
  })
}

async function click(el: Element | undefined | null) {
  await act(async () => {
    el?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20))
  })
}

const cardButtons = (label: string) =>
  [...container.querySelectorAll('button')].filter((b) => b.textContent?.trim() === label)

/** The header More menu is portalled to <body>; open it and read its items. */
async function moreItems(): Promise<string[]> {
  await click(container.querySelector('button[aria-label="More actions"]'))
  return [...document.body.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent?.trim() ?? '')
}

const dialog = () => document.body.querySelector('[role="dialog"]')

beforeEach(() => {
  session.role = 'Coordinator'
  session.membershipKnown = false
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  document.body.innerHTML = ''
})

describe('who is offered it', () => {
  it.each(['Owner', 'Admin', 'Manager', 'Coordinator'])('offers %s the action, in the card and in More', async (role) => {
    session.role = role
    await mount()
    expect(cardButtons('Activate Membership')).toHaveLength(1)
    expect(await moreItems()).toContain('Activate Membership')
  })

  it.each(['Accounts', 'Warehouse', 'Technician', 'Driver'])('offers %s nothing, even though the page shows them money', async (role) => {
    session.role = role
    await mount()
    expect(cardButtons('Activate Membership')).toHaveLength(0)
    expect(cardButtons('Change Membership Plan')).toHaveLength(0)
    const items = await moreItems()
    expect(items.join('|')).not.toMatch(/Membership|Upgrade Tier|Change Tier/)
  })
})

describe('how it is worded', () => {
  it('says Activate when the client has no live membership', async () => {
    session.membershipKnown = false
    await mount()
    expect(cardButtons('Activate Membership')).toHaveLength(1)
    expect(cardButtons('Change Membership Plan')).toHaveLength(0)
  })

  it('says Change when they have one', async () => {
    session.membershipKnown = true
    await mount()
    expect(cardButtons('Change Membership Plan')).toHaveLength(1)
    expect(cardButtons('Activate Membership')).toHaveLength(0)
  })

  it('does not call a client with no membership an Academy member — the tier row says so honestly', async () => {
    session.membershipKnown = false
    await mount()
    expect(container.textContent).toContain('No membership yet')
    const tier = CLIENTS_DATA[0]!.membership
    // The placeholder tier must not be presented as this client's plan beside an Activate button.
    expect((container.textContent ?? '').replace(/\s+/g, '')).not.toContain('MembershipTier' + tier)
  })

  it('shows the real tier once they have one', async () => {
    session.membershipKnown = true
    await mount()
    expect(container.textContent).not.toContain('No membership yet')
    expect(container.textContent).toContain(CLIENTS_DATA[0]!.membership)
  })

  it('no longer carries the old Upgrade Tier / Change Tier wording', async () => {
    await mount()
    expect(container.textContent).not.toContain('Change Tier')
    expect(await moreItems()).not.toContain('Upgrade Tier')
  })
})

describe('opening it', () => {
  it('opens the dialog from the card button, titled for what will happen', async () => {
    session.membershipKnown = false
    await mount()
    expect(dialog()).toBeNull()
    await click(cardButtons('Activate Membership')[0])
    expect(dialog()).not.toBeNull()
    expect(dialog()?.textContent).toContain('has no membership yet.')
  })

  it('opens it from the More menu too', async () => {
    session.membershipKnown = true
    await mount()
    await click(container.querySelector('button[aria-label="More actions"]'))
    const item = [...document.body.querySelectorAll('[role="menuitem"]')].find((i) => i.textContent?.trim() === 'Change Membership Plan')
    await click(item)
    expect(dialog()?.textContent).toContain('Change Membership Plan')
  })
})
