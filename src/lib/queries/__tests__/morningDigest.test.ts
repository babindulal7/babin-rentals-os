import { describe, it, expect, vi } from 'vitest'

vi.mock('../../supabase', () => ({
  IS_MOCK: true,
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: '00000000-0000-4000-8000-00000000e001' } } }),
    },
    rpc: vi.fn(),
    functions: {
      invoke: vi.fn(),
    },
  },
}))

import {
  fetchMorningDigest,
  triggerMorningDigestRun,
  MOCK_MORNING_DIGEST,
} from '../morningDigest'

describe('Morning Digest Query & Trigger (T5-04, O-4)', () => {
  it('fetches morning digest in mock mode with formatted BS date', async () => {
    const digest = await fetchMorningDigest('2026-07-31')

    expect(digest).toBeDefined()
    expect(digest.target_date).toBe('2026-07-31')
    expect(digest.bs_date).toBe('15 Shrawan 2083')
    expect(digest.recipient.full_name).toBe('Babin Dulal')
    expect(digest.recipient.role).toBe('Owner')
    expect(digest.can_view_money).toBe(true)
    expect(digest.pickups.length).toBeGreaterThan(0)
    expect(digest.returns.length).toBeGreaterThan(0)
    expect(digest.overdue.length).toBeGreaterThan(0)
    expect(digest.open_damage.length).toBeGreaterThan(0)
    expect(digest.shift_handovers.length).toBeGreaterThan(0)
    expect(digest.payments_due.length).toBeGreaterThan(0)
  })

  it('triggers morning digest run returning processed count', async () => {
    const result = await triggerMorningDigestRun('2026-07-31')

    expect(result.success).toBe(true)
    expect(result.processed).toBe(4)
    expect(result.errors).toEqual([])
  })

  it('contains expected structure conforming to MorningDigestData', () => {
    expect(MOCK_MORNING_DIGEST.recipient.user_id).toBeDefined()
    expect(MOCK_MORNING_DIGEST.total_items_count).toBe(5)
    expect(MOCK_MORNING_DIGEST.operational_day_start).toContain('2026-07-31')
  })
})
