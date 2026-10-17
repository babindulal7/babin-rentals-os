// @vitest-environment jsdom
/**
 * # One search per list page, one toolbar line (RULING 2026-10-15)
 *
 * Inventory and Clients each drew two search boxes over the same `?q=` — the
 * page header's and an in-page copy with the same words — and a toolbar that
 * wrapped at 1280px with the sidebar open. These tests render each page the way
 * the app does (inside the workspace shell, under the global `Header`) and pin:
 *
 *  1. exactly one search box, and it is the header's;
 *  2. `/` focuses it at desktop width, as its "(press /)" placeholder promises;
 *  3. every quick-filter chip is still in the toolbar — moving controls must not
 *     make a filter unreachable;
 *  4. (Not ported: the old line also moved Stats into More. On this line Stats
 *     stays in the toolbar and the toolbar still fits; see RULINGS-2026-10-15 row 25.)
 *
 * jsdom has no layout, so line count and height are measured in the browser and
 * logged in PROGRESS.md; this file pins the structure that produces them.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClientRecord } from '../../data/clients'
import { rupees } from '../../lib/money'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: '00000000-0000-4000-8000-000000000001', name: 'Babin Shrestha', role: 'Owner', isSharedDevice: false },
    loading: false,
    isLocked: false,
    hasPin: true,
    lockNow: vi.fn(),
    logout: vi.fn(),
  }),
}))

vi.mock('../../lib/device', () => ({
  useViewport: () => 'desktop',
  useCapability: () => ({ coarsePointer: false, hasHover: true, standalone: false, reducedMotion: false }),
  useTabularLayout: () => true,
}))

vi.mock('../../lib/network', () => ({ useNetwork: () => true }))

vi.mock('../../lib/syncContext', () => ({
  useSync: () => ({ status: 'synced', pendingCount: 0, error: null, triggerSync: vi.fn() }),
}))

vi.mock('../../components/ui/Toast', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
  useToast: () => ({ showSuccessToast: vi.fn(), showToast: vi.fn() }),
}))

vi.mock('../../modules/operations/OperationsWorkspaceContext', () => ({
  OperationsWorkspaceProvider: ({ children }: { children: React.ReactNode }) => children,
  useOperationsWorkspace: () => ({ openOperations: vi.fn(), closeOperations: vi.fn() }),
}))

/* Chainable and thenable, so every list query resolves to an empty page. */
vi.mock('../../lib/supabase', () => {
  const build = (): Record<string, unknown> => {
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'neq', 'is', 'in', 'or', 'ilike', 'gte', 'lte', 'gt', 'lt', 'not', 'order', 'limit', 'range']) chain[m] = () => chain
    chain['single'] = async () => ({ data: null, error: null })
    chain['maybeSingle'] = async () => ({ data: null, error: null })
    chain['then'] = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(resolve)
    return chain
  }
  return {
    IS_MOCK: false,
    newClientUuid: () => '11111111-1111-4111-8111-111111111111',
    supabase: { from: () => build(), rpc: async () => ({ data: null, error: null }) },
  }
})

function client(over: Partial<ClientRecord>): ClientRecord {
  return {
    id: 'C-1',
    name: 'Anjali Thapa',
    clientType: 'Individual',
    membership: 'Creator',
    phone: '9800000000',
    email: 'anjali@example.com',
    currentRentalsCount: 1,
    activeBookings: [],
    outstandingPaisa: rupees(1000),
    depositHeldPaisa: rupees(0),
    creditLimitPaisa: rupees(0),
    creditUsedPaisa: rupees(0),
    lastRentalAd: '18 Jul 2026',
    lastRentalBs: '2083/04/03',
    address: 'Boudha',
    ...over,
  } as ClientRecord
}

/* The directory renders only once it has rows, so the hook hands it two. */
vi.mock('../../lib/queries/useClients', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../lib/queries/useClients')>()
  const clients = [client({ id: 'C-1' }), client({ id: 'C-2', name: 'Bagmati Films Pvt. Ltd.', clientType: 'Organisation' })]
  return { ...real, useClients: () => ({ clients, loading: false, error: null, isEmpty: false, refresh: vi.fn() }) }
})

import Header from '../../components/shell/Header'
import { WorkspaceProvider } from '../../lib/workspaceContext'

let container: HTMLDivElement
let root: Root

async function mountInShell(page: 'inventory' | 'clients') {
  const Page = page === 'inventory'
    ? (await import('../../modules/inventory/Inventory')).default
    : (await import('../../modules/clients/Clients')).default
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/${page}`]}>
        <WorkspaceProvider>
          <Header crumbs={[{ label: page === 'inventory' ? 'Inventory' : 'Clients' }]} />
          <Page />
        </WorkspaceProvider>
      </MemoryRouter>,
    )
  })
  for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve() })
}

const searchBoxes = () => [...container.querySelectorAll<HTMLInputElement>('input[type="search"], [role="searchbox"]')]
const buttonLabels = (scope: Element) => [...scope.querySelectorAll('button')].map((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').replace(/\s+/g, ' ').trim())

beforeEach(() => window.sessionStorage.clear())

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  container?.remove()
})

describe('RULING 2026-10-15 — one search per list page, one toolbar line', { timeout: 90_000 }, () => {
  it.each(['inventory', 'clients'] as const)('%s renders exactly one search box, the header one', async (page) => {
    await mountInShell(page)
    const boxes = searchBoxes()
    expect(boxes.map((b) => b.placeholder)).toHaveLength(1)
    expect(boxes[0]!.closest('.app-global-header')).not.toBeNull()
  })

  it.each(['inventory', 'clients'] as const)('%s: "/" focuses the header search at desktop width', async (page) => {
    await mountInShell(page)
    const header = container.querySelector<HTMLInputElement>('.app-global-header input[type="search"]')!
    expect(header.placeholder).toContain('(press /)')
    const event = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true })
    await act(async () => { document.body.dispatchEvent(event) })
    expect(document.activeElement).toBe(header)
    // Prevented, so the "/" is not typed into the box it just focused.
    expect(event.defaultPrevented).toBe(true)
  })

  it('Inventory keeps every status chip in the one toolbar', async () => {
    await mountInShell('inventory')
    const toolbar = container.querySelector('.inventory-list-toolbar')!
    const labels = buttonLabels(toolbar)
    for (const chip of ['All', 'Available', 'On Rent']) {
      expect(labels.some((l) => l.startsWith(chip))).toBe(true)
    }
    // The chips are not a second row of their own any more.
    expect(container.querySelectorAll('.inventory-chip-track')).toHaveLength(1)
    expect(toolbar.querySelector('.inventory-chip-track')).not.toBeNull()
  })

  it('Clients keeps every quick filter in the one toolbar', async () => {
    await mountInShell('clients')
    const toolbar = container.querySelector('.client-chip-track')!
    const labels = buttonLabels(toolbar)
    for (const chip of ['All', 'Open rentals', 'Payment Due', 'Blocked']) {
      expect(labels.some((l) => l.startsWith(chip))).toBe(true)
    }
    // The view switch is still one tap away, at the end of the same row.
    expect(labels).toEqual(expect.arrayContaining(['Table', 'Cards']))
  })
})
