/**
 * Client Message Register (T5-06, W20, W21, W60).
 *
 * Central register listing every message the application sends to a client,
 * specifying transmission mechanism (automatic email, staff-sent email, or WhatsApp draft),
 * triggering condition, timing, recipient, and ruling references.
 *
 * Key Rulings:
 *   - W21: The 7 operational lifecycle client emails are automatic.
 *   - W18/W18b: Payment reminders are automatic at completion, day 5, 10, then every 5 days;
 *               staff can pause a client.
 *   - W22: Clients with no email receive a WhatsApp draft task for staff (wa.me link).
 *   - W20: Booking confirmation is staff-initiated ("Send via email and then WhatsApp is option").
 *   - W60: WhatsApp Business API is NOT used — WhatsApp is strictly a draft staff send.
 *   - W80: All client emails must be in English from no-reply@babinrentals.com.
 *   - Law 6: Damage notice carries strictly NO money figures until manager/owner approval.
 */

export type ClientMessageTransmission = 'automatic_email' | 'staff_sent_email' | 'whatsapp_draft'
export type ClientMessageRecipient = 'client' | 'client_portal_user'

export interface ClientMessageEntry {
  id: string
  name: string
  transmission: ClientMessageTransmission
  trigger: string
  timing: string
  recipient: ClientMessageRecipient
  rulingRef: string
  templateId: string
  description: string
  hasMoneyAmount: boolean
}

export const CLIENT_MESSAGE_REGISTER: readonly ClientMessageEntry[] = [
  // ── Automatic Operational Emails (T5-07, W21, W37, W38) ────────────────────
  {
    id: 'pickup_reminder',
    name: 'Pickup Reminder',
    transmission: 'automatic_email',
    trigger: 'Booking stage = Booked',
    timing: '2 hours before scheduled pickup (pickup_at - 2h)',
    recipient: 'client',
    rulingRef: 'W21, W37',
    templateId: 'pickup_reminder',
    description: 'Reminds client equipment is ready for collection; lists pickup window and reminder to bring ID.',
    hasMoneyAmount: false,
  },
  {
    id: 'pickup_receipt',
    name: 'Pickup Receipt',
    transmission: 'automatic_email',
    trigger: 'Booking handover completes (transition to On Rent)',
    timing: 'Immediately upon Handover session completion',
    recipient: 'client',
    rulingRef: 'W21',
    templateId: 'pickup_receipt',
    description: 'Confirms custody transfer, signer name, schedule, and return due date.',
    hasMoneyAmount: false,
  },
  {
    id: 'return_reminder',
    name: 'Return Reminder',
    transmission: 'automatic_email',
    trigger: 'Booking stage = On Rent',
    timing: '2 hours before scheduled return (return_at - 2h)',
    recipient: 'client',
    rulingRef: 'W21, W37',
    templateId: 'return_reminder',
    description: 'Reminds client of impending return time and location in Kathmandu.',
    hasMoneyAmount: false,
  },
  {
    id: 'late_return',
    name: 'Late Return Notice',
    transmission: 'automatic_email',
    trigger: 'Booking stage = On Rent and now() > return_at + 30 min',
    timing: '+30 minutes after return due time (grace period elapsed)',
    recipient: 'client',
    rulingRef: 'W21, W38',
    templateId: 'late_return',
    description: 'Urgent notice that equipment is overdue and grace period has expired.',
    hasMoneyAmount: false,
  },
  {
    id: 'return_receipt',
    name: 'Return Receipt',
    transmission: 'automatic_email',
    trigger: 'Booking return check-in completes (transition to Returned)',
    timing: 'Immediately upon Return session completion',
    recipient: 'client',
    rulingRef: 'W21',
    templateId: 'return_receipt',
    description: 'Acknowledges equipment check-in and notes if any items are under review.',
    hasMoneyAmount: false,
  },
  {
    id: 'damage_notice',
    name: 'Damage / Loss Inspection Notice',
    transmission: 'automatic_email',
    trigger: 'Damage finding recorded during return check-in or cleaning review',
    timing: 'Immediately upon finding creation',
    recipient: 'client',
    rulingRef: 'W21, W23, Law 6',
    templateId: 'damage_notice',
    description: 'Notifies client an item is under technical review. Strictly NO money figure displayed prior to approval.',
    hasMoneyAmount: false,
  },
  {
    id: 'damage_charge',
    name: 'Approved Damage Charge',
    transmission: 'automatic_email',
    trigger: 'Damage finding approved by Manager or Owner',
    timing: 'Immediately upon finding approval',
    recipient: 'client',
    rulingRef: 'W21, W23, PERMISSIONS §7 P1',
    templateId: 'damage_charge',
    description: 'Notifies client of finalized and approved damage assessment amount and updated statement.',
    hasMoneyAmount: true,
  },

  // ── Automatic Payment Reminders (T5-08, W18, W18b) ─────────────────────────
  {
    id: 'payment_reminder',
    name: 'Payment Reminder',
    transmission: 'automatic_email',
    trigger: 'Booking Returned with outstanding invoice balance > 0 and client reminders_paused = false',
    timing: 'Completion (seq 0), day 5 (seq 1), day 10 (seq 2), then every 5 days until balance = 0',
    recipient: 'client',
    rulingRef: 'W18, W18b',
    templateId: 'payment_reminder',
    description: 'Regular polite payment reminder displaying outstanding balance and statement link.',
    hasMoneyAmount: true,
  },

  // ── Client-Triggered Portal Emails (T7) ────────────────────────────────────
  {
    id: 'client_sign_in_code',
    name: 'Portal Sign-in OTP',
    transmission: 'automatic_email',
    trigger: 'Client requests email OTP sign-in on portal',
    timing: 'Instant on demand',
    recipient: 'client_portal_user',
    rulingRef: 'W80, T7',
    templateId: 'client_sign_in_code',
    description: 'Delivers 6-digit one-time passcode for secure passwordless portal authentication.',
    hasMoneyAmount: false,
  },
  {
    id: 'online_request_received',
    name: 'Online Request Received',
    transmission: 'automatic_email',
    trigger: 'Client submits new rental request on portal',
    timing: 'Immediately upon request submission',
    recipient: 'client',
    rulingRef: 'W80, T7-04',
    templateId: 'online_request_received',
    description: 'Confirms receipt of rental request and advises staff review in progress.',
    hasMoneyAmount: false,
  },
  {
    id: 'online_payment_receipt',
    name: 'Online Payment Receipt',
    transmission: 'automatic_email',
    trigger: 'Online card/wallet payment confirmed',
    timing: 'Immediately upon successful payment confirmation',
    recipient: 'client',
    rulingRef: 'W80, T7-04',
    templateId: 'online_payment_receipt',
    description: 'Digital payment receipt confirming amount received and transaction reference.',
    hasMoneyAmount: true,
  },
  {
    id: 'online_request_confirmed',
    name: 'Online Request Confirmed',
    transmission: 'automatic_email',
    trigger: 'Staff approves online rental request into confirmed booking',
    timing: 'Immediately upon staff approval',
    recipient: 'client',
    rulingRef: 'W80, T7-04',
    templateId: 'online_request_confirmed',
    description: 'Informs client booking has been accepted and gear reserved.',
    hasMoneyAmount: true,
  },
  {
    id: 'online_request_declined',
    name: 'Online Request Declined',
    transmission: 'automatic_email',
    trigger: 'Staff declines online rental request with reason',
    timing: 'Immediately upon staff rejection',
    recipient: 'client',
    rulingRef: 'W80, T7-04',
    templateId: 'online_request_declined',
    description: 'Informs client request could not be fulfilled along with coordinator note.',
    hasMoneyAmount: false,
  },

  // ── Staff-Initiated Documents & Emails (W20, T3-16) ────────────────────────
  {
    id: 'booking_confirmation',
    name: 'Booking Confirmation',
    transmission: 'staff_sent_email',
    trigger: 'Staff taps "Send Booking Confirmation" from booking page',
    timing: 'On staff demand',
    recipient: 'client',
    rulingRef: 'W20',
    templateId: 'booking_confirmed',
    description: 'Formal confirmation of booked gear, dates, pricing, and handover instructions.',
    hasMoneyAmount: true,
  },
  {
    id: 'quote_document',
    name: 'Quote Document',
    transmission: 'staff_sent_email',
    trigger: 'Staff taps "Send Quote" from quote workspace',
    timing: 'On staff demand',
    recipient: 'client',
    rulingRef: 'T3-16',
    templateId: 'quote_document',
    description: 'Official rental estimate and pricing breakdown with PDF link.',
    hasMoneyAmount: true,
  },
  {
    id: 'invoice_document',
    name: 'Invoice Document',
    transmission: 'staff_sent_email',
    trigger: 'Staff taps "Send Invoice" from finance or invoice workspace',
    timing: 'On staff demand',
    recipient: 'client',
    rulingRef: 'T3-16',
    templateId: 'invoice_document',
    description: 'Tax invoice with VAT breakdown, bank payment details, and PDF link.',
    hasMoneyAmount: true,
  },
  {
    id: 'statement_document',
    name: 'Account Statement',
    transmission: 'staff_sent_email',
    trigger: 'Staff taps "Send Statement" from client record or Who Owes list',
    timing: 'On staff demand',
    recipient: 'client',
    rulingRef: 'T3-16, T3-20',
    templateId: 'statement_document',
    description: 'Ledger statement of all active/historical rentals, debits, credits, and balance.',
    hasMoneyAmount: true,
  },

  // ── Staff WhatsApp Drafts (W60: always draft staff send, never API) ────────
  {
    id: 'wa_booking_confirmed',
    name: 'WhatsApp: Booking Confirmed',
    transmission: 'whatsapp_draft',
    trigger: 'Staff opens WhatsApp action menu on Booked stage',
    timing: 'On staff tap (opens wa.me draft in browser)',
    recipient: 'client',
    rulingRef: 'W20, W60',
    templateId: 'booking_confirmed',
    description: 'Pre-filled WhatsApp courtesy greeting, equipment summary, dates, and store location.',
    hasMoneyAmount: true,
  },
  {
    id: 'wa_gear_ready',
    name: 'WhatsApp: Gear Ready',
    transmission: 'whatsapp_draft',
    trigger: 'Staff opens WhatsApp action menu on Packed stage',
    timing: 'On staff tap (opens wa.me draft in browser)',
    recipient: 'client',
    rulingRef: 'W60',
    templateId: 'gear_ready',
    description: 'Informs client gear is packed and ready for immediate collection.',
    hasMoneyAmount: false,
  },
  {
    id: 'wa_pickup_tomorrow',
    name: 'WhatsApp: Pickup Tomorrow',
    transmission: 'whatsapp_draft',
    trigger: 'Staff opens WhatsApp action menu day before pickup',
    timing: 'On staff tap (opens wa.me draft in browser)',
    recipient: 'client',
    rulingRef: 'W60',
    templateId: 'pickup_tomorrow',
    description: 'Courtesy reminder for pickup scheduled for the next operational day.',
    hasMoneyAmount: false,
  },
  {
    id: 'wa_return_reminder',
    name: 'WhatsApp: Return Reminder',
    transmission: 'whatsapp_draft',
    trigger: 'Staff opens WhatsApp action menu on return day, or fallback task when client has no email (W22)',
    timing: 'On staff tap or from pending WhatsApp draft task list',
    recipient: 'client',
    rulingRef: 'W22, W60',
    templateId: 'return_reminder',
    description: 'Courtesy WhatsApp reminder that gear is due for return today.',
    hasMoneyAmount: false,
  },
  {
    id: 'wa_overdue',
    name: 'WhatsApp: Overdue / Late Return',
    transmission: 'whatsapp_draft',
    trigger: 'Staff opens WhatsApp action menu on overdue booking, or fallback task when client has no email (W22)',
    timing: 'On staff tap or from pending WhatsApp draft task list',
    recipient: 'client',
    rulingRef: 'W22, W38, W60',
    templateId: 'overdue',
    description: 'Urgent reminder that rental window has lapsed past grace period.',
    hasMoneyAmount: false,
  },
  {
    id: 'wa_dispatch_manifest',
    name: 'WhatsApp: Dispatch Manifest',
    transmission: 'whatsapp_draft',
    trigger: 'Staff coordinates transport delivery dispatch',
    timing: 'On staff tap (opens wa.me draft for driver or client)',
    recipient: 'client',
    rulingRef: 'W60',
    templateId: 'dispatch_manifest',
    description: 'Manifest breakdown of equipment being transported to delivery zone.',
    hasMoneyAmount: false,
  },
  {
    id: 'wa_return_receipt',
    name: 'WhatsApp: Return Receipt',
    transmission: 'whatsapp_draft',
    trigger: 'Staff opens WhatsApp action menu on Returned stage, or fallback task when client has no email (W22)',
    timing: 'On staff tap or from pending WhatsApp draft task list',
    recipient: 'client',
    rulingRef: 'W22, W60',
    templateId: 'return_receipt',
    description: 'Confirms return check-in completed in store.',
    hasMoneyAmount: false,
  },
  {
    id: 'wa_payment_receipt',
    name: 'WhatsApp: Payment Receipt',
    transmission: 'whatsapp_draft',
    trigger: 'Staff records cash or in-store payment and sends WhatsApp confirmation',
    timing: 'On staff tap from Payment record',
    recipient: 'client',
    rulingRef: 'W60',
    templateId: 'payment_receipt',
    description: 'Receipt acknowledgement with amount received and remaining balance.',
    hasMoneyAmount: true,
  },
  {
    id: 'wa_balance_due',
    name: 'WhatsApp: Balance Due Reminder',
    transmission: 'whatsapp_draft',
    trigger: 'Staff sends reminder from Who Owes list, or fallback task when client has no email (W18, W22)',
    timing: 'On staff tap or from pending WhatsApp draft task list',
    recipient: 'client',
    rulingRef: 'W18, W22, W60',
    templateId: 'balance_due',
    description: 'Outstanding balance statement reminder with settlement instructions.',
    hasMoneyAmount: true,
  },
  {
    id: 'wa_damage_notice',
    name: 'WhatsApp: Damage Inspection Notice',
    transmission: 'whatsapp_draft',
    trigger: 'Fallback task when client has no email upon damage inspection flag (W22, W23)',
    timing: 'From pending WhatsApp draft task list',
    recipient: 'client',
    rulingRef: 'W22, W23, Law 6, W60',
    templateId: 'damage_notice',
    description: 'Advises client of workshop review. Strictly NO amount displayed before approval.',
    hasMoneyAmount: false,
  },
  {
    id: 'wa_damage_charge',
    name: 'WhatsApp: Approved Damage Charge',
    transmission: 'whatsapp_draft',
    trigger: 'Fallback task when client has no email upon damage assessment approval (W22, W23)',
    timing: 'From pending WhatsApp draft task list',
    recipient: 'client',
    rulingRef: 'W22, W23, W60',
    templateId: 'damage_charge',
    description: 'Notifies client of approved assessment charge and request to contact accounts.',
    hasMoneyAmount: true,
  },
] as const

/**
 * Lookup a registered client message by ID.
 */
export function getClientMessageDefinition(id: string): ClientMessageEntry | undefined {
  return CLIENT_MESSAGE_REGISTER.find((entry) => entry.id === id)
}

/**
 * Validate whether a given message ID is registered in the client message register.
 */
export function isRegisteredClientMessage(id: string): boolean {
  return CLIENT_MESSAGE_REGISTER.some((entry) => entry.id === id)
}

/**
 * Filter registered messages by transmission channel.
 */
export function getMessagesByTransmission(transmission: ClientMessageTransmission): ClientMessageEntry[] {
  return CLIENT_MESSAGE_REGISTER.filter((entry) => entry.transmission === transmission)
}
