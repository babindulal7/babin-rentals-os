import { describe, it, expect, beforeEach, vi } from 'vitest'
import { planDowntimeConfig, type PlanDowntimeInput } from '../planDowntime'
import { EVENT_TYPES } from '../../../events/eventBus'
import { supabase } from '../../../lib/supabase'

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}))

describe('planDowntime action (T2-21, B10)', () => {
  const ctx = {
    userId: 'user-tech-1',
    role: 'Technician' as const,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('declares maintenance.create permission and implemented: true', () => {
    expect(planDowntimeConfig.permissions).toEqual(['maintenance.create'])
    expect(planDowntimeConfig.implemented).toBe(true)
  })

  it('validates input: rejects missing target (both assetId and productId missing)', () => {
    expect(() =>
      planDowntimeConfig.validate({
        startAt: '2026-11-20T09:00:00Z',
        endAt: '2026-11-23T18:00:00Z',
        reason: 'Repair',
      } as PlanDowntimeInput),
    ).toThrow('Either assetId or productId must be provided.')
  })

  it('validates input: rejects start >= end', () => {
    expect(() =>
      planDowntimeConfig.validate({
        assetId: 'unit-1',
        startAt: '2026-11-25T09:00:00Z',
        endAt: '2026-11-20T18:00:00Z',
        reason: 'Repair',
      }),
    ).toThrow('Start date must be before end date.')
  })

  it('validates input: rejects invalid reason', () => {
    expect(() =>
      planDowntimeConfig.validate({
        assetId: 'unit-1',
        startAt: '2026-11-20T09:00:00Z',
        endAt: '2026-11-23T18:00:00Z',
        reason: 'Holiday' as any,
      }),
    ).toThrow(/Reason must be one of:/)
  })

  it('validates input: requires notes for Other reason', () => {
    expect(() =>
      planDowntimeConfig.validate({
        assetId: 'unit-1',
        startAt: '2026-11-20T09:00:00Z',
        endAt: '2026-11-23T18:00:00Z',
        reason: 'Other',
        notes: '',
      }),
    ).toThrow('Notes (at least 3 characters) are required when reason is Other.')
  })

  it('executes successfully and returns result and INVENTORY_DOWNTIME_PLANNED event', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: { success: true, reservation_id: 'res-downtime-123' },
      error: null,
    } as any)

    const input: PlanDowntimeInput = {
      assetId: 'unit-cam-1',
      productId: 'prod-cam-1',
      qty: 1,
      startAt: '2026-11-20T09:00:00Z',
      endAt: '2026-11-23T18:00:00Z',
      reason: 'Service or calibration',
      notes: 'Sensor cleaning and firmware update',
    }

    const { result, events } = await planDowntimeConfig.execute(input, ctx)
    expect(result.success).toBe(true)
    expect(result.reservationId).toBe('res-downtime-123')

    expect(events).toHaveLength(1)
    const firstEvent = events[0]!
    expect(firstEvent.type).toBe(EVENT_TYPES.INVENTORY_DOWNTIME_PLANNED)
    expect(firstEvent.payload).toMatchObject({
      reservationId: 'res-downtime-123',
      assetId: 'unit-cam-1',
      reason: 'Service or calibration',
    })
  })

  it('surfaces booking collision message from the database', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'BK-2026-0042 has it on those dates' },
    } as any)

    const input: PlanDowntimeInput = {
      assetId: 'unit-cam-1',
      startAt: '2026-11-20T09:00:00Z',
      endAt: '2026-11-23T18:00:00Z',
      reason: 'Repair',
    }

    await expect(planDowntimeConfig.execute(input, ctx)).rejects.toThrow(
      'BK-2026-0042 has it on those dates',
    )
  })
})
