import { describe, it, expect, vi, beforeEach } from 'vitest'
import { recordIdDocument } from '../recordIdDocument'
import { createClientCollector, deactivateClientCollector } from '../manageCollector'
import { supabase } from '../../../lib/supabase'

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
  newClientUuid: () => '00000000-0000-4000-8000-000000000001',
}))

vi.mock('../../../lib/audit', () => ({
  logAuditEvent: vi.fn().mockResolvedValue({ id: 'audit-1' }),
}))

describe('T2-12: Client ID on File and Authorized Collectors', () => {
  const CLIENT_ID = 'client-uuid-123'
  const USER_ID = 'user-uuid-456'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('recordIdDocument (W50, W51)', () => {
    it('records a citizenship card with null expiry (W51: citizenship does not expire)', async () => {
      const mockInsert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'doc-uuid-1' },
            error: null,
          }),
        }),
      })

      vi.mocked(supabase.from).mockImplementation((table: string): any => {
        if (table === 'clients') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: CLIENT_ID, name: 'Sagarmatha Pictures' },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'client_id_documents') {
          return { insert: mockInsert }
        }
        return {}
      })

      const res = await recordIdDocument(
        {
          clientId: CLIENT_ID,
          idType: 'citizenship_card',
          idNumber: '27-01-79-12345',
          expiryDate: '2030-01-01', // Should be ignored because citizenship cards do not expire (W51)
          notes: 'Verified with original card',
        },
        { userId: USER_ID, role: 'Warehouse' },
      )

      expect(res.success).toBe(true)
      expect(res.documentId).toBe('doc-uuid-1')
      expect(res.idType).toBe('citizenship_card')

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          client_id: CLIENT_ID,
          id_type: 'citizenship_card',
          id_number: '27-01-79-12345',
          expiry_date: null, // Null enforced per W51
          created_by: USER_ID,
        }),
      )
    })

    it('records a passport with its expiry date', async () => {
      const mockInsert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'doc-uuid-2' },
            error: null,
          }),
        }),
      })

      vi.mocked(supabase.from).mockImplementation((table: string): any => {
        if (table === 'clients') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: CLIENT_ID, name: 'Babin Dulal' },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'client_id_documents') {
          return { insert: mockInsert }
        }
        return {}
      })

      const res = await recordIdDocument(
        {
          clientId: CLIENT_ID,
          idType: 'passport',
          idNumber: 'PA1234567',
          expiryDate: '2029-05-15',
        },
        { userId: USER_ID, role: 'Coordinator' },
      )

      expect(res.success).toBe(true)
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id_type: 'passport',
          id_number: 'PA1234567',
          expiry_date: '2029-05-15',
        }),
      )
    })

    it('refuses when ID number is missing', async () => {
      await expect(
        recordIdDocument(
          {
            clientId: CLIENT_ID,
            idType: 'citizenship_card',
            idNumber: '   ',
          },
          { userId: USER_ID, role: 'Warehouse' },
        ),
      ).rejects.toThrow('An ID document number is required.')
    })

    it('refuses for unauthenticated role', async () => {
      await expect(
        recordIdDocument(
          {
            clientId: CLIENT_ID,
            idType: 'citizenship_card',
            idNumber: '12345',
          },
          { userId: '', role: null as any },
        ),
      ).rejects.toThrow('an active authenticated session is required')
    })
  })

  describe('createClientCollector (W28, W34)', () => {
    it('adds an authorized collector with name, phone, and role title', async () => {
      const mockInsert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'col-uuid-1' },
            error: null,
          }),
        }),
      })

      vi.mocked(supabase.from).mockImplementation((table: string): any => {
        if (table === 'clients') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: CLIENT_ID, name: 'Kathmandu Films' },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'client_collectors') {
          return { insert: mockInsert }
        }
        return {}
      })

      const res = await createClientCollector(
        {
          clientId: CLIENT_ID,
          name: 'Ram Thapa',
          phone: '+9779801234567',
          roleTitle: '1st AC',
          idType: 'driving_licence',
          idNumber: 'DL-998877',
        },
        { userId: USER_ID, role: 'Warehouse' },
      )

      expect(res.success).toBe(true)
      expect(res.collectorId).toBe('col-uuid-1')
      expect(res.name).toBe('Ram Thapa')

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          client_id: CLIENT_ID,
          name: 'Ram Thapa',
          phone: '+9779801234567',
          role_title: '1st AC',
          id_type: 'driving_licence',
          id_number: 'DL-998877',
          is_active: true,
          created_by: USER_ID,
        }),
      )
    })

    it('refuses when collector name is missing', async () => {
      await expect(
        createClientCollector(
          {
            clientId: CLIENT_ID,
            name: '',
            phone: '+9779801234567',
          },
          { userId: USER_ID, role: 'Warehouse' },
        ),
      ).rejects.toThrow('Collector name is required.')
    })

    it('deactivates an authorized collector cleanly', async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null })
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })

      vi.mocked(supabase.from).mockImplementation((table: string): any => {
        if (table === 'client_collectors') {
          return { update: mockUpdate }
        }
        return {}
      })

      const res = await deactivateClientCollector('col-uuid-1', {
        userId: USER_ID,
        role: 'Manager',
      })

      expect(res.success).toBe(true)
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ is_active: false }),
      )
    })
  })
})
