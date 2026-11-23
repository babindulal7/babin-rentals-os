/**
 * src/booking/__tests__/cartCheckout.test.ts
 *
 * Tests for booking request submission and pricing computation (T7-04 / T7-14).
 */

import { describe, it, expect } from 'vitest'
import { submitBookingRequest, type BookingRequestPayload } from '../lib/catalogueApi'
import { setMockOnlineBookingAwayStatus, resetMockOnlineBookingAwayStatus } from '@/lib/awayMode'

describe('Online Booking Request Submission (T7-04 / T7-14)', () => {
  it('submits a booking request in mock mode with 13% VAT and advance due', async () => {
    const payload: BookingRequestPayload = {
      client_name: 'Aayush Shrestha',
      client_email: 'aayush@example.com',
      client_phone: '+977-9841000000',
      project_name: 'Short Film',
      shoot_location: 'Bhaktapur Durbar Square',
      start_date: '2026-11-25',
      end_date: '2026-11-27',
      fulfillment_type: 'pickup',
      lines: [
        {
          product_id: '11111111-1111-4111-8111-111111111111',
          quantity: 1,
        },
      ],
    }

    const res = await submitBookingRequest(payload)
    expect(res.request_id).toBeDefined()
    expect(res.request_number).toMatch(/^REQ-\d{8}-\d{4}$/)
    expect(res.status).toBe('pending')
    expect(res.total_paisa).toBeGreaterThan(0)
    expect(res.vat_paisa).toBeGreaterThan(0)
    expect(res.advance_due_paisa).toBeGreaterThan(0)
  })

  it('rejects booking request when Away mode is active (T7-14)', async () => {
    setMockOnlineBookingAwayStatus({
      configured_away: true,
      message: 'Back on 15 Feb — call or WhatsApp us',
      resume_date: null,
    })

    const payload: BookingRequestPayload = {
      client_name: 'Regular Client',
      client_email: 'client@example.com',
      client_phone: '+977-9841000000',
      start_date: '2026-11-25',
      end_date: '2026-11-27',
      fulfillment_type: 'pickup',
      lines: [
        {
          product_id: '11111111-1111-4111-8111-111111111111',
          quantity: 1,
        },
      ],
    }

    try {
      await expect(
        submitBookingRequest(payload)
      ).rejects.toThrow(/Online booking requests are temporarily disabled: Back on 15 Feb — call or WhatsApp us/)
    } finally {
      resetMockOnlineBookingAwayStatus()
    }
  })
})
