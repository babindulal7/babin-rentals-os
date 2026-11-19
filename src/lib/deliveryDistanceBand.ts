/*
 * RULING 2026-11-19 (O-28b): a delivery zone carries a road-distance band from Boudha as a CHECK.
 * The band covers distances over `minKm` up to and including `maxKm`; a null `maxKm` is open-ended.
 * No price depends on it. Pure helpers only; the database enforces the shape (migration 0248).
 */

export type DistanceBand = { minKm: number; maxKm: number | null }

export type KmInput = { ok: true; km: number | null } | { ok: false; error: string }

const MAX_KM = 9999.99

/** Blank means "no value" (null), never 0. Accepts up to two decimals. */
export function parseKmInput(raw: string): KmInput {
  const text = raw.trim()
  if (text === '') return { ok: true, km: null }
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return { ok: false, error: 'Enter a distance in km, like 7 or 12.5' }
  const km = Number(text)
  if (km > MAX_KM) return { ok: false, error: 'That distance is too large' }
  return { ok: true, km }
}

export type BandInput = { ok: true; band: DistanceBand | null } | { ok: false; error: string }

/** Validates a lower and an upper box together. A blank lower box clears the band (not set). */
export function parseBandInput(minRaw: string, maxRaw: string): BandInput {
  const min = parseKmInput(minRaw)
  if (!min.ok) return min
  const max = parseKmInput(maxRaw)
  if (!max.ok) return max
  if (min.km === null) {
    if (max.km !== null) return { ok: false, error: 'Enter the lower distance too, or clear both' }
    return { ok: true, band: null }
  }
  if (max.km !== null && max.km <= min.km) {
    return { ok: false, error: 'The upper distance must be greater than the lower distance' }
  }
  return { ok: true, band: { minKm: min.km, maxKm: max.km } }
}

const km = (n: number): string => String(n)

/** "0–3 km", "over 3–7 km", "over 25 km"; null band reads "Distance not set". */
export function formatDistanceBand(band: DistanceBand | null | undefined): string {
  if (!band) return 'Distance not set'
  if (band.maxKm === null) return `over ${km(band.minKm)} km`
  if (band.minKm === 0) return `0–${km(band.maxKm)} km`
  return `over ${km(band.minKm)}–${km(band.maxKm)} km`
}
