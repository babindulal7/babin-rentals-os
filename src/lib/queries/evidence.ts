import { supabase } from '../supabase'
import {
  PHOTOS,
  matchState,
  THRESHOLDS,
  CATEGORY_NAMES,
  UPLOAD_SOURCES,
  UPLOAD_ROADMAP,
  STEPS,
  BULK_ACTIONS,
  LIMITS,
  type MatchState,
  type MatchSource,
  type Photo,
} from '../../data/evidence'

export {
  PHOTOS,
  matchState,
  THRESHOLDS,
  CATEGORY_NAMES,
  UPLOAD_SOURCES,
  UPLOAD_ROADMAP,
  STEPS,
  BULK_ACTIONS,
  LIMITS,
}

export type { MatchState, MatchSource, Photo }

export interface EvidenceSummary {
  photos: Photo[]
  total: number
  matched: number
  review: number
  unmatched: number
}

export interface SavedEvidenceFile {
  id: string
  referenceId: string
  storagePath: string
  filename: string
  fileSizeBytes: number
  category: string
  operationStage: string
  createdAt: string
  itemId: string | null
}

/**
 * Loads persisted evidence files linked to a booking.
 */
export async function fetchBookingEvidenceFiles(bookingId: string): Promise<SavedEvidenceFile[]> {
  try {
    const { data, error } = await supabase
      .from('evidence_references')
      .select(`
        id,
        operation_stage,
        item_id,
        created_at,
        file:evidence_files(
          id,
          storage_path,
          original_filename,
          size_bytes,
          category,
          removed_at
        )
      `)
      .eq('booking_id', bookingId)
      .is('removed_at', null)
      .order('created_at', { ascending: false })

    if (error || !Array.isArray(data)) {
      throw new Error(error?.message ?? 'Evidence query returned no usable data')
    }

    const results: SavedEvidenceFile[] = []
    for (const row of data as Array<{
      id: string
      operation_stage: string
      item_id: string | null
      created_at: string
      file: {
        id: string
        storage_path: string
        original_filename: string | null
        size_bytes: number | null
        category: string | null
        removed_at: string | null
      } | Array<{
        id: string
        storage_path: string
        original_filename: string | null
        size_bytes: number | null
        category: string | null
        removed_at: string | null
      }> | null
    }>) {
      const file = Array.isArray(row.file) ? row.file[0] : row.file
      if (!file || file.removed_at !== null) continue
      results.push({
        id: file.id,
        referenceId: row.id,
        storagePath: file.storage_path,
        filename: file.original_filename ?? 'evidence_photo.jpg',
        fileSizeBytes: file.size_bytes ?? 0,
        category: file.category ?? 'Inspection',
        operationStage: row.operation_stage,
        createdAt: row.created_at,
        itemId: row.item_id ?? null,
      })
    }
    return results
  } catch (err) {
    throw new Error(`Could not load photos: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Loads evidence files and summary for an operation or booking.
 */
export async function getEvidenceSummary(): Promise<EvidenceSummary> {
  try {
    const { data, error } = await supabase
      .from('evidence_files')
      .select('id, match_state, match_source, category, processing_step')

    if (error) {
      return {
        photos: [],
        total: 0,
        matched: 0,
        review: 0,
        unmatched: 0,
      }
    }

    const rows = data ?? []
    let matched = 0
    let review = 0
    let unmatched = 0

    for (const d of rows) {
      if (d.match_state === 'Matched') matched++
      else if (d.match_state === 'Review') review++
      else unmatched++
    }

    return {
      photos: [],
      total: rows.length,
      matched,
      review,
      unmatched,
    }
  } catch {
    return {
      photos: [],
      total: 0,
      matched: 0,
      review: 0,
      unmatched: 0,
    }
  }
}
