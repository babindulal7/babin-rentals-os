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

  describe('fetchBookingEvidenceFiles fail-closed handling', () => {
    it('throws error when database query fails instead of returning empty array', async () => {
      const mockOrder = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'relation "evidence_references" does not exist' },
      })
      const mockIs = vi.fn().mockReturnValue({ order: mockOrder })
      const mockEq = vi.fn().mockReturnValue({ is: mockIs })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      ;(supabase.from as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        select: mockSelect,
      })

      await expect(fetchBookingEvidenceFiles('booking-123')).rejects.toThrow(
        'Failed to load evidence files: relation "evidence_references" does not exist',
      )
    })

    it('throws error when response data is not an array', async () => {
      const mockOrder = vi.fn().mockResolvedValue({
        data: null,
        error: null,
      })
      const mockIs = vi.fn().mockReturnValue({ order: mockOrder })
      const mockEq = vi.fn().mockReturnValue({ is: mockIs })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      ;(supabase.from as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        select: mockSelect,
      })

      await expect(fetchBookingEvidenceFiles('booking-123')).rejects.toThrow(
        'Failed to load evidence files: invalid response shape',
      )
    })

    it('returns mapped evidence files on success', async () => {
      const mockOrder = vi.fn().mockResolvedValue({
        data: [
          {
            id: 'ref-1',
            operation_stage: 'Packing',
            item_id: 'item-1',
            created_at: '2026-11-06T00:00:00Z',
            file: {
              id: 'file-1',
              storage_path: 'evidence/photo1.jpg',
              original_filename: 'photo1.jpg',
              size_bytes: 2048,
              category: 'Packing',
              match_state: 'Matched',
              confidence: 98,
              matched_serial: 'CAM-001',
              removed_at: null,
            },
          },
        ],
        error: null,
      })
      const mockIs = vi.fn().mockReturnValue({ order: mockOrder })
      const mockEq = vi.fn().mockReturnValue({ is: mockIs })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      ;(supabase.from as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        select: mockSelect,
      })

      const files = await fetchBookingEvidenceFiles('booking-123')
      expect(files).toHaveLength(1)
      expect(files[0]?.id).toBe('file-1')
      expect(files[0]?.filename).toBe('photo1.jpg')
      expect(files[0]?.matchState).toBe('Matched')
      expect(files[0]?.matchedSerial).toBe('CAM-001')
    })
  })
})
