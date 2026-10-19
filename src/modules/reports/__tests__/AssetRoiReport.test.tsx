// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import AssetRoiReport from '../AssetRoiReport'
import { computeFleetSummary, type UnitRoiRow } from '../../../lib/queries/assetRoi'
import { rupees } from '../../../lib/money'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
})

const state = vi.hoisted(() => ({
  canSeeMoney: true,
}))

vi.mock('../../../lib/moneyVisibility', () => ({
  useCanViewMoney: () => state.canSeeMoney,
}))

// One real-shaped unit. The report used to fall back to five invented seed
// units (CAM-001 "RED Komodo") and estimate revenue as price × 1.6 (Law 16).
vi.mock('../../../lib/supabase', async () => {
  const { fakeSupabase } = await import('../../../lib/queries/__tests__/fakeSupabase')
  return {
    supabase: fakeSupabase({
      product_units_v: [{ id: 'u1', asset_tag: 'CAM-101', serial_no: 'SN-1', product_id: 'p1', purchase_price: 950000, purchase_date: '2026-01-01', created_at: null, retired_at: null }],
      products: [{ id: 'p1', name: 'Sony FX6', category_id: null }],
    }).client,
  }
})

describe('computeFleetSummary (Pillar 4 calculations)', () => {
  it('correctly aggregates capital, revenue, maintenance, and ROI', () => {
    const testRows: UnitRoiRow[] = [
      {
        unitId: 'u-1',
        assetTag: 'TAG-1',
        serialNo: 'SN-1',
        productName: 'Cinema Camera',
        category: 'Cameras',
        purchasePricePaisa: rupees(100000),
        lifetimeRevenuePaisa: rupees(200000),
        maintenanceCostPaisa: rupees(10000),
        netProfitPaisa: rupees(90000),
        roiPercent: 90,
        maintenanceDragPercent: 5,
        utilizationPercent: 80,
        daysOwned: 200,
      },
      {
        unitId: 'u-2',
        assetTag: 'TAG-2',
        serialNo: 'SN-2',
        productName: 'Studio Light',
        category: 'Lighting',
        purchasePricePaisa: rupees(50000),
        lifetimeRevenuePaisa: rupees(40000),
        maintenanceCostPaisa: rupees(5000),
        netProfitPaisa: rupees(-15000),
        roiPercent: -30,
        maintenanceDragPercent: 12.5,
        utilizationPercent: 40,
        daysOwned: 150,
      },
    ]

    const summary = computeFleetSummary(testRows)

    expect(summary.totalCapitalInvestedPaisa).toBe(rupees(150000))
    expect(summary.totalInvoicedRevenuePaisa).toBe(rupees(240000))
    expect(summary.unpricedUnits).toBe(0)
    expect(summary.totalMaintenanceExpensePaisa).toBe(rupees(15000))
    expect(summary.netFleetReturnPaisa).toBe(rupees(75000))
    expect(summary.fleetRoiPercent).toBe(50.0)
    expect(summary.averageMaintenanceDragPercent).toBe(6.3)
  })
})

describe('AssetRoiReport UI Component', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    state.canSeeMoney = true
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('renders restricted state when user cannot view money (Law 6)', async () => {
    state.canSeeMoney = false

    await act(async () => {
      root.render(<AssetRoiReport />)
    })

    const bodyText = document.body.textContent || ''
    expect(bodyText).toContain('Access restricted')
    expect(bodyText).toContain('financial currency')
    expect(bodyText).not.toContain('Total Capital Invested')
  })

  it('renders full ROI metrics and table when user has financial access', async () => {
    state.canSeeMoney = true

    await act(async () => {
      root.render(<AssetRoiReport />)
    })

    // Allow promise resolution
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    const bodyText = document.body.textContent || ''
    expect(bodyText).toContain('Asset ROI & True Cost of Ownership')
    expect(bodyText).toContain('Total Capital Invested')
    expect(bodyText).toContain('Lifetime Rental Revenue')
    expect(bodyText).toContain('Fleet Net Margin')
    expect(bodyText).toContain('CAM-101')
    expect(bodyText).toContain('Sony FX6')
    expect(bodyText).toContain('Rs 9,50,000')
    // Revenue has no per-unit source: it says so instead of estimating it.
    expect(bodyText).toContain('Not tracked yet')
    expect(bodyText).not.toContain('RED Komodo')
  })
})
