import { describe, expect, it, vi } from 'vitest'
import { completeReportRead } from '../reportSupport'

vi.mock('../../supabase', () => ({ supabase: {} }))

function query(rows: Record<string, unknown>[], cap = 500, failedPage = -1, repeat = false) {
  let calls = 0
  const builder = {
    order: vi.fn(() => builder),
    range: vi.fn(async (from: number, to: number) => {
      if (calls++ === failedPage) return { data: null, error: { message: 'later page refused' } }
      return { data: rows.slice(repeat ? 0 : from, (repeat ? 0 : from) + Math.min(cap, to - from + 1)), error: null }
    }),
  }
  return builder
}
describe('report datasets must be complete and confirmed', () => {
  it('includes cap+1 rows, even when the server cap is smaller than the requested page', async () => {
    const rows = Array.from({ length: 1001 }, (_, id) => ({ id: String(id), amount: id }))
    const q = query(rows, 100)
    const result = await completeReportRead(q, 'Report')
    expect(result.data).toEqual(rows)
    expect(q.order).toHaveBeenCalledWith('id', { ascending: true })
    expect(q.range).toHaveBeenLastCalledWith(1001, 1500)
  })
  it('refuses to report the first page as a complete total when a later page fails', async () => {
    const result = await completeReportRead(query([{ id: '1' }, { id: '2' }], 1, 1), 'Report')
    expect(result.data).toBeNull()
    expect(result.error?.message).toContain('later page refused')
  })
  it('refuses repeated pages instead of duplicating totals or looping forever', async () => {
    await expect(completeReportRead(query([{ id: '1' }], 1, -1, true), 'Report')).rejects.toThrow(/changed|repeated/i)
  })
  it('refuses rows without stable identities', async () => {
    await expect(completeReportRead(query([{ amount: 10 }]), 'Report')).rejects.toThrow(/identity/i)
  })
})
