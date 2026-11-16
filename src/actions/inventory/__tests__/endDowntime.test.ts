import { describe, it, expect, beforeEach, vi } from 'vitest'
import { endDowntimeConfig, type EndDowntimeInput } from '../endDowntime'
import { EVENT_TYPES } from '../../../events/eventBus'
import { supabase } from '../../../lib/supabase'

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}))

describe('endDowntime action (T2-21, Law 3)', () => {
  const ctx = {
    userId: 'user-coord-1',
    role: 'Coordinator' as const,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('declares maintenance.create permission and implemented: true', () => {
    expect(endDowntimeConfig.permissions).toEqual(['maintenance.create'])
    expect(endDowntimeConfig.implemented).toBe(true)
  })

  it('validates input: requires reservationId', () => {
    expect(() => endDowntimeConfig.validate({ reservationId: '' } as EndDowntimeInput)).toThrow(
      'Reservation ID is required.',
    )
  })

  it('executes successfully and returns result and INVENTORY_DOWNTIME_ENDED event', async () => {
    const fakeEndedAt = '2026-11-15T10:00:00Z'
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: { success: true, ended_at: fakeEndedAt },
      error: null,
    } as any)

    const input: EndDowntimeInput = {
      reservationId: 'res-downtime-456',
    }

    const { result, events } = await endDowntimeConfig.execute(input, ctx)
    expect(result.success).toBe(true)
    expect(result.endedAt).toBe(fakeEndedAt)

    expect(events).toHaveLength(1)
    const firstEvent = events[0]!
    expect(firstEvent.type).toBe(EVENT_TYPES.INVENTORY_DOWNTIME_ENDED)
    expect(firstEvent.payload).toMatchObject({
      reservationId: 'res-downtime-456',
      endedAt: fakeEndedAt,
    })
  })
})
