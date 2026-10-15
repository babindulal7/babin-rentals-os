import { describe, it, expect, vi } from 'vitest'
import { listActivityEvents } from '../activity'

vi.mock('../../supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue({
            data: null,
            error: new Error('Simulated database error'),
          }),
        })),
      })),
    })),
  },
}))

describe('activity query module', () => {
  /* RULING 2026-10-15: a failed read throws (Activity Log draws Error + Retry
     from it). It used to resolve to zero rows — an outage drawn as an empty log. */
  it('throws on a database error instead of reporting an empty log', async () => {
    await expect(listActivityEvents()).rejects.toThrow('listActivityEvents failed: Simulated database error')
  })
})
