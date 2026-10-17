// @vitest-environment jsdom
/**
 * The converted report reads against the mock corpus (`lib/__mocks__`), which
 * is what the `dev:mock` build serves. The fake-client suite proves each
 * read's contract; this one proves each read finishes, and returns real
 * figures, over the same data the browser check drives.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'

// The dev:mock build seeds the corpus from `.env.mock.local`
// (VITE_MOCK_SEEDED=true); Vitest does not load that file, so say it here,
// before the client module builds its store.
vi.hoisted(() => {
  vi.stubEnv('VITE_MOCK_SEEDED', 'true')
})

vi.mock('../../supabase', async () => {
  const { mockSupabase } = await import('../../__mocks__/client')
  return { IS_MOCK: true, supabase: mockSupabase }
})

const reads: [string, () => Promise<unknown>][] = [
  ['rental performance', async () => (await import('../rentalReports')).getRentalPerformanceReport()],
  ['rental duration', async () => (await import('../rentalReports')).getRentalDurationReport()],
  ['cancellations', async () => (await import('../rentalReports')).getCancellationsReport()],
  ['operations', async () => (await import('../operationReports')).getOperationsReport()],
  ['damage & maintenance', async () => (await import('../damageMaintenanceReports')).getDamageMaintenanceReport()],
  ['sales/VAT', async () => (await import('../salesVatReports')).getSalesVatReport()],
  ['activity', async () => (await import('../activityReports')).getActivityReport()],
  ['asset ROI', async () => (await import('../assetRoi')).getFleetAssetRoiSummary()],
  ['staff', async () => (await import('../staffReports')).getStaffReportsSummary()],
  ['equipment', async () => (await import('../equipmentPerformance')).getEquipmentPerformanceSummary()],
  ['product', async () => (await import('../productReports')).getProductReportsSummary()],
  ['promotions', async () => (await import('../promotionsReports')).getPromotionsReportsSummary()],
  ['client', async () => (await import('../clientReports')).getClientReportsSummary()],
  ['cash flow', async () => (await import('../liquidity')).getCashFlowSummary()],
  ['working capital', async () => (await import('../liquidity')).getWorkingCapitalSummary()],
]

describe('report reads over the mock corpus', () => {
  // Build the corpus once, outside any one read's budget. A hang is caught by
  // the per-test timeout; wall-clock assertions are flaky under suite load.
  beforeAll(async () => {
    const { mockStoreSummary } = await import('../../__mocks__/client')
    expect(mockStoreSummary().length).toBeGreaterThan(0)
  }, 30_000)

  it.each(reads)('%s resolves', async (_name, run) => {
    await expect(run()).resolves.toBeDefined()
  }, 20_000)
})

describe('the reports agree with each other over the mock corpus', () => {
  it('rental revenue equals product revenue, and cash collected equals invoice paid amounts', async () => {
    const { getRentalPerformanceReport } = await import('../rentalReports')
    const { getProductReportsSummary } = await import('../productReports')
    const { getCashFlowSummary } = await import('../liquidity')
    const { getSalesVatReport } = await import('../salesVatReports')
    const [rental, product, cash, sales] = await Promise.all([
      getRentalPerformanceReport(),
      getProductReportsSummary(),
      getCashFlowSummary(),
      getSalesVatReport(),
    ])
    expect(rental.metrics.totalRevenue).toBeGreaterThan(0)
    expect(product.revenue).toBe(rental.metrics.totalRevenue)
    // The corpus used to write payment_type 'Rental' (not an enum value), so this read Rs 0.
    expect(cash.collected).toBeGreaterThan(0)
    expect(cash.collected).toBe(sales.sales.metrics.totalCollected)
  }, 30_000)
})
