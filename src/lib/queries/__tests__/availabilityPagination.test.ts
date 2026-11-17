import { describe, expect, it } from 'vitest'
import { readCompleteAvailability } from '../availability'

type RecordRow = { id: string; qty: number }

describe('readCompleteAvailability (server-authoritative availability)', () => {
  it('keeps reading after a partial page until the server explicitly returns an empty page', async () => {
    const expected: RecordRow[] = Array.from({ length: 1203 }, (_, i) => ({ id: `row-${i}`, qty: 1 }))
    const pages: number[] = []
    const actual = await readCompleteAvailability<RecordRow>(async (from, to) => {
      pages.push(from)
      return { data: expected.slice(from, to + 1), error: null }
    }, 'test stock')
    expect(actual).toEqual(expected)
    expect(pages).toEqual([0, 500, 1000, 1203])
  })

  it('does not equate a failed second page with available stock', async () => {
    await expect(readCompleteAvailability<RecordRow>(async (from) =>
      from === 0
        ? { data: [{ id: 'row-1', qty: 1 }], error: null }
        : { data: null, error: { message: 'permission denied' } },
    'reservation holds')).rejects.toThrow('permission denied')
  })

  it('refuses a missing dataset instead of treating it as no reservations', async () => {
    await expect(readCompleteAvailability<RecordRow>(async () => ({
      data: null,
      error: null,
    }), 'reservation holds')).rejects.toThrow('incomplete')
  })

  it('refuses duplicated IDs across pages', async () => {
    await expect(readCompleteAvailability<RecordRow>(async (from) => ({
      data: from === 0 ? [{ id: 'same-id', qty: 1 }] : from === 1 ? [{ id: 'same-id', qty: 2 }] : [],
      error: null,
    }), 'reservation holds')).rejects.toThrow('duplicate')
  })

  it('returns an empty result only when an actual empty page was received', async () => {
    const rows = await readCompleteAvailability<RecordRow>(async () => ({ data: [], error: null }), 'booking lines')
    expect(rows).toEqual([])
  })
})
