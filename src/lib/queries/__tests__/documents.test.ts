import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listDocuments, mapDbRowToDocRow, type DocumentRowDb } from '../documents'
import { supabase } from '../../supabase'

vi.mock('../../supabase', () => {
  return {
    supabase: {
      from: vi.fn(),
    },
  }
})

describe('documents queries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mapDbRowToDocRow maps database document row to DocRow', () => {
    const row: DocumentRowDb = {
      id: 'doc-uuid-1',
      client_uuid: 'client-uuid-1',
      document_no: 'DOC-2026-0001',
      document_type: 'Rental Agreement',
      booking_id: 'b-uuid-1234',
      client_id: 'c-uuid-1234',
      lifecycle_status: 'Signed',
      file_url: '/documents/DOC-2026-0001.pdf',
      file_size_bytes: 2048576,
      generated_by: 'user-1',
      signed_at: '2026-08-01T10:00:00Z',
      signed_by_name: 'Babin Shrestha',
      created_at: '2026-08-01T10:00:00Z',
    }

    const doc = mapDbRowToDocRow(row)
    expect(doc.id).toBe('DOC-2026-0001')
    expect(doc.type).toBe('Rental Agreement')
    expect(doc.category).toBe('Rental')
    expect(doc.status).toBe('Signed')
    expect(doc.recordState).toBe('Signed')
    expect(doc.recordTone).toBe('neutral')
  })

  it('mapDbRowToDocRow correctly categorizes Finance documents', () => {
    const row: DocumentRowDb = {
      id: 'doc-uuid-2',
      client_uuid: 'client-uuid-2',
      document_no: 'INV-2026-0001',
      document_type: 'Tax Invoice',
      booking_id: null,
      client_id: null,
      lifecycle_status: 'Issued',
      file_url: '/documents/INV-2026-0001.pdf',
      file_size_bytes: null,
      generated_by: null,
      signed_at: null,
      signed_by_name: null,
      created_at: '2026-08-02T10:00:00Z',
    }

    const doc = mapDbRowToDocRow(row)
    expect(doc.category).toBe('Finance')
    expect(doc.finance).toBe(true)
    expect(doc.status).toBe('Issued')
  })

  it('listDocuments returns database rows when present', async () => {
    const mockSelect = vi.fn().mockReturnThis()
    const mockOrder = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'doc-uuid-1',
          client_uuid: 'client-uuid-1',
          document_no: 'DOC-2026-0001',
          document_type: 'Rental Agreement',
          booking_id: 'b-1',
          client_id: null,
          lifecycle_status: 'Signed',
          file_url: '/documents/DOC-2026-0001.pdf',
          file_size_bytes: 1048576,
          generated_by: null,
          signed_at: null,
          signed_by_name: null,
          created_at: '2026-08-01T10:00:00Z',
        },
      ],
      error: null,
    })

    ;(supabase.from as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      select: mockSelect,
      order: mockOrder,
    })

    const result = await listDocuments()
    expect(mockSelect.mock.calls[0]?.[0]).not.toMatch(/file_url|signature_url/)
    expect(result.rows.length).toBe(1)
    expect(result.rows[0]?.id).toBe('DOC-2026-0001')
  })

  it('listDocuments returns empty array when empty or error', async () => {
    const mockSelect = vi.fn().mockReturnThis()
    const mockOrder = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    })

    ;(supabase.from as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      select: mockSelect,
      order: mockOrder,
    })

    const result = await listDocuments()
    expect(result.rows).toEqual([])
    expect(result.total).toBe(0)
  })

  it('listDocuments includes signed agreement evidence for a booking', async () => {
    const mockEqBooking = vi.fn().mockResolvedValue({
      data: [],
      error: null,
      count: 0,
    })

    const mockEvidenceEqCategory = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'ref-1',
          created_at: '2026-08-01T12:00:00Z',
          evidence_files: {
            id: 'ef-sig-1',
            storage_path: 'evidence/signatures/sig-1.png',
            original_filename: 'signature-receiver-B-100.png',
            file_size_bytes: 45000,
          },
        },
      ],
      error: null,
    })
    const mockEvidenceEqBooking = vi.fn().mockReturnValue({
      eq: mockEvidenceEqCategory,
    })

    ;(supabase.from as unknown as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      if (table === 'document_registry') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              eq: mockEqBooking,
            }),
          }),
        }
      }
      if (table === 'evidence_references') {
        return {
          select: vi.fn().mockReturnValue({
            eq: mockEvidenceEqBooking,
          }),
        }
      }
      return { select: vi.fn().mockReturnThis() }
    })

    const result = await listDocuments({ chips: { booking_id: ['b-100'] } })
    expect(result.rows.length).toBe(1)
    expect(result.rows[0]?.id).toBe('ef-sig-1')
    expect(result.rows[0]?.type).toBe('Rental Agreement')
    expect(result.rows[0]?.status).toBe('Signed')
    expect(result.rows[0]?.fileUrl).toBe('evidence/signatures/sig-1.png')
  })
})
