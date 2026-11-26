import { beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock('../supabase', () => ({
  supabase: { from: () => ({ select: () => ({ in: query.run }) }) },
}))
import { fetchHandoverPickupTotals } from './handoverPickupTotals'

beforeEach(() => query.run.mockReset())

describe('pickup totals', () => {
  it('returns recorded totals and leaves untouched lines absent', async () => {
    query.run.mockResolvedValue({ data: [{ booking_line_id: 'one', picked_qty: '2' }], error: null })
    expect(await fetchHandoverPickupTotals(['one', 'two'])).toEqual(new Map([['one', 2]]))
  })
  it('refuses missing, invalid, duplicate, or unexpected results', async () => {
    for (const data of [null, [{ booking_line_id: 'one', picked_qty: null }],
      [{ booking_line_id: 'other', picked_qty: 1 }],
      [{ booking_line_id: 'one', picked_qty: 1 }, { booking_line_id: 'one', picked_qty: 1 }]]) {
      query.run.mockResolvedValueOnce({ data, error: null })
      await expect(fetchHandoverPickupTotals(['one'])).rejects.toThrow(/previous pickup/i)
    }
  })
  it('does not silently treat a query failure as zero pickups', async () => {
    query.run.mockResolvedValue({ data: null, error: { message: 'offline' } })
    await expect(fetchHandoverPickupTotals(['one'])).rejects.toThrow(/offline/)
  })
  it('chunks long line lists below the server row limit', async () => {
    query.run.mockResolvedValue({ data: [], error: null })
    await fetchHandoverPickupTotals(Array.from({ length: 401 }, (_, i) => String(i)))
    expect(query.run.mock.calls.map((call) => call[1].length)).toEqual([200, 200, 1])
  })
})
