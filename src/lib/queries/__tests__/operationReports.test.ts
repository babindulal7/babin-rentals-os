import { describe, it, expect, vi } from 'vitest'
import { getOperationsReport } from '../operationReports'
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

describe('operationReports query module (WF-04)', () => {
  it('returns valid operations report in mock mode or fallback', async () => {
    const report = await getOperationsReport()
    expect(report).toBeDefined()
    expect(report.metrics).toBeDefined()
    expect(report.metrics.totalPickups).toBeGreaterThanOrEqual(0)
  })

  it('WF-04: computes genuine on-time rates and counts from database records', async () => {
    const mockBookings = [
      {
        id: 'b-01',
        booking_no: 'BK-2026-0001',
        client_id: 'c-01',
        branch_id: 'br-01',
        stage: 'Booked',
        pickup_at: '2026-10-18T10:00:00Z',
        return_at: '2026-10-20T10:00:00Z',
        actual_return_at: null,
        delivery_type: 'Customer Pickup',
        project: 'Documentary',
        clients: { name: 'Doc Co' },
        booking_lines: [{ id: 'bl-1', qty: 2 }],
      },
    ]

    const mockSessions = [
      {
        id: 'ses-01',
        booking_id: 'b-01',
        operation: 'dispatch',
        session_no: 1,
        state: 'completed',
        started_at: '2026-10-18T09:30:00Z',
        completed_at: '2026-10-18T09:55:00Z',
        receiver_name: 'Driver Ram',
        government_id_verified: true,
        booking_authorization_verified: true,
        returning_person_name: null,
        pickup_person_name: 'Driver Ram',
      },
    ]

    const fromSpy = vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'bookings') {
        return {
          select: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            then: (resolve: any) => resolve({ data: mockBookings, error: null }),
          }),
        } as any
      }
      if (table === 'operation_sessions') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              then: (resolve: any) => resolve({ data: mockSessions, error: null }),
            }),
          }),
        } as any
      }
      if (table === 'return_lines') {
        return {
          select: vi.fn().mockReturnValue({
            then: (resolve: any) => resolve({ data: [], error: null }),
          }),
        } as any
      }
      return { select: vi.fn() } as any
    })

    try {
      const report = await getOperationsReport()
      expect(report.metrics.totalPickups).toBe(1)
      expect(report.metrics.idVerificationRate).toBe(100)
      expect(report.metrics.onTimePickupRate).toBe(100)
      // When 0 returns occurred in this dataset, totalReturns is 0 and onTimeReturnRate is 0 (not hardcoded 88.1!)
      expect(report.metrics.totalReturns).toBe(0)
      expect(report.metrics.onTimeReturnRate).toBe(0)
      expect(report.metrics.totalPackingJobs).toBe(1)
    } finally {
      fromSpy.mockRestore()
    }
  })
})
