/**
 * Smart Workspace Views v1 — the migration-marker edge case the pack requires a
 * regression for (§4.6 of the implementation doc):
 *
 *   DB unavailable → legacy list empty → marker written anyway (the bug) → the
 *   menu falls back to device storage → the user saves real views there → the
 *   database arrives → the marker says "done" → those views are stranded on one
 *   device forever.
 *
 * The fix: `migrateLocalViews` writes the marker only after the database has
 * confirmed something — an empty legacy list writes nothing. These tests pin
 * both that sequence and the two behaviors the pack says must not regress:
 * a completed migration never repeats (so a retired DB view cannot resurrect),
 * and a populated legacy list still migrates exactly once with its backup kept.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  rpcCalls: [] as Array<Record<string, unknown>>,
  dbAvailable: true,
}))

vi.mock('../supabase', () => ({
  newClientUuid: () => '00000000-0000-4000-8000-000000000000',
  supabase: {
    rpc: (_fn: string, args: Record<string, unknown>) => {
      mocks.rpcCalls.push(args)
      if (mocks.dbAvailable) return Promise.resolve({ data: '00000000-0000-4000-8000-00000000view1', error: null })
      return Promise.resolve({
        data: null,
        error: { message: 'Could not find the function public.save_view in the schema cache' },
      })
    },
  },
}))

vi.mock('../safeStorage', () => ({
  readLocal: (key: string) => mocks.storage.get(key) ?? null,
  writeLocal: (key: string, value: string) => {
    mocks.storage.set(key, value)
  },
}))

const { migrateLocalViews, readDeviceViews, writeDeviceViews } = await import('../savedViews')

const KEY = 'babin-inventory:saved-views:u-1'
const MARKER = `${KEY}:migrated-to-db`

function seedLegacy(views: Array<{ id: string; name: string; query: string }>) {
  mocks.storage.set(KEY, JSON.stringify(views.map((v) => ({ ...v, hiddenColumns: [] }))))
}

beforeEach(() => {
  mocks.storage.clear()
  mocks.rpcCalls.length = 0
  mocks.dbAvailable = true
})

describe('migrateLocalViews — the marker follows the database, not the calendar', () => {
  it('does not write the marker before the database has confirmed anything (the stranded-views sequence)', async () => {
    // 1. 0159 not applied, nothing saved yet. The old code wrote the marker HERE,
    //    without making a single database call, because the legacy list was empty.
    mocks.dbAvailable = false
    await expect(migrateLocalViews('inventory', KEY)).resolves.toBe(0)
    expect(mocks.storage.get(MARKER)).toBeUndefined()
    expect(mocks.rpcCalls).toHaveLength(0)

    // 2. Device-fallback mode: the user saves a real view on this device.
    writeDeviceViews(KEY, [
      {
        id: 'v1', name: 'FX3 on rent', query: 'q=FX3&chip=on-rent', hiddenColumns: [],
        visibility: 'private', isSystem: false, ownerId: 'u-1', createdAt: new Date().toISOString(),
      },
    ])
    expect(readDeviceViews(KEY, 'u-1', 'inventory').map((v) => v.name)).toEqual(['FX3 on rent'])

    // 3. The database arrives. The view MUST migrate now — the marker must not
    //    have been pre-written in step 1.
    mocks.dbAvailable = true
    await expect(migrateLocalViews('inventory', KEY)).resolves.toBe(1)
    expect(mocks.rpcCalls.map((c) => c.p_name)).toEqual(['FX3 on rent'])
    expect(mocks.storage.get(MARKER)).toBe('done')
  })

  it('a completed migration never repeats, so a view retired in the database cannot resurrect', async () => {
    seedLegacy([{ id: 'a', name: 'Old view', query: 'stage=Draft' }])
    await expect(migrateLocalViews('rentals', KEY)).resolves.toBe(1)
    expect(mocks.storage.get(MARKER)).toBe('done')

    // The legacy backup is left in place (nothing is deleted), but a later load
    // — even one where the database answers again — must not re-save it.
    mocks.rpcCalls.length = 0
    seedLegacy([{ id: 'a', name: 'Old view', query: 'stage=Draft' }])
    await expect(migrateLocalViews('rentals', KEY)).resolves.toBe(0)
    expect(mocks.rpcCalls).toHaveLength(0)
  })

  it('still migrates a populated legacy list exactly once and keeps the backup', async () => {
    seedLegacy([
      { id: 'a', name: 'View A', query: 'q=FX3' },
      { id: 'b', name: 'View B', query: 'chip=on-rent' },
    ])
    await expect(migrateLocalViews('inventory', KEY)).resolves.toBe(2)
    expect(mocks.rpcCalls.map((c) => c.p_name)).toEqual(['View A', 'View B'])
    expect(mocks.storage.get(MARKER)).toBe('done')
    // The pre-G2 list is a backup, not a casualty (the module contract).
    expect(JSON.parse(mocks.storage.get(KEY) ?? '[]')).toHaveLength(2)
  })

  it('a name the database refuses as a duplicate finishes the migration instead of retrying forever', async () => {
    const { supabase } = await import('../supabase')
    const original = supabase.rpc.bind(supabase)
    ;(supabase as { rpc: unknown }).rpc = (_fn: string, args: Record<string, unknown>) => {
      mocks.rpcCalls.push(args)
      return Promise.resolve({
        data: null,
        error: { message: 'GATE:saved_view.duplicate|duplicate key value violates unique constraint "saved_views_list_key_name_key"' },
      })
    }
    try {
      seedLegacy([{ id: 'a', name: 'Already in DB', query: 'q=FX3' }])
      await expect(migrateLocalViews('inventory', KEY)).resolves.toBe(0)
      expect(mocks.rpcCalls).toHaveLength(1)
      expect(mocks.storage.get(MARKER)).toBe('done')
    } finally {
      ;(supabase as { rpc: unknown }).rpc = original
    }
  })

  it('a network failure mid-migration leaves the marker unset so the next load retries', async () => {
    mocks.dbAvailable = false
    seedLegacy([
      { id: 'a', name: 'View A', query: 'q=FX3' },
      { id: 'b', name: 'View B', query: 'chip=on-rent' },
    ])
    await expect(migrateLocalViews('inventory', KEY)).resolves.toBe(0)
    expect(mocks.storage.get(MARKER)).toBeUndefined()

    mocks.dbAvailable = true
    await expect(migrateLocalViews('inventory', KEY)).resolves.toBe(2)
  })
})
