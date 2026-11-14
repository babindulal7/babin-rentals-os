import type { Paisa } from './money'
import type { MembershipTier } from '../data/clients'

/**
 * Client portal transport contracts. Do not substitute fixtures for JWT-backed
 * access, server-derived discounts, or durable booking requests.
 * This PR remains a draft until its backend/RLS release gate is implemented.
 */
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
  pickupTime?: string
  returnDate: string
  returnTime?: string
  productIds: string[]
  clientSuppliedDiscount?: number
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
export interface StaffApprovalResult {
  success: boolean
  status: 'Approved' | 'Declined'
  bookingId?: string | undefined
  reason?: string | undefined
}

const PORTAL_UNAVAILABLE = 'Secure client portal data access is not yet connected; no client records were loaded.'
const REQUEST_UNAVAILABLE = 'Booking request could not be saved to the staff queue. Please contact Babin Rentals directly.'

/**
 * Never trust caller-provided email/verification state. A Supabase-authenticated
 * confirmed email and its OWN RLS-protected portal_users binding are prerequisites.
 * Read-only: DO NOT call the binding mutation on behalf of a signed-in browser.
 * Refuse to render profile data until a real session-scoped client reader is added.
 */
export async function authenticateClientSession(
  _claimedEmail?: string,
  _claimedVerified?: boolean,
): Promise<{ client: ClientPortalProfile | null; error: string | null }> {
  try {
    const { supabase, IS_MOCK } = await import('./supabase')
    if (IS_MOCK) return { client: null, error: PORTAL_UNAVAILABLE }
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user?.email || !data.user.email_confirmed_at) {
      return { client: null, error: 'Verified Supabase email session required for client portal access.' }
    }
    const { data: portal, error: portalError } = await supabase
      .from('portal_users')
      .select('client_id')
      .eq('auth_user_id', data.user.id)
      .eq('status', 'Active')
      .is('deactivated_at', null)
      .maybeSingle()
    if (portalError || !portal?.client_id) {
      return { client: null, error: 'No verified client account binding for this session.' }
    }
  } catch {
    return { client: null, error: PORTAL_UNAVAILABLE }
  }
  // A binding alone does not prove the whole client profile, bookings and
  // invoices have been mapped through correct RLS readers.
  return { client: null, error: PORTAL_UNAVAILABLE }
}

/** Caller-supplied client IDs must not permit in-browser filtering of records. */
export async function getClientPortalBookings(_clientId?: string): Promise<ClientPortalBooking[]> {
  throw new Error(PORTAL_UNAVAILABLE)
}
export async function getClientPortalInvoices(_clientId?: string): Promise<ClientPortalInvoice[]> {
  throw new Error(PORTAL_UNAVAILABLE)
}

function validDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(value + 'T00:00:00.000Z')
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value
}

/**
 * A guest request must be persisted by a real staff-readable server action
 * before returning success. No browser-memory queue, fake request ID or
 * unverified inventory hold is allowed.
 */
export async function submitGuestBookingRequest(
  input: GuestBookingRequestInput,
): Promise<GuestBookingRequestResult> {
  const base = { success: false, requestId: '', status: 'Pending Staff Review' as const, serverDerivedDiscountPercent: 0 }
  if (!input.guestName.trim() || !input.guestEmail.trim() || !input.guestPhone.trim()) {
    return { ...base, error: 'Name, email, and phone are required.' }
  }
  if (!validDay(input.pickupDate) || !validDay(input.returnDate) ||
      input.returnDate <= input.pickupDate || input.productIds.length === 0) {
    return { ...base, error: 'Choose valid pickup and return dates and at least one item.' }
  }
  if (input.pickupTime || input.returnTime) {
    if (!input.pickupTime || !input.returnTime ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.pickupTime) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.returnTime)) {
      return { ...base, error: 'Choose both pickup and return times.' }
    }
  }
  // clientSuppliedDiscount and product IDs are never trusted for pricing/stock.
  return { ...base, error: REQUEST_UNAVAILABLE }
}

/** Staff cannot book inventory through a browser-side stock Map. */
export async function validateStockOnStaffApproval(_requestId: string): Promise<StaffApprovalStockCheckResult> {
  return { allowed: false, reason: 'Atomic server reservation verification is not yet available.' }
}
export async function approveGuestBookingRequest(
  _requestId: string,
  _staffUserId: string,
): Promise<StaffApprovalResult> {
  return { success: false, status: 'Declined', reason: 'Server-side staff approval is not yet configured.' }
}
export async function declineGuestBookingRequest(
  _requestId: string,
  _staffUserId: string,
  _reason: string,
): Promise<StaffApprovalResult> {
  return { success: false, status: 'Declined', reason: 'Server-side audited decline is not yet configured.' }
}
