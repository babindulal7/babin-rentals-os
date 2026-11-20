/**
 * src/booking/account/accountApi.ts — Babin Rentals OS
 *
 * Client Portal Bookings & Invoices API (T7-08).
 * Provides client-scoped booking timeline (6 steps), invoices with balance,
 * receipts, documents, and online payment integration (T7-05).
 *
 * Security & RLS (D-5, Law 6, PERMISSIONS §7 P2-P5):
 *  - Communicates via Supabase client using client auth session.
 *  - Enforces D-5 tenant isolation: clients can only query their own bookings
 *    and requests.
 *  - Integer paisa amounts only via formatMoney / Paisa.
 */

import { supabase } from '@/lib/supabase'
import { getCurrentClientUser } from '../lib/clientAuthApi'

export type ClientTimelineStep =
  | 'submitted'
  | 'confirmed'
  | 'packed'
  | 'on_rent'
  | 'returned'
  | 'closed'

export interface ClientBookingLine {
  id: string
  product_name: string
  qty: number
  rate_paisa?: number | undefined
}

export interface ClientBookingDocument {
  id: string
  title: string
  kind: 'quote' | 'agreement' | 'invoice' | 'receipt'
  created_at: string
  url?: string | undefined
}

export interface ClientBooking {
  id: string
  booking_no: string
  request_id?: string | undefined
  request_no?: string | undefined
  project_name: string
  shoot_location?: string | undefined
  start_date: string
  end_date: string
  stage: string
  timeline_step: ClientTimelineStep
  timeline_progress: number // 1 to 6
  total_paisa: number
  paid_paisa: number
  balance_paisa: number
  payment_available?: boolean
  payment_kind?: 'advance' | 'balance' | 'none'
  lines: ClientBookingLine[]
  documents: ClientBookingDocument[]
  created_at: string
}

// Mock fallback for mock mode / unit tests
const MOCK_STORAGE_KEY = 'babin_mock_client_bookings'

export function getMockClientBookings(): ClientBooking[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(MOCK_STORAGE_KEY)
      if (stored) {
        return JSON.parse(stored) as ClientBooking[]
      }
    }
  } catch {
    // Ignore storage errors
  }

  // Realistic mock data showcasing the 6-step client timeline and payment
  return [
    {
      id: 'mock-bk-001',
      booking_no: 'BK-2026-0881',
      request_id: 'req-001',
      request_no: 'REQ-2026-0042',
      project_name: 'Mountaineering Commercial Shoot',
      shoot_location: 'Namche Bazaar & Kathmandu',
      start_date: '2026-11-25',
      end_date: '2026-11-28',
      stage: 'Booked',
      timeline_step: 'confirmed',
      timeline_progress: 2,
      total_paisa: 3600000, // Rs 36,000
      paid_paisa: 1500000, // Rs 15,000 advance paid
      balance_paisa: 2100000, // Rs 21,000 due
      created_at: '2026-11-18T10:00:00Z',
      lines: [
        { id: 'line-1', product_name: 'Sony FX3 Cinema Line Camera', qty: 1, rate_paisa: 600000 },
        { id: 'line-2', product_name: 'Sony FE 24-70mm f/2.8 GM II', qty: 1, rate_paisa: 350000 },
        { id: 'line-3', product_name: 'DJI RS3 Pro Gimbal Stabilizer', qty: 1, rate_paisa: 250000 },
      ],
      documents: [
        { id: 'doc-1', title: 'Formal Quote #QT-2026-0042', kind: 'quote', created_at: '2026-11-18T10:30:00Z' },
        { id: 'doc-2', title: 'Advance Payment Receipt #REC-0881', kind: 'receipt', created_at: '2026-11-18T11:00:00Z' },
        { id: 'doc-3', title: 'Rental Agreement (Digital Preview)', kind: 'agreement', created_at: '2026-11-18T11:15:00Z' },
      ],
    },
    {
      id: 'mock-bk-002',
      booking_no: 'BK-2026-0814',
      request_id: 'req-002',
      request_no: 'REQ-2026-0019',
      project_name: 'Music Video Production',
      shoot_location: 'Patan Durbar Square',
      start_date: '2026-11-10',
      end_date: '2026-11-12',
      stage: 'Closed',
      timeline_step: 'closed',
      timeline_progress: 6,
      total_paisa: 2400000, // Rs 24,000
      paid_paisa: 2400000, // Fully settled
      balance_paisa: 0,
      created_at: '2026-11-08T09:00:00Z',
      lines: [
        { id: 'line-4', product_name: 'Aputure 600d Pro Daylight LED', qty: 2, rate_paisa: 400000 },
        { id: 'line-5', product_name: 'C-Stand 40" with Grip Arm', qty: 4, rate_paisa: 50000 },
      ],
      documents: [
        { id: 'doc-4', title: 'Final Tax Invoice #INV-2026-0814', kind: 'invoice', created_at: '2026-11-12T16:00:00Z' },
        { id: 'doc-5', title: 'Full Settlement Receipt #REC-0814', kind: 'receipt', created_at: '2026-11-12T16:05:00Z' },
      ],
    },
  ]
}

export function saveMockClientBookings(bookings: ClientBooking[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(bookings))
    }
  } catch {
    // Ignore
  }
}

/**
 * Maps a booking stage or request status to a 6-step client timeline.
 * 1: submitted, 2: confirmed, 3: packed, 4: on_rent, 5: returned, 6: closed.
 */
export function mapStageToTimeline(stage: string): { step: ClientTimelineStep; progress: number } {
  const norm = (stage || '').toLowerCase()
  switch (norm) {
    case 'pending':
    case 'under_review':
    case 'quote':
    case 'draft':
      return { step: 'submitted', progress: 1 }
    case 'confirmed':
    case 'booked':
      return { step: 'confirmed', progress: 2 }
    case 'packed':
      return { step: 'packed', progress: 3 }
    case 'on rent':
    case 'on_rent':
    case 'in_transit':
      return { step: 'on_rent', progress: 4 }
    case 'returned':
    case 'inspection':
      return { step: 'returned', progress: 5 }
    case 'closed':
    case 'settled':
      return { step: 'closed', progress: 6 }
    default:
      return { step: 'submitted', progress: 1 }
  }
}

/**
 * Fetches the authenticated client's list of bookings and requests.
 * Enforces D-5 tenant isolation via auth session.
 */
export async function fetchMyBookings(): Promise<ClientBooking[]> {
  const isMock = typeof process !== 'undefined' && (process.env.VITE_DATA_SOURCE === 'mock' || process.env.NODE_ENV === 'test')
  if (isMock) {
    return getMockClientBookings()
  }

  const user = await getCurrentClientUser()
  if (!user) {
    return []
  }

  try {
    // 1. Fetch client requests created by this auth user
    const { data: requests, error: reqErr } = await supabase
      .from('booking_requests')
      .select('id, request_number, client_name, project_name, shoot_location, start_date, end_date, status, total_paisa, vat_paisa, advance_due_paisa, booking_id, created_at')
      .eq('requester_auth_uid', user.id)
      .order('created_at', { ascending: false })

    if (reqErr) throw reqErr

    // 2. Fetch associated bookings
    const bookingsList: ClientBooking[] = []

    for (const req of (requests || [])) {
      let bkgNo = req.request_number || 'REQ-ONLINE'
      let stage = req.status === 'confirmed' ? 'Booked' : req.status === 'declined' || req.status === 'cancelled' ? 'Cancelled' : 'Pending'
      let lines: ClientBookingLine[] = []
      const documents: ClientBookingDocument[] = []
      let paidPaisa = 0
      // Request subtotal and VAT are separate paisa fields.
      let totalPaisa = Number(req.total_paisa || 0) + Number(req.vat_paisa || 0)
      let balancePaisa = Number(req.advance_due_paisa || 0)
      let paymentAvailable = req.status === 'pending'
      let paymentKind: ClientBooking['payment_kind'] = paymentAvailable ? 'advance' : 'none'

      // Fetch request lines
      const { data: reqLines } = await supabase
        .from('booking_request_lines')
        .select('id, product_id, bundle_id, quantity, daily_rate_paisa')
        .eq('request_id', req.id)

      if (reqLines) {
        lines = reqLines.map((l: { id: string; product_id: string | null; bundle_id: string | null; quantity: number; daily_rate_paisa: number }) => ({
          id: l.id,
          product_name: l.bundle_id ? 'Rental bundle' : 'Rental equipment',
          qty: l.quantity,
          rate_paisa: l.daily_rate_paisa,
        }))
      }

      // Check payment intents for paid amount
      const { data: intents } = await supabase
        .from('payment_intents')
        .select('id, amount_paisa, status')
        .eq('booking_request_id', req.id)

      if (intents) {
        paidPaisa = intents
          .filter((i: { status: string }) => i.status === 'paid' || i.status === 'allocated')
          .reduce((sum: number, i: { amount_paisa: number }) => sum + Number(i.amount_paisa), 0)
        balancePaisa = Math.max(0, balancePaisa - paidPaisa)
      }

      // If linked to confirmed booking, fetch official booking stage
      if (req.booking_id) {
        const { data: bkg } = await supabase
          .from('bookings')
          .select('id, booking_no, stage, created_at')
          .eq('id', req.booking_id)
          .maybeSingle()

        if (bkg) {
          bkgNo = bkg.booking_no
          stage = bkg.stage
        }
      }

      // Only the authenticated owner may see the actual, issued invoice balance.
      // Requests without an issued invoice are never presented as payable balances.
      if (req.status === 'confirmed' && req.booking_id) {
        const { data: invoiceBalance, error: balanceErr } = await supabase.rpc('get_client_booking_balance', {
          p_request_id: req.id,
        })
        if (balanceErr) throw balanceErr
        if (invoiceBalance?.available === true && invoiceBalance.booking_id === req.booking_id) {
          totalPaisa = Number(invoiceBalance.total_paisa)
          paidPaisa = Number(invoiceBalance.paid_paisa)
          balancePaisa = Number(invoiceBalance.balance_paisa)
          paymentAvailable = balancePaisa > 0
          paymentKind = 'balance'
        } else {
          balancePaisa = 0
          paymentAvailable = false
          paymentKind = 'none'
        }
      } else if (req.status !== 'pending') {
        balancePaisa = 0
        paymentAvailable = false
        paymentKind = 'none'
      }

      // No invented quotes, receipts, agreements or VAT invoices.
      // Documents must come from a server-authorized stored attachment record.
      // Until the document/attachment integration is verified, leave this empty.

      const { step, progress } = mapStageToTimeline(stage)

      bookingsList.push({
        id: req.booking_id || req.id,
        booking_no: bkgNo,
        request_id: req.id,
        request_no: req.request_number,
        project_name: req.project_name || 'Production Rental',
        shoot_location: req.shoot_location || undefined,
        start_date: req.start_date,
        end_date: req.end_date,
        stage,
        timeline_step: step,
        timeline_progress: progress,
        total_paisa: totalPaisa,
        paid_paisa: paidPaisa,
        balance_paisa: balancePaisa,
        payment_available: paymentAvailable && balancePaisa > 0,
        payment_kind: paymentKind,
        lines,
        documents,
        created_at: req.created_at,
      })
    }

    return bookingsList
  } catch (err) {
    console.error("[MyBookings] Could not load the client's real bookings:", err)
    throw new Error('Booking records are temporarily unavailable. Please try again or contact Babin Rentals.')
  }
}

/**
 * Triggers a client document download or view.
 */
export function viewClientDocument(doc: ClientBookingDocument, booking: ClientBooking): void {
  const content = `# Babin Rentals — ${doc.title}
Document ID: ${doc.id}
Date: ${new Date(doc.created_at).toLocaleDateString()}
Client Booking: ${booking.booking_no}
Project: ${booking.project_name}
Rental Period: ${booking.start_date} to ${booking.end_date}

EQUIPMENT:
${booking.lines.map((l) => `- ${l.product_name} × ${l.qty}`).join('\n')}

FINANCIAL SUMMARY:
- Total: Rs ${(booking.total_paisa / 100).toLocaleString('en-IN')}
- Paid: Rs ${(booking.paid_paisa / 100).toLocaleString('en-IN')}
- Outstanding Balance: Rs ${(booking.balance_paisa / 100).toLocaleString('en-IN')}

Official Babin Rentals Document • Kathmandu, Nepal
`
  if (typeof window !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${booking.booking_no}_${doc.kind}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
}
