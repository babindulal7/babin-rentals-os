import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchReturnQuantityFacts } from '../returnQuantityFacts'

const db = vi.hoisted(() => ({
  data: [] as unknown,
  error: null as { message: string } | null,
  mock: false,
  calls: [] as Array<{ name: string; args: Record<string, unknown> }>,
}))

vi.mock('../../supabase', () => ({
  get IS_MOCK() { return db.mock },
  supabase: {
    rpc: async (name: string, args: Record<string, unknown>) => {
      db.calls.push({ name, args })
      return { data: db.data, error: db.error }
    },
  },
}))

const lines = [{ id: 'quantity-line', qty: 5 }, { id: 'serialised-line', qty: 2 }]
const receipt = (bookingLineId: string, qty: unknown) => ({ booking_line_id: bookingLineId, returned_qty: qty })

beforeEach(() => {
  db.data = [receipt('quantity-line', 2), receipt('serialised-line', 0)]
  db.error = null
  db.mock = false
  db.calls = []
})

describe('verified Return quantity facts', () => {
  it('reads complete authoritative receipt counts, including explicit zero', async () => {
    expect(await fetchReturnQuantityFacts('booking', lines)).toEqual(new Map([
      ['quantity-line', 2], ['serialised-line', 0],
    ]))
    expect(db.calls).toEqual([{
      name: 'read_verified_return_quantities', args: { p_booking_id: 'booking' },
    }])
  })

  it('refuses an unavailable RPC or denied read instead of assuming zero', async () => {
    db.error = { message: 'permission denied' }
    await expect(fetchReturnQuantityFacts('booking', lines)).rejects.toThrow('could not be verified')
  })

  it.each([null, undefined, {}, '2'])('refuses non-array data %s', async (value) => {
    db.data = value
    await expect(fetchReturnQuantityFacts('booking', lines)).rejects.toThrow('could not be verified')
  })

  it('refuses a missing line, including a missing explicit zero', async () => {
    db.data = [receipt('quantity-line', 2)]
    await expect(fetchReturnQuantityFacts('booking', lines)).rejects.toThrow('incomplete')
  })

  it('refuses duplicates instead of allowing a later count to overwrite the first', async () => {
    db.data = [receipt('quantity-line', 2), receipt('quantity-line', 3), receipt('serialised-line', 0)]
    await expect(fetchReturnQuantityFacts('booking', lines)).rejects.toThrow('invalid')
  })

  it('refuses unknown line IDs instead of mixing another booking into the balance', async () => {
    db.data = [receipt('quantity-line', 2), receipt('serialised-line', 0), receipt('other-line', 1)]
    await expect(fetchReturnQuantityFacts('booking', lines)).rejects.toThrow('invalid')
  })

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, '2', null, undefined, 6])(
    'refuses invalid or excessive receipt quantity %s', async (qty) => {
      db.data = [receipt('quantity-line', qty), receipt('serialised-line', 0)]
      await expect(fetchReturnQuantityFacts('booking', lines)).rejects.toThrow('invalid')
    },
  )

  it.each([null, [], false, { returned_qty: 2 }])('refuses malformed receipt row %s', async (row) => {
    db.data = [row, receipt('serialised-line', 0)]
    await expect(fetchReturnQuantityFacts('booking', lines)).rejects.toThrow(/incomplete|invalid/)
  })

  it.each([
    { expected: [{ id: 'line', qty: 0 }] },
    { expected: [{ id: 'line', qty: 1.5 }] },
    { expected: [{ id: '', qty: 1 }] },
    { expected: [{ id: 'line', qty: 1 }, { id: 'line', qty: 1 }] },
  ])('refuses an invalid expected booking-line set before reading', async ({ expected }) => {
    await expect(fetchReturnQuantityFacts('booking', expected)).rejects.toThrow('Booking quantities could not be verified')
    expect(db.calls).toEqual([])
  })

  it('has no receipt read to make when the booking has no physical lines', async () => {
    expect(await fetchReturnQuantityFacts('booking', [])).toEqual(new Map())
    expect(db.calls).toEqual([])
  })

  it('uses explicit zero facts only for the local mock corpus', async () => {
    db.mock = true
    expect(await fetchReturnQuantityFacts('booking', lines)).toEqual(new Map([
      ['quantity-line', 0], ['serialised-line', 0],
    ]))
    expect(db.calls).toEqual([])
  })
})
