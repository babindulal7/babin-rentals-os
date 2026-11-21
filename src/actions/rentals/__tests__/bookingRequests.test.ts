/**
 * src/actions/rentals/__tests__/bookingRequests.test.ts
 *
 * Unit tests for confirmBookingRequest and declineBookingRequest actions (T7-04).
 */

import { describe, it, expect } from 'vitest'
import { confirmBookingRequest } from '../confirmBookingRequest'
import { declineBookingRequest } from '../declineBookingRequest'
import { ActionPermissionError, type ActionContext } from '../../core'

describe('Online Booking Requests Actions (T7-04)', () => {
  const coordinatorCtx: ActionContext = {
    role: 'Coordinator',
    userId: 'coord-1',
    isOnline: true,
  }

  const warehouseCtx: ActionContext = {
    role: 'Warehouse',
    userId: 'wh-1',
    isOnline: true,
  }

  const clientCtx: ActionContext = {
    role: 'Client',
    userId: 'client-1',
    isOnline: true,
  }

  describe('confirmBookingRequest', () => {
    it('validates required inputs', async () => {
      await expect(
        confirmBookingRequest(
          {
            requestId: '',
            bookingId: 'bk-123',
          },
          coordinatorCtx
        )
      ).rejects.toThrow(/required/)

      await expect(
        confirmBookingRequest(
          {
            requestId: 'req-123',
            bookingId: '',
          },
          coordinatorCtx
        )
      ).rejects.toThrow(/required/)
    })

    it('refuses execution for Client role with ActionPermissionError', async () => {
      await expect(
        confirmBookingRequest(
          {
            requestId: 'req-123',
            bookingId: 'bk-123',
          },
          clientCtx
        )
      ).rejects.toThrow(ActionPermissionError)
    })

    it('refuses execution for floor roles (Warehouse)', async () => {
      await expect(
        confirmBookingRequest(
          {
            requestId: 'req-123',
            bookingId: 'bk-123',
          },
          warehouseCtx
        )
      ).rejects.toThrow(/coordinator or higher/)
    })

    it('allows execution for Coordinator role in mock mode', async () => {
      const res = await confirmBookingRequest(
        {
          requestId: 'req-123',
          bookingId: 'bk-123',
        },
        coordinatorCtx
      )
      expect(res.success).toBe(true)
      expect(res.requestId).toBe('req-123')
      expect(res.bookingId).toBe('bk-123')
    })
  })

  describe('declineBookingRequest', () => {
    it('validates non-empty decline reason', async () => {
      await expect(
        declineBookingRequest(
          {
            requestId: 'req-123',
            reason: '   ',
          },
          coordinatorCtx
        )
      ).rejects.toThrow(/reason is required/i)
    })

    it('refuses execution for Client role with ActionPermissionError', async () => {
      await expect(
        declineBookingRequest(
          {
            requestId: 'req-123',
            reason: 'Unavailable gear',
          },
          clientCtx
        )
      ).rejects.toThrow(ActionPermissionError)
    })

    it('refuses execution for floor roles (Warehouse)', async () => {
      await expect(
        declineBookingRequest(
          {
            requestId: 'req-123',
            reason: 'Unavailable gear',
          },
          warehouseCtx
        )
      ).rejects.toThrow(/coordinator or higher/)
    })

    it('allows execution for Coordinator role in mock mode', async () => {
      const res = await declineBookingRequest(
        {
          requestId: 'req-123',
          reason: 'Unavailable gear',
        },
        coordinatorCtx
      )
      expect(res.success).toBe(true)
      expect(res.status).toBe('declined')
    })
  })
})
