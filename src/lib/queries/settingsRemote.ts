import {
  SETTING_SPECS,
  SETTINGS_DEFAULTS,
  DEVICE_KEYS,
  LOCATION_OVERRIDABLE_KEYS,
  applyRemoteSettings,
  clearRemoteSettings,
  readSettings,
  remoteSettingsLoaded,
  validateSetting,
  writeSettings,
} from '../settingsStore'
import type { SettingKey, SettingValue, SettingsRecord } from '../settingsStore'

/**
 * Shared settings (G1, migration 0158). The store stays synchronous for its many
 * readers; this file is the only place that talks to the `settings` table.
 *
 * `supabase` is imported lazily so tests and mock mode, which have no live
 * client, keep the old localStorage behaviour instead of throwing at import.
 */

interface SettingRow {
  key: string
  value: unknown
  scope: 'org' | 'location'
  location_id: string | null
}

let activeLocationId: string | null = null

/** The branch whose location overrides apply. Single location today, so unset. */
export function setActiveLocation(id: string | null): void {
  activeLocationId = id
}

async function client() {
  try {
    const mod = await import('../supabase')
    return mod.supabase
  } catch {
    return null
  }
}

/** Loads the shared settings. Never throws: on failure the store keeps its fallback. */
export async function hydrateSettings(): Promise<boolean> {
  const db = await client()
  if (!db) return false
  try {
    const { data, error } = await db.from('settings').select('key, value, scope, location_id')
    if (error || !data) return false
    const org: Partial<Record<SettingKey, SettingValue>> = {}
    const loc: Partial<Record<SettingKey, SettingValue>> = {}
    for (const r of data as unknown as SettingRow[]) {
      const v = r.value as SettingValue
      if (r.scope === 'org') org[r.key as SettingKey] = v
      else if (activeLocationId && r.location_id === activeLocationId) loc[r.key as SettingKey] = v
    }
    applyRemoteSettings(org, loc)
    return true
  } catch {
    return false
  }
}

export { clearRemoteSettings }

type Db = NonNullable<Awaited<ReturnType<typeof client>>>

async function upsertSetting(db: Db, key: string, value: SettingValue, locationId: string | null) {
  const scope = locationId ? 'location' : 'org'
  let q = db.from('settings').select('id').eq('key', key).eq('scope', scope)
  q = locationId ? q.eq('location_id', locationId) : q.is('location_id', null)
  const found = await q.maybeSingle()
  if (found.error) throw new Error('Could not save the setting. Try again.')
  const res = found.data
    ? await db.from('settings').update({ value }).eq('id', (found.data as { id: string }).id).select('id')
    : await db.from('settings').insert({ key, value, scope, location_id: locationId }).select('id')
  // RLS refuses a non-Owner write by returning no row, not an error.
  if (res.error || !res.data || res.data.length === 0) {
    throw new Error('Only the Owner can change settings, or the change could not be saved.')
  }
}

/**
 * Saves a patch. Shared keys go to the database; device keys stay on this device.
 * If shared settings were never loaded (mock, offline) it falls back to local storage.
 * `locationId` writes a location override and is refused for any key but `operationalDayStart`.
 */
export async function saveSettings(patch: Partial<SettingsRecord>, locationId: string | null = null): Promise<void> {
  const entries = Object.entries(patch) as Array<[SettingKey, SettingValue]>
  for (const [k, v] of entries) {
    const problem = validateSetting(k, v)
    if (problem) throw new Error(problem)
    if (locationId && !LOCATION_OVERRIDABLE_KEYS.includes(k)) {
      throw new Error(`${k} is organisation-wide; only the operational day start may differ per location.`)
    }
  }
  if (!remoteSettingsLoaded()) {
    writeSettings(patch)
    return
  }
  const shared = entries.filter(([k]) => !DEVICE_KEYS.includes(k))
  const device = entries.filter(([k]) => DEVICE_KEYS.includes(k))
  if (device.length) writeSettings(Object.fromEntries(device) as Partial<SettingsRecord>)
  if (!shared.length) return
  const db = await client()
  if (!db) throw new Error('Settings could not be saved: no connection.')
  for (const [k, v] of shared) await upsertSetting(db, k, v, locationId)
  await hydrateSettings()
}

/** Writes the coded default over every shared key that differs. History keeps the old values. */
export async function resetSharedSettingsToDefaults(): Promise<void> {
  if (!remoteSettingsLoaded()) return
  const current = readSettings()
  const patch: Record<string, SettingValue> = {}
  for (const k of Object.keys(SETTING_SPECS) as SettingKey[]) {
    if (DEVICE_KEYS.includes(k)) continue
    if (current[k] !== SETTINGS_DEFAULTS[k]) patch[k] = SETTINGS_DEFAULTS[k]
  }
  if (Object.keys(patch).length) await saveSettings(patch as Partial<SettingsRecord>)
}
