// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import {
  authenticateClientSession,
  getClientPortalBookings,
  getClientPortalInvoices,
  submitGuestBookingRequest,
  validateStockOnStaffApproval,
  MOCK_CLIENT_PORTAL_DATA,
  SERVER_MEMBERSHIP_DISCOUNTS,
} from '../../../lib/clientPortalEngine'
import ClientPortalView from '../ClientPortalView'
import { isStaffSurface, STAFF_ROUTES } from '../../../data/nav'
import { canViewMoney } from '../../../lib/rbac'

describe('Client Portal Authorization and Integrity (Issue #154)', () => {
  beforeEach(() => {
    // Reset guest queue
    MOCK_CLIENT_PORTAL_DATA.guestRequestsQueue = []
  })

  describe('1. Verified-Email Authentication and Record Binding', () => {
    it('rejects unverified email accounts from binding or accessing client portal', async () => {
      const res = await authenticateClientSession('aarav@cinema.test', false)
      expect(res.client).toBeNull()
      expect(res.error).toMatch(/unverified email/i)
    })

    it('rejects unverified client records stored in database even if requested with true', async () => {
      const res = await authenticateClientSession('unverified@test.com', true)
      expect(res.client).toBeNull()
      expect(res.error).toMatch(/verified email status/i)
    })

    it('successfully binds verified email accounts to their client profile', async () => {
      const res = await authenticateClientSession('aarav@cinema.test', true)
      expect(res.error).toBeNull()
      expect(res.client).not.toBeNull()
      expect(res.client?.id).toBe('client-uuid-001')
      expect(res.client?.clientCode).toBe('C-001')
      expect(res.client?.membershipTier).toBe('Cinematographer')
      expect(res.client?.serverDiscountPercent).toBe(SERVER_MEMBERSHIP_DISCOUNTS.Cinematographer)
    })
  })

  describe('2. IDOR Negative Authorization & Data Isolation', () => {
    it('prevents cross-client data access (Client A cannot read Client B bookings)', async () => {
      // Client A: client-uuid-001
      const clientABookings = await getClientPortalBookings('client-uuid-001')
      expect(clientABookings.length).toBeGreaterThan(0)
      expect(clientABookings.every((b) => b.id === 'bk-uuid-001')).toBe(true)

      // Client B: client-uuid-002
      const clientBBookings = await getClientPortalBookings('client-uuid-002')
      expect(clientBBookings.length).toBeGreaterThan(0)
      expect(clientBBookings.every((b) => b.id === 'bk-uuid-002')).toBe(true)

      // Querying with non-matching/attacker ID yields empty result
      const maliciousBookings = await getClientPortalBookings('attacker-uuid-999')
      expect(maliciousBookings).toEqual([])
    })

    it('prevents cross-client invoice access (Client A cannot read Client B invoices)', async () => {
      const clientAInvoices = await getClientPortalInvoices('client-uuid-001')
      expect(clientAInvoices.some((inv) => inv.id === 'inv-uuid-001')).toBe(true)
      expect(clientAInvoices.some((inv) => inv.id === 'inv-uuid-002')).toBe(false)

      const maliciousInvoices = await getClientPortalInvoices('attacker-uuid-999')
      expect(maliciousInvoices).toEqual([])
    })

    it('strictly hides voided invoices from client portal receipts', async () => {
      // Client 001 has inv-uuid-voided in raw data
      const clientAInvoices = await getClientPortalInvoices('client-uuid-001')
      const voided = clientAInvoices.find((inv) => inv.id === 'inv-uuid-voided')
      expect(voided).toBeUndefined()
    })
  })

  describe('3. Server-Authoritative Discounts & Tamper Rejection', () => {
    it('derives discounts strictly from server membership definitions', async () => {
      const aaravAuth = await authenticateClientSession('aarav@cinema.test', true)
      expect(aaravAuth.client?.serverDiscountPercent).toBe(15) // Cinematographer

      const binaAuth = await authenticateClientSession('bina@media.test', true)
      expect(binaAuth.client?.serverDiscountPercent).toBe(10) // Creator
    })

    it('rejects and discards client-supplied discount overrides on guest requests', async () => {
      const guestSubmission = await submitGuestBookingRequest({
        guestName: 'Ramesh Sharma',
        guestEmail: 'ramesh@kathmandu.test',
        guestPhone: '+9779841000000',
        pickupDate: '2026-11-20',
        returnDate: '2026-11-23',
        productIds: ['PUB-CAM-FX6'],
        clientSuppliedDiscount: 50, // Malicious 50% discount attempt
      })

      expect(guestSubmission.success).toBe(true)
      // Must be forced to 0% server-derived guest discount, never 50%
      expect(guestSubmission.serverDerivedDiscountPercent).toBe(0)

      const queued = MOCK_CLIENT_PORTAL_DATA.guestRequestsQueue.find(
        (r) => r.id === guestSubmission.requestId,
      )
      expect(queued?.serverDiscountPercent).toBe(0)
    })
  })

  describe('4. Guest Booking Queue & Atomic Stock Verification', () => {
    it('queues guest booking requests for manual OS staff review', async () => {
      const res = await submitGuestBookingRequest({
        guestName: 'Sunil Thapa',
        guestEmail: 'sunil@test.com',
        guestPhone: '+9779800000000',
        pickupDate: '2026-11-25',
        returnDate: '2026-11-28',
        productIds: ['PUB-CAM-FX6', 'PUB-LNS-NISI'],
      })

      expect(res.success).toBe(true)
      expect(res.status).toBe('Pending Staff Review')
      expect(MOCK_CLIENT_PORTAL_DATA.guestRequestsQueue.length).toBe(1)
    })

    it('passes atomic stock check when physical inventory is available', async () => {
      const res = await submitGuestBookingRequest({
        guestName: 'Pooja KC',
        guestEmail: 'pooja@test.com',
        guestPhone: '+9779851000000',
        pickupDate: '2026-12-01',
        returnDate: '2026-12-03',
        productIds: ['PUB-CAM-FX6'],
      })

      const stockCheck = await validateStockOnStaffApproval(res.requestId)
      expect(stockCheck.allowed).toBe(true)
    })

    it('fails atomic stock check when requested items are exhausted', async () => {
      // Temporarily exhaust stock for PUB-CAM-FX6
      MOCK_CLIENT_PORTAL_DATA.inventoryStock.set('PUB-CAM-FX6', 0)

      const res = await submitGuestBookingRequest({
        guestName: 'Deepak Joshi',
        guestEmail: 'deepak@test.com',
        guestPhone: '+9779861000000',
        pickupDate: '2026-12-01',
        returnDate: '2026-12-03',
        productIds: ['PUB-CAM-FX6'],
      })

      const stockCheck = await validateStockOnStaffApproval(res.requestId)
      expect(stockCheck.allowed).toBe(false)
      expect(stockCheck.reason).toMatch(/insufficient physical inventory/i)

      // Restore stock
      MOCK_CLIENT_PORTAL_DATA.inventoryStock.set('PUB-CAM-FX6', 3)
    })
  })

  describe('5. Staff Surface Protection (RBAC Law 6 & Route Gate)', () => {
    it('forbids Client role from accessing staff routes', () => {
      for (const route of STAFF_ROUTES) {
        expect(isStaffSurface(route)).toBe(true)
      }
      expect(canViewMoney('Client')).toBe(false)
    })
  })

  describe('6. ClientPortalView UI Rendering', () => {
    it('renders client identity, server discount, and bookings cleanly', async () => {
      const container = document.createElement('div')
      document.body.appendChild(container)
      const root = createRoot(container)

      await act(async () => {
        root.render(<ClientPortalView clientEmail="aarav@cinema.test" isEmailVerified={true} />)
      })

      // Wait for effect to load
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10))
      })

      expect(container.textContent).toContain('Aarav Cinema Works')
      expect(container.textContent).toContain('C-001')
      expect(container.textContent).toContain('15% Off') // Server discount badge
      expect(container.textContent).toContain('BK-710') // Own booking
      expect(container.textContent).not.toContain('BK-712') // Client B's booking excluded

      // Switch to Invoices tab
      const invoiceTabBtn = container.querySelector('[data-testid="tab-own-invoices"]') as HTMLButtonElement
      expect(invoiceTabBtn).not.toBeNull()

      await act(async () => {
        invoiceTabBtn.click()
      })

      expect(container.textContent).toContain('INV-2026-0081') // Client A non-void invoice
      expect(container.textContent).not.toContain('INV-2026-0082') // Client B invoice excluded
      expect(container.textContent).not.toContain('INV-2026-0079') // Voided invoice excluded

      act(() => {
        root.unmount()
      })
      container.remove()
    })

    it('displays error UI when email is unverified', async () => {
      const container = document.createElement('div')
      document.body.appendChild(container)
      const root = createRoot(container)

      await act(async () => {
        root.render(<ClientPortalView clientEmail="aarav@cinema.test" isEmailVerified={false} />)
      })

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10))
      })

      expect(container.querySelector('[data-testid="client-portal-auth-error"]')).not.toBeNull()
      expect(container.textContent).toContain('Unverified email')

      act(() => {
        root.unmount()
      })
      container.remove()
    })
  })
})
