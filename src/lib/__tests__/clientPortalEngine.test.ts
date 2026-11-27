import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getUserMock, fromMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  fromMock: vi.fn(),
}))

vi.mock('../supabase', () => ({
  IS_MOCK: false,
  supabase: {
    auth: { getUser: getUserMock },
    from: fromMock,
  },
}))

import {
  authenticateClientSession,
  getClientPortalBookings,
  getClientPortalInvoices,
  submitGuestBookingRequest,
  validateStockOnStaffApproval,
  approveGuestBookingRequest,
  declineGuestBookingRequest,
} from '../clientPortalEngine'

describe('clientPortalEngine fail-closed contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects unverified or missing Supabase email sessions', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null }, error: null })
    const res = await authenticateClientSession('spoof@example.com', true)
    expect(res.client).toBeNull()
    expect(res.error).toMatch(/Verified Supabase email session required/i)
  })

  it('rejects authenticated user without active portal_users binding', async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: 'auth-1', email: 'c@example.com', email_confirmed_at: '2026-11-01T00:00:00Z' } },
      error: null,
    })
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      }),
    })

    const res = await authenticateClientSession()
    expect(res.client).toBeNull()
    expect(res.error).toMatch(/No verified client account binding/i)
  })

  it('refuses portal bookings and invoices reads until wired', async () => {
    await expect(getClientPortalBookings('cli-1')).rejects.toThrow(/not yet connected/i)
    await expect(getClientPortalInvoices('cli-1')).rejects.toThrow(/not yet connected/i)
  })

  it('validates guest booking request fields and fails closed without fake success', async () => {
    const missingContact = await submitGuestBookingRequest({
      guestName: '',
      guestEmail: 'a@b.com',
      guestPhone: '9800000000',
      pickupDate: '2026-12-01',
      returnDate: '2026-12-02',
      productIds: ['p1'],
    })
    expect(missingContact.success).toBe(false)
    expect(missingContact.error).toMatch(/required/i)

    const badDates = await submitGuestBookingRequest({
      guestName: 'Test',
      guestEmail: 'a@b.com',
      guestPhone: '9800000000',
      pickupDate: '2026-12-05',
      returnDate: '2026-12-02',
      productIds: ['p1'],
    })
    expect(badDates.success).toBe(false)
    expect(badDates.error).toMatch(/valid pickup and return dates/i)

    const badTimes = await submitGuestBookingRequest({
      guestName: 'Test',
      guestEmail: 'a@b.com',
      guestPhone: '9800000000',
      pickupDate: '2026-12-01',
      pickupTime: '09:00',
      returnDate: '2026-12-02',
      productIds: ['p1'],
    })
    expect(badTimes.success).toBe(false)
    expect(badTimes.error).toMatch(/both pickup and return times/i)

    const validShape = await submitGuestBookingRequest({
      guestName: 'Test',
      guestEmail: 'a@b.com',
      guestPhone: '9800000000',
      pickupDate: '2026-12-01',
      returnDate: '2026-12-02',
      productIds: ['p1'],
      clientSuppliedDiscount: 50,
    })
    expect(validShape.success).toBe(false)
    expect(validShape.serverDerivedDiscountPercent).toBe(0)
  })

  it('fails closed on staff approval stubs', async () => {
    expect((await validateStockOnStaffApproval('req-1')).allowed).toBe(false)
    expect((await approveGuestBookingRequest('req-1', 'staff-1')).success).toBe(false)
    expect((await declineGuestBookingRequest('req-1', 'staff-1', 'no stock')).success).toBe(false)
  })
})
