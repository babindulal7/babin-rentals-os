import { beforeEach, describe, expect, it, vi } from 'vitest'
import { planAssignment, readCandidates, readHeldForBooking, readHolds, readProductModes, readQuantityHolds } from '../availability'
import { readProductAvailability } from '../productAvailability'

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  cap: 2,
  failure: '' as string,
  nullPage: false,
  nullTable: '',
  networkThrows: false,
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
      maybeSingle: () => Promise.resolve({ data: (db.tables[table] ?? []).find(row => predicates.every(predicate => predicate(row))) ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => {
        if (db.networkThrows) throw new Error('network unavailable')
        db.calls.push({ table, start })
        const failed = db.failure === table && start > 0
        const rows = (db.tables[table] ?? []).filter(row => predicates.every(predicate => predicate(row)))
        const offset = db.repeat ? 0 : start
        return Promise.resolve({
          data: failed || db.nullPage || db.nullTable === table ? null : rows.slice(offset, offset + Math.min(end - start + 1, db.cap)),
          error: failed ? { message: 'later page failed' } : null,
        }).then(resolve)
      },
    }
    return query
  } },
}))

vi.mock('../../settingsStore', () => ({
  getSetting: (key: string) => key === 'unitAvailabilityRule' ? 'Condition only' : 'Same-instant handover allowed',
}))

const period = '[2026-10-20T00:00:00Z,2026-10-22T00:00:00Z)'
const reservations = () => Array.from({ length: 3 }, (_, n) => ({
  id: `r-${n}`, asset_id: `u-${n}`, product_id: 'p-1', qty: n + 1,
  booking_id: `booking-${n}`, bookings: { booking_no: `BK-${n}` }, period, released_at: null,
}))
const units = () => Array.from({ length: 3 }, (_, n) => ({
  id: `u-${n}`, product_id: 'p-1', asset_tag: `EQ-${n}`, serial_no: null, status: 'In Stock', condition: 'Good', retired_at: null,
}))

describe('availability reads must be complete before reporting stock', () => {
  beforeEach(() => {
    db.tables = { inventory_reservations: reservations(), product_units_v: units() }
    db.failure = ''; db.nullPage = false; db.nullTable = ''; db.networkThrows = false; db.repeat = false; db.calls = []; db.cap = 2
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

  it('reads actual unit condition instead of using pending cleaning as a damage proxy', async () => {
    db.tables.product_units_v = [{ ...units()[0], condition: 'Damaged' }]
    const candidates = (await readCandidates(['p-1'])).get('p-1')
    expect(candidates?.[0]?.condition).toBe('Damaged')
  })

  it.each([undefined, null, 'unknown'])('refuses an unreadable unit condition (%s)', async condition => {
    db.tables.product_units_v = [{ ...units()[0], condition }]
    await expect(readCandidates(['p-1'])).rejects.toThrow(/condition|incomplete/i)
  })

  it('reports pending-reset unit stock for a free window while retaining other unit holds', async () => {
    db.tables.products_v = [{ id: 'p-1', tracking_mode: 'Serialised', total_quantity: 3 }]
    db.tables.inventory_reservations = [reservations()[1]] as Array<Record<string, unknown>>
    db.tables.cleaning_queue_entries = [{
      id: 'reset-0', unit_id: 'u-0', requires_clean: true, requires_reset: true,
      reset_completed_at: null, bookings: { booking_no: 'BK-0' },
    }]
    const answer = await readProductAvailability({ fromAd: '2026-10-21T00:00:00Z', toAd: '2026-10-22T00:00:00Z' }, ['p-1'])
    expect(answer.get('p-1')?.unitsFree).toBe(2)
    expect(answer.get('p-1')?.unitsHeld).toBe(1)
    expect(db.tables.cleaning_queue_entries[0]?.reset_completed_at).toBeNull()
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

describe('booking inputs must be complete before planning stock', () => {
  const bookingId = '11111111-2222-4333-8444-555555555555'
  const products = () => Array.from({ length: 3 }, (_, n) => ({ id: `p-${n + 1}`, tracking_mode: 'Quantity', total_quantity: 2 }))

  beforeEach(() => {
    db.cap = 2; db.failure = ''; db.nullPage = false; db.nullTable = ''; db.networkThrows = false; db.repeat = false; db.calls = []
    db.tables = {
      bookings: [{ id: bookingId, booking_no: 'BK-TEST', pickup_at: '2026-10-20T00:00:00Z', return_at: '2026-10-22T00:00:00Z' }],
      products_v: products(),
      // The third line claims the last unit again; missing it falsely makes the plan complete.
      booking_lines: Array.from({ length: 3 }, (_, n) => ({ id: `line-${n}`, booking_id: bookingId, product_id: 'p-1', qty: 1, line_type: 'Equipment', description: `Cable ${n}`, voided_at: null })),
    }
  })

  it('checks a later booking line instead of declaring the truncated plan complete', async () => {
    const plan = await planAssignment(bookingId)
    expect(plan.lines).toHaveLength(3)
    expect(plan.complete).toBe(false)
    expect(plan.lines[2]?.problem).toMatch(/earlier line/)
  })

  it('refuses a failed later booking-line page', async () => {
    db.failure = 'booking_lines'
    await expect(planAssignment(bookingId)).rejects.toThrow(/later page failed/)
  })

  it('refuses a missing booking-line dataset rather than an empty, complete plan', async () => {
    db.nullTable = 'booking_lines'
    await expect(planAssignment(bookingId)).rejects.toThrow(/missing|incomplete/i)
  })

  it('loads tracking modes and stock ceilings beyond the view row cap', async () => {
    expect((await readProductModes(['p-1', 'p-2', 'p-3'])).size).toBe(3)
    expect(db.calls.filter(call => call.table === 'products_v').map(call => call.start)).toEqual([0, 2, 3])
    expect(db.calls.some(call => call.table === 'products')).toBe(false)
  })

  it('loads every money-safe base fallback row when the view has no matching rows', async () => {
    db.tables.products_v = []; db.tables.products = products()
    expect((await readProductModes(['p-1', 'p-2', 'p-3'])).size).toBe(3)
  })

  it.each(['products_v', 'products'])('refuses a failed later %s metadata page', async table => {
    if (table === 'products') { db.tables.products_v = []; db.tables.products = products() }
    db.failure = table
    await expect(readProductModes(['p-1', 'p-2', 'p-3'])).rejects.toThrow(/later page failed/)
  })

  it('refuses missing metadata rather than treating it as an empty catalogue', async () => {
    db.nullPage = true
    await expect(readProductModes(['p-1'])).rejects.toThrow(/missing|incomplete/i)
  })
})

describe('post-confirmation reservation counts distinguish unknown from zero', () => {
  beforeEach(() => {
    db.cap = 2; db.failure = ''; db.nullPage = false; db.nullTable = ''; db.networkThrows = false; db.repeat = false; db.calls = []
    db.tables = { inventory_reservations: [
      { id: 'r-0', booking_id: 'confirmed-booking', asset_id: 'u-0', product_id: null, qty: 1, released_at: null },
      { id: 'r-1', booking_id: 'confirmed-booking', asset_id: null, product_id: 'p-1', qty: 2, released_at: null },
      { id: 'r-2', booking_id: 'confirmed-booking', asset_id: null, product_id: 'p-1', qty: 3, released_at: null },
    ] }
  })

  it('counts every serial and quantity hold beyond the server cap', async () => {
    expect(await readHeldForBooking('confirmed-booking')).toEqual({ units: 1, quantityHolds: 2, quantityReserved: 5 })
  })

  it('returns unknown for a failed later page instead of partial counts', async () => {
    db.failure = 'inventory_reservations'
    expect(await readHeldForBooking('confirmed-booking')).toBeNull()
  })

  it('returns unknown for a missing dataset instead of reporting zero holds', async () => {
    db.nullPage = true
    expect(await readHeldForBooking('confirmed-booking')).toBeNull()
  })

  it('contains thrown network failures after the booking has already committed', async () => {
    db.networkThrows = true
    expect(await readHeldForBooking('confirmed-booking')).toBeNull()
  })

  it('returns unknown for repeated pages', async () => {
    db.repeat = true
    expect(await readHeldForBooking('confirmed-booking')).toBeNull()
  })

  it('returns unknown for an invalid quantity instead of a misleading count', async () => {
    db.tables.inventory_reservations = [{ id: 'invalid', booking_id: 'confirmed-booking', asset_id: null, product_id: 'p-1', qty: null, released_at: null }]
    expect(await readHeldForBooking('confirmed-booking')).toBeNull()
  })
})
