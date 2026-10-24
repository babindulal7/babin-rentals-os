import { supabase } from '../supabase'

export interface OperationTaskFacts {
  total: number
  resetDone: number
  cleaningPending: number
  qcPending: number
  problems: number
}

/** Cleanup facts are independent of booking stage and unit availability. */
export async function fetchOperationTaskFacts(bookingId: string): Promise<OperationTaskFacts> {
  const facts: OperationTaskFacts = { total: 0, resetDone: 0, cleaningPending: 0, qcPending: 0, problems: 0 }
  const seen = new Set<string>()
  for (;;) {
    const { data, error } = await supabase.from('cleaning_queue_entries')
      .select('id, requires_clean, requires_reset, clean_completed_at, reset_completed_at, qc_at, qc_skipped, qc_skip_reason, qc_fail_reason, problem_state')
      .eq('booking_id', bookingId).order('id', { ascending: true }).range(seen.size, seen.size + 499)
    if (error || !Array.isArray(data)) throw new Error('Cleaning and QC task records could not be verified. Retry booking status.')
    if (data.length === 0) return facts
    for (const row of data) {
      if (!row.id || seen.has(row.id) || typeof row.requires_clean !== 'boolean' || typeof row.requires_reset !== 'boolean') throw new Error('Cleaning and QC task records are incomplete. Retry booking status.')
      if ([row.clean_completed_at, row.reset_completed_at, row.qc_at].some(value => value !== null && (typeof value !== 'string' || !Number.isFinite(Date.parse(value))))) throw new Error('Cleaning and QC timestamps could not be verified. Retry booking status.')
      seen.add(row.id)
      facts.total += 1
      if (row.reset_completed_at) facts.resetDone += 1
      if (row.requires_clean && !row.clean_completed_at) facts.cleaningPending += 1
      if (row.requires_reset && !row.qc_at && !(row.qc_skipped && row.qc_skip_reason?.trim())) facts.qcPending += 1
      if ((row.problem_state && row.problem_state !== 'No Problems') || row.qc_fail_reason?.trim()) facts.problems += 1
    }
    if (seen.size > 50_000) throw new Error('Cleaning and QC task records exceed the read limit.')
  }
}
