import { readLocal, writeLocal } from './safeStorage'

/**
 * RULING 2026-11-10: G-13 — 5 groups + pinned reports
 *
 * Reports open on five groups: Money · Rentals · Equipment · Clients · Team.
 * Each user can pin reports; pinned ones show first.
 * No report is removed and no report URL changes.
 */

export type ReportGroupKey = 'money' | 'rentals' | 'equipment' | 'clients' | 'team'

export interface ReportNavItem {
  id: string
  label: string
  to: string
  money: boolean
  group: ReportGroupKey
  desc?: string
}

export interface ReportGroupDef {
  key: ReportGroupKey
  label: string
}

export const REPORT_GROUPS: readonly ReportGroupDef[] = [
  { key: 'money', label: 'Money' },
  { key: 'rentals', label: 'Rentals' },
  { key: 'equipment', label: 'Equipment' },
  { key: 'clients', label: 'Clients' },
  { key: 'team', label: 'Team' },
] as const

/**
 * All 22 report routes registered in the system.
 * 21 from G-13 table + Crew TDS (missing from ruling table, grouped under Money).
 */
export const ALL_REPORTS: readonly ReportNavItem[] = [
  // Money (8 reports, all money: true)
  { id: 'revenue', label: 'Revenue', to: '/reports/revenue', money: true, group: 'money' },
  { id: 'sales', label: 'Sales Register', to: '/reports/sales', money: true, group: 'money' },
  { id: 'vat-tax', label: 'VAT / Tax', to: '/reports/vat-tax', money: true, group: 'money' },
  // Missing from G-13 ruling table; registered in Money as Crew TDS
  { id: 'tds', label: 'Crew TDS', to: '/reports/tds', money: true, group: 'money' },
  { id: 'expenses', label: 'Expenses', to: '/reports/expenses', money: true, group: 'money' },
  { id: 'cash-flow', label: 'Cash Flow', to: '/reports/cash-flow', money: true, group: 'money' },
  { id: 'working-capital', label: 'Working Capital', to: '/reports/working-capital', money: true, group: 'money' },
  { id: 'promotions', label: 'Promotions', to: '/reports/promotions', money: true, group: 'money' },

  // Rentals (5 reports, money: false)
  { id: 'pulse', label: 'Pulse', to: '/reports/pulse', money: false, group: 'rentals' },
  { id: 'rentals', label: 'Rental Reports', to: '/reports/rentals', money: false, group: 'rentals' },
  { id: 'operations', label: 'Operations', to: '/reports/operations', money: false, group: 'rentals' },
  { id: 'forecasting', label: 'Forecasting', to: '/reports/forecasting', money: false, group: 'rentals' },
  { id: 'custom', label: 'Custom', to: '/reports/custom', money: false, group: 'rentals' },

  // Equipment (6 reports, money: false)
  { id: 'inventory', label: 'Inventory', to: '/reports/inventory', money: false, group: 'equipment' },
  { id: 'products', label: 'Product', to: '/reports/products', money: false, group: 'equipment' },
  { id: 'equipment-performance', label: 'Equipment Performance', to: '/reports/equipment-performance', money: false, group: 'equipment' },
  { id: 'asset-roi', label: 'Asset ROI', to: '/reports/asset-roi', money: true, group: 'equipment' },
  { id: 'damage-maintenance', label: 'Damage & Maintenance', to: '/reports/damage-maintenance', money: false, group: 'equipment' },
  { id: 'cases', label: 'Cases', to: '/reports/cases', money: false, group: 'equipment' },

  // Clients (1 report, money: true)
  { id: 'clients', label: 'Client Ledger', to: '/reports/clients', money: true, group: 'clients' },

  // Team (2 reports, money: false)
  { id: 'staff', label: 'Staff Performance', to: '/reports/staff', money: false, group: 'team' },
  { id: 'activity', label: 'Activity', to: '/reports/activity', money: false, group: 'team' },
] as const

export const DEFAULT_PINNED_REPORT_ROUTES: readonly string[] = [
  '/reports/pulse',
  '/reports/revenue',
  '/reports/rentals',
  '/reports/inventory',
]

export function getReportPinsStorageKey(userId?: string | null): string {
  return `babin-rentals:report-pins:${userId ?? 'anonymous'}`
}

export function getReportPins(userId?: string | null): string[] {
  const key = getReportPinsStorageKey(userId)
  const raw = readLocal(key)
  if (!raw) {
    return [...DEFAULT_PINNED_REPORT_ROUTES]
  }
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
      return parsed
    }
  } catch {
    // fallback
  }
  return [...DEFAULT_PINNED_REPORT_ROUTES]
}

export function saveReportPins(userId: string | null | undefined, pins: string[]): void {
  const key = getReportPinsStorageKey(userId)
  writeLocal(key, JSON.stringify(pins))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('babin-rentals:report-pins-change', { detail: { pins } }))
  }
}

export function toggleReportPin(userId: string | null | undefined, route: string): string[] {
  const current = getReportPins(userId)
  const next = current.includes(route)
    ? current.filter((r) => r !== route)
    : [...current, route]
  saveReportPins(userId, next)
  return next
}

export function isReportPinned(userId: string | null | undefined, route: string): boolean {
  return getReportPins(userId).includes(route)
}

export function getVisibleReports(canViewMoney: boolean): readonly ReportNavItem[] {
  return ALL_REPORTS.filter((r) => canViewMoney || !r.money)
}

export function getVisibleGroups(canViewMoney: boolean): readonly ReportGroupDef[] {
  const visible = getVisibleReports(canViewMoney)
  const visibleGroupKeys = new Set(visible.map((r) => r.group))
  return REPORT_GROUPS.filter((g) => visibleGroupKeys.has(g.key))
}

export function findGroupByReport(current: string): ReportGroupKey | null {
  const needle = current.toLowerCase().trim()
  const report = ALL_REPORTS.find(
    (r) =>
      r.id.toLowerCase() === needle ||
      r.label.toLowerCase() === needle ||
      r.to.toLowerCase() === needle ||
      (needle === 'dashboard' && r.id === 'pulse') ||
      (needle === 'maintenance' && r.id === 'damage-maintenance') ||
      (needle === 'finance' && r.id === 'cash-flow') ||
      (needle === 'staff' && r.id === 'staff')
  )
  return report ? report.group : null
}
