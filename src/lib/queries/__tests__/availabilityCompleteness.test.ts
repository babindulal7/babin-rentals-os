import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readCandidates, readHolds, readQuantityHolds } from '../availability'

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  cap: 2,
  failure: '' as string,
  nullPage: false,
  repeat: false,
  calls: [] as Array<{ table: string; start: number }>,
}))

vi.mock('../../supabase', () => ({
  supabase: { from: (table: string) => {
    let start = 0
    let end = db.cap - 1
    const predicates: Array<(row: Record<string, unknown>) => boolean> = []
    const query = {
      select: () => query,
      order: () => query,
      in: (key: string, values: unknown[]) => { predicates.push(row => values.includes(row[key])); return query },
      eq: (key: string, value: unknown) => { predicates.push(row => row[key] === value); return query },
      neq: (key: string, value: unknown) => { predicates.push(row => row[key] !== value); return query },
      is: (key: string, value: unknown) => { predicates.push(row => (row[key] ?? null) === value); return query },
      not: (key: string, _op: string, value: unknown) => { predicates.push(row => (row[key] ?? null) !== value); return query },
      range: (from: number, to: number) => { start = from; end = to; return query },
      then: (resolve: (value: unknown) => unknown) => {
        db.calls.push({ table, start })
        const failed = db.failure === table && start > 0
        const rows = (db.tables[table] ?? []).filter(row => predicates.every(predicate => predicate(row)))
        const offset = db.repeat ? 0 : start
        return Promise.resolve({
          data: failed || db.nullPage ? null : rows.slice(offset, offset + Math.min(end - start + 1, db.cap)),
          error: failed ? { message: 'later page failed' } : null,
        }).then(resolve)
      },
    }
    return query
  } },
}))

const period = '[2026-10-20T00:00:00Z,2026-10-22T00:00:00Z)'
const reservations = () => Array.from({ length: 3 }, (_, n) => ({
  id: `r-${n}`, asset_id: `u-${n}`, product_id: 'p-1', qty: n + 1,
  booking_id: `booking-${n}`, bookings: { booking_no: `BK-${n}` }, period, released_at: null,
}))
const units = () => Array.from({ length: 3 }, (_, n) => ({
  id: `u-${n}`, product_id: 'p-1', asset_tag: `EQ-${n}`, serial_no: null, status: 'In Stock', retired_at: null,
}))

describe('availability reads must be complete before reporting stock', () => {
  beforeEach(() => {
    db.tables = { inventory_reservations: reservations(), product_units_v: units() }
    db.failure = ''; db.nullPage = false; db.repeat = false; db.calls = []; db.cap = 2
  })

  it('includes serial holds beyond a server cap smaller than the requested page', async () => {
    expect((await readHolds(null)).map(hold => hold.unitId)).toEqual(['u-0', 'u-1', 'u-2'])
    expect(db.calls.map(call => call.start)).toEqual([0, 2, 3])
  })

  it('includes quantity holds on the later page while excluding the current booking', async () => {
    db.cap = 1
    const holds = await readQuantityHolds(['p-1'], 'booking-0')
    expect(holds.get('p-1')?.map(hold => hold.qty)).toEqual([2, 3])
  })

  it('includes all candidates and reset entries beyond each server cap', async () => {
    db.tables.cleaning_queue_entries = units().map((unit, n) => ({
      id: `reset-${n}`, unit_id: unit.id, requires_clean: true, requires_reset: true,
      reset_completed_at: null, bookings: { booking_no: `BK-${n}` },
    }))
    const candidates = (await readCandidates(['p-1'])).get('p-1')
    expect(candidates).toHaveLength(3)
    expect(candidates?.every(candidate => candidate.openCleaning !== null)).toBe(true)
  })

  it.each(['serial', 'quantity', 'units', 'reset'])('refuses a failed later %s page rather than returning partial availability', async kind => {
    db.failure = kind === 'units' ? 'product_units_v' : kind === 'reset' ? 'cleaning_queue_entries' : 'inventory_reservations'
    db.tables.cleaning_queue_entries = units().map((unit, n) => ({ id: `reset-${n}`, unit_id: unit.id, requires_reset: true, reset_completed_at: null }))
    const read = kind === 'serial' ? readHolds(null) : kind === 'quantity' ? readQuantityHolds(['p-1'], null) : readCandidates(['p-1'])
    await expect(read).rejects.toThrow(/later page failed/)
  })

  it('refuses a missing dataset instead of treating it as no reservations', async () => {
    db.nullPage = true
    await expect(readHolds(null)).rejects.toThrow(/incomplete|unavailable|missing/i)
  })

  it('refuses repeated pages instead of looping or double counting', async () => {
    db.repeat = true
    await expect(readHolds(null)).rejects.toThrow(/repeat|duplicate|incomplete/i)
  })

  it.each(['serial', 'quantity'])('refuses an unreadable %s hold period rather than dropping the hold', async kind => {
    db.tables.inventory_reservations = [{ ...reservations()[0], period: 'empty' }]
    const read = kind === 'serial' ? readHolds(null) : readQuantityHolds(['p-1'], null)
    await expect(read).rejects.toThrow(/period|window/i)
  })
})
