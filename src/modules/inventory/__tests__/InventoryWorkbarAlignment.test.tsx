// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { InventoryListRow } from '../../../lib/queries/inventory'
import Inventory from '../Inventory'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

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
  for (const m of ['select', 'or', 'in', 'gte', 'lte', 'is', 'not', 'order', 'range', 'eq', 'neq', 'limit', 'ilike']) {
    builder[m] = () => builder
  }
  builder.then = (resolve: (v: { data: unknown[]; error: null; count: number }) => unknown) =>
    resolve({ data: [], error: null, count: 0 })
  return {
    supabase: { from: () => builder, rpc: () => builder },
    newClientUuid: () => '00000000-0000-4000-8000-000000000000',
  }
})

const SAMPLE_ROW: InventoryListRow = {
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
    'In Stock': 6,
    Reserved: 0,
    Packed: 0,
    'On Rent': 0,
    Returning: 0,
    Inspection: 0,
    Cleaning: 0,
    Maintenance: 0,
    Missing: 0,
    Retired: 0,
  },
  unitConditions: ['Good'] as InventoryListRow['unitConditions'],
  dailyRate: null,
  replacementValue: null,
}

vi.mock('../../../lib/queries/inventory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/queries/inventory')>()
  return {
    ...actual,
    listInventory: async () => ({ rows: [SAMPLE_ROW], total: 1 }),
    listUnits: async () => ({ rows: [], total: 0 }),
    listInventoryCategories: async () => [],
    listProductImportCorpus: async () => ({ categories: [], codes: new Set(), barcodes: new Set(), serials: new Set() }),
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

describe('Inventory Workbar & Chip Alignment — Global Shell Phase 2', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    state.viewport = 'desktop'
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    document.body.innerHTML = ''
  })

  async function mount(initialEntry = '/inventory') {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[initialEntry]}>
          <Inventory />
        </MemoryRouter>
      )
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
  }

  it('renders equipment status chips with WAI-ARIA roving focus (tabIndex=0 for active, tabIndex=-1 for inactive)', async () => {
    await mount('/inventory')

    const chipTrack = container.querySelector('.inventory-chip-track')
    expect(chipTrack).not.toBeNull()
    expect(chipTrack?.getAttribute('role')).toBe('tablist')
    expect(chipTrack?.getAttribute('aria-label')).toBe('Equipment status')

    const tabs = Array.from(chipTrack!.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    expect(tabs.length).toBeGreaterThanOrEqual(3) // All, In Stock, On Rent

    // Default active is "All"
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true')
    expect(tabs[0]?.getAttribute('tabindex')).toBe('0')
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('false')
    expect(tabs[1]?.getAttribute('tabindex')).toBe('-1')
  })

  it('supports roving keyboard navigation across equipment status chips via Arrow keys and Home/End', async () => {
    await mount('/inventory')

    const chipTrack = container.querySelector('.inventory-chip-track')
    const tabs = Array.from(chipTrack!.querySelectorAll<HTMLButtonElement>('[role="tab"]'))

    // Press ArrowRight on "All" -> switches to "In Stock"
    await act(async () => {
      tabs[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })

    const updated1 = Array.from(chipTrack!.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    expect(updated1[1]?.getAttribute('aria-selected')).toBe('true')
    expect(updated1[1]?.getAttribute('tabindex')).toBe('0')
    expect(updated1[0]?.getAttribute('tabindex')).toBe('-1')

    // Press End -> switches to the last primary chip
    await act(async () => {
      updated1[1]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    })

    const updated2 = Array.from(chipTrack!.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    const lastIndex = updated2.length - 1
    expect(updated2[lastIndex]?.getAttribute('aria-selected')).toBe('true')
    expect(updated2[lastIndex]?.getAttribute('tabindex')).toBe('0')

    // Press Home -> switches back to first chip ("All")
    await act(async () => {
      updated2[lastIndex]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    })

    const updated3 = Array.from(chipTrack!.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    expect(updated3[0]?.getAttribute('aria-selected')).toBe('true')
    expect(updated3[0]?.getAttribute('tabindex')).toBe('0')
  })

  it('enforces minHeight >= 44px on all filter chips and segmented control tabs', async () => {
    await mount('/inventory')

    const filterChips = Array.from(container.querySelectorAll<HTMLButtonElement>('.inventory-filter-chip'))
    for (const chip of filterChips) {
      const minH = chip.style.minHeight || window.getComputedStyle(chip).minHeight
      expect(minH === '44px' || minH === 'var(--tap)' || minH === 'var(--tap, 44px)').toBe(true)
    }

    const sectionTabs = Array.from(container.querySelectorAll<HTMLButtonElement>('.segmented-control button[role="tab"]'))
    expect(sectionTabs.length).toBeGreaterThan(0)
    for (const tab of sectionTabs) {
      const minH = tab.style.minHeight || window.getComputedStyle(tab).minHeight
      expect(minH === '44px' || minH === 'var(--tap)' || minH === 'var(--tap, 44px)').toBe(true)
    }
  })
})
