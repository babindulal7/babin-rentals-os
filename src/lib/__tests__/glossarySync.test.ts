import { describe, it, expect, vi, beforeEach } from 'vitest'

const { fromMock, mergeGlossaryRevisionsMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  mergeGlossaryRevisionsMock: vi.fn(),
}))

vi.mock('../supabase', () => ({
  supabase: {
    from: fromMock,
  },
}))

vi.mock('../glossaryStore', () => ({
  mergeGlossaryRevisions: mergeGlossaryRevisionsMock,
}))

import { readGlossaryRevisions, hydrateGlossary } from '../glossarySync'

describe('glossarySync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads and validates glossary revisions and hydrates glossaryStore', async () => {
    const rev = { term_key: 'rentals.title', original_nepali: 'भाडा', nepali: 'भाडा सूची', revision: 2 }
    fromMock.mockReturnValue({
      select: () => ({
        order: () => ({
          range: async () => ({ data: [rev], error: null }),
        }),
      }),
    })

    const rows = await readGlossaryRevisions()
    expect(rows).toEqual([rev])

    await hydrateGlossary()
    expect(mergeGlossaryRevisionsMock).toHaveBeenCalledWith([rev])
  })

  it('throws clear error on DB failure or malformed revision row', async () => {
    fromMock.mockReturnValueOnce({
      select: () => ({
        order: () => ({
          range: async () => ({ data: null, error: { message: 'network' } }),
        }),
      }),
    })
    await expect(readGlossaryRevisions()).rejects.toThrow(/Could not load approved glossary changes/i)

    fromMock.mockReturnValueOnce({
      select: () => ({
        order: () => ({
          range: async () => ({ data: [{ term_key: 123 }], error: null }),
        }),
      }),
    })
    await expect(readGlossaryRevisions()).rejects.toThrow(/Could not read glossary history/i)
  })
})
