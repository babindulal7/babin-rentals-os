import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Row } from '../engine'

const actor = '00000000-0000-4000-8000-0000000000a1'
const booking = '00000000-0000-4000-8000-0000000000b1'

async function boot(role: string, invoices: Array<Record<string, unknown>> = [], linePricing: Record<string, unknown> = {}, extraRows: Array<{ table: string; row: Row }> = []) {
  const data = new Map<string, string>([
    ['babin.mock.overlay.v1', JSON.stringify({ inserts: [
      { table: 'users', row: { id: actor, primary_role: role, is_active: true } },
      { table: 'bookings', row: { id: booking, booking_no: 'BK-1', stage: 'Booked', deposit_required: 5000,
        pickup_at: '2026-11-20T00:15:00Z', return_at: '2026-11-22T00:15:00Z' } },
      { table: 'booking_lines', row: { id: 'line-1', client_uuid: 'line-key', booking_id: booking, rate: 2000, discount_amount: 0, qty: 1, days: 1, line_type: 'Equipment', ...linePricing } },
      ...invoices.map(row => ({ table: 'invoices', row })),
      ...extraRows,
    ], updates: [], deletes: [], seq: {} })],
    ['babin.mock.session.v1', JSON.stringify({ user: { id: actor } })],
  ])
  vi.stubEnv('VITE_MOCK_SEEDED', 'false')
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => { data.set(key, value) }),
    removeItem: (key: string) => data.delete(key),
  })
  vi.resetModules()
  return (await import('../client')).mockSupabase
}

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules() })

describe('booking change mock privacy', () => {
  it.each(['Warehouse', 'Owner'])('serves real bundle components and masks prices for %s', async role => {
    const client = await boot(role, [], {}, [
      { table: 'bundles', row: { id: 'bundle-real', name: 'Real kit', daily_rate: 750, weekly_rate: 3000, is_active: true } },
      { table: 'bundle_items', row: { id: 'component-real', bundle_id: 'bundle-real', product_id: 'product-real', quantity: 2, is_active: true } },
    ])
    const result = await client.from('bundles_v').select('id, name, daily_rate, weekly_rate, items:bundle_items(id, product_id, quantity)')
    expect(result.error).toBeNull()
    expect(result.data).toMatchObject([{ id: 'bundle-real', daily_rate: role === 'Warehouse' ? null : 750,
      weekly_rate: role === 'Warehouse' ? null : 3000, items: [{ id: 'component-real', quantity: 2 }] }])
  })
  it('lets Warehouse edit without receiving or writing financial fields', async () => {
    const client = await boot('Warehouse', [], {}, [{ table: 'booking_transport', row: {
      id: 'transport-1', booking_id: booking, delivery_charge: 450.75, fuel_charge: 50,
      special_instructions: 'Use gate B | Return Pickup: Babin Pickup from "Studio" at 18:00 (Return Pickup Fee: Rs 450.75)',
    } }])
    const read = await client.rpc('read_booking_for_change', { p_id: booking })
    expect(read.error).toBeNull()
    const snapshot = read.data as { revision: string; values: Record<string, unknown>; lines: Array<Record<string, unknown>> }
    expect(snapshot.values).not.toHaveProperty('deposit_required')
    expect(snapshot.lines[0]).not.toHaveProperty('rate')
    expect(JSON.stringify(snapshot)).not.toContain('450.75')
    expect(read.data).toMatchObject({ transport: { special_instructions: 'Use gate B | Return Pickup: Babin Pickup from "Studio" at 18:00' } })
    const request = { booking_id: booking, client_uuid: 'w-save', revision: snapshot.revision,
      actor_id: actor, values: { project: 'Updated' }, lines: snapshot.lines }
    const denied = await client.rpc('change_booking', { p_payload: { ...request, values: { deposit_required: 0 } } })
    expect(denied.error?.code).toBe('42501')
    const saved = await client.rpc('change_booking', { p_payload: request })
    expect(saved.error).toBeNull()
    expect(saved.data).toMatchObject({ values: { project: 'Updated' }, money_visible: false })
    expect((saved.data as { lines: Array<Record<string, unknown>> }).lines[0]).not.toHaveProperty('rate')
  })
  it('persists a change and supports reload, retry and stale revisions', async () => {
    const client = await boot('Coordinator')
    const before = await client.rpc('read_booking_for_change', { p_id: booking })
    const snapshot = before.data as { revision: string; lines: Array<Record<string, unknown>> }
    const payload = { booking_id: booking, client_uuid: 'save-1', revision: snapshot.revision, actor_id: actor,
      values: { project: 'Changed project' }, lines: snapshot.lines.map(line => ({ ...line, qty: 2 })),
      crew: [], transport: { vehicle: 'Van' }, discount_percent: 5 }
    const saved = await client.rpc('change_booking', { p_payload: payload })
    expect(saved.error).toBeNull()
    expect(saved.data).toMatchObject({ values: { project: 'Changed project' }, lines: [{ qty: 2 }], transport: { vehicle: 'Van' }, discounts: [{ percent: 5 }] })
    expect((saved.data as { revision: string }).revision).not.toBe(snapshot.revision)
    const replay = await client.rpc('change_booking', { p_payload: payload })
    expect(replay.data).toEqual(saved.data)
    const stale = await client.rpc('change_booking', { p_payload: { ...payload, client_uuid: 'save-2' } })
    expect(stale.error?.code).toBe('40001')
    vi.resetModules()
    const reloaded = (await import('../client')).mockSupabase
    const after = await reloaded.rpc('read_booking_for_change', { p_id: booking })
    expect(after.data).toMatchObject({ values: { project: 'Changed project' }, lines: [{ qty: 2 }], transport: { vehicle: 'Van' }, discounts: [{ percent: 5 }] })
    expect((await reloaded.rpc('change_booking', { p_payload: payload })).data).toEqual(saved.data)
  })
  it('permits a Coordinator to read the editor', async () => {
    const client = await boot('Coordinator')
    const read = await client.rpc('read_booking_for_change', { p_id: booking })
    expect(read.error).toBeNull()
    expect(read.data).toMatchObject({ id: booking })
  })
  it('returns one committed result for simultaneous retries of the same save', async () => {
    const client = await boot('Coordinator')
    const read = await client.rpc('read_booking_for_change', { p_id: booking })
    const snapshot = read.data as { revision: string; lines: Array<Record<string, unknown>> }
    const payload = { booking_id: booking, client_uuid: 'simultaneous-save', revision: snapshot.revision,
      actor_id: actor, values: { project: 'One change' }, lines: snapshot.lines }
    const [first, retry] = await Promise.all([
      client.rpc('change_booking', { p_payload: payload }),
      client.rpc('change_booking', { p_payload: payload }),
    ])
    expect(first.error).toBeNull()
    expect(retry.error).toBeNull()
    expect(retry.data).toEqual(first.data)
    const receipts = await client.from('mock_booking_change_receipts').select('*')
    expect(receipts.data).toHaveLength(1)
    const writes = vi.mocked(localStorage.setItem).mock.calls.filter(([key]) => key === 'babin.mock.overlay.v1')
    expect(writes).toHaveLength(1)
    const durable = JSON.parse(writes[0]![1]) as { inserts: Array<{ table: string }> }
    expect(durable.inserts.some(row => row.table === 'mock_booking_change_receipts')).toBe(true)
  })
  it('refuses changes after an invoice is numbered and preserves the booking', async () => {
    const client = await boot('Coordinator', [{ id: 'invoice-1', booking_id: booking, status: 'Sent', invoice_no: 'INV-1' }])
    const read = await client.rpc('read_booking_for_change', { p_id: booking })
    const snapshot = read.data as { revision: string; lines: Array<Record<string, unknown>> }
    const saved = await client.rpc('change_booking', { p_payload: {
      booking_id: booking, client_uuid: 'issued-save', revision: snapshot.revision,
      actor_id: actor, values: { project: 'Must not save' }, lines: snapshot.lines,
    } })
    expect(saved.error?.message).toMatch(/numbered invoice/i)
    const after = await client.rpc('read_booking_for_change', { p_id: booking })
    expect(after.data).toEqual(read.data)
  })
  it.each([{ rate: 1 }, { discount_amount: 1 }])('preserves a stored total when financial fields change: %j', async patch => {
    const client = await boot('Coordinator', [], { line_total: 1800 })
    const read = await client.rpc('read_booking_for_change', { p_id: booking })
    const snapshot = read.data as { revision: string; lines: Array<Record<string, unknown>> }
    const saved = await client.rpc('change_booking', { p_payload: {
      booking_id: booking, client_uuid: 'stored-price-save', revision: snapshot.revision,
      actor_id: actor, values: {}, lines: snapshot.lines.map(line => ({ ...line, ...patch })),
    } })
    expect(saved.error?.message).toMatch(/stored pricing/i)
    expect((await client.rpc('read_booking_for_change', { p_id: booking })).data).toEqual(read.data)
  })
  it('rolls back all changes and storage writes when a later row cannot be written', async () => {
    const client = await boot('Coordinator')
    const read = await client.rpc('read_booking_for_change', { p_id: booking })
    const snapshot = read.data as { revision: string; lines: Array<Record<string, unknown>> }
    vi.stubGlobal('crypto', { randomUUID: () => { throw new Error('Simulated row identity failure') } })
    const saved = await client.rpc('change_booking', { p_payload: {
      booking_id: booking, client_uuid: 'rollback-save', revision: snapshot.revision, actor_id: actor,
      values: { project: 'Must not persist' }, lines: snapshot.lines.map(line => ({ ...line, qty: 2 })),
      crew: [{ name: 'New crew member' }],
    } })
    expect(saved.error?.message).toMatch(/row identity failure/i)
    expect((await client.rpc('read_booking_for_change', { p_id: booking })).data).toEqual(read.data)
    expect(localStorage.setItem).not.toHaveBeenCalled()
  })
  it.each(['Coordinator', 'Warehouse'])('recalculates an ordinary stored daily total for %s', async role => {
    const client = await boot(role, [], { line_total: 1999.50, discount_amount: 0.50 })
    const read = await client.rpc('read_booking_for_change', { p_id: booking })
    const snapshot = read.data as { revision: string; lines: Array<Record<string, unknown>> }
    const saved = await client.rpc('change_booking', { p_payload: {
      booking_id: booking, client_uuid: 'daily-reprice', revision: snapshot.revision, actor_id: actor,
      values: {}, lines: snapshot.lines.map(line => ({ ...line, qty: 2, days: 3 })),
    } })
    expect(saved.error).toBeNull()
    const rows = await client.from('booking_lines').select('*')
    expect(rows.data).toMatchObject([{ qty: 2, days: 3, rate: 2000, discount_amount: 0.50, line_total: 11999.50 }])
    if (role === 'Warehouse') expect((saved.data as { lines: Row[] }).lines[0]).not.toHaveProperty('line_total')
  })
  it('recalculates a daily total when the desk changes a rate and discount', async () => {
    const client = await boot('Coordinator', [], { line_total: 2000 })
    const read = await client.rpc('read_booking_for_change', { p_id: booking })
    const snapshot = read.data as { revision: string; lines: Row[] }
    const saved = await client.rpc('change_booking', { p_payload: {
      booking_id: booking, client_uuid: 'new-rate', revision: snapshot.revision, actor_id: actor,
      values: {}, lines: snapshot.lines.map(line => ({ ...line, qty: 2, days: 3, rate: 250.25, discount_amount: 0.50 })),
    } })
    expect(saved.error).toBeNull()
    expect((await client.from('booking_lines').select('*')).data).toMatchObject([{ line_total: 1501 }])
  })
  it('lets Warehouse add only the actual included components of a priced bundle', async () => {
    const client = await boot('Warehouse', [], {}, [
      { table: 'bundles', row: { id: 'kit-1', daily_rate: 5000 } },
      { table: 'bundle_items', row: { id: 'component-1', bundle_id: 'kit-1', product_id: 'camera-1', quantity: 2, is_active: true } },
    ])
    const read = await client.rpc('read_booking_for_change', { p_id: booking })
    const snapshot = read.data as { revision: string; lines: Row[] }
    const parent = { id: null, client_uuid: 'kit-key', line_type: 'Bundle', bundle_id: 'kit-1', qty: 1, days: 1, is_included: false }
    const child = { id: null, client_uuid: 'child-key', parent_client_uuid: 'kit-key', line_type: 'Equipment', bundle_id: 'kit-1', product_id: 'camera-1', qty: 2, days: 1, is_included: true }
    const payload = { booking_id: booking, revision: snapshot.revision, actor_id: actor, values: {} }
    const missing = await client.rpc('change_booking', { p_payload: { ...payload, client_uuid: 'missing', lines: [...snapshot.lines, parent] } })
    expect(missing.error?.message).toMatch(/bundle|component/i)
    const duplicated = await client.rpc('change_booking', { p_payload: { ...payload, client_uuid: 'duplicate', lines: [...snapshot.lines, parent, child, { ...child, client_uuid: 'child-2' }] } })
    expect(duplicated.error?.message).toMatch(/bundle|component/i)
    const forged = await client.rpc('change_booking', { p_payload: { ...payload, client_uuid: 'forged', lines: [...snapshot.lines, parent, { ...child, product_id: 'other' }] } })
    expect(forged.error?.message).toMatch(/bundle|component/i)
    const excessive = await client.rpc('change_booking', { p_payload: { ...payload, client_uuid: 'excessive', lines: [...snapshot.lines, parent, { ...child, qty: 3 }] } })
    expect(excessive.error?.message).toMatch(/bundle|component/i)
    const saved = await client.rpc('change_booking', { p_payload: { ...payload, client_uuid: 'valid-bundle', lines: [...snapshot.lines, parent, child] } })
    expect(saved.error).toBeNull()
    expect(JSON.stringify(saved.data)).not.toContain('5000')
    expect((saved.data as { lines: Row[] }).lines).toHaveLength(3)
    const current = saved.data as { revision: string; lines: Row[] }
    const inflated = await client.rpc('change_booking', { p_payload: { ...payload, revision: current.revision, client_uuid: 'inflated',
      lines: current.lines.map(line => line['client_uuid'] === 'child-key' ? { ...line, qty: 3 } : line) } })
    expect(inflated.error?.message).toMatch(/bundle|component/i)

  })
  it('requires and preserves a desk review when a custom item is removed', async () => {
    const client = await boot('Coordinator', [], { line_total: 1800, price_breakdown: { method: 'structure' } })
    const read = await client.rpc('read_booking_for_change', { p_id: booking })
    const snapshot = read.data as { revision: string; lines: Row[] }
    const base = { booking_id: booking, revision: snapshot.revision, actor_id: actor, values: {}, lines: [] }
    const denied = await client.rpc('change_booking', { p_payload: { ...base, client_uuid: 'remove-denied' } })
    expect(denied.error?.message).toMatch(/review/i)
    const saved = await client.rpc('change_booking', { p_payload: { ...base, client_uuid: 'remove-reviewed',
      removed_price_reviews: [{ id: 'line-1', price_reviewed: true, reviewed_line_total: 0 }] } })
    expect(saved.error).toBeNull()
    expect((await client.from('booking_lines').select('*')).data).toMatchObject([{ voided_reason: 'Removed while changing booking',
      price_breakdown: { reviewed_total: 0, previous_total: 1800, previous_breakdown: { method: 'structure' } } }])
  })
  it('refuses a schedule move for structure pricing without overwriting its snapshot', async () => {
    const client = await boot('Coordinator', [], { line_total: 1800, price_breakdown: { method: 'structure' } })
    const read = await client.rpc('read_booking_for_change', { p_id: booking })
    const snapshot = read.data as { revision: string; lines: Row[] }
    const saved = await client.rpc('change_booking', { p_payload: {
      booking_id: booking, client_uuid: 'structure-move', revision: snapshot.revision, actor_id: actor,
      values: { pickup_at: '2026-11-21T00:15:00Z', return_at: '2026-11-23T00:15:00Z' }, lines: snapshot.lines,
    } })
    expect(saved.error?.message).toMatch(/stored pricing/i)
    expect((await client.rpc('read_booking_for_change', { p_id: booking })).data).toEqual(read.data)
  })
})
