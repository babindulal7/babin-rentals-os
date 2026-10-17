// @vitest-environment jsdom
/**
 * Phase 6 Task 3.4 — the five states on the reports that were blocked on
 * Law 16 (they used to draw seed figures on failure). Each report's query is
 * replaced by a controllable promise:
 *
 *   - a failing query draws the inline banner + Retry, never a figure, and
 *     Retry re-sends the read;
 *   - an offline failure is worded as offline;
 *   - an empty read draws nothing-yet;
 *   - a money-blind role is refused without the read being sent, or — on the
 *     mixed reports — sees no rupee figure.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { SystemRole } from '../../../types/database'

type Fn = () => Promise<unknown>
const state = vi.hoisted(() => ({
  role: 'Owner' as SystemRole,
  answers: {} as Record<string, () => Promise<unknown>>,
}))
const answer = (key: string) => () => (state.answers[key] ?? (() => new Promise(() => {})))()

vi.mock('../../../lib/supabase', () => ({ IS_MOCK: true, supabase: {} }))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u-1', name: 'Test User', role: state.role } }),
}))
vi.mock('../../../lib/queries/rentalReports', () => ({
  getRentalPerformanceReport: vi.fn(answer('rental')),
  getRentalDurationReport: vi.fn(answer('rentalDuration')),
  getCancellationsReport: vi.fn(answer('rentalCancel')),
}))
vi.mock('../../../lib/queries/operationReports', () => ({ getOperationsReport: vi.fn(answer('ops')) }))
vi.mock('../../../lib/queries/damageMaintenanceReports', () => ({ getDamageMaintenanceReport: vi.fn(answer('dm')) }))
vi.mock('../../../lib/queries/salesVatReports', () => ({ getSalesVatReport: vi.fn(answer('sales')) }))
vi.mock('../../../lib/queries/activityReports', () => ({ getActivityReport: vi.fn(answer('activity')) }))
vi.mock('../../../lib/queries/reportRevenueTrend', () => ({ getIssuedRevenueTrend: vi.fn(answer('revenue')) }))
vi.mock('../../../lib/queries/assetRoi', () => ({ getFleetAssetRoiSummary: vi.fn(answer('roi')) }))
vi.mock('../../../lib/queries/staffReports', () => ({ getStaffReportsSummary: vi.fn(answer('staff')) }))
vi.mock('../../../lib/queries/equipmentPerformance', () => ({ getEquipmentPerformanceSummary: vi.fn(answer('equipment')) }))
vi.mock('../../../lib/queries/productReports', () => ({ getProductReportsSummary: vi.fn(answer('product')) }))
vi.mock('../../../lib/queries/promotionsReports', () => ({ getPromotionsReportsSummary: vi.fn(answer('promotions')) }))
vi.mock('../../../lib/queries/clientReports', () => ({ getClientReportsSummary: vi.fn(answer('client')) }))
vi.mock('../../../lib/queries/liquidity', () => ({
  getCashFlowSummary: vi.fn(answer('cash')),
  getWorkingCapitalSummary: vi.fn(answer('wc')),
}))
vi.mock('../../../components/ui/charts/InteractiveRevenueTrend', () => ({ InteractiveRevenueTrend: () => null }))

window.matchMedia = ((q: string) => ({
  matches: false, media: q, onchange: null,
  addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const pages = {
  RentalReports: (await import('../RentalReports')).default,
  OperationsReports: (await import('../OperationsReports')).default,
  DamageMaintenanceReports: (await import('../DamageMaintenanceReports')).default,
  SalesVatReports: (await import('../SalesVatReports')).default,
  ActivityReports: (await import('../ActivityReports')).default,
  RevenueReport: (await import('../RevenueReport')).default,
  AssetRoiReport: (await import('../AssetRoiReport')).default,
  StaffReports: (await import('../StaffReports')).default,
  EquipmentPerformance: (await import('../EquipmentPerformance')).default,
  ProductReports: (await import('../ProductReports')).default,
  PromotionsReports: (await import('../PromotionsReports')).default,
  ClientReports: (await import('../ClientReports')).default,
  CashFlowReport: (await import('../CashFlowReport')).default,
  WorkingCapitalReport: (await import('../WorkingCapitalReport')).default,
}
const q = {
  sales: (await import('../../../lib/queries/salesVatReports')).getSalesVatReport,
  roi: (await import('../../../lib/queries/assetRoi')).getFleetAssetRoiSummary,
  staff: (await import('../../../lib/queries/staffReports')).getStaffReportsSummary,
  equipment: (await import('../../../lib/queries/equipmentPerformance')).getEquipmentPerformanceSummary,
  promotions: (await import('../../../lib/queries/promotionsReports')).getPromotionsReportsSummary,
  cash: (await import('../../../lib/queries/liquidity')).getCashFlowSummary,
  wc: (await import('../../../lib/queries/liquidity')).getWorkingCapitalSummary,
  revenue: (await import('../../../lib/queries/reportRevenueTrend')).getIssuedRevenueTrend,
  client: (await import('../../../lib/queries/clientReports')).getClientReportsSummary,
}

let container: HTMLDivElement
let root: Root
async function render(Page: () => React.ReactElement | null) {
  await act(async () => root.render(<MemoryRouter><Page /></MemoryRouter>))
}
const text = () => container.textContent ?? ''
const retry = () => [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Retry')
const fail: Fn = () => Promise.reject(new Error('500 Internal Server Error'))

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  state.role = 'Owner'
  state.answers = {}
  Object.values(q).forEach((fn) => vi.mocked(fn).mockClear())
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
})

/* ── Empty shapes each query returns for an empty database ───────────────── */
const P = 0 as never
const empties: Record<string, unknown> = {
  rental: { metrics: { totalBookings: 0, activeRentals: 0, completedRentals: 0, cancelledRentals: 0, totalRevenue: P, averageBookingValue: P, totalRentalDays: 0, averageDurationDays: 0 }, stages: [], projectTypes: [], topBookings: [] },
  rentalDuration: { totalRentals: 0, averageDuration: 0, medianDuration: 0, longestDuration: 0, shortestDuration: 0, buckets: [] },
  rentalCancel: { totalCancellations: 0, cancellationRate: 0, totalLostRevenue: P, averageNoticeDays: null, reasons: [], cancelledBookings: [] },
  ops: { metrics: { totalPickups: 0, onTimePickupRate: null, totalReturns: 0, onTimeReturnRate: null, currentlyOverdue: 0, totalPackingJobs: 0, packingFulfillmentRate: null, idVerificationRate: null }, deliveryMethods: [], returnConditions: [], pickups: [], returns: [], overdueList: [], packingJobs: [] },
  dm: { metrics: { totalFindings: 0, totalDamageCost: P, totalChargedToClient: P, activeRepairs: 0, averageTurnaroundDays: null, totalRepairSpend: P, routineServicesCompleted: 0, fleetAvailabilityRate: null, sidelinedUnitsCount: 0, rentalReadyUnits: 0 }, severityBreakdown: [], damageTypeBreakdown: [], incidents: [], repairs: [], servicing: [], sidelinedUnits: [] },
  sales: { sales: { metrics: { totalInvoiced: P, netSales: P, totalVat: P, totalDiscounts: P, totalCollected: P, totalOutstanding: P, invoiceCount: 0, collectionRate: 0 }, statusBreakdown: [], monthlyTrend: [], topClients: [], invoices: [] }, vat: { metrics: { totalGrossTurnover: P, taxableTurnover: P, totalOutputVat: P, exemptTurnover: P, effectiveVatRate: 0, invoicesCount: 0 }, monthlySchedule: [], taxRegister: [] } },
  activity: { metrics: { totalEvents: 0, successfulEvents: 0, failedEvents: 0, criticalEvents: 0, activeOperators: 0, mostActiveModule: 'None', mostActiveOperator: 'None' }, eventsByCategory: [], eventsBySeverity: [], staffSummaries: [], recentEvents: [] },
  revenue: { fromAd: '2026-07-18', toAd: '2026-10-16', months: [], totalPaisa: 0, issuedCount: 0, creditReconciliation: { creditNoteCount: 0, creditNoteAmountPaisa: 0, voidedTaxablePaisa: 0, voidedInvoiceCount: 0, paidVoidMismatchCount: 0, activeInvoiceCreditNoteCount: 0 } },
  roi: { totalCapitalInvestedPaisa: P, unpricedUnits: 0, totalInvoicedRevenuePaisa: null, totalMaintenanceExpensePaisa: P, netFleetReturnPaisa: null, fleetRoiPercent: null, averageMaintenanceDragPercent: null, rows: [] },
  staff: { rows: [], totals: { bookingsCreated: 0, bookingValue: P, collections: P, sessionsCompleted: 0 } },
  equipment: { revenue: P, productsRented: 0, rows: [], topPerformers: [], worstPerformers: [] },
  product: { productCount: 0, activeProducts: 0, productsBooked: 0, revenue: P, byCategory: [], topRevenue: [], notBooked: [], lowStock: [] },
  promotions: { couponCount: 0, activeCoupons: 0, redemptionCount: 0, discountsGiven: P, promotionRevenue: P, returnOnPromotion: null, coupons: [], discountSources: [], bundles: [] },
  client: { totalClients: 0, activeClients: 0, newClients: 0, members: 0, bookedClients: 0, repeatClients: 0, frequency: [], topClients: [], money: null },
  cash: { collected: P, refunds: P, expensesPaid: P, expensesByCategory: [], netOperatingCash: P, depositsReceived: P, depositsReleased: P, invoiced: P, collectionRatePct: null, openingCash: null, closingCash: null, capitalSpend: null, runwayMonths: null },
  wc: { receivables: P, overdueReceivables: P, ageing: [], depositsHeld: P, approvedUnpaidExpenses: P, daysSalesOutstanding: null, cash: null, workingCapital: null, currentRatio: null },
}

/* page · its query keys · the noun in "Could not load …" · the nothing-yet title */
const table: [keyof typeof pages, string[], string, string][] = [
  ['RentalReports', ['rental', 'rentalDuration', 'rentalCancel'], 'rental figures', 'No bookings yet'],
  ['OperationsReports', ['ops'], 'operations figures', 'No operations yet'],
  ['DamageMaintenanceReports', ['dm'], 'damage and maintenance figures', 'No damage or maintenance recorded yet'],
  ['SalesVatReports', ['sales'], 'sales and VAT figures', 'No invoices issued yet'],
  ['ActivityReports', ['activity'], 'activity', 'No activity recorded yet'],
  ['RevenueReport', ['revenue'], 'revenue', 'No invoices issued in the last 90 days'],
  ['AssetRoiReport', ['roi'], 'asset figures', 'No equipment units yet'],
  ['StaffReports', ['staff'], 'staff figures', 'No staff activity yet'],
  ['EquipmentPerformance', ['equipment'], 'equipment figures', 'No equipment yet'],
  ['ProductReports', ['product'], 'product figures', 'No products yet'],
  ['PromotionsReports', ['promotions'], 'promotion figures', 'No promotions yet'],
  ['ClientReports', ['client'], 'client figures', 'No clients yet'],
  ['CashFlowReport', ['cash'], 'cash figures', 'No cash movement recorded yet'],
  ['WorkingCapitalReport', ['wc'], 'working capital', 'Nothing open right now'],
]

describe.each(table)('%s', (name, keys, noun, nothingYet) => {
  it('loading, then a failing query draws banner + Retry (no figure), and Retry recovers to nothing-yet', async () => {
    await render(pages[name])
    expect(text()).toContain(`Loading ${noun}…`)

    act(() => root.unmount())
    root = createRoot(container)
    keys.forEach((k) => (state.answers[k] = fail))
    await render(pages[name])
    expect(text()).toContain(`Could not load ${noun}`)
    expect(text()).toContain('500 Internal Server Error')
    expect(text()).not.toMatch(/Rs\s?[1-9]/)
    expect(retry()).toBeDefined()

    keys.forEach((k) => (state.answers[k] = () => Promise.resolve(empties[k])))
    await act(async () => retry()?.click())
    expect(text()).toContain(nothingYet)
    expect(text()).not.toContain('Could not load')
  })

  it('an offline failure says so and offers Retry', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    keys.forEach((k) => (state.answers[k] = () => Promise.reject(new TypeError('Failed to fetch'))))
    await render(pages[name])
    expect(text()).toContain('This device is offline')
    expect(retry()).toBeDefined()
  })
})

describe('restricted roles', () => {
  const moneyOnly: [keyof typeof pages, keyof typeof q][] = [
    ['SalesVatReports', 'sales'],
    ['AssetRoiReport', 'roi'],
    ['StaffReports', 'staff'],
    ['EquipmentPerformance', 'equipment'],
    ['PromotionsReports', 'promotions'],
    ['CashFlowReport', 'cash'],
    ['WorkingCapitalReport', 'wc'],
    ['RevenueReport', 'revenue'],
  ]
  it.each(moneyOnly)('%s refuses a money-blind role without sending the read', async (name, key) => {
    state.role = 'Warehouse'
    await render(pages[name])
    expect(text()).toContain('Access restricted')
    expect(q[key]).not.toHaveBeenCalled()
    expect(text()).not.toMatch(/Rs\s?\d/)
  })

  it('Client Reports asks for no money for a money-blind role', async () => {
    state.role = 'Warehouse'
    state.answers['client'] = () => Promise.resolve({ ...(empties['client'] as object), totalClients: 3, activeClients: 3 })
    await render(pages.ClientReports)
    expect(vi.mocked(q.client).mock.calls[0]?.[1]).toMatchObject({ includeMoney: false })
    expect(text()).not.toContain('Receivables')
  })

  it('Rental Reports shows counts but no rupee figure to a money-blind role', async () => {
    state.role = 'Warehouse'
    state.answers['rental'] = () =>
      Promise.resolve({
        ...(empties['rental'] as object),
        metrics: { ...(empties['rental'] as { metrics: object }).metrics, totalBookings: 2, totalRevenue: 500000, averageBookingValue: 250000 },
        topBookings: [{ id: 'b', bookingNo: 'BK-2026-0001', clientName: 'A', project: 'P', days: 2, stage: 'Closed', value: 500000 }],
      })
    state.answers['rentalDuration'] = () => Promise.resolve(empties['rentalDuration'])
    state.answers['rentalCancel'] = () => Promise.resolve(empties['rentalCancel'])
    await render(pages.RentalReports)
    expect(text()).toContain('Total Bookings')
    expect(text()).not.toMatch(/Rs\s?\d/)
  })
})

describe('filtered empty is "nothing in this period", not "nothing yet"', async () => {
  const { hasReportFilters, reportFilterOptions } = await import('../reportStates')
  it('a period or a chip counts as a filter; nothing set does not', () => {
    expect(hasReportFilters({})).toBe(false)
    expect(hasReportFilters({ dateRange: { column: 'pickup_at', fromAd: '2026-10-01T00:00:00Z' } })).toBe(true)
    expect(hasReportFilters({ chips: { branch_id: ['b1'] } })).toBe(true)
    expect(hasReportFilters({ chips: { branch_id: [] } })).toBe(false)
  })
  it('the toolbar filters become the query options', () => {
    expect(
      reportFilterOptions({ dateRange: { column: 'pickup_at', fromAd: 'a', toAd: 'b' }, chips: { branch_id: ['b1'] } }),
    ).toEqual({ from: 'a', to: 'b', branchId: 'b1' })
  })
})
