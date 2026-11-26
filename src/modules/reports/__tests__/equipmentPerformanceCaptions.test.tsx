// @vitest-environment jsdom
/**
 * R2-D2, audit key sweep-C-finance-reports-1-17. The Top and Lowest tables are
 * captioned with the number of rows they draw. A query that returns three
 * products must not be captioned as a top five.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { rupees } from '../../../lib/money'
import type { EquipmentPerformanceRow, EquipmentPerformanceSummary } from '../../../lib/queries/equipmentPerformance'
import EquipmentPerformance from '../EquipmentPerformance'

const state = vi.hoisted(() => ({ summary: null as EquipmentPerformanceSummary | null }))

vi.mock('../../../lib/supabase', () => ({ IS_MOCK: true, supabase: {} }))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u-1', name: 'Test User', role: 'Owner' } }),
}))
vi.mock('../../../lib/queries/equipmentPerformance', () => ({
  getEquipmentPerformanceSummary: vi.fn(async () => state.summary),
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

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

function product(productId: string, name: string, revenueRs: number, units: number): EquipmentPerformanceRow {
  return {
    productId,
    name,
    category: 'Camera',
    revenue: rupees(revenueRs),
    bookings: 2,
    units,
    revenuePerUnit: units > 0 ? rupees(Math.round(revenueRs / units)) : null,
  }
}

/* Three products, as the query would return them. */
const THREE = [
  product('p1', 'Sony FX3', 240000, 2),
  product('p2', 'Canon R5 C', 180000, 3),
  product('p3', 'Boom Pole Carbon 3m', 1500, 1),
]

function summaryOf(rows: EquipmentPerformanceRow[]): EquipmentPerformanceSummary {
  return {
    revenue: rupees(rows.reduce((total, r) => total + (r.revenue as number), 0)),
    productsRented: rows.length,
    rows,
    topPerformers: [...rows].sort((a, b) => b.revenue - a.revenue),
    worstPerformers: rows
      .filter((r) => r.units > 0)
      .sort((a, b) => (a.revenuePerUnit ?? 0) - (b.revenuePerUnit ?? 0)),
  }
}

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  if (root && container) {
    act(() => {
      root!.unmount()
    })
  }
  container?.remove()
  container = null
  root = null
})

async function renderWith(summary: EquipmentPerformanceSummary) {
  state.summary = summary
  await act(async () => {
    root!.render(
      <MemoryRouter>
        <EquipmentPerformance />
      </MemoryRouter>,
    )
  })
  // Let the read resolve and the tables draw.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe('Equipment Performance captions', () => {
  it('captions both tables with the three rows they draw, not a fixed five', async () => {
    await renderWith(summaryOf(THREE))
    const text = container?.textContent ?? ''

    expect(text).toContain('Top 3 products by revenue.')
    expect(text).toContain('Lowest 3 products by revenue per unit, lowest first.')
    expect(text).not.toMatch(/Top 5|Lowest 5/)
  })

  it('uses the singular for a single product', async () => {
    await renderWith(summaryOf(THREE.slice(0, 1)))
    const text = container?.textContent ?? ''

    expect(text).toContain('Top 1 product by revenue.')
    expect(text).toContain('Lowest 1 product by revenue per unit, lowest first.')
  })
})
