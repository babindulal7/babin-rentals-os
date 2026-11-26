/**
 * Documents counts (audit sweep-C-finance-reports-1-11).
 *
 * The All tab lists the rows that are not archived, so its count leaves archived
 * documents out. The Archived count stays on its own tab. The Total Documents
 * tile still counts everything not deleted, archived included, and its note says
 * so (spec §6).
 */
import { describe, it, expect } from 'vitest'
import {
  DOCUMENTS,
  categoriesFor,
  kpisFor,
  totalDocuments,
  totalDocumentsIncludingArchived,
} from '../documents'

const archivedRows = DOCUMENTS.filter((d) => d.archived)
const liveRows = DOCUMENTS.filter((d) => !d.archived)

describe('the All count equals the rows All shows', () => {
  it('leaves archived documents out of the All total', () => {
    expect(archivedRows.length).toBeGreaterThan(0)
    expect(totalDocuments(true)).toBe(liveRows.length)
  })

  it('matches the non-archived rows for a money-blind session too', () => {
    const visible = DOCUMENTS.filter((d) => !d.archived && !d.finance)
    expect(totalDocuments(false)).toBe(visible.length)
  })

  it('keeps the Archived count on its own tab', () => {
    const archived = categoriesFor(true).find((c) => c.key === 'Archived')
    expect(archived?.count).toBe(archivedRows.length)
  })

  it('All plus Archived accounts for every document', () => {
    expect(totalDocuments(true) + archivedRows.length).toBe(DOCUMENTS.length)
  })
})

describe('the Total Documents tile counts archived documents, and says so', () => {
  it('keeps the archived-inclusive basis its note states', () => {
    const tile = kpisFor(true).find((k) => k.label === 'Total Documents')
    expect(tile?.value).toBe(String(DOCUMENTS.length))
    expect(tile?.note).toBe('All categories, including archived')
    expect(totalDocumentsIncludingArchived(true)).toBe(DOCUMENTS.length)
  })
})
