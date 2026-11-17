import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchOperationEvidence } from '../operationEvidence'
import type { Database } from '../../../types/supabase'

const { pages, from, range } = vi.hoisted(() => ({
  pages: [] as Array<{ data: unknown; error: unknown }>, from: vi.fn(), range: vi.fn(),
}))
vi.mock('../../supabase', () => ({
  supabase: { from: (...args: unknown[]) => {
    from(...args)
    const query = { select: () => query, eq: () => query, is: () => query, order: () => query,
      range: (...values: unknown[]) => { range(...values); return Promise.resolve(pages.shift() ?? { data: [], error: null }) } }
    return query
  } },
}))
const file = (id: string, media_type: Database['public']['Enums']['evidence_media_type'] = 'Image', removed_at: string | null = null, category: Database['public']['Enums']['evidence_category'] = 'Damage') => ({ id, media_type, removed_at, category })
beforeEach(() => { pages.length = 0; vi.clearAllMocks() })

describe('saved operation evidence', () => {
  it('counts all booking images but only Damage-category images per unit across pages', async () => {
    pages.push({ data: [
      { id: 'r1', item_id: 'a1', file: file('p1') },
      { id: 'r2', item_id: 'a1', file: file('p1') },
      { id: 'r3', item_id: null, file: file('p2') },
      { id: 'r4', item_id: 'a1', file: file('video', 'Video') },
      { id: 'r5', item_id: 'a2', file: file('removed', 'Image', '2026-10-24T00:00:00Z') },
      { id: 'r7', item_id: 'a2', file: file('document', 'Document') },
      { id: 'r8', item_id: 'a1', file: file('packing-image', 'Image', null, 'Packing') },
    ], error: null }, { data: [{ id: 'r6', item_id: 'a2', file: [file('p3')] }], error: null })
    expect(await fetchOperationEvidence('booking')).toEqual({ files: 4, filesByUnit: { a1: 1, a2: 1 } })
    expect(from).toHaveBeenCalledWith('evidence_references')
    expect(range).toHaveBeenNthCalledWith(2, 7, 506)
  })
  it('refuses a later-page failure rather than claiming partial evidence is complete', async () => {
    pages.push({ data: [{ id: 'r1', item_id: 'a1', file: file('p1') }], error: null }, { data: null, error: { message: 'read refused' } })
    await expect(fetchOperationEvidence('booking')).rejects.toThrow('could not be verified')
  })
  it('refuses missing linked files and duplicate reference pagination', async () => {
    pages.push({ data: [{ id: 'r1', item_id: 'a1', file: null }], error: null })
    await expect(fetchOperationEvidence('booking')).rejects.toThrow('linked evidence file')
    pages.push({ data: [{ id: 'r1', item_id: null, file: file('p1') }], error: null }, { data: [{ id: 'r1', item_id: null, file: file('p1') }], error: null })
    await expect(fetchOperationEvidence('booking')).rejects.toThrow('incomplete')
  })
})
