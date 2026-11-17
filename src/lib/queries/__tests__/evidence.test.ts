import { describe, it, expect } from 'vitest'
import {
  getEvidenceSummary,
  fetchBookingEvidenceFiles,
  PHOTOS,
  matchState,
  THRESHOLDS,
  CATEGORY_NAMES,
  UPLOAD_SOURCES,
  UPLOAD_ROADMAP,
  STEPS,
  BULK_ACTIONS,
  LIMITS,
} from '../evidence'

import { supabase } from '../../supabase'
import { vi, beforeEach } from 'vitest'

vi.mock('../../supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

describe('evidence queries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('re-exports canonical evidence configurations and limits', () => {
    expect(PHOTOS.length).toBeGreaterThan(0)
    expect(CATEGORY_NAMES.length).toBeGreaterThan(0)
    expect(UPLOAD_SOURCES.length).toBeGreaterThan(0)
    expect(UPLOAD_ROADMAP.length).toBeGreaterThan(0)
    expect(STEPS.length).toBeGreaterThan(0)
    expect(BULK_ACTIONS.length).toBeGreaterThan(0)
    expect(LIMITS.image).toBeDefined()
    expect(THRESHOLDS.matched).toBe(95)
  })

  it('correctly calculates matchState for sample photos', () => {
    const matchedPhoto = PHOTOS.find((p) => p.source === 'QR')
    if (matchedPhoto) {
      expect(matchState(matchedPhoto)).toBe('Matched')
    }
  })


  function mockSavedEvidenceRead(result: { data: unknown; error: { message: string } | null }) {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      is: vi.fn(),
      order: vi.fn().mockResolvedValue(result),
    }
    query.select.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    query.is.mockReturnValue(query)
    ;(supabase.from as unknown as ReturnType<typeof vi.fn>).mockReturnValue(query)
    return query
  }

  it('returns only persisted non-removed booking photos when the read succeeds', async () => {
    const query = mockSavedEvidenceRead({
      data: [
        {
          id: 'reference-1',
          operation_stage: 'Packing',
          item_id: null,
          created_at: '2026-11-03T00:00:00Z',
          file: {
            id: 'file-1',
            storage_path: 'booking/file-1.jpg',
            original_filename: 'camera.jpg',
            size_bytes: 123,
            category: 'Packing',
            removed_at: null,
          },
        },
        {
          id: 'reference-2',
          operation_stage: 'Packing',
          item_id: null,
          created_at: '2026-11-03T00:00:00Z',
          file: {
            id: 'file-2',
            storage_path: 'booking/file-2.jpg',
            original_filename: 'removed.jpg',
            size_bytes: 456,
            category: 'Packing',
            removed_at: '2026-11-03T01:00:00Z',
          },
        },
      ],
      error: null,
    })
    expect(await fetchBookingEvidenceFiles('booking-1')).toEqual([
      {
        id: 'file-1',
        referenceId: 'reference-1',
        storagePath: 'booking/file-1.jpg',
        filename: 'camera.jpg',
        fileSizeBytes: 123,
        category: 'Packing',
        operationStage: 'Packing',
        createdAt: '2026-11-03T00:00:00Z',
        itemId: null,
      },
    ])
    expect(query.eq).toHaveBeenCalledWith('booking_id', 'booking-1')
  })

  it('allows a verified empty result without treating it as an error', async () => {
    mockSavedEvidenceRead({ data: [], error: null })
    await expect(fetchBookingEvidenceFiles('booking-1')).resolves.toEqual([])
  })

  it('rejects a failed booking evidence query instead of claiming zero photos', async () => {
    mockSavedEvidenceRead({ data: null, error: { message: 'RLS denied' } })
    await expect(fetchBookingEvidenceFiles('booking-1')).rejects.toThrow('Could not load photos: RLS denied')
  })

  it('rejects an unusable response and thrown transport failure', async () => {
    mockSavedEvidenceRead({ data: null, error: null })
    await expect(fetchBookingEvidenceFiles('booking-1')).rejects.toThrow('Could not load photos')
    ;(supabase.from as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('network offline')
    })
    await expect(fetchBookingEvidenceFiles('booking-1')).rejects.toThrow('Could not load photos: network offline')
  })

  it('loads evidence summary with 0 counts when empty or error', async () => {
    const mockSelect = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    })
    ;(supabase.from as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      select: mockSelect,
    })

    const summary = await getEvidenceSummary()
    expect(summary.total).toBe(0)
    expect(summary.photos).toEqual([])
    expect(summary.matched).toBe(0)
    expect(summary.review).toBe(0)
    expect(summary.unmatched).toBe(0)
  })

  it('loads evidence summary with valid counts when data present', async () => {
    const mockSelect = vi.fn().mockResolvedValue({
      data: [
        { id: '1', match_state: 'Matched', match_source: 'QR', category: 'Camera', processing_step: 'Processed' },
        { id: '2', match_state: 'Review', match_source: 'AI', category: 'Lens', processing_step: 'Processed' },
      ],
      error: null,
    })
    ;(supabase.from as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      select: mockSelect,
    })

    const summary = await getEvidenceSummary()
    expect(summary.total).toBe(2)
    expect(summary.matched).toBe(1)
    expect(summary.review).toBe(1)
    expect(summary.unmatched).toBe(0)
    expect(summary.matched + summary.review + summary.unmatched).toBe(summary.total)
  })
})
