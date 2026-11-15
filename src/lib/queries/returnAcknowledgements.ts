import { supabase } from '../supabase'
import { EVIDENCE_STORAGE_BUCKET } from '../evidenceStorage'
import { formatReturnFlaggedItem, type ReturnFlaggedItemSnapshot } from '../returnAcknowledgement'

export interface ReturnAcknowledgement {
  sessionId: string
  returningName: string
  recordedAt: string
  refusalReason: string | null
  signatureUrl: string | null
  flaggedItems: string[]
}

/** Explicit columns only: floor documents and damage notices receive no money. */
export async function fetchReturnAcknowledgements(bookingId: string): Promise<ReturnAcknowledgement[]> {
  const { data: sessions, error: sessionError } = await supabase.from('operation_sessions')
    .select('id').eq('booking_id', bookingId).eq('operation', 'Return').eq('state', 'Completed')
  if (sessionError || !Array.isArray(sessions)) throw new Error('Return sessions could not be verified for printing.')
  if (sessions.length === 0) return []
  const { data, error } = await supabase.from('return_acknowledgements')
    .select('session_id, returning_name, recorded_at, refusal_reason, signature_id, flagged_items')
    .in('session_id', sessions.map((row: { id: string }) => row.id)).order('recorded_at', { ascending: true })
  if (error || !Array.isArray(data)) throw new Error('Return acknowledgements could not be loaded.')
  if (data.length === 0) return []
  const { data: lines, error: linesError } = await supabase.from('booking_lines').select('id, description').eq('booking_id', bookingId)
  if (linesError || !Array.isArray(lines)) throw new Error('The acknowledged items could not be loaded.')
  const lineNames = new Map<string, string>(lines.map((line: { id: string; description: string }) => [line.id, line.description]))
  return Promise.all(data.map(async (row: { session_id: string; returning_name: string; recorded_at: string; refusal_reason: string | null; signature_id: string | null; flagged_items: ReturnFlaggedItemSnapshot[] }) => {
    let signatureUrl: string | null = null
    if (row.signature_id) {
      const { data: signature, error: signatureError } = await supabase.from('signatures')
        .select('signature_evidence_file_id').eq('id', row.signature_id).single()
      if (signatureError || !signature?.signature_evidence_file_id) throw new Error('The stored Return signature could not be verified.')
      const { data: file, error: fileError } = await supabase.from('evidence_files')
        .select('storage_path').eq('id', signature.signature_evidence_file_id).is('removed_at', null).single()
      if (fileError || !file?.storage_path) throw new Error('The Return signature image is unavailable.')
      const { data: link, error: linkError } = await supabase.storage.from(EVIDENCE_STORAGE_BUCKET).createSignedUrl(file.storage_path, 300)
      if (linkError || !link?.signedUrl) throw new Error('The Return signature image could not be opened.')
      signatureUrl = link.signedUrl
    }
    if (!Array.isArray(row.flagged_items)) throw new Error('The stored flagged-item list is incomplete.')
    return { sessionId: row.session_id, returningName: row.returning_name, recordedAt: row.recorded_at, refusalReason: row.refusal_reason, signatureUrl,
      flaggedItems: row.flagged_items.flatMap(item => formatReturnFlaggedItem(item, lineNames.get(item.booking_line_id) || item.booking_line_id)) }
  }))
}
