import { supabase } from '../supabase'

export interface OperationEvidence {
  files: number
  filesByUnit: Readonly<Record<string, number>>
}

/** Only persisted, nonremoved photo files linked to this booking satisfy evidence gates. */
export async function fetchOperationEvidence(bookingId: string): Promise<OperationEvidence> {
  const seen = new Set<string>()
  const files = new Set<string>()
  const units = new Map<string, Set<string>>()
  for (;;) {
    const { data, error } = await supabase.from('evidence_references')
      .select('id, item_id, file:evidence_files(id, media_type, removed_at)')
      .eq('booking_id', bookingId).is('removed_at', null)
      .order('id', { ascending: true }).range(seen.size, seen.size + 499)
    if (error || !Array.isArray(data)) throw new Error('Saved booking evidence could not be verified. Refresh evidence before confirming.')
    if (data.length === 0) return { files: files.size, filesByUnit: Object.fromEntries([...units].map(([id, photos]) => [id, photos.size])) }
    for (const value of data as unknown[]) {
      if (!value || typeof value !== 'object') throw new Error('Saved booking evidence is incomplete.')
      const row = value as Record<string, unknown>
      if (typeof row.id !== 'string' || seen.has(row.id)) throw new Error('Saved booking evidence is incomplete.')
      seen.add(row.id)
      if (Array.isArray(row.file) && row.file.length !== 1) throw new Error('A linked evidence file could not be verified.')
      const nested = Array.isArray(row.file) ? row.file[0] : row.file
      if (!nested || typeof nested !== 'object') throw new Error('A linked evidence file could not be verified.')
      const file = nested as Record<string, unknown>
      if (typeof file.id !== 'string' || typeof file.media_type !== 'string' || !('removed_at' in file)) throw new Error('Saved booking evidence is incomplete.')
      if (file.media_type !== 'Image' || file.removed_at !== null) continue
      files.add(file.id)
      if (typeof row.item_id === 'string') {
        const photos = units.get(row.item_id) ?? new Set<string>()
        photos.add(file.id)
        units.set(row.item_id, photos)
      }
    }
    if (seen.size > 50_000) throw new Error('Saved booking evidence exceeds the verification limit.')
  }
}
