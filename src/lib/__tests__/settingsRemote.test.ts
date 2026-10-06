// @vitest-environment jsdom
/** G1 — the loader and the saver against a fake `settings` table. */
import { describe, it, expect, beforeEach, vi } from 'vitest'

type Row = { id: string; key: string; value: unknown; scope: 'org' | 'location'; location_id: string | null }
let rows: Row[] = []
let ownerOnly = true
let isOwner = true
let selectFails = false

function builder() {
  const filters: Array<(r: Row) => boolean> = []
  let op: 'select' | 'update' | 'insert' = 'select'
  let patch: Partial<Row> = {}
  const api: Record<string, unknown> = {
    select() { return api },
    eq(c: keyof Row, v: unknown) { filters.push((r) => r[c] === v); return api },
    is(c: keyof Row, v: unknown) { filters.push((r) => r[c] === v); return api },
    update(p: Partial<Row>) { op = 'update'; patch = p; return api },
    insert(p: Partial<Row>) { op = 'insert'; patch = p; return api },
    maybeSingle() { return Promise.resolve({ data: rows.filter((r) => filters.every((f) => f(r)))[0] ?? null, error: null }) },
    then(res: (v: unknown) => unknown) {
      if (selectFails) return res({ data: null, error: { message: 'x' } })
      if (op === 'select') return res({ data: rows.filter((r) => filters.every((f) => f(r))), error: null })
      if (ownerOnly && !isOwner) return res({ data: [], error: null }) // RLS: silently no row
      if (op === 'update') {
        const hit = rows.filter((r) => filters.every((f) => f(r)))
        hit.forEach((r) => Object.assign(r, patch))
        return res({ data: hit.map((r) => ({ id: r.id })), error: null })
      }
      const row = { id: `id${rows.length + 1}`, location_id: null, scope: 'org', ...patch } as Row
      rows.push(row)
      return res({ data: [{ id: row.id }], error: null })
    },
  }
  return api
}

vi.mock('../supabase', () => ({ supabase: { from: () => builder() } }))

import { hydrateSettings, saveSettings, setActiveLocation } from '../queries/settingsRemote'
import { readSettings, clearRemoteSettings, remoteSettingsLoaded } from '../settingsStore'

beforeEach(() => {
  window.localStorage.clear()
  clearRemoteSettings()
  setActiveLocation(null)
  rows = []
  ownerOnly = true
  isOwner = true
  selectFails = false
})

describe('shared settings loader and saver', () => {
  it('device A saves, device B (empty cache, same rows) reads the value', async () => {
    await hydrateSettings()
    await saveSettings({ operationalDayStart: '05:30' })
    // "device B": nothing cached, nothing local
    clearRemoteSettings()
    window.localStorage.clear()
    await hydrateSettings()
    expect(readSettings().operationalDayStart).toBe('05:30')
  })

  it('a second save updates the same row instead of adding one', async () => {
    await hydrateSettings()
    await saveSettings({ vatRatePercent: 12 })
    await saveSettings({ vatRatePercent: 14 })
    expect(rows.filter((r) => r.key === 'vatRatePercent')).toHaveLength(1)
    expect(readSettings().vatRatePercent).toBe(14)
  })

  it('a refused write (non-Owner, RLS returns no row) throws and changes nothing', async () => {
    await hydrateSettings()
    isOwner = false
    await expect(saveSettings({ vatRatePercent: 9 })).rejects.toThrow(/Owner/)
    expect(readSettings().vatRatePercent).toBe(13)
  })

  it('an invalid value is refused before it reaches the database', async () => {
    await hydrateSettings()
    await expect(saveSettings({ vatRatePercent: 400 })).rejects.toThrow()
    expect(rows).toHaveLength(0)
  })

  it('a location override is allowed only for operationalDayStart', async () => {
    await hydrateSettings()
    await expect(saveSettings({ vatRatePercent: 5 }, 'loc1')).rejects.toThrow(/organisation-wide/)
    await saveSettings({ operationalDayStart: '07:00' }, 'loc1')
    expect(rows[0]).toMatchObject({ scope: 'location', location_id: 'loc1' })
  })

  it("the active location's override beats the org value", async () => {
    rows = [
      { id: 'a', key: 'operationalDayStart', value: '06:00', scope: 'org', location_id: null },
      { id: 'b', key: 'operationalDayStart', value: '07:00', scope: 'location', location_id: 'loc1' },
    ]
    setActiveLocation('loc1')
    await hydrateSettings()
    expect(readSettings().operationalDayStart).toBe('07:00')
    setActiveLocation('loc2')
    await hydrateSettings()
    expect(readSettings().operationalDayStart).toBe('06:00')
  })

  it('a failed load leaves the local fallback in place', async () => {
    window.localStorage.setItem('br.settings.vatRatePercent', '11')
    selectFails = true
    expect(await hydrateSettings()).toBe(false)
    expect(remoteSettingsLoaded()).toBe(false)
    expect(readSettings().vatRatePercent).toBe(11)
  })

  it('device preferences are saved locally, never to the table', async () => {
    await hydrateSettings()
    await saveSettings({ density: 'Compact' })
    expect(rows).toHaveLength(0)
    expect(readSettings().density).toBe('Compact')
  })
})
