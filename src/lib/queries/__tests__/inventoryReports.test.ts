import { describe, it, expect, vi } from 'vitest'
import { INVENTORY_STATES, getInventoryReportSummary, sharePercent, summariseStatusCounts, type StatusCount } from '../inventoryReports'
import { supabase } from '../../supabase'

vi.mock('../../supabase', () => ({ supabase: { from: vi.fn() } }))

/** `from().select().eq()` resolving to the given result for every status. */
function countsResolve(result: { count: number | null; error: { message: string } | null }) {
  ;(supabase.from as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    select: () => ({ eq: () => Promise.resolve(result) }),
  })
}

const counts = (m: Partial<Record<(typeof INVENTORY_STATES)[number], number>>): StatusCount[] =>
  INVENTORY_STATES.map((status) => ({ status, count: m[status] ?? 0 }))

describe('inventoryReports', () => {
  it('derives totals from per-status counts, excluding Retired from active', () => {
    const s = summariseStatusCounts(counts({ 'In Stock': 7, 'On Rent': 2, Retired: 1 }))
    expect(s.totalUnits).toBe(10)
    expect(s.activeUnits).toBe(9)
    expect(s.inStock).toBe(7)
  })

  it('covers all ten locked inventory states', () => {
    expect(INVENTORY_STATES).toHaveLength(10)
  })

  it('sharePercent is null, not 0, when there is nothing to divide', () => {
    expect(sharePercent(0, 0)).toBeNull()
    expect(sharePercent(1, 4)).toBe(25)
  })

  /* RULING 2026-10-15: a failed read throws, so the page can offer Retry. */
  it('throws on a failed count rather than returning a summary', async () => {
    countsResolve({ count: null, error: { message: 'relation "product_units_v" does not exist' } })
    await expect(getInventoryReportSummary()).rejects.toThrow('does not exist')
  })

  it('treats a missing count as a failure, never as zero', async () => {
    countsResolve({ count: null, error: null })
    await expect(getInventoryReportSummary()).rejects.toThrow('no count returned')
  })

  it('sums real counts when every read succeeds', async () => {
    countsResolve({ count: 2, error: null })
    const s = await getInventoryReportSummary()
    expect(s.totalUnits).toBe(2 * INVENTORY_STATES.length)
  })
})
