// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { ReportFamiliesNav } from '../../../components/ui/ReportFamiliesNav'
import {
  REPORT_GROUPS,
  ALL_REPORTS,
  getVisibleGroups,
  getVisibleReports,
  getReportPinsStorageKey,
} from '../../../lib/reportsNav'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const state = vi.hoisted(() => ({
  canSeeMoney: true,
  user: { id: 'test-user-123' },
}))

vi.mock('../../../lib/moneyVisibility', () => ({
  useCanViewMoney: () => state.canSeeMoney,
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: state.user,
    role: state.canSeeMoney ? 'Owner' : 'Warehouse',
    permissions: [],
    loading: false,
    error: null,
  }),
}))

describe('ReportFamiliesNav (Card 7, G-13)', () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    state.canSeeMoney = true
    state.user = { id: 'test-user-123' }
    window.localStorage.clear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    if (root && container) {
      act(() => {
        root!.unmount()
      })
      container.remove()
    }
    container = null
    root = null
    window.localStorage.clear()
  })

  it('contains exactly 5 groups in the ruling order (G-13)', () => {
    expect(REPORT_GROUPS).toHaveLength(5)
    const labels = REPORT_GROUPS.map((g) => g.label)
    expect(labels).toEqual(['Money', 'Rentals', 'Equipment', 'Clients', 'Team'])
  })

  it('contains all 22 active reports registered across the 5 groups', () => {
    // 21 reports from G-13 table + Crew TDS (added to Money)
    expect(ALL_REPORTS).toHaveLength(22)

    const moneyReports = ALL_REPORTS.filter((r) => r.group === 'money').map((r) => r.label)
    expect(moneyReports).toEqual([
      'Revenue',
      'Sales Register',
      'VAT / Tax',
      'Crew TDS',
      'Expenses',
      'Cash Flow',
      'Working Capital',
      'Promotions',
    ])

    const rentalsReports = ALL_REPORTS.filter((r) => r.group === 'rentals').map((r) => r.label)
    expect(rentalsReports).toEqual([
      'Pulse',
      'Rental Reports',
      'Operations',
      'Forecasting',
      'Custom',
    ])

    const equipmentReports = ALL_REPORTS.filter((r) => r.group === 'equipment').map((r) => r.label)
    expect(equipmentReports).toEqual([
      'Inventory',
      'Product',
      'Equipment Performance',
      'Asset ROI',
      'Damage & Maintenance',
      'Cases',
    ])

    const clientsReports = ALL_REPORTS.filter((r) => r.group === 'clients').map((r) => r.label)
    expect(clientsReports).toEqual(['Client Ledger'])

    const teamReports = ALL_REPORTS.filter((r) => r.group === 'team').map((r) => r.label)
    expect(teamReports).toEqual(['Staff Performance', 'Activity'])
  })

  it('all 22 reports have valid /reports/... URLs', () => {
    for (const report of ALL_REPORTS) {
      expect(report.to).toMatch(/^\/reports\//)
      expect(report.id).toBeTruthy()
    }
  })

  it('renders all 5 group tabs for money-privileged roles', async () => {
    await act(async () => {
      root!.render(
        <MemoryRouter>
          <ReportFamiliesNav current="Pulse" />
        </MemoryRouter>,
      )
    })

    const groupTabs = Array.from(container?.querySelectorAll('[role="tab"]') ?? [])
    const tabLabels = groupTabs.map((t) => t.textContent?.trim())
    expect(tabLabels).toEqual(['Money', 'Rentals', 'Equipment', 'Clients', 'Team'])
  })

  it('completely omits Money and Clients groups from the DOM for money-blind roles (Law 6, G-13)', async () => {
    state.canSeeMoney = false

    await act(async () => {
      root!.render(
        <MemoryRouter>
          <ReportFamiliesNav current="Pulse" />
        </MemoryRouter>,
      )
    })

    const groupTabs = Array.from(container?.querySelectorAll('[role="tab"]') ?? [])
    const tabLabels = groupTabs.map((t) => t.textContent?.trim())
    expect(tabLabels).toEqual(['Rentals', 'Equipment', 'Team'])
    expect(tabLabels).not.toContain('Money')
    expect(tabLabels).not.toContain('Clients')

    // Verify no money-gated report appears anywhere in the DOM
    const allLinks = Array.from(container?.querySelectorAll('a') ?? [])
    const linkHrefs = allLinks.map((a) => a.getAttribute('href'))

    expect(linkHrefs).not.toContain('/reports/revenue')
    expect(linkHrefs).not.toContain('/reports/sales')
    expect(linkHrefs).not.toContain('/reports/vat-tax')
    expect(linkHrefs).not.toContain('/reports/tds')
    expect(linkHrefs).not.toContain('/reports/expenses')
    expect(linkHrefs).not.toContain('/reports/cash-flow')
    expect(linkHrefs).not.toContain('/reports/working-capital')
    expect(linkHrefs).not.toContain('/reports/promotions')
    expect(linkHrefs).not.toContain('/reports/clients')
    expect(linkHrefs).not.toContain('/reports/asset-roi')

    // Visible reports for money-blind must be exactly 12 (Asset ROI is money: true)
    const visibleReports = getVisibleReports(false)
    expect(visibleReports).toHaveLength(12)
    const visibleGroups = getVisibleGroups(false)
    expect(visibleGroups.map((g) => g.key)).toEqual(['rentals', 'equipment', 'team'])
  })

  it('allows reaching any report in at most 2 taps (Tap 1: group tab, Tap 2: report link)', async () => {
    await act(async () => {
      root!.render(
        <MemoryRouter>
          <ReportFamiliesNav current="Pulse" />
        </MemoryRouter>,
      )
    })

    // On mount, current="Pulse" auto-selects Rentals group
    let reportsStrip = container?.querySelector('[data-testid="group-reports-strip"]')
    expect(reportsStrip?.textContent ?? '').toContain('Pulse')
    expect(reportsStrip?.textContent ?? '').toContain('Rental Reports')
    expect(reportsStrip?.textContent ?? '').not.toContain('Cases')

    // Tap 1: Select "Equipment" group tab
    const equipmentTab = Array.from(container?.querySelectorAll('[role="tab"]') ?? []).find(
      (t) => t.textContent?.trim() === 'Equipment',
    )
    expect(equipmentTab).toBeTruthy()

    await act(async () => {
      equipmentTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Tap 2: Reports strip now shows Equipment reports including Cases
    reportsStrip = container?.querySelector('[data-testid="group-reports-strip"]')
    expect(reportsStrip?.textContent ?? '').toContain('Cases')
    expect(reportsStrip?.textContent ?? '').toContain('Inventory')

    const casesLink = Array.from(reportsStrip?.querySelectorAll('a') ?? []).find(
      (a) => a.textContent?.trim() === 'Cases',
    )
    expect(casesLink).toBeTruthy()
    expect(casesLink?.getAttribute('href')).toBe('/reports/cases')
  })

  it('auto-selects the group containing the current report', async () => {
    await act(async () => {
      root!.render(
        <MemoryRouter>
          <ReportFamiliesNav current="Cases" />
        </MemoryRouter>,
      )
    })

    const activeTab = container?.querySelector('[role="tab"][aria-selected="true"]')
    expect(activeTab?.textContent?.trim()).toBe('Equipment')

    const casesLink = Array.from(container?.querySelectorAll('a') ?? []).find(
      (a) => a.textContent?.trim() === 'Cases',
    )
    expect(casesLink?.getAttribute('aria-current')).toBe('page')
  })

  it('supports pinning reports and persists them in safeStorage per user (G-13)', async () => {
    const key = getReportPinsStorageKey('test-user-123')

    await act(async () => {
      root!.render(
        <MemoryRouter>
          <ReportFamiliesNav current="Pulse" />
        </MemoryRouter>,
      )
    })

    // Default pins are rendered in the pinned reports strip
    const pinnedStrip = container?.querySelector('[data-testid="pinned-reports-strip"]')
    expect(pinnedStrip).toBeTruthy()
    expect(pinnedStrip?.textContent ?? '').toContain('Pinned:')

    // Toggle pin on "Operations" (in Rentals group)
    const pinOpsBtn = container?.querySelector('button[aria-label="Pin Operations"]') as HTMLButtonElement
    expect(pinOpsBtn).toBeTruthy()

    await act(async () => {
      pinOpsBtn.click()
    })

    // Verify stored in safeStorage
    const storedPins = JSON.parse(window.localStorage.getItem(key)!)
    expect(storedPins).toContain('/reports/operations')

    // Verify Operations is now in the pinned strip
    const updatedPinnedStrip = container?.querySelector('[data-testid="pinned-reports-strip"]')
    expect(updatedPinnedStrip?.textContent ?? '').toContain('Operations')
  })

  it('filters money-gated pinned reports for money-blind roles', async () => {
    // Pin a money report and a non-money report
    const key = getReportPinsStorageKey('test-user-123')
    window.localStorage.setItem(key, JSON.stringify(['/reports/revenue', '/reports/rentals']))

    state.canSeeMoney = false

    await act(async () => {
      root!.render(
        <MemoryRouter>
          <ReportFamiliesNav current="Rentals" />
        </MemoryRouter>,
      )
    })

    const pinnedStrip = container?.querySelector('[data-testid="pinned-reports-strip"]')
    expect(pinnedStrip?.textContent ?? '').toContain('Rental Reports')
    expect(pinnedStrip?.textContent ?? '').not.toContain('Revenue')
  })
})
