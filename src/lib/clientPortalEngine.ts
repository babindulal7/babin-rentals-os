import { rupees, type Paisa } from './money'
import type { MembershipTier } from '../data/clients'

/**
 * Server-authoritative membership tier discount rates (Babin Rentals standard).
 * Clients can NEVER supply or override discount rates.
 */
export const SERVER_MEMBERSHIP_DISCOUNTS: Record<MembershipTier, number> = {
  Academy: 20,
  Creator: 10,
  Cinematographer: 15,
  'Production Alliance': 10,
  Elite: 25,
}

export interface ClientPortalProfile {
  id: string
  clientCode: string
  name: string
  email: string
  isEmailVerified: boolean
  company?: string | undefined
  membershipTier: MembershipTier
  serverDiscountPercent: number
  panVat?: string | undefined
  phone: string
  isBound: boolean
}

export interface ClientPortalBooking {
  id: string
  bookingNo: string
  project: string
  stage: 'Quote' | 'Booked' | 'Packed' | 'On Rent' | 'Returned' | 'Closed'
  pickupAtAd: string
  returnAtAd: string
  itemCount: number
  items: Array<{ name: string; quantity: number; dailyRatePaisa: Paisa }>
}

export interface ClientPortalInvoice {
  id: string
  invoiceNo: string
  bookingNo: string
  issueDateAd: string
  dueDateAd: string
  currency: 'NPR'
  subtotal: Paisa
  discountPercent: number
  discountAmount: Paisa
  taxableAmount: Paisa
  vatAmount: Paisa
  totalAmount: Paisa
  paidAmount: Paisa
  outstandingAmount: Paisa
  isVoid: boolean
}

export interface GuestBookingRequestInput {
  guestName: string
  guestEmail: string
  guestPhone: string
  company?: string
  pickupDate: string
  returnDate: string
  productIds: string[]
  clientSuppliedDiscount?: number // Tamper attempt field
}

export interface GuestBookingRequestResult {
  success: boolean
  requestId: string
  status: 'Pending Staff Review'
  serverDerivedDiscountPercent: number
  error?: string
}

export interface StaffApprovalStockCheckResult {
  allowed: boolean
  reason?: string
  conflicts?: Array<{ productId: string; requested: number; available: number }>
}

/**
 * Mock data store for client records & portal views
 */
export const MOCK_CLIENT_PORTAL_DATA = {
  clients: [
    {
      id: 'client-uuid-001',
      clientCode: 'C-001',
      name: 'Aarav Cinema Works',
      email: 'aarav@cinema.test',
      isEmailVerified: true,
      company: 'Aarav Productions Pvt. Ltd.',
      membershipTier: 'Cinematographer' as MembershipTier,
      serverDiscountPercent: 15,
      panVat: '601234567',
      phone: '+9779801234567',
      isBound: true,
    },
    {
      id: 'client-uuid-002',
      clientCode: 'C-002',
      name: 'Bina Media Creations',
      email: 'bina@media.test',
      isEmailVerified: true,
      company: 'Bina Films',
      membershipTier: 'Creator' as MembershipTier,
      serverDiscountPercent: 10,
      panVat: '609876543',
      phone: '+9779841234567',
      isBound: true,
    },
    {
      id: 'client-uuid-003-unverified',
      clientCode: 'C-003',
      name: 'Unverified Visitor',
      email: 'unverified@test.com',
      isEmailVerified: false,
      membershipTier: 'Creator' as MembershipTier,
      serverDiscountPercent: 10,
      phone: '+9779812345678',
      isBound: false,
    },
  ],
  bookings: [
    {
      id: 'bk-uuid-001',
      clientId: 'client-uuid-001',
      bookingNo: 'BK-710',
      project: 'Pokhara Feature Film',
      stage: 'Booked' as const,
      pickupAtAd: '2026-11-20T06:00:00+05:45',
      returnAtAd: '2026-11-23T06:00:00+05:45',
      itemCount: 4,
      items: [
        { name: 'Sony FX6 Cinema Camera', quantity: 1, dailyRatePaisa: rupees(6000) },
        { name: 'NISI Athena Prime Set', quantity: 1, dailyRatePaisa: rupees(4500) },
      ],
    },
    {
      id: 'bk-uuid-002',
      clientId: 'client-uuid-002',
      bookingNo: 'BK-712',
      project: 'Music Video Shoot',
      stage: 'On Rent' as const,
      pickupAtAd: '2026-11-15T06:00:00+05:45',
      returnAtAd: '2026-11-18T06:00:00+05:45',
      itemCount: 3,
      items: [
        { name: 'RED Komodo 6K', quantity: 1, dailyRatePaisa: rupees(12000) },
      ],
    },
  ],
  invoices: [
    {
      id: 'inv-uuid-001',
      clientId: 'client-uuid-001',
      invoiceNo: 'INV-2026-0081',
      bookingNo: 'BK-710',
      issueDateAd: '2026-11-12',
      dueDateAd: '2026-11-25',
      currency: 'NPR' as const,
      subtotal: rupees(31500),
      discountPercent: 15,
      discountAmount: rupees(4725),
      taxableAmount: rupees(26775),
      vatAmount: rupees(3480.75),
      totalAmount: rupees(30255.75),
      paidAmount: rupees(0),
      outstandingAmount: rupees(30255.75),
      isVoid: false,
    },
    {
      id: 'inv-uuid-002',
      clientId: 'client-uuid-002',
      invoiceNo: 'INV-2026-0082',
      bookingNo: 'BK-712',
      issueDateAd: '2026-11-10',
      dueDateAd: '2026-11-24',
      currency: 'NPR' as const,
      subtotal: rupees(36000),
      discountPercent: 10,
      discountAmount: rupees(3600),
      taxableAmount: rupees(32400),
      vatAmount: rupees(4212),
      totalAmount: rupees(36612),
      paidAmount: rupees(36612),
      outstandingAmount: rupees(0),
      isVoid: false,
    },
    {
      id: 'inv-uuid-voided',
      clientId: 'client-uuid-001',
      invoiceNo: 'INV-2026-0079',
      bookingNo: 'BK-709',
      issueDateAd: '2026-11-01',
      dueDateAd: '2026-11-15',
      currency: 'NPR' as const,
      subtotal: rupees(10000),
      discountPercent: 0,
      discountAmount: rupees(0),
      taxableAmount: rupees(10000),
      vatAmount: rupees(1300),
      totalAmount: rupees(11300),
      paidAmount: rupees(0),
      outstandingAmount: rupees(0),
      isVoid: true, // VOIDED: must not show in active client receipts
    },
  ],
  inventoryStock: new Map<string, number>([
    ['PUB-CAM-FX6', 3],
    ['PUB-CAM-ALEXA', 2],
    ['PUB-CAM-KOMODO', 2],
    ['PUB-LNS-NISI', 3],
  ]),
  guestRequestsQueue: [] as Array<{
    id: string
    guestName: string
    guestEmail: string
    guestPhone: string
    status: 'Pending Staff Review' | 'Approved' | 'Declined'
    productIds: string[]
    serverDiscountPercent: number
    submittedAtAd: string
  }>,
}

/**
 * 1. Authenticate / Bind Client Account by Verified Email.
 * Unverified accounts cannot bind or access client data.
 */
export async function authenticateClientSession(
  email: string,
  isEmailVerified: boolean,
): Promise<{ client: ClientPortalProfile | null; error: string | null }> {
  if (!isEmailVerified) {
    return {
      client: null,
      error: 'Unverified email: Email must be verified via secure one-time passcode before account access.',
    }
  }

  const found = MOCK_CLIENT_PORTAL_DATA.clients.find(
    (c) => c.email.toLowerCase() === email.toLowerCase(),
  )

  if (!found) {
    return {
      client: null,
      error: 'Account not bound to an active client record.',
    }
  }

  if (!found.isEmailVerified) {
    return {
      client: null,
      error: 'Client record requires verified email status before portal access is granted.',
    }
  }

  return {
    client: {
      id: found.id,
      clientCode: found.clientCode,
      name: found.name,
      email: found.email,
      isEmailVerified: found.isEmailVerified,
      company: found.company,
      membershipTier: found.membershipTier,
      serverDiscountPercent: SERVER_MEMBERSHIP_DISCOUNTS[found.membershipTier] ?? 0,
      panVat: found.panVat,
      phone: found.phone,
      isBound: true,
    },
    error: null,
  }
}

/**
 * 2. Fetch Own Bookings for Client Portal.
 * Guaranteed IDOR isolation: reads only matching client ID.
 */
export async function getClientPortalBookings(
  authenticatedClientId: string,
): Promise<ClientPortalBooking[]> {
  if (!authenticatedClientId) return []
  return MOCK_CLIENT_PORTAL_DATA.bookings
    .filter((b) => b.clientId === authenticatedClientId)
    .map(({ id, bookingNo, project, stage, pickupAtAd, returnAtAd, itemCount, items }) => ({
      id,
      bookingNo,
      project,
      stage,
      pickupAtAd,
      returnAtAd,
      itemCount,
      items,
    }))
}

/**
 * 3. Fetch Own Invoices/Receipts for Client Portal.
 * Filters strictly to non-void NPR currency invoices for the authenticated client.
 */
export async function getClientPortalInvoices(
  authenticatedClientId: string,
): Promise<ClientPortalInvoice[]> {
  if (!authenticatedClientId) return []
  return MOCK_CLIENT_PORTAL_DATA.invoices
    .filter((inv) => inv.clientId === authenticatedClientId && !inv.isVoid)
    .map(
      ({
        id,
        invoiceNo,
        bookingNo,
        issueDateAd,
        dueDateAd,
        currency,
        subtotal,
        discountPercent,
        discountAmount,
        taxableAmount,
        vatAmount,
        totalAmount,
        paidAmount,
        outstandingAmount,
        isVoid,
      }) => ({
        id,
        invoiceNo,
        bookingNo,
        issueDateAd,
        dueDateAd,
        currency,
        subtotal,
        discountPercent,
        discountAmount,
        taxableAmount,
        vatAmount,
        totalAmount,
        paidAmount,
        outstandingAmount,
        isVoid,
      }),
    )
}

/**
 * 4. Submit Guest Booking Request (No Client Account Required).
 * Enters OS staff queue for manual approval and strictly ignores any client-supplied discount.
 */
export async function submitGuestBookingRequest(
  input: GuestBookingRequestInput,
): Promise<GuestBookingRequestResult> {
  if (!input.guestName.trim() || !input.guestEmail.trim() || !input.guestPhone.trim()) {
    return {
      success: false,
      requestId: '',
      status: 'Pending Staff Review',
      serverDerivedDiscountPercent: 0,
      error: 'Name, email, and mobile phone are required for guest booking.',
    }
  }

  // Server-authoritative discount derivation: Guests receive 0% discount
  // Any input.clientSuppliedDiscount is strictly discarded (anti-tamper)
  const serverDerivedDiscount = 0

  const requestId = `REQ-${Date.now().toString().slice(-6)}`
  const queueEntry = {
    id: requestId,
    guestName: input.guestName.trim(),
    guestEmail: input.guestEmail.trim(),
    guestPhone: input.guestPhone.trim(),
    status: 'Pending Staff Review' as const,
    productIds: input.productIds,
    serverDiscountPercent: serverDerivedDiscount,
    submittedAtAd: new Date().toISOString(),
  }

  MOCK_CLIENT_PORTAL_DATA.guestRequestsQueue.push(queueEntry)

  return {
    success: true,
    requestId,
    status: 'Pending Staff Review',
    serverDerivedDiscountPercent: serverDerivedDiscount,
  }
}

/**
 * 5. Atomic Stock Check on Staff Approval of Guest Request.
 * Validates availability before staff can approve the guest booking.
 */
export async function validateStockOnStaffApproval(
  requestId: string,
): Promise<StaffApprovalStockCheckResult> {
  const req = MOCK_CLIENT_PORTAL_DATA.guestRequestsQueue.find((r) => r.id === requestId)
  if (!req) {
    return { allowed: false, reason: 'Request not found in staff queue.' }
  }

  const conflicts: Array<{ productId: string; requested: number; available: number }> = []

  for (const pid of req.productIds) {
    const stock = MOCK_CLIENT_PORTAL_DATA.inventoryStock.get(pid) ?? 0
    if (stock <= 0) {
      conflicts.push({ productId: pid, requested: 1, available: stock })
    }
  }

  if (conflicts.length > 0) {
    return {
      allowed: false,
      reason: 'Atomic stock check failed: Insufficient physical inventory for requested lines.',
      conflicts,
    }
  }

  return { allowed: true }
}
