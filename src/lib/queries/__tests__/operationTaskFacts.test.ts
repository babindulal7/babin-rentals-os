import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchOperationTaskFacts } from '../operationTaskFacts'
const db = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], error: false, missing: false }))
vi.mock('../../supabase', () => ({ supabase: { from: () => {
  let start = 0
  const query = { select: () => query, eq: () => query, order: () => query, range: (from: number) => { start = from; return query }, then: (resolve: (value: unknown) => unknown) => Promise.resolve({data: db.missing ? null : db.rows.slice(start, start + 1), error: db.error ? {message:'denied'} : null}).then(resolve) }
  return query
} } }))
const pending = (id: string) => ({ id, requires_clean: true, requires_reset: true, clean_completed_at: null, reset_completed_at: null, qc_at: null, qc_skipped: false, qc_skip_reason: null, problem_state: 'No Problems' })
beforeEach(() => { db.rows = []; db.error = false; db.missing = false })
describe('saved cleanup facts', () => {
  it('keeps pending tasks pending independently of a returned booking', async () => {
    db.rows = [pending('a'), pending('b')]
    expect(await fetchOperationTaskFacts('booking')).toEqual({total:2,resetDone:0,cleaningPending:2,qcPending:2,problems:0})
  })
  it('counts persisted completion and actual exceptions, never progress by stage', async () => {
    db.rows = [{...pending('a'), clean_completed_at:'2026-10-24T00:00:00Z', reset_completed_at:'2026-10-24T01:00:00Z', qc_at:'2026-10-24T00:30:00Z'}, {...pending('b'), problem_state:'Damaged'}]
    expect(await fetchOperationTaskFacts('booking')).toEqual({total:2,resetDone:1,cleaningPending:1,qcPending:1,problems:1})
  })
  it('does not treat an unreadable task source as zero tasks', async () => { db.missing = true; await expect(fetchOperationTaskFacts('booking')).rejects.toThrow('could not be verified') })
  it('reports an honest empty queue without claiming completion', async () => { expect((await fetchOperationTaskFacts('booking')).total).toBe(0) })
})
