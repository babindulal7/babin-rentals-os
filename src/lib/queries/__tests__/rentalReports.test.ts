import { describe, it, expect, vi } from 'vitest'
import {
  getRentalPerformanceReport,
  getRentalDurationReport,
  getCancellationsReport,
} from '../rentalReports'
import { supabase } from '../../supabase'

// Unit fixtures use a concrete client object; the app's lazy mock-client Proxy
// intentionally has no own method descriptors for vi.spyOn to replace.
vi.mock('../../supabase', () => ({ IS_MOCK: false, supabase: {
  from: vi.fn(() => {
    const query: Record<string, unknown> = {}
    for (const method of ['select','order','is','eq','gte','lte','in','range','limit','not']) query[method] = () => query
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({data: [], error: null}).then(resolve)
    return query
  }),
} }))

describe('rentalReports query module (WF-02, WF-03)', () => {
  it('returns valid mock performance report in mock mode or fallback', async () => {
    const report = await getRentalPerformanceReport()
    expect(report).toBeDefined()
    expect(report.metrics).toBeDefined()
    expect(report.metrics.totalBookings).toBeGreaterThanOrEqual(0)
    expect(Number(report.metrics.totalRevenue)).toBeGreaterThanOrEqual(0)
  })

  it('WF-02 & WF-03: accurately converts Rupee rate into Paisa and counts Closed as completed', async () => {
    // Single Closed booking with 1 line: rate 1000 NPR, qty 1, days 1
    const mockBookings = [
      {
        id: 'b-closed-01',
        booking_no: 'BK-2026-0001',
        client_id: 'c-01',
        branch_id: 'br-01',
        stage: 'Closed',
        pickup_at: '2026-10-18T03:15:00Z',
        return_at: '2026-10-19T03:15:00Z',
        project: 'Film Shoot',
        cancelled_at: null,
        created_at: '2026-10-17T03:15:00Z',
        clients: { name: 'Acme Media' },
        booking_lines: [
          { id: 'bl-1', qty: 1, days: 1, rate: 1000, discount_amount: 0, voided_at: null },
        ],
      },
    ]

    const fromSpy = vi.spyOn(supabase, 'from').mockReturnValue({
      select: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: (resolve: any) => resolve({ data: mockBookings, error: null }),
      }),
    } as any)

    try {
      const report = await getRentalPerformanceReport()
      expect(report.metrics.completedRentals).toBe(1)
      expect(report.metrics.cancelledRentals).toBe(0)
      // 1000 Rupees -> 100,000 Paisa (NOT 1,000 Paisa which would be Rs 10!)
      expect(report.metrics.totalRevenue as number).toBe(100000)
      expect(report.topBookings[0]?.value as number).toBe(100000)
    } finally {
      fromSpy.mockRestore()
    }
  })

  it('WF-03: correctly identifies cancelled_at flag even if stage is not Cancelled', async () => {
    const mockBookings = [
      {
        id: 'b-cancel-01',
        booking_no: 'BK-2026-0002',
        client_id: 'c-02',
        branch_id: 'br-01',
        stage: 'Packed',
        pickup_at: '2026-10-18T03:15:00Z',
        return_at: '2026-10-19T03:15:00Z',
        project: 'Ad Shoot',
        cancelled_at: '2026-10-17T12:00:00Z',
        created_at: '2026-10-16T03:15:00Z',
        clients: { name: 'Promo Corp' },
        booking_lines: [
          { id: 'bl-2', qty: 1, days: 1, rate: 2500, discount_amount: 0, voided_at: null },
        ],
      },
    ]

    const fromSpy = vi.spyOn(supabase, 'from').mockReturnValue({
      select: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: (resolve: any) => resolve({ data: mockBookings, error: null }),
      }),
    } as any)

    try {
      const report = await getRentalPerformanceReport()
      expect(report.metrics.cancelledRentals).toBe(1)
      expect(report.metrics.activeRentals).toBe(0)
      // Cancelled booking revenue is excluded from totalRevenue
      expect(report.metrics.totalRevenue as number).toBe(0)
    } finally {
      fromSpy.mockRestore()
    }
  })

  it('returns valid duration report', async () => {
    const report = await getRentalDurationReport()
    expect(report).toBeDefined()
    expect(report.totalRentals).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(report.buckets)).toBe(true)
  })

  it('returns valid cancellations report', async () => {
    const report = await getCancellationsReport()
    expect(report).toBeDefined()
    expect(report.totalCancellations).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(report.reasons)).toBe(true)
  })
})
