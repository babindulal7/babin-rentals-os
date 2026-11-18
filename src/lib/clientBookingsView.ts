/**
 * Client Portal: My Bookings Timeline & Account View (T7-08)
 *
 * Implements presentation logic and status mapping for signed-in clients:
 * - 6-step client timeline (Submitted -> Confirmed -> Packed -> With Client -> Returned -> Closed).
 * - Read-only view of rental lines, total, paid advance, and balance due.
 * - Documents available for download (Quotes, Invoices, Receipts, Agreements).
 * - "Pay Balance" CTA active only when balance > 0 and booking is confirmed.
 * - Strict client data scoping: clients can NEVER view another client's bookings.
 */

export type ClientBookingStage =
  | 'Submitted'
  | 'Confirmed'
  | 'Packed'
  | 'With Client'
  | 'Returned'
  | 'Closed'

export interface ClientTimelineStep {
  stage: ClientBookingStage
  label: string
  isCurrent: boolean
  isCompleted: boolean
}

export interface ClientDocumentRef {
  docId: string
  docType: 'Quote' | 'Agreement' | 'Invoice' | 'Receipt'
  documentNumber: string
  downloadUrl: string
}

export interface ClientBookingViewModel {
  bookingId: string
  bookingNumber: string
  timeline: ClientTimelineStep[]
  pickupDateUtc: string
  returnDateUtc: string
  totalPaisa: number
  paidPaisa: number
  balanceDuePaisa: number
  canPayBalanceOnline: boolean
  documents: ClientDocumentRef[]
  lines: Array<{
    lineId: string
    productName: string
    quantity: number
  }>
}

const STAGES: ClientBookingStage[] = [
  'Submitted',
  'Confirmed',
  'Packed',
  'With Client',
  'Returned',
  'Closed',
]

/**
 * Builds the 6-step client-facing timeline.
 */
export function buildClientTimeline(currentStage: ClientBookingStage): ClientTimelineStep[] {
  const currentIndex = STAGES.indexOf(currentStage)

  return STAGES.map((stage, idx) => ({
    stage,
    label: stage,
    isCurrent: idx === currentIndex,
    isCompleted: idx < currentIndex,
  }))
}

/**
 * Evaluates whether a client can click "Pay Balance" online.
 */
export function canClientPayBalance(stage: ClientBookingStage, balanceDuePaisa: number): boolean {
  if (balanceDuePaisa <= 0) return false
  // Online payment is offered once confirmed and before closed
  return stage !== 'Submitted' && stage !== 'Closed'
}

/**
 * Formats a raw booking into a secure client view model.
 */
export function formatClientBookingView(
  booking: {
    bookingId: string
    bookingNumber: string
    clientId: string
    stage: ClientBookingStage
    pickupDateUtc: string
    returnDateUtc: string
    totalPaisa: number
    paidPaisa: number
    lines: Array<{ lineId: string; productName: string; quantity: number }>
    documents: ClientDocumentRef[]
  },
  authenticatedClientId: string,
): ClientBookingViewModel | null {
  // Scoping gate: Client can only view their own booking
  if (booking.clientId !== authenticatedClientId) {
    return null
  }

  const balanceDuePaisa = Math.max(0, booking.totalPaisa - booking.paidPaisa)
  const timeline = buildClientTimeline(booking.stage)
  const canPayOnline = canClientPayBalance(booking.stage, balanceDuePaisa)

  return {
    bookingId: booking.bookingId,
    bookingNumber: booking.bookingNumber,
    timeline,
    pickupDateUtc: booking.pickupDateUtc,
    returnDateUtc: booking.returnDateUtc,
    totalPaisa: booking.totalPaisa,
    paidPaisa: booking.paidPaisa,
    balanceDuePaisa,
    canPayBalanceOnline: canPayOnline,
    documents: booking.documents,
    lines: booking.lines,
  }
}
