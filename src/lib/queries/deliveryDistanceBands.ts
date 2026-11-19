import { supabase } from '../supabase'
import type { DistanceBand } from '../deliveryDistanceBand'

/*
 * RULING 2026-11-19 (O-28b): read and write the road-distance band of a delivery zone
 * (migration 0248). A check only: no price depends on it. A zone with no row, or a row with a
 * NULL lower bound, has no band set.
 */

type BandRow = { zone_id: string; min_km: number | string | null; max_km: number | string | null }

/** Every zone's band, keyed by zone id. A zone with no band set is absent from the map. */
export async function fetchDistanceBands(): Promise<Map<string, DistanceBand>> {
  const { data, error } = await supabase.from('delivery_zone_distance_bands').select('zone_id, min_km, max_km')
  if (error) throw new Error(`Could not read the zone distance bands: ${error.message}`)
  const bands = new Map<string, DistanceBand>()
  for (const row of (data ?? []) as unknown as BandRow[]) {
    if (row.min_km === null) continue
    bands.set(row.zone_id, {
      minKm: Number(row.min_km),
      maxKm: row.max_km === null ? null : Number(row.max_km),
    })
  }
  return bands
}

/** Saves a zone's band. A null band clears it to not set (the row is kept, nothing is deleted). */
export async function setDistanceBand(zoneId: string, band: DistanceBand | null): Promise<void> {
  const { error } = await supabase.rpc('set_delivery_zone_distance_band', {
    p_zone_id: zoneId,
    p_min_km: band === null ? null : band.minKm,
    p_max_km: band === null ? null : band.maxKm,
  })
  if (error) throw new Error(`The distance band was not saved: ${error.message}`)
}
