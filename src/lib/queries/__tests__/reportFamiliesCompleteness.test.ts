import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSupabase, type TableAnswer } from './fakeSupabase'
const state = vi.hoisted(() => ({ client: null as unknown as { from: (table: string) => unknown } }))
vi.mock('../../supabase', () => ({ IS_MOCK: false, supabase: { from: (table: string) => state.client.from(table) } }))
import { getRentalPerformanceReport } from '../rentalReports'
import { getOperationsReport } from '../operationReports'
import { getDamageMaintenanceReport } from '../damageMaintenanceReports'
import { getFleetAssetRoiSummary, computeFleetSummary, type UnitRoiRow } from '../assetRoi'
import { getClientReportsSummary } from '../clientReports'
import { getProductReportsSummary } from '../productReports'
import { getStaffReportsSummary } from '../staffReports'
import { getPromotionsReportsSummary } from '../promotionsReports'
import { getActivityReport } from '../activityReports'

const rows = (make: (id: string) => Record<string, unknown>) => Array.from({ length: 1001 }, (_, index) => make(String(index)))
function useTables(tables: Record<string, TableAnswer>) { state.client = fakeSupabase(tables).client }
beforeEach(() => useTables({}))

describe('WF-02/03/04/05/08 reports include all authorized rows', () => {
  it('rentals read every booking and price line, not the first API page', async () => {
    useTables({ bookings: rows(id => ({ id, stage: 'Closed', pickup_at: '2026-10-19T09:00:00+05:45', return_at: '2026-10-19T18:00:00+05:45', cancelled_at: null })),
      booking_lines_v: rows(id => ({ id, booking_id: id, line_total: '1000.01' })) })
    const result = await getRentalPerformanceReport()
    expect(result.metrics.totalBookings).toBe(1001)
    expect(result.metrics.totalRevenue).toBe(100101001)
  })
  it('Returned remains distinct from completed Closed, and cancellation has no earned revenue', async () => {
    useTables({ bookings: [
      { id: 'closed', stage: 'Closed', cancelled_at: null }, { id: 'returned', stage: 'Returned', cancelled_at: null },
      { id: 'cancelled', stage: 'Packed', cancelled_at: '2026-10-19' },
    ], booking_lines_v: ['closed', 'returned', 'cancelled'].map(id => ({ id, booking_id: id, line_total: 1000 })) })
    const result = await getRentalPerformanceReport()
    expect(result.metrics.completedRentals).toBe(1)
    expect(result.metrics.cancelledRentals).toBe(1)
    expect(result.metrics.totalRevenue).toBe(200000)
    expect(result.stages.find(row => row.stage === 'Cancelled')?.revenue).toBe(0)
    expect(result.stages.reduce((total, row) => total + row.revenue, 0)).toBe(result.metrics.totalRevenue)
  })
  it('operations detail/export retains every session used by the headline', async () => {
    useTables({ bookings: [{ id: 'b', stage: 'On Rent', pickup_at: '2026-10-19', return_at: '2026-10-22', cancelled_at: null }],
      operation_sessions: rows(id => ({ id, booking_id: 'b', operation: 'Handover', state: 'Completed', cancelled_at: null })) })
    const result = await getOperationsReport()
    expect(result.metrics.totalPickups).toBe(1001)
    expect(result.pickups).toHaveLength(1001)
  })
  it('damage detail/export retains all findings, including a real zero cost', async () => {
    useTables({ damage_findings_v: rows(id => ({ id, estimated_cost: 0, created_at: '2026-10-19' })) })
    const result = await getDamageMaintenanceReport()
    expect(result.metrics.totalFindings).toBe(1001)
    expect(result.metrics.totalDamageCost).toBe(0)
    expect(result.incidents).toHaveLength(1001)
  })
  it('staff, clients, products, promotions and activity are never capped at one page', async () => {
    useTables({ clients: rows(id => ({ id })), products: rows(id => ({ id, is_active: true })),
      payments: rows(id => ({ id, received_by: 'staff', amount: 1 })),
      coupon_redemptions: rows(id => ({ id, coupon_id: 'coupon', booking_id: 'b', discount_amount: 1 })),
      audit_events: rows(id => ({ id, created_at: '2026-10-19', status: 'success' })) })
    expect((await getStaffReportsSummary()).totals.collections).toBe(100100)
    expect((await getClientReportsSummary()).totalClients).toBe(1001)
    expect((await getProductReportsSummary()).productCount).toBe(1001)
    expect((await getPromotionsReportsSummary()).redemptionCount).toBe(1001)
    expect((await getActivityReport()).metrics.totalEvents).toBe(1001)
  })
  it('ROI preserves every unit and missing acquisition costs', async () => {
    useTables({ product_units_v: rows(id => ({ id, purchase_price: null })) })
    const result = await getFleetAssetRoiSummary()
    expect(result.rows).toHaveLength(1001)
    expect(result.unpricedUnits).toBe(1001)
    const unit: UnitRoiRow = { unitId: 'u', assetTag: 'U', serialNo: null, productName: 'Unit', category: '', purchasePricePaisa: null,
      lifetimeRevenuePaisa: 100000 as UnitRoiRow['maintenanceCostPaisa'], maintenanceCostPaisa: 0 as UnitRoiRow['maintenanceCostPaisa'],
      netProfitPaisa: null, roiPercent: null, maintenanceDragPercent: null, utilizationPercent: null, daysOwned: null }
    expect(computeFleetSummary([unit]).netFleetReturnPaisa).toBeNull()
  })
})
