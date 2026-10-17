/**
 * Phase 6 Task 3.4 · Law 16 — the report reads that used to resolve to seed
 * data. For each: a failed read THROWS (the page draws Error + Retry), an empty
 * database is an honest empty (never a seed figure), and the fixes that made
 * live reads impossible stay fixed (enum literals, real column names, money
 * read through the `_v` views). RULING 2026-10-16, R-P6-STATES.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fakeSupabase, type TableAnswer, type FakeCall } from './fakeSupabase'
import { rupees } from '../../money'

const state = vi.hoisted(() => ({
  client: null as unknown as { from: (t: string) => unknown },
}))
vi.mock('../../supabase', () => ({
  IS_MOCK: false,
  supabase: { from: (t: string) => state.client.from(t) },
}))

let calls: FakeCall[] = []
function useTables(tables: Record<string, TableAnswer>) {
  const fake = fakeSupabase(tables)
  state.client = fake.client
  calls = fake.calls
}
const filtersOn = (table: string) => calls.filter((c) => c.table === table)
const DOWN = { error: 'permission denied for table x' }

const { getRentalPerformanceReport, getRentalDurationReport, getCancellationsReport } = await import('../rentalReports')
const { getOperationsReport } = await import('../operationReports')
const { getDamageMaintenanceReport } = await import('../damageMaintenanceReports')
const { getSalesVatReport } = await import('../salesVatReports')
const { getActivityReport } = await import('../activityReports')
const { getFleetAssetRoiSummary, computeFleetSummary } = await import('../assetRoi')
const { getStaffReportsSummary } = await import('../staffReports')
const { getEquipmentPerformanceSummary } = await import('../equipmentPerformance')
const { getProductReportsSummary } = await import('../productReports')
const { getPromotionsReportsSummary } = await import('../promotionsReports')
const { getClientReportsSummary } = await import('../clientReports')
const { getCashFlowSummary, getWorkingCapitalSummary } = await import('../liquidity')

beforeEach(() => useTables({}))

describe('every converted read throws on failure instead of returning seed data', () => {
  const cases: [string, string, () => Promise<unknown>][] = [
    ['Rental performance', 'bookings', () => getRentalPerformanceReport()],
    ['Rental duration', 'booking_lines_v', () => getRentalDurationReport()],
    ['Cancellations', 'bookings', () => getCancellationsReport()],
    ['Operations', 'operation_sessions', () => getOperationsReport()],
    ['Damage & Maintenance', 'damage_findings_v', () => getDamageMaintenanceReport()],
    ['Sales/VAT', 'invoices', () => getSalesVatReport()],
    ['Activity', 'audit_events', () => getActivityReport()],
    ['Asset ROI', 'product_units_v', () => getFleetAssetRoiSummary()],
    ['Staff', 'payments', () => getStaffReportsSummary()],
    ['Equipment Performance', 'products', () => getEquipmentPerformanceSummary()],
    ['Product', 'inventory_categories', () => getProductReportsSummary()],
    ['Promotions', 'coupon_redemptions', () => getPromotionsReportsSummary()],
    ['Client', 'clients', () => getClientReportsSummary()],
    ['Cash Flow', 'payments', () => getCashFlowSummary()],
    ['Working Capital', 'security_deposits', () => getWorkingCapitalSummary()],
  ]
  it.each(cases)('%s rejects when %s fails', async (_name, table, run) => {
    useTables({ [table]: DOWN })
    await expect(run()).rejects.toThrow(/permission denied/)
  })
})

describe('an empty database is an honest empty, never a seed figure', () => {
  it('Rental: zero bookings, zero revenue, no invented trend or reasons', async () => {
    const perf = await getRentalPerformanceReport()
    expect(perf.metrics.totalBookings).toBe(0)
    expect(perf.metrics.totalRevenue).toBe(0)
    expect(perf.topBookings).toEqual([])
    expect(perf).not.toHaveProperty('trend')
    const canc = await getCancellationsReport()
    expect(canc.totalCancellations).toBe(0)
    expect(canc.averageNoticeDays).toBeNull()
    expect(canc.reasons).toEqual([])
  })

  it('Operations: no seed sessions, and unmeasured rates are null', async () => {
    const ops = await getOperationsReport()
    expect(ops.pickups).toEqual([])
    expect(ops.overdueList).toEqual([])
    expect(ops.metrics.onTimePickupRate).toBeNull()
    expect(ops.metrics.packingFulfillmentRate).toBeNull()
    expect(ops.metrics.idVerificationRate).toBeNull()
  })

  it('Damage: no seed incidents or sidelined units', async () => {
    const dm = await getDamageMaintenanceReport()
    expect(dm.incidents).toEqual([])
    expect(dm.sidelinedUnits).toEqual([])
    expect(dm.metrics.fleetAvailabilityRate).toBeNull()
    expect(dm.metrics.averageTurnaroundDays).toBeNull()
  })

  it('Sales/VAT, Activity, Asset ROI, Staff, Equipment, Product, Promotions, Client, Cash, WC', async () => {
    expect((await getSalesVatReport()).sales.metrics.invoiceCount).toBe(0)
    expect((await getActivityReport()).metrics.totalEvents).toBe(0)
    expect((await getFleetAssetRoiSummary()).rows).toEqual([])
    expect((await getStaffReportsSummary()).rows).toEqual([])
    expect((await getEquipmentPerformanceSummary()).rows).toEqual([])
    expect((await getProductReportsSummary()).productCount).toBe(0)
    expect((await getPromotionsReportsSummary()).redemptionCount).toBe(0)
    expect((await getClientReportsSummary()).totalClients).toBe(0)
    const cash = await getCashFlowSummary()
    expect(cash.collected).toBe(0)
    expect(cash.closingCash).toBeNull()
    expect((await getWorkingCapitalSummary()).workingCapital).toBeNull()
  })
})

describe('the fixes that made live reads impossible stay fixed', () => {
  it('Rental money comes from booking_lines_v in rupees, not base booking_lines ÷ 100', async () => {
    useTables({
      bookings: [{ id: 'b1', booking_no: 'BK-2026-0001', stage: 'Closed', pickup_at: '2026-09-01T00:00:00Z', return_at: '2026-09-03T00:00:00Z', project: 'Ad', cancelled_at: null }],
      booking_lines_v: [{ booking_id: 'b1', qty: 2, days: 2, rate: 1000, discount_amount: 500, voided_at: null }],
    })
    const perf = await getRentalPerformanceReport()
    expect(perf.metrics.totalRevenue).toBe(rupees(3500))
    expect(perf.metrics.completedRentals).toBe(1)
    expect(calls.some((c) => c.table === 'booking_lines')).toBe(false)
  })

  it('Cancellation is cancelled_at, not stage = "Cancelled"', async () => {
    await getCancellationsReport()
    const bookingFilters = filtersOn('bookings')
    expect(bookingFilters.some((c) => c.method === 'not' && c.args[0] === 'cancelled_at')).toBe(true)
    expect(bookingFilters.some((c) => c.method === 'eq' && c.args[1] === 'Cancelled')).toBe(false)
  })

  it('An unreadable project_type column degrades only that card', async () => {
    const fake = fakeSupabase({})
    const from = (t: string) => {
      const b = fake.client.from(t) as Record<string, unknown>
      if (t !== 'bookings') return b
      const select = b['select'] as (cols: string) => unknown
      b['select'] = (cols: string) =>
        cols.includes('project_type')
          ? { ...(select(cols) as object), then: (r: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { code: '42501', message: 'permission denied for column project_type' } }).then(r) }
          : select(cols)
      return b
    }
    state.client = { from }
    const perf = await getRentalPerformanceReport()
    expect(perf.projectTypes).toBeNull()
  })

  it('Operations reads Handover/Return sessions, not "dispatch"/"return"', async () => {
    await getOperationsReport()
    const inCall = filtersOn('operation_sessions').find((c) => c.method === 'in')
    expect(inCall?.args).toEqual(['operation', ['Handover', 'Return']])
  })

  it('Sales/VAT reads vat_amount/total_amount/pan_vat and leaves Draft and Void out', async () => {
    useTables({
      invoices: [
        { id: 'i1', invoice_no: 'INV-1', client_id: 'c1', status: 'Sent', issue_date: '2026-09-10', due_date: '2026-09-25', subtotal: 1000, discount_amount: 0, taxable_amount: 1000, vat_rate: 0.13, vat_amount: 130, total_amount: 1130, paid_amount: 0, outstanding_amount: 1130, voided_at: null, clients: { name: 'A', pan_vat: '123' } },
      ],
    })
    const { sales, vat } = await getSalesVatReport()
    expect(sales.metrics.totalInvoiced).toBe(rupees(1130))
    expect(vat.metrics.totalOutputVat).toBe(rupees(130))
    expect(vat.metrics.effectiveVatRate).toBe(13)
    expect(sales.invoices[0]?.clientPan).toBe('123')
    expect(vat.monthlySchedule).toHaveLength(1)
    const select = filtersOn('invoices').find((c) => c.method === 'select')?.args[0] as string
    expect(select).not.toMatch(/grand_total|tax_amount|pan_number/)
    expect(filtersOn('invoices').filter((c) => c.method === 'neq').map((c) => c.args[1])).toEqual(['Draft', 'Void'])
  })

  it('Cash Flow counts payments with status "Received" (the enum value), and keeps deposits apart', async () => {
    useTables({
      payments: [
        { amount: 5000, payment_type: 'Advance Payment' },
        { amount: 2000, payment_type: 'Security Deposit' },
        { amount: 500, payment_type: 'Refund' },
      ],
      expenses: [{ amount: 1000, category_id: null }],
    })
    const cash = await getCashFlowSummary()
    expect(filtersOn('payments').some((c) => c.method === 'eq' && c.args[0] === 'status' && c.args[1] === 'Received')).toBe(true)
    expect(calls.some((c) => c.args.includes('Completed'))).toBe(false)
    expect(cash.collected).toBe(rupees(5000))
    expect(cash.netOperatingCash).toBe(rupees(3500))
  })

  it('Asset ROI never estimates revenue from purchase price', async () => {
    useTables({ product_units_v: [{ id: 'u1', asset_tag: 'CAM-1', serial_no: 'S1', product_id: null, purchase_price: 100000, purchase_date: '2026-01-01', created_at: null, retired_at: null }] })
    const roi = await getFleetAssetRoiSummary(new Date('2026-10-16T00:00:00Z'))
    expect(roi.rows[0]?.lifetimeRevenuePaisa).toBeNull()
    expect(roi.rows[0]?.roiPercent).toBeNull()
    expect(roi.totalCapitalInvestedPaisa).toBe(rupees(100000))
    expect(roi.fleetRoiPercent).toBeNull()
  })

  it('Asset ROI: a unit with no purchase price is counted as unpriced, not ₹5,00,000', async () => {
    useTables({ product_units_v: [{ id: 'u1', asset_tag: 'X', serial_no: null, product_id: null, purchase_price: null, purchase_date: null, created_at: null, retired_at: null }] })
    const roi = await getFleetAssetRoiSummary()
    expect(roi.totalCapitalInvestedPaisa).toBe(0)
    expect(roi.unpricedUnits).toBe(1)
  })

  it('computeFleetSummary still computes ROI when revenue is known', () => {
    const s = computeFleetSummary([
      { unitId: 'a', assetTag: 'A', serialNo: null, productName: 'A', category: 'C', purchasePricePaisa: rupees(100), lifetimeRevenuePaisa: rupees(200), maintenanceCostPaisa: rupees(10), netProfitPaisa: rupees(90), roiPercent: 90, maintenanceDragPercent: 5, utilizationPercent: null, daysOwned: 1 },
    ])
    expect(s.fleetRoiPercent).toBe(90)
    expect(s.averageMaintenanceDragPercent).toBe(5)
  })

  it('Staff attributes only rental collections (deposits are not revenue)', async () => {
    useTables({
      users: [{ id: 'u1', full_name: 'Sita', primary_role: 'Accounts' }],
      payments: [{ received_by: 'u1', amount: 1500 }],
    })
    const s = await getStaffReportsSummary()
    expect(filtersOn('payments').some((c) => c.method === 'eq' && c.args[1] === 'Advance Payment')).toBe(true)
    expect(s.rows[0]).toMatchObject({ name: 'Sita', collections: rupees(1500) })
  })

  it('Activity: unresolved names read "—", never "Staff Member"', async () => {
    useTables({ audit_events: [{ id: 'e1', created_at: '2026-10-01T00:00:00Z', action: 'x', actor_id: 'ghost', status: 'success' }] })
    const a = await getActivityReport()
    expect(a.recentEvents[0]?.actorName).toBe('—')
  })

  it('Client: money is not read for a money-blind session', async () => {
    const s = await getClientReportsSummary({}, { includeMoney: false })
    expect(s.money).toBeNull()
    expect(calls.some((c) => c.table === 'invoices')).toBe(false)
  })
})
