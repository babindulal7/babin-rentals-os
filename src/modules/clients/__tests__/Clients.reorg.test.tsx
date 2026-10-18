// @vitest-environment jsdom
/**
 * RULING 2026-10-18 (Babin's rulings): Coupons & Promos joined Referral Codes
 * under Clients ▸ More (money only, as it was in Tools), and the tier credit
 * policy moved to Settings ▸ Business — Clients ▸ More now opens the
 * client-level "Client Credit" view, which points at the new home.
 *
 * The page's data and its heavy child screens are stubbed: this pins the wiring
 * in `Clients.tsx`, not the screens it mounts.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

let money = true

vi.mock('../../../lib/moneyVisibility', () => ({ useCanViewMoney: () => money }))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u-1', name: 'Test', role: money ? 'Owner' : 'Warehouse' } }),
}))
vi.mock('../../../components/ui/Toast', () => ({ useToast: () => ({ showSuccessToast: vi.fn() }) }))
vi.mock('../../../lib/queries/useClients', () => ({
  useClients: () => ({ clients: [], loading: false, error: null, refresh: vi.fn() }),
}))
vi.mock('../../../components/ui/creation/GlobalAddMenu', () => ({ GlobalAddMenu: () => null }))
vi.mock('../ClientsDirectory', () => ({ ClientsDirectory: () => <div>directory</div> }))
vi.mock('../Membership', () => ({ default: () => <div>membership</div> }))
vi.mock('../ImportCenter', () => ({ default: () => null }))
vi.mock('../DuplicateCenter', () => ({ default: () => null }))
vi.mock('../GenerateReferralCode', () => ({ default: () => null }))
vi.mock('../../tools/CouponsManager', () => ({ default: () => <div data-coupons>coupons manager</div> }))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { default: Clients } = await import('../Clients')

let root: Root | undefined
let host: HTMLDivElement | undefined

async function mount(entry: string) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(
      <MemoryRouter initialEntries={[entry]}>
        <Clients />
      </MemoryRouter>,
    )
  })
}

/** Opens the header's More menu and returns the visible item labels. */
async function moreItems(): Promise<string[]> {
  const more = document.body.querySelector<HTMLButtonElement>('button[aria-label="More actions"]')
  expect(more, 'Clients header has a More menu').not.toBeNull()
  await act(async () => {
    more!.click()
  })
  return [...document.body.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent?.trim() ?? '')
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  host?.remove()
  root = undefined
  host = undefined
  money = true
})

describe('Clients ▸ More after the 18 Oct moves', () => {
  it('offers Client Credit and Coupons & Promos beside Referral Codes to a money role', async () => {
    await mount('/clients')
    const items = await moreItems()
    expect(items).toEqual(expect.arrayContaining(['Client Credit', 'Referral Codes', 'Coupons & Promos']))
    expect(items).not.toContain('Credit Policies')
  })

  it('offers neither money item to a money-blind role', async () => {
    money = false
    await mount('/clients')
    const items = await moreItems()
    expect(items).toContain('Referral Codes')
    expect(items).not.toContain('Client Credit')
    expect(items).not.toContain('Coupons & Promos')
  })
})

describe('Coupons & Promos tab', () => {
  it('mounts the coupons manager for a money role', async () => {
    await mount('/clients?tab=coupons')
    expect(host?.querySelector('[data-coupons]')).not.toBeNull()
  })

  it('mounts nothing of it for a money-blind role, even when typed into the URL', async () => {
    money = false
    await mount('/clients?tab=coupons')
    expect(host?.querySelector('[data-coupons]')).toBeNull()
  })
})

describe('Client Credit view', () => {
  it('keeps the client-level figures and points at Settings ▸ Business for the tier policy', async () => {
    await mount('/clients?tab=credit')
    expect(host?.textContent).toContain('Credit Extended')
    expect(host?.textContent).not.toContain('Credit policy by membership tier')
    const link = host?.querySelector<HTMLAnchorElement>('a[href="/settings?tab=business"]')
    expect(link?.textContent).toContain('Settings ▸ Business')
  })
})
