import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordCancellationFeeTier } from '../cancellationFeeTiers'

const mocks = vi.hoisted(() => ({ insert: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }))
vi.mock('../../supabase', () => ({
  supabase: { from: () => ({
    insert: mocks.insert,
    select: () => ({ eq: mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle }) }),
  }) },
}))

const input = { noticeHours: 24, feePercent: 12.25, clientUuid: 'entry-1', createdBy: 'owner-1' }

describe('recordCancellationFeeTier', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.insert.mockResolvedValue({ error: null })
  })

  it('records an explicit zero-hour and zero-percent tier', async () => {
    await recordCancellationFeeTier({ ...input, noticeHours: 0, feePercent: 0 })
    expect(mocks.insert).toHaveBeenCalledWith({
      notice_hours: 0, fee_percent: 0, client_uuid: 'entry-1', created_by: 'owner-1',
    })
  })

  it.each([{ noticeHours: -1 }, { noticeHours: 0.5 }, { feePercent: 101 }, { feePercent: 12.001 }])(
    'rejects invalid notice or fee input before writing',
    async change => {
      await expect(recordCancellationFeeTier({ ...input, ...change })).rejects.toThrow('Enter')
      expect(mocks.insert).not.toHaveBeenCalled()
    },
  )

  it('accepts the same request after a lost response but reports a conflicting threshold', async () => {
    mocks.insert.mockResolvedValue({ error: { code: '23505', message: 'cancellation_fee_tiers_active_notice_key' } })
    mocks.maybeSingle
      .mockResolvedValueOnce({ data: { notice_hours: 24, fee_percent: '12.25', created_by: 'owner-1' }, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
    await expect(recordCancellationFeeTier(input)).resolves.toBeUndefined()
    await expect(recordCancellationFeeTier(input)).rejects.toThrow('An active tier already uses')
    expect(mocks.eq).toHaveBeenCalledWith('client_uuid', 'entry-1')
  })
})
