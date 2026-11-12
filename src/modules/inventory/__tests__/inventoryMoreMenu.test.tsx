// @vitest-environment jsdom
/**
 * Card 8 (G-14): Inventory keeps 4 primary tabs and exposes
 * Cases, Warranty & RMA, QR & Barcode Labels, and Purchase Requests in one More menu
 * for staff roles, while hiding them from Client.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SystemRole } from '../../../types/database'

const state = vi.hoisted(() => ({ role: 'Owner' as SystemRole }))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'USR-1', name: 'Operator', role: state.role, isSharedDevice: false }, loading: false }),
}))
vi.mock('../../../lib/supabase', () => {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'or', 'in', 'gte', 'lte', 'is', 'not', 'order', 'range', 'eq', 'neq', 'limit', 'ilike']) builder[m] = () => builder
  builder.then = (resolve: (v: { data: unknown[]; error: null; count: number }) => unknown) => resolve({ data: [], error: null, count: 0 })
  return {
    supabase: { from: () => builder, rpc: () => builder },
    newClientUuid: () => '00000000-0000-4000-8000-000000000000',
  }
})
vi.mock('../../../lib/queries/inventory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/queries/inventory')>()
  return {
    ...actual,
    listInventory: async () => ({ rows: [], total: 0 }),
    listUnits: async () => ({ rows: [], total: 0 }),
  }
})

window.matchMedia = ((q: string) => ({
  matches: false, media: q, onchange: null,
  addEventListener: () => {}, removeEventListener: () => {},
  addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { default: Inventory } = await import('../Inventory')

const ALL_ROLES: SystemRole[] = [
  'Owner',
  'Admin',
  'Manager',
  'Coordinator',
  'Accounts',
  'Warehouse',
  'Technician',
  'Driver',
  'Client',
]

let root: Root | undefined
let host: HTMLDivElement | undefined

async function mount(entry = '/inventory') {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(
      <MemoryRouter initialEntries={[entry]}>
        <Inventory />
      </MemoryRouter>,
    )
  })
}

async function openMoreItems(): Promise<string[]> {
  const more = document.body.querySelector<HTMLButtonElement>('button[aria-label="More actions"]')
  expect(more, 'Inventory header should have a More actions menu').not.toBeNull()
  await act(async () => {
    more!.click()
  })
  return [...document.body.querySelectorAll('[role="menuitem"]')].map((el) => el.textContent?.trim() ?? '')
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  host?.remove()
  root = undefined
  host = undefined
  state.role = 'Owner'
})

describe('Inventory More menu (Card 8, G-14)', () => {
  it.each(ALL_ROLES)('matches route access for %s', async (role) => {
    state.role = role
    await mount('/inventory')
    const items = await openMoreItems()
    if (role === 'Client') {
      expect(items).not.toContain('Cases')
      expect(items).not.toContain('Warranty & RMA')
      expect(items).not.toContain('QR & Barcode Labels')
      expect(items).not.toContain('Purchase Requests')
    } else {
      expect(items).toEqual(
        expect.arrayContaining([
          'Cases',
          'Warranty & RMA',
          'QR & Barcode Labels',
          'Purchase Requests',
        ]),
      )
    }
  })

  it('also exposes the 4 Inventory tools in More on Bundles tab', async () => {
    state.role = 'Warehouse'
    await mount('/inventory?tab=bundles')
    const items = await openMoreItems()
    expect(items).toEqual(
      expect.arrayContaining([
        'Cases',
        'Warranty & RMA',
        'QR & Barcode Labels',
        'Purchase Requests',
      ]),
    )
  })
})
