// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import {
  authenticateClientSession,
  getClientPortalBookings,
  getClientPortalInvoices,
  submitGuestBookingRequest,
  validateStockOnStaffApproval,
  approveGuestBookingRequest,
  declineGuestBookingRequest,
} from '../../../lib/clientPortalEngine'
import ClientPortalView from '../ClientPortalView'
import { isStaffSurface, STAFF_ROUTES } from '../../../data/nav'
import { canViewMoney } from '../../../lib/rbac'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const request = {
  guestName: 'Sunil Thapa',
  guestEmail: 'sunil@test.com',
  guestPhone: '+9779800000000',
  pickupDate: '2026-11-25',
  returnDate: '2026-11-28',
  productIds: ['PUB-CAM-FX6'],
}

describe('Client portal release safety gates (Issue #154)', () => {
  it('cannot authenticate by merely claiming an email and verification flag', async () => {
    const result = await authenticateClientSession('aarav@cinema.test', true)
    expect(result.client).toBeNull()
    expect(result.error).toBeTruthy()
  })

  it('does not return fake Client A or Client B bookings/invoices by caller-controlled ID', async () => {
    await expect(getClientPortalBookings('client-uuid-001')).rejects.toThrow(/not yet connected/i)
    await expect(getClientPortalBookings('client-uuid-002')).rejects.toThrow(/not yet connected/i)
    await expect(getClientPortalInvoices('client-uuid-001')).rejects.toThrow(/not yet connected/i)
    await expect(getClientPortalInvoices('client-uuid-002')).rejects.toThrow(/not yet connected/i)
  })

  it('never acknowledges guest submission without durable staff queue persistence', async () => {
    const result = await submitGuestBookingRequest({ ...request, clientSuppliedDiscount: 99 })
    expect(result.success).toBe(false)
    expect(result.requestId).toBe('')
    expect(result.serverDerivedDiscountPercent).toBe(0)
    expect(result.error).toMatch(/could not be saved/i)
  })

  it('requires valid requested dates and products before any queue attempt', async () => {
    const reverse = await submitGuestBookingRequest({ ...request, returnDate: '2026-11-23' })
    const invalidDay = await submitGuestBookingRequest({ ...request, pickupDate: '2026-02-30' })
    const empty = await submitGuestBookingRequest({ ...request, productIds: [] })
    expect(reverse.success).toBe(false)
    expect(invalidDay.success).toBe(false)
    expect(empty.success).toBe(false)
    expect(reverse.error).toMatch(/valid pickup and return dates/i)
  })

  it('requires complete pickup/return time selections when either time is provided', async () => {
    const result = await submitGuestBookingRequest({ ...request, pickupTime: '06:00' })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/both pickup and return times/i)
  })

  it('refuses simulated staff stock approval, booking and decline operations', async () => {
    const check = await validateStockOnStaffApproval('REQ-fake')
    expect(check.allowed).toBe(false)
    expect((await approveGuestBookingRequest('REQ-fake', 'staff-fake')).success).toBe(false)
    expect((await declineGuestBookingRequest('REQ-fake', 'staff-fake', 'Not available')).success).toBe(false)
  })

  it('keeps staff screens inaccessible to Client roles', () => {
    for (const route of STAFF_ROUTES) expect(isStaffSurface(route)).toBe(true)
    expect(canViewMoney('Client')).toBe(false)
  })

  it('shows an access error rather than a seeded customer profile or financial details', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => { root.render(<ClientPortalView />) })
    await act(async () => { await Promise.resolve() })
    expect(container.querySelector('[data-testid="client-portal-auth-error"]')).not.toBeNull()
    expect(container.textContent).not.toContain('Aarav Cinema Works')
    expect(container.textContent).not.toContain('INV-2026-0081')
    act(() => { root.unmount() })
    container.remove()
  })
})
