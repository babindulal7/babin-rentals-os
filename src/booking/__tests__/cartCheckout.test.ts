/**
 * src/booking/__tests__/cartCheckout.test.ts
 *
 * Tests for booking request submission and pricing computation (T7-04).
 */

import { describe, it, expect } from 'vitest'
import { submitBookingRequest, type BookingRequestPayload } from '../lib/catalogueApi'

describe('Online Booking Request Submission (T7-04)', () => {
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
})
