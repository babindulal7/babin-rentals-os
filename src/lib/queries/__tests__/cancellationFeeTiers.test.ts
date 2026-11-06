import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordCancellationFeeTier, suggestCancellationFee, updateCancellationFeeTier, type CancellationFeeTier } from '../cancellationFeeTiers'

const mocks = vi.hoisted(() => ({ insert: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), update: vi.fn() }))
vi.mock('../../supabase', () => ({
  supabase: { from: () => ({
    insert: mocks.insert,
    update: mocks.update,
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


const tier = (noticeHours: number, feePercent: number): CancellationFeeTier => ({
  id: `tier-${noticeHours}`, noticeHours, feePercent, retiredAt: null,
  createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z',
})

describe('cancellation fee tier boundaries', () => {
  const schedule = [tier(0, 50), tier(48, 0), tier(24, 25)]
  it.each([[0, 50], [23.99, 50], [24, 25], [47.99, 25], [48, 0], [72, 0]])(
    'uses the greatest qualifying threshold for %s hours', (hours, expected) => {
      expect(suggestCancellationFee(hours, schedule)).toBe(expected)
    },
  )
  it('ignores retired tiers and returns null without a qualifying active tier', () => {
    expect(suggestCancellationFee(48, [{ ...tier(24, 25), retiredAt: '2026-11-01' }])).toBeNull()
    expect(suggestCancellationFee(23, [tier(24, 25)])).toBeNull()
  })
})

describe('updateCancellationFeeTier', () => {
  const existing = tier(24, 25)
  const match = vi.fn()
  const active = vi.fn()
  const saved = vi.fn()
  beforeEach(() => {
    vi.resetAllMocks()
    const builder = { eq: match, is: active, select: () => ({ maybeSingle: saved }) }
    match.mockReturnValue(builder)
    active.mockReturnValue(builder)
    mocks.update.mockReturnValue(builder)
  })

  it('retires only the selected active revision', async () => {
    saved.mockResolvedValue({ data: { id: existing.id }, error: null })
    await updateCancellationFeeTier(existing, 'retire')
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ retired_at: expect.any(String) }))
    expect(match).toHaveBeenCalledWith('id', existing.id)
    expect(match).toHaveBeenCalledWith('updated_at', existing.updatedAt)
    expect(active).toHaveBeenCalledWith('retired_at', null)
  })

  it('recognises an identical retry and refuses to overwrite a conflicting change', async () => {
    saved.mockResolvedValue({ data: null, error: null })
    mocks.maybeSingle.mockResolvedValueOnce({
      data: { notice_hours: 24, fee_percent: '30.00', retired_at: null }, error: null,
    }).mockResolvedValueOnce({
      data: { notice_hours: 24, fee_percent: '40.00', retired_at: null }, error: null,
    })
    const change = { noticeHours: 24, feePercent: 30 }
    await expect(updateCancellationFeeTier(existing, change)).resolves.toBeUndefined()
    await expect(updateCancellationFeeTier(existing, change)).rejects.toThrow('This tier changed')
  })
})
