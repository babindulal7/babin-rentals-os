import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  idempotentInsert,
  safeUpdate,
  OfflineStorageUnavailableError,
} from '../dataAccess'

const mockEnqueueMutation = vi.fn()

vi.mock('../supabase', () => ({
  IS_MOCK: false,
  supabase: {
    from: vi.fn(),
  },
}))

vi.mock('../offlineQueue', () => ({
  enqueueMutation: (...args: unknown[]) => mockEnqueueMutation(...args),
}))

vi.mock('../monitoring', () => ({
  captureError: vi.fn(),
}))

describe('dataAccess offline behavior (DATA-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('when navigator is offline', () => {
    beforeEach(() => {
      vi.stubGlobal('navigator', { onLine: false })
    })

    it('returns queued: true when storage successfully enqueues insert', async () => {
      mockEnqueueMutation.mockResolvedValueOnce(true)

      const result = await idempotentInsert('booking_notes' as any, {
        booking_id: 'test-booking',
        note: 'Customer called',
      } as any)

      expect(result).toEqual({
        data: expect.objectContaining({
          booking_id: 'test-booking',
          note: 'Customer called',
          client_uuid: expect.any(String),
        }),
        error: null,
        queued: true,
      })
      expect(mockEnqueueMutation).toHaveBeenCalledWith(
        'booking_notes',
        'insert',
        expect.anything(),
        expect.any(String),
      )
    })

    it('throws OfflineStorageUnavailableError when insert fails to enqueue (DATA-02)', async () => {
      mockEnqueueMutation.mockResolvedValueOnce(false)

      await expect(
        idempotentInsert('booking_notes' as any, {
          booking_id: 'test-booking',
          note: 'Will not save',
        } as any),
      ).rejects.toThrow(OfflineStorageUnavailableError)
    })

    it('returns queued: true when storage successfully enqueues update', async () => {
      mockEnqueueMutation.mockResolvedValueOnce(true)

      const result = await safeUpdate(
        'booking_notes' as any,
        'note-123',
        { note: 'Updated note' } as any,
        'client-uuid-abc',
      )

      expect(result).toEqual({
        data: { id: 'note-123', note: 'Updated note' },
        error: null,
        queued: true,
      })
      expect(mockEnqueueMutation).toHaveBeenCalledWith(
        'booking_notes',
        'update',
        { id: 'note-123', note: 'Updated note' },
        'client-uuid-abc:note-123',
      )
    })

    it('throws OfflineStorageUnavailableError when update fails to enqueue (DATA-02)', async () => {
      mockEnqueueMutation.mockResolvedValueOnce(false)

      await expect(
        safeUpdate(
          'booking_notes' as any,
          'note-123',
          { note: 'Updated note' } as any,
          'client-uuid-abc',
        ),
      ).rejects.toThrow(OfflineStorageUnavailableError)
    })
  })
})
