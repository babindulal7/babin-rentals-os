// @vitest-environment jsdom
/**
 * Smart Workspace Views v1 — Inventory Equipment saved views, integration level.
 *
 * The supabase mock answers every `saved_views` read with the schema-cache
 * error, which is the deployed reality until 0159 is applied: the menu must fall
 * back to device storage and SAY so, save real views there, and apply them back
 * through the same allowlist codec the lib tests cover. §5 of the pack maps to
 * the cases below.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { InventoryListRow } from '../../../lib/queries/inventory'

const state = vi.hoisted(() => ({
  user: { id: 'USR-1', name: 'Babin', role: 'Owner' } as { id: string; name: string; role: string } | null,
}))

vi.mock('../../../lib/device', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/device')>()
  return { ...actual, useViewport: () => 'desktop' as const, useTabularLayout: () => true }
})
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: state.user, loading: false }),
}))
vi.mock('../../../lib/supabase', () => {
  /* Every table read errors with the 0159-missing message, so SavedViewsMenu
     must take its device-only fallback path. */
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'or', 'in', 'gte', 'lte', 'is', 'not', 'order', 'range', 'eq', 'neq', 'limit', 'ilike']) builder[m] = () => builder
  builder.then = (resolve: (v: { data: null; error: { message: string } }) => unknown) =>
    resolve({ data: null, error: { message: 'Could not find the table public.saved_views in the schema cache' } })
  return {
    supabase: { from: () => builder, rpc: () => builder },
    newClientUuid: () => '00000000-0000-4000-8000-000000000000',
  }
})

const ROW: InventoryListRow = {
  id: 'p-1', assetCode: 'EQ000267', name: 'Aputure Amaran 200x', shortName: null, brand: 'Aputure',
  model: '200x', categoryId: 'c-1', category: 'Lighting' as InventoryListRow['category'], categoryCode: 'lighting',
  trackingMode: 'Serialised' as InventoryListRow['trackingMode'], recordState: 'Active' as InventoryListRow['recordState'],
  isActive: true, totalQuantity: 6, quantityUnit: null, createdAtAd: '2026-07-01T00:00:00.000Z', unitCount: 6,
  unitCountExcludingRetired: 6,
  unitsByState: { 'In Stock': 6, Reserved: 0, Packed: 0, 'On Rent': 0, Returning: 0, Inspection: 0, Cleaning: 0, Maintenance: 0, Missing: 0, Retired: 0 },
  unitConditions: ['Good'] as InventoryListRow['unitConditions'], dailyRate: null, replacementValue: null,
}
const ROW2: InventoryListRow = { ...ROW, id: 'p-2', assetCode: 'EQ000268', name: 'Sony FX3' }

vi.mock('../../../lib/queries/inventory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/queries/inventory')>()
  return { ...actual, listInventory: async () => ({ rows: [ROW, ROW2], total: 30 }), listUnits: async () => ({ rows: [], total: 0 }) }
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
let lastSearch = ''

function LocationProbe() {
  const location = useLocation()
  lastSearch = location.search
  return null
}

async function mountAt(entry: string) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <LocationProbe />
        <Inventory />
      </MemoryRouter>,
    )
  })
  /* listInventory and the menu's device-view load resolve a microtask later. */
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}

/* The toolbar trigger, found structurally: once a view is active the button's
   label becomes that view's name, so text-matching "Saved views" only works
   before the first save. */
const savedViewsButton = () =>
  container.querySelector<HTMLButtonElement>('.list-workspace__controls button[aria-haspopup="menu"]')

const menuEl = () => document.body.querySelector<HTMLElement>('[role="menu"][aria-label="Saved inventory views"]')

async function openMenu() {
  await act(async () => { savedViewsButton()?.click() })
  return menuEl()
}

const menuItem = (menu: Element | null | undefined, text: string) =>
  [...(menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])].find((b) => b.textContent?.includes(text))

async function saveCurrentView(name: string) {
  const menu = await openMenu()
  await act(async () => { menuItem(menu, 'Save current view')?.click() })
  const input = document.body.querySelector<HTMLInputElement>('#saved-view-name')
  expect(input).not.toBeNull()
  await act(async () => { setNativeValue(input, name) })
  const saveBtn = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Save view')
  await act(async () => { saveBtn?.click() })
}

/** Set a form control's value the way a real keystroke does, with the guards
 * strict mode demands, and dispatch the event React listens for. */
function setNativeValue(el: HTMLInputElement | HTMLSelectElement | null | undefined, value: string) {
  if (!el) throw new Error('expected a form control, found none')
  const proto = el instanceof HTMLSelectElement ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype
  const set = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  if (!set) throw new Error('native value setter missing')
  set.call(el, value)
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
}

const sortSelect = () => container.querySelector<HTMLSelectElement>('select[aria-label="Sort equipment"]')

const layoutTab = (label: string) =>
  [...container.querySelectorAll<HTMLButtonElement>('[role="tablist"][aria-label="View layout"] [role="tab"]')].find((b) => b.textContent === label)

beforeEach(() => {
  state.user = { id: 'USR-1', name: 'Babin', role: 'Owner' }
  localStorage.clear()
})

afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
  document.body.innerHTML = ''
})

describe('Inventory saved views — the menu (device fallback until 0159 is applied)', () => {
  it('renders one menu on the Equipment toolbar with inventory copy and an honest device-only note', async () => {
    await mountAt('/inventory')
    expect(savedViewsButton()).not.toBeNull()
    const menu = await openMenu()
    expect(menu).not.toBeNull()
    expect(menu?.textContent).toContain('INVENTORY VIEWS')
    expect(menu?.textContent).toContain('All equipment')
    expect(menu?.textContent).toContain('Save current view')
    expect(menu?.textContent).toContain('Saved on this device')
    /* The stale, inert control is gone from the rail. */
    expect(container.textContent).not.toContain('Save Current View')
  })

  it('is disabled for a signed-out session', async () => {
    state.user = null
    await mountAt('/inventory')
    expect(savedViewsButton()?.disabled).toBe(true)
  })})

describe('Inventory saved views — save and re-apply', () => {
  it('restores search, chip, sort and layout; the saved view row marks itself active', async () => {
    await mountAt('/inventory?q=FX3&chip=on-rent')
    /* Change presentation so the view carries non-default sort + layout. */
    setNativeValue(sortSelect(), 'Category A–Z')
    await act(async () => { layoutTab('Cards')?.click() })

    await saveCurrentView('FX3 on rent')

    /* Apply "All equipment": unfettered list, default sort, table layout,
       still on the Equipment tab (no tab param appears). */
    const menu = await openMenu()
    await act(async () => { menuItem(menu, 'All equipment')?.click() })
    expect(lastSearch).toBe('')
    expect(sortSelect()?.value).toBe('Equipment A–Z')
    expect(layoutTab('Cards')?.getAttribute('aria-selected')).toBe('false')
    /* Re-apply the saved view: filters, sort and layout return together. */
    const menu2 = await openMenu()
    const row = menuItem(menu2, 'FX3 on rent')
    expect(row).not.toBeNull()
    await act(async () => { row?.click() })
    expect(lastSearch).toBe('?chip=on-rent&q=FX3')
    expect(sortSelect()?.value).toBe('Category A–Z')
    expect(layoutTab('Cards')?.getAttribute('aria-selected')).toBe('true')

    /* The menu button now names the active view. */
    expect(savedViewsButton()?.textContent).toContain('FX3 on rent')
  })

  it('resets the page and clears multi-selection and the open inspector when a view applies', async () => {
    await mountAt('/inventory')
    await act(async () => { container.querySelector<HTMLButtonElement>('button[aria-label="Page 2"]')?.click() })
    setNativeValue(sortSelect(), 'Equipment Z–A')

    /* One row bulk-selected, one record being inspected. */
    await act(async () => { container.querySelector<HTMLInputElement>(`input[aria-label="Select ${ROW2.name}"]`)?.click() })
    await act(async () => { container.querySelector<HTMLElement>('.inventory-parent-row')?.click() })
    expect(document.body.querySelector('.context-drawer')).not.toBeNull()

    await saveCurrentView('Page two selection')
    const menu = await openMenu()
    await act(async () => { menuItem(menu, 'All equipment')?.click() })
    /* The drawer's exit animation keeps it mounted for 200ms — the assertion
       is that it is GONE, so let the exit finish rather than catching it
       mid-close. */
    await act(async () => { await new Promise((r) => setTimeout(r, 250)) })

    expect(container.querySelector('button[aria-current="page"]')?.textContent).toBe('1')
    expect(container.querySelector<HTMLInputElement>(`input[aria-label="Select ${ROW2.name}"]`)?.checked).toBe(false)
    expect(document.body.querySelector('.context-drawer')).toBeNull()
  })

  it('sanitizes a hand-edited saved query: navigation, money and unsupported sort never apply', async () => {
    localStorage.setItem(
      'babin-inventory:saved-views:USR-1',
      JSON.stringify([
        {
          id: 'v-evil', name: 'Bad view',
          query: 'action=edit&tab=new&money=1&page=9&viewSort=Needs+attention+first&viewLayout=fullscreen&category=Bogus,Lighting&q=FX3',
          hiddenColumns: [], createdAt: new Date().toISOString(),
        },
      ]),
    )
    await mountAt('/inventory')
    const menu = await openMenu()
    const row = menuItem(menu, 'Bad view')
    expect(row).not.toBeNull()
    await act(async () => { row?.click() })

    expect(lastSearch).toBe('?category=Lighting&q=FX3')
    expect(lastSearch).not.toContain('action=')
    expect(lastSearch).not.toContain('money=')
    expect(lastSearch).not.toContain('tab=')
    expect(sortSelect()?.value).toBe('Equipment A–Z')
    expect(layoutTab('Cards')?.getAttribute('aria-selected')).toBe('false')
  })
})
