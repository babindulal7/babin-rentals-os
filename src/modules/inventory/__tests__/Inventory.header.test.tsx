// @vitest-environment jsdom
/**
 * Inventory header and Equipment table by room — zoom audit, 15 Oct 2026.
 *
 * Measured in the mock build: at 911px (a 1366px laptop at 150%) the Inventory title was
 * 0px wide and the table's forced 1060px floor hid Replacement and Actions behind a 252px
 * sideways scroll; at 1280px with the sidebar open the title was 14px. Now:
 *  - Refresh and Export already live in More at every width (RULINGS-2026-10-15 row 9); a
 *    compact header also drops the "N models" pill, which the list card heading repeats;
 *  - the table has no forced floor, and its Actions column is pinned to the scroller's
 *    right edge, Rentals' §4.1 pattern.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { InventoryListRow } from '../../../lib/queries/inventory'

const state = vi.hoisted(() => ({ viewport: 'desktop' as 'desktop' | 'tablet' | 'phone' }))

vi.mock('../../../lib/device', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/device')>()
  return { ...actual, useViewport: () => state.viewport, useTabularLayout: () => state.viewport !== 'phone' }
})
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'USR-1', name: 'Babin', role: 'Owner', isSharedDevice: false }, loading: false }),
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

const ROW: InventoryListRow = {
  id: 'p-1',
  assetCode: 'EQ000267',
  name: 'Aputure Amaran 200x',
  shortName: null,
  brand: 'Aputure',
  model: '200x',
  categoryId: 'c-1',
  category: 'Lighting' as InventoryListRow['category'],
  categoryCode: 'lighting',
  trackingMode: 'Serialised' as InventoryListRow['trackingMode'],
  recordState: 'Active' as InventoryListRow['recordState'],
  isActive: true,
  totalQuantity: 6,
  quantityUnit: null,
  createdAtAd: '2026-07-01T00:00:00.000Z',
  unitCount: 6,
  unitCountExcludingRetired: 6,
  unitsByState: {
    'In Stock': 6, Reserved: 0, Packed: 0, 'On Rent': 0, Returning: 0,
    Inspection: 0, Cleaning: 0, Maintenance: 0, Missing: 0, Retired: 0,
  },
  unitConditions: ['Good'] as InventoryListRow['unitConditions'],
  dailyRate: null,
  replacementValue: null,
}

vi.mock('../../../lib/queries/inventory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/queries/inventory')>()
  return {
    ...actual,
    listInventory: async () => ({ rows: [ROW], total: 1 }),
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

let container: HTMLDivElement
let root: Root
let header: HTMLElement | null = null

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/inventory']}>
        <Inventory />
      </MemoryRouter>,
    )
  })
  /* listInventory resolves on a microtask after mount. */
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}

const launcher = (name: string) =>
  [...container.querySelectorAll<HTMLButtonElement>(`.page-actions button[aria-label="${name}"]`)].filter((b) => !b.closest('[role="menu"]'))

async function openMore() {
  const more = container.querySelector<HTMLButtonElement>('.page-actions button[aria-label="More actions"]')
  expect(more).not.toBeNull()
  await act(async () => more?.click())
  return [...document.body.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"]')].map((i) => i.textContent?.trim())
}

beforeEach(() => {
  state.viewport = 'desktop'
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  header?.remove()
  header = null
  document.body.innerHTML = ''
})

describe('Inventory header — Refresh and Export in More at every width (RULINGS-2026-10-15 row 9)', () => {
  it('a roomy desktop keeps them in More and shows the model count beside the title', async () => {
    await mount()
    expect(launcher('Refresh equipment')).toHaveLength(0)
    expect(container.querySelector('.eyebrow-pill')?.textContent).toBe('1 models')
    expect(await openMore()).toEqual(expect.arrayContaining(['Refresh equipment', 'Export this page']))
  })

  it('a tablet drops the count pill; the list card heading still states it', async () => {
    state.viewport = 'tablet'
    await mount()
    expect(container.querySelector('.eyebrow-pill')).toBeNull()
    expect(container.textContent).toContain('1 Model found')
  })

  it('a desktop whose open sidebar leaves a 1024px header drops the pill too', async () => {
    header = document.createElement('header')
    header.className = 'app-global-header'
    header.getBoundingClientRect = () => ({ width: 1024, height: 64, top: 0, left: 256, right: 1280, bottom: 64, x: 256, y: 0, toJSON: () => ({}) }) as DOMRect
    document.body.appendChild(header)
    await mount()
    expect(container.querySelector('.eyebrow-pill')).toBeNull()
  })
})

describe('Equipment table — no forced floor, Actions pinned', () => {
  it('lets the columns decide the width and pins the Actions header and row cell', async () => {
    state.viewport = 'tablet'
    await mount()
    const table = container.querySelector<HTMLTableElement>('table[aria-label="Equipment inventory"]')
    expect(table).not.toBeNull()
    expect(table!.style.minWidth).toBe('0px')
    const headCells = [...table!.querySelectorAll('thead th')]
    expect(headCells[headCells.length - 1]?.classList.contains('inventory-actions-cell')).toBe(true)
    const quickView = table!.querySelector(`button[aria-label="Quick view ${ROW.name}"]`)
    expect(quickView?.closest('td')?.classList.contains('inventory-actions-cell')).toBe(true)
  })
})
