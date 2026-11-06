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
function useTables(tables: Record<string, TableAnswer>, maxRows?: number) {
  const fake = fakeSupabase(tables, maxRows)
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
  it.each(cases)('%s refuses a missing dataset from %s instead of claiming zero activity', async (_name, table, run) => {
    useTables({ [table]: { unconfirmed: true } })
    await expect(run()).rejects.toThrow(/confirmed dataset/)
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
      b['select'] = (cols: string) => {
        const result = select(cols)
        if (cols.includes('project_type')) {
          b['then'] = (r: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { code: '42501', message: 'permission denied for column project_type' } }).then(r)
        }
        return result
      }
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
    // The final empty page confirms completeness and must retain the same
    // exclusions as the populated first page.
    expect(filtersOn('invoices').filter((c) => c.method === 'neq').map((c) => c.args[1])).toEqual(['Draft', 'Void', 'Draft', 'Void'])
    expect(filtersOn('invoices').filter((c) => c.method === 'range').map((c) => c.args)).toEqual([[0, 499], [1, 500]])
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

describe('Cash Flow opening balance', () => {
  const from = '2026-11-03'
  const opening = { account_type: 'cash', account_id: null, amount: 125, opening_date: from }

  it('reads the period start in the selected branch and leaves closing unreconciled', async () => {
    useTables({
      opening_balances: [opening],
      payments: [{ payment_type: 'Advance Payment', amount: 60 }],
    })
    const result = await getCashFlowSummary({ from, to: '2026-11-05', branchId: 'branch-a' })
    expect(result.openingCash).toBe(rupees(125))
    expect(result.closingCash).toBeNull()
    expect(filtersOn('opening_balances')).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: 'lte', args: ['opening_date', from] }),
      expect.objectContaining({ method: 'is', args: ['account_id', null] }),
      expect.objectContaining({ method: 'eq', args: ['scope', 'location'] }),
      expect.objectContaining({ method: 'eq', args: ['location_id', 'branch-a'] }),
    ]))
  })

  it('does not present a prior snapshot as the opening balance', async () => {
    useTables({ opening_balances: [{ ...opening, opening_date: '2026-11-02' }] })
    expect((await getCashFlowSummary({ from })).openingCash).toBeNull()
    expect(filtersOn('opening_balances')).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: 'eq', args: ['scope', 'org'] }),
      expect.objectContaining({ method: 'is', args: ['location_id', null] }),
    ]))
  })

  it('surfaces a failed opening balance read', async () => {
    useTables({ opening_balances: DOWN })
    await expect(getCashFlowSummary({ from })).rejects.toThrow('Could not read opening balance')
  })
})

describe('Cash Flow complete ledger reads', () => {
  it('includes every payment, expense, deposit movement and invoice beyond one server page', async () => {
    useTables({
      payments: Array.from({ length: 1001 }, () => ({ payment_type: 'Advance Payment', amount: 1 })),
      expenses: Array.from({ length: 1001 }, () => ({ category_id: 'category-a', amount: 2 })),
      expense_categories: [{ id: 'category-a', name: 'Transport' }],
      deposit_movements: Array.from({ length: 1001 }, () => ({ movement_type: 'Received', amount: 3 })),
      invoices: Array.from({ length: 1001 }, () => ({ total_amount: 4 })),
    }, 100)
    const result = await getCashFlowSummary()
    expect(result).toMatchObject({
      collected: rupees(1001), expensesPaid: rupees(2002),
      netOperatingCash: rupees(-1001), depositsReceived: rupees(3003), invoiced: rupees(4004),
      expensesByCategory: [{ category: 'Transport', amount: rupees(2002) }],
    })
  })

  it('includes all receivables, deposits and approved expenses in Working Capital', async () => {
    useTables({
      invoices: Array.from({ length: 1001 }, () => ({
        outstanding_amount: 1, total_amount: 4, due_date: '2026-12-01',
      })),
      security_deposits: Array.from({ length: 1001 }, () => ({
        received_amount: 3, refunded_amount: 1, applied_amount: 1,
      })),
      expenses: Array.from({ length: 1001 }, () => ({ amount: 2 })),
    }, 100)
    const result = await getWorkingCapitalSummary({}, new Date('2026-11-06T12:00:00Z'))
    expect(result).toMatchObject({
      receivables: rupees(1001), depositsHeld: rupees(1001),
      approvedUnpaidExpenses: rupees(2002), daysSalesOutstanding: 23,
    })
    expect(result.ageing[0]).toMatchObject({ amount: rupees(1001), invoices: 1001 })
  })
})

describe('Cash Flow period and branch boundaries', () => {
  it.each([
    ['2026-11-03T00:00:00.000+05:45', '2026-11-05T23:59:59.999+05:45'],
    ['2026-11-02T18:15:00.000Z', '2026-11-05T18:14:59.999Z'],
  ])('accepts toolbar bounds and equivalent UTC instants (%s)', async (from, to) => {
    useTables({ opening_balances: [{
      account_type: 'cash', account_id: null, amount: 125, opening_date: '2026-11-03',
    }] })
    const result = await getCashFlowSummary({ from, to })
    expect(result.openingCash).toBe(rupees(125))
    expect(filtersOn('opening_balances')).toContainEqual({
      table: 'opening_balances', method: 'lte', args: ['opening_date', '2026-11-03'],
    })
    expect(filtersOn('payments')).toEqual(expect.arrayContaining([
      { table: 'payments', method: 'gte', args: ['payment_date', '2026-11-03T00:00:00.000+05:45'] },
      { table: 'payments', method: 'lt', args: ['payment_date', '2026-11-06T00:00:00.000+05:45'] },
    ]))
    expect(filtersOn('expenses')).toContainEqual({ table: 'expenses', method: 'gte', args: ['expense_date', '2026-11-03'] })
    expect(filtersOn('invoices')).toContainEqual({ table: 'invoices', method: 'lte', args: ['issue_date', '2026-11-05'] })
  })

  it('includes the entire final Kathmandu day without moving finance to the floor shift', async () => {
    await getCashFlowSummary({ from: '2026-11-03', to: '2026-11-05' })
    for (const [table, column] of [['payments', 'payment_date'], ['deposit_movements', 'created_at']]) {
      expect(filtersOn(table!)).toEqual(expect.arrayContaining([
        { table, method: 'gte', args: [column, '2026-11-03T00:00:00.000+05:45'] },
        { table, method: 'lt', args: [column, '2026-11-06T00:00:00.000+05:45'] },
      ]))
    }
    expect(filtersOn('expenses')).toContainEqual({ table: 'expenses', method: 'lte', args: ['expense_date', '2026-11-05'] })
    expect(filtersOn('invoices')).toContainEqual({ table: 'invoices', method: 'lte', args: ['issue_date', '2026-11-05'] })
  })

  it('restricts deposit movements to the selected branch through their deposit', async () => {
    await getCashFlowSummary({ branchId: 'branch-a' })
    expect(filtersOn('deposit_movements')).toEqual(expect.arrayContaining([
      { table: 'deposit_movements', method: 'select', args: ['id, movement_type, amount, security_deposits!inner(branch_id)'] },
      { table: 'deposit_movements', method: 'eq', args: ['security_deposits.branch_id', 'branch-a'] },
    ]))
  })

  it('refuses an impossible calendar date before reading the ledgers', async () => {
    await expect(getCashFlowSummary({ from: '2026-02-30' })).rejects.toThrow('valid report date')
    await expect(getCashFlowSummary({ from: '2026-02-30T00:00:00.000+05:45' })).rejects.toThrow('valid report date')
    expect(calls).toEqual([])
  })
})
