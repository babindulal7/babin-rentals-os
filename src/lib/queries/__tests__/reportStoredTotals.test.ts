import { describe, expect, it, vi } from 'vitest'

const query = vi.hoisted(() => ({ select: vi.fn() }))
vi.mock('../../supabase', () => ({ supabase: { from: () => ({ select: query.select }) } }))
import { lineValue, readLineValues } from '../reportSupport'

const priced = (line_total: number | string | null) => ({ qty: 2, days: 3, rate: 1000, discount_amount: 100, line_total })

describe('reports preserve the recorded net booking-line value (0168)', () => {
  it('uses a structured price instead of rebuilding the flat rate', () => {
    expect(lineValue(priced('300.05'))).toBe(30005)
  })
  it('preserves an explicitly free line without replacing it with the rate', () => {
    expect(lineValue(priced(0))).toBe(0)
  })
  it('keeps voided lines out of revenue even when a stored total exists', () => {
    expect(lineValue({ ...priced('300.05'), voided_at: '2026-10-20T00:00:00Z' })).toBe(0)
  })
  it('retains the existing flat-rate calculation only for legacy rows without a total', () => {
    expect(lineValue(priced(null))).toBe(590000)
  })
  it.each(['invalid', 'NaN', '9007199254740992'])('refuses an invalid recorded amount: %s', value => {
    expect(() => lineValue(priced(value))).toThrow()
  })
  it('selects the stored total through the money-masked view and carries it into the adapter', async () => {
    query.select.mockReturnValue({ is: async () => ({ data: [{ ...priced('666.09'), booking_id: 'b1', product_id: null, bundle_id: null }], error: null }) })
    const rows = await readLineValues()
    expect(query.select.mock.calls.at(-1)?.[0].split(',').map((column: string) => column.trim())).toContain('line_total')
    const row = rows.get('b1')?.[0]
    if (!row) throw new Error('Missing report row')
    expect(lineValue(row)).toBe(66609)
  })
})
