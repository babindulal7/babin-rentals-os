import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => {
  const state = {
    updates: [] as Array<Record<string, unknown>>,
    selected: [] as string[],
    filters: [] as Array<[string, string]>,
    result: {
      data: {
        id: 'unit-1', asset_tag: 'FX3-02', serial_no: null,
        rack: 'A', shelf: 'B2', bin: null, updated_at: '2026-11-03T13:00:00.000Z',
      } as Record<string, unknown> | null,
      error: null as { code: string; message: string } | null,
    },
  }
  const chain = {
    eq(col: string, value: string) { state.filters.push([col, value]); return chain },
    select(columns: string) { state.selected.push(columns); return chain },
    maybeSingle: async () => state.result,
  }
  return { state, chain }
})

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table !== 'product_units') throw new Error('Unexpected table ' + table)
      return {
        update: (payload: Record<string, unknown>) => {
          db.state.updates.push(payload)
          return db.chain
        },
      }
    },
  },
}))

const { updateUnitConfig, updateUnit } = await import('../updateUnit')

const valid = {
  unitId: 'unit-1',
  clientUuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  expectedRevision: '2026-11-03T12:00:00.000Z',
  patch: { assetTag: ' --FX3-02-- ', rack: ' A ', shelf: ' B2 ' },
}

const warehouse = { userId: 'actor-1', role: 'Warehouse' as const, isOnline: true }

beforeEach(() => {
  db.state.updates = []
  db.state.selected = []
  db.state.filters = []
  db.state.result = {
    data: {
      id: 'unit-1', asset_tag: 'FX3-02', serial_no: null,
      rack: 'A', shelf: 'B2', bin: null, updated_at: '2026-11-03T13:00:00.000Z',
    },
    error: null,
  }
})

describe('T2-17 updateUnit', () => {
  it('exposes a narrow capability (no Coordinator / Technician role expansion)', () => {
    expect(updateUnitConfig.permissions).toEqual(['inventory.update_unit_identity'])
  })
  it('rejects lifecycle, condition and money-field injection before any write', () => {
    for (const key of ['status', 'condition', 'replacementValue', 'purchase_price', 'updated_by']) {
      expect(() => updateUnitConfig.validate({
        ...valid, patch: { [key]: 'bad' },
      })).toThrow(/cannot be changed/)
    }
    expect(db.state.updates).toHaveLength(0)
  })
  it('refuses missing revision and blank or dash-only tags', () => {
    expect(() => updateUnitConfig.validate({ ...valid, expectedRevision: '' })).toThrow(/revision/)
    expect(() => updateUnitConfig.validate({ ...valid, patch: { assetTag: ' -- ' } })).toThrow(/required/)
  })
  it('rejects offline writes before reaching the database', async () => {
    await expect(updateUnit({ ...valid }, { ...warehouse, isOnline: false })).rejects.toThrow(/offline/)
    expect(db.state.updates).toHaveLength(0)
  })
  it('allows Warehouse and denies Coordinator, Technician and Client', async () => {
    const ok = await updateUnit(valid, warehouse)
    expect(ok.assetTag).toBe('FX3-02')
    for (const role of ['Coordinator', 'Technician', 'Client'] as const) {
      await expect(updateUnit(valid, { ...warehouse, role })).rejects.toThrow()
    }
  })
  it('updates only whitelisted non-money columns and the revision/actor, atomically keyed by old revision', async () => {
    await updateUnitConfig.execute(valid, warehouse)
    expect(db.state.filters).toContainEqual(['id', 'unit-1'])
    expect(db.state.filters).toContainEqual(['updated_at', valid.expectedRevision])
    expect(db.state.updates).toHaveLength(1)
    const patch = db.state.updates[0]!
    expect(patch).toMatchObject({ asset_tag: 'FX3-02', rack: 'A', shelf: 'B2', updated_by: 'actor-1' })
    expect(Object.keys(patch).sort()).toEqual(['asset_tag', 'rack', 'shelf', 'updated_at', 'updated_by'])
    expect(db.state.selected).toEqual(['id, asset_tag, serial_no, rack, shelf, bin, updated_at'])
    expect(JSON.stringify(patch)).not.toMatch(/replacement|price|cost|amount|rate|status|condition/)
  })
  it('sends a clearable serial and an untouched dash inside the tag', async () => {
    await updateUnitConfig.execute({ ...valid, patch: { assetTag: ' FX3-A ', serialNo: '' } }, warehouse)
    expect(db.state.updates[0]).toMatchObject({ asset_tag: 'FX3-A', serial_no: null })
  })
  it('a stale tab or RLS zero-row update is never reported as saved', async () => {
    db.state.result.data = null
    await expect(updateUnitConfig.execute(valid, warehouse)).rejects.toThrow(/changed since you opened/)
  })
  it('reports unique-key conflict without losing the draft', async () => {
    db.state.result = { data: null, error: { code: '23505', message: 'duplicate key' } }
    await expect(updateUnitConfig.execute(valid, warehouse)).rejects.toThrow(/already assigned/)
  })
  it('reports a different database failure instead of claiming success', async () => {
    db.state.result = { data: null, error: { code: '42501', message: 'permission denied' } }
    await expect(updateUnitConfig.execute(valid, warehouse)).rejects.toThrow(/not saved/)
  })
})
