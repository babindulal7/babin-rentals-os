import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listRentalViewCounts } from '../rentalViews'

const db = vi.hoisted(() => ({ select: vi.fn(), eq: vi.fn(), in: vi.fn(), gte: vi.fn(), count: 2 as number | null, error: null as { message: string } | null }))
const bookings = vi.hoisted(() => vi.fn(async (f: { chips?: { stage?: string[] }; headOnly?: boolean; excludeArchived?: boolean }) => ({ rows: [], total: f.chips?.stage?.length === 1 ? 1 : 5 })))
vi.mock('../bookings', () => ({ listBookings: bookings }))
vi.mock('../../supabase', () => ({ supabase: { from: () => {
  const chain = { select: db.select, eq: db.eq, in: db.in, gte: db.gte, then: (resolve: (result: { count: number | null; error: typeof db.error }) => unknown) => Promise.resolve({ count: db.count, error: db.error }).then(resolve) }
  for (const method of [db.select, db.eq, db.in, db.gte]) method.mockReturnValue(chain)
  return chain
} } }))
beforeEach(() => { vi.clearAllMocks(); db.error = null; db.count = 2 })

describe('rental view counts', () => {
  it('adds drafts only to All and counts full matching registries with no money payload', async () => {
    const { rows } = await listRentalViewCounts({ page: { index: 4, size: 25 }, chips: { stage: ['Returned'] } })
    expect(rows.find(r => r.id === 'All')?.count).toBe(7)
    expect(rows.find(r => r.id === 'Draft')?.count).toBe(2)
    expect(rows.find(r => r.id === 'Quote')?.count).toBe(1)
    expect(bookings.mock.calls.every(([f]) => f.headOnly === true)).toBe(true)
    expect(bookings.mock.calls.every(([f]) => f.excludeArchived === true)).toBe(true)
    expect(db.select).toHaveBeenCalledWith('id', { count: 'exact', head: true })
    expect(db.eq).toHaveBeenCalledWith('status', 'Active')
  })
  it('maps draft date and project facets without selecting the saved snapshot', async () => {
    await listRentalViewCounts({ chips: { project_type: ['Documentary'] }, dateRange: { column: 'pickup_at', fromAd: '2026-10-07' } })
    expect(db.in).toHaveBeenCalledWith('data->>kind', ['Documentary'])
    expect(db.gte).toHaveBeenCalledWith('data->>pickup', '2026-10-07')
  })  it('reports a count read failure rather than returning a false zero', async () => {
    db.error = { message: 'Session expired' }
    await expect(listRentalViewCounts({})).rejects.toThrow('Session expired')
  })
  it('keeps an unanswered draft count unknown', async () => {
    db.count = null
    const { rows } = await listRentalViewCounts({})
    expect(rows.find(r => r.id === 'Draft')?.count).toBeNull()
    expect(rows.find(r => r.id === 'All')?.count).toBeNull()
  })
  it('counts the excluded Cancelled population with the presence flag flipped and no stage constraint', async () => {
    // ADOPTIONS item 4 (Booqable §9.2): filter + census. The mock answers 5
    // for a stageless count; what matters is the call shape, not the number.
    const { rows } = await listRentalViewCounts({ chips: { stage: ['On Rent'] } })
    expect(rows.find(r => r.id === 'Cancelled')?.count).toBe(5)
    const cancelledCall = bookings.mock.calls.find(
      ([f]) => (f as { presence?: { cancelled_at?: boolean } }).presence?.cancelled_at === true,
    )
    expect(cancelledCall).toBeDefined()
    const [cancelledFilters] = cancelledCall as [{ chips?: { stage?: string[] }; presence?: { cancelled_at?: boolean }; headOnly?: boolean; excludeArchived?: boolean }]
    expect(cancelledFilters.chips?.stage).toBeUndefined()
    expect(cancelledFilters.headOnly).toBe(true)
    expect(cancelledFilters.excludeArchived).toBe(true)
    // Every other view keeps the live-only baseline.
    for (const [f] of bookings.mock.calls) {
      const filters = f as { presence?: { cancelled_at?: boolean } }
      if (filters.presence?.cancelled_at === true) continue
      expect(filters.presence ?? { cancelled_at: false }).toMatchObject({ cancelled_at: false })
    }
  })
})
