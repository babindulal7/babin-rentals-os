/**
 * Client Message Events Query and Service Module (T5-07, W21, W22, W23, W37, W38, W80).
 *
 * Rules:
 *   - Automatic client emails sent in English (W80).
 *   - Pickup reminder: 2h before pickup (W37).
 *   - Pickup receipt: on Handover (On Rent).
 *   - Return reminder: 2h before return.
 *   - Late return: at +30m after return_at (W38, grace period ended).
 *   - Return receipt: on Return.
 *   - Damage notice: on damage case opened, strictly NO money amount (W23, Law 6).
 *   - Damage charge: only after Manager (< Rs 25,000) or Owner (>= Rs 25,000) approval (PERMISSIONS §7 P1).
 *   - No-email fallback: staff get a WhatsApp draft task with identical text, one tap to send (W22).
 *   - Hard delete forbidden (Law 3).
 *   - Records immutable once sent (Law 4).
 *   - Client UUID on every mutation (Law 8).
 */

import { supabase, IS_MOCK } from '../supabase'
import { buildWaLink } from '../whatsapp'
import { formatMoney, type Paisa } from '../money'

export type ClientMessageEventType =
  | 'pickup_reminder'
  | 'pickup_receipt'
  | 'return_reminder'
  | 'late_return'
  | 'return_receipt'
  | 'damage_notice'
  | 'damage_charge'

export type ClientMessageChannel = 'email' | 'whatsapp_draft'

export type ClientMessageStatus = 'pending' | 'sent' | 'draft_ready' | 'cancelled' | 'failed'

export interface ClientMessageEvent {
  id: string
  clientUuid: string
  bookingId: string
  eventType: ClientMessageEventType
  channel: ClientMessageChannel
  status: ClientMessageStatus
  dueAt: string
  sentAt: string | null
  recipientName: string
  recipientEmail: string | null
  recipientPhone: string | null
  findingId: string | null
  payload: Record<string, unknown>
  emailLogId: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

export interface PendingWhatsAppDraftTask {
  eventId: string
  bookingId: string
  bookingNo: string
  clientName: string
  clientPhone: string | null
  eventType: ClientMessageEventType
  dueAt: string
  draftText: string
  waLink: string | null
}

export function formatClientDraftText(
  eventType: ClientMessageEventType,
  clientName: string,
  bookingNo: string,
  extra?: {
    dueTime?: string
    chargePaisa?: Paisa | null
    findingDesc?: string
  },
): string {
  const firstName = clientName.trim().split(/\s+/)[0] || clientName.trim()
  const businessName = 'Babin Rentals'

  switch (eventType) {
    case 'pickup_reminder':
      return [
        `Namaste ${firstName},`,
        '',
        `A reminder that your rental gear for booking ${bookingNo} is ready for pickup in 2 hours.`,
        'Please bring your valid government-issued ID for verification at handover.',
        '',
        `Dhanyabad,\n${businessName}`,
      ].join('\n')

    case 'pickup_receipt':
      return [
        `Namaste ${firstName},`,
        '',
        `Your equipment handover for booking ${bookingNo} has been completed. ✅`,
        extra?.dueTime ? `Scheduled return: ${extra.dueTime}.` : 'Please check your schedule for return time.',
        'Please ensure all cables and accessories are returned together.',
        '',
        `Dhanyabad,\n${businessName}`,
      ].join('\n')

    case 'return_reminder':
      return [
        `Namaste ${firstName},`,
        '',
        `A friendly reminder that booking ${bookingNo} is due for return in 2 hours.`,
        'Returning on time keeps your account in good standing.',
        '',
        `Dhanyabad,\n${businessName}`,
      ].join('\n')

    case 'late_return':
      return [
        `Namaste ${firstName},`,
        '',
        `URGENT: Booking ${bookingNo} is overdue (the 30-minute grace period has ended).`,
        'Please return the equipment to our Kathmandu store immediately or call us to extend.',
        '',
        `Dhanyabad,\n${businessName}`,
      ].join('\n')

    case 'return_receipt':
      return [
        `Namaste ${firstName},`,
        '',
        `Your equipment return for booking ${bookingNo} has been received. 🎬`,
        'All returned items are logged. Any missing or damaged gear is placed under technical review.',
        '',
        `Dhanyabad,\n${businessName}`,
      ].join('\n')

    case 'damage_notice':
      // Strictly NO money amount per W23 and Law 6
      return [
        `Namaste ${firstName},`,
        '',
        `During return inspection for booking ${bookingNo}, an item was flagged for review${
          extra?.findingDesc ? `: ${extra.findingDesc}` : ''
        }.`,
        'Status: Under Technical Review. No charges are applied until assessment is concluded.',
        '',
        `Dhanyabad,\n${businessName}`,
      ].join('\n')

    case 'damage_charge': {
      const chargeText = extra?.chargePaisa != null ? formatMoney(extra.chargePaisa) : 'as per store invoice'
      return [
        `Namaste ${firstName},`,
        '',
        `Technical assessment for damaged equipment on booking ${bookingNo} has been approved.`,
        `Approved repair charge: ${chargeText}.`,
        'An updated invoice statement has been attached to your account.',
        '',
        `Dhanyabad,\n${businessName}`,
      ].join('\n')
    }

    default:
      return [
        `Namaste ${firstName},`,
        '',
        `Update regarding your booking ${bookingNo}.`,
        '',
        `Dhanyabad,\n${businessName}`,
      ].join('\n')
  }
}

// ────────────────────────────────────────────────────────────────────────────
// In-Memory Mock Store for Mock Mode
// ────────────────────────────────────────────────────────────────────────────

let mockEvents: ClientMessageEvent[] = []

export function _resetMockClientMessageEvents(): void {
  mockEvents = []
}

export function _seedMockClientMessageEvents(events: ClientMessageEvent[]): void {
  mockEvents = [...events]
}

export function _getMockClientMessageEvents(): ClientMessageEvent[] {
  return [...mockEvents]
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

/**
 * Fetch client message events for a booking or all events.
 */
export async function fetchClientMessageEvents(bookingId?: string): Promise<ClientMessageEvent[]> {
  if (IS_MOCK) {
    let result = [...mockEvents]
    if (bookingId) {
      result = result.filter((e) => e.bookingId === bookingId)
    }
    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  let query = supabase.from('client_message_events').select('*').order('created_at', { ascending: false })
  if (bookingId) {
    query = query.eq('booking_id', bookingId)
  }

  const { data, error } = await query
  if (error) {
    throw new Error(`Failed to fetch client message events: ${error.message}`)
  }

  return (data || []).map((row) => ({
    id: row.id,
    clientUuid: row.client_uuid,
    bookingId: row.booking_id,
    eventType: row.event_type as ClientMessageEventType,
    channel: row.channel as ClientMessageChannel,
    status: row.status as ClientMessageStatus,
    dueAt: row.due_at,
    sentAt: row.sent_at,
    recipientName: row.recipient_name,
    recipientEmail: row.recipient_email,
    recipientPhone: row.recipient_phone,
    findingId: row.finding_id,
    payload: (row.payload as Record<string, unknown>) || {},
    emailLogId: row.email_log_id,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

/**
 * Fetch pending WhatsApp draft tasks ready for staff to review & send with one tap.
 */
export async function fetchPendingWhatsAppDraftTasks(): Promise<PendingWhatsAppDraftTask[]> {
  if (IS_MOCK) {
    const ready = mockEvents.filter((e) => e.channel === 'whatsapp_draft' && e.status === 'draft_ready')
    return ready.map((e) => {
      const bookingNo = String(e.payload['booking_no'] || 'BK-MOCK')
      const draftText = formatClientDraftText(e.eventType, e.recipientName, bookingNo)
      const waLink = buildWaLink(e.recipientPhone, draftText)
      return {
        eventId: e.id,
        bookingId: e.bookingId,
        bookingNo,
        clientName: e.recipientName,
        clientPhone: e.recipientPhone,
        eventType: e.eventType,
        dueAt: e.dueAt,
        draftText,
        waLink,
      }
    })
  }

  const { data, error } = await supabase.rpc('get_pending_whatsapp_draft_tasks')
  if (error) {
    throw new Error(`Failed to fetch pending WhatsApp draft tasks: ${error.message}`)
  }

  return (data || []).map((r: {
    event_id: string
    booking_id: string
    booking_no: string
    client_name: string
    client_phone: string | null
    event_type: string
    due_at: string
    draft_text: string
    wa_link: string | null
  }) => ({
    eventId: r.event_id,
    bookingId: r.booking_id,
    bookingNo: r.booking_no,
    clientName: r.client_name,
    clientPhone: r.client_phone,
    eventType: r.event_type as ClientMessageEventType,
    dueAt: r.due_at,
    draftText: r.draft_text,
    waLink: r.wa_link || (r.client_phone ? buildWaLink(r.client_phone, r.draft_text) : null),
  }))
}

/**
 * Process due client message events (called by pg_cron or manual trigger).
 */
export async function processDueClientMessageEvents(limit = 50): Promise<{
  processedCount: number
  events: ClientMessageEvent[]
}> {
  if (IS_MOCK) {
    const now = new Date().getTime()
    const dueEvents = mockEvents.filter((e) => e.status === 'pending' && new Date(e.dueAt).getTime() <= now).slice(0, limit)

    for (const ev of dueEvents) {
      if (ev.channel === 'whatsapp_draft') {
        ev.status = 'draft_ready'
        ev.updatedAt = new Date().toISOString()
      } else {
        ev.status = 'sent'
        ev.sentAt = new Date().toISOString()
        ev.updatedAt = new Date().toISOString()
      }
    }

    return {
      processedCount: dueEvents.length,
      events: dueEvents,
    }
  }

  const { data, error } = await supabase.rpc('process_due_client_message_events', { p_limit: limit })
  if (error) {
    throw new Error(`Failed to process due client message events: ${error.message}`)
  }

  const events: ClientMessageEvent[] = (data || []).map((row: {
    id: string
    client_uuid: string
    booking_id: string
    event_type: string
    channel: string
    status: string
    due_at: string
    sent_at: string | null
    recipient_name: string
    recipient_email: string | null
    recipient_phone: string | null
    finding_id: string | null
    payload: Record<string, unknown>
    email_log_id: string | null
    error_message: string | null
    created_at: string
    updated_at: string
  }) => ({
    id: row.id,
    clientUuid: row.client_uuid,
    bookingId: row.booking_id,
    eventType: row.event_type as ClientMessageEventType,
    channel: row.channel as ClientMessageChannel,
    status: row.status as ClientMessageStatus,
    dueAt: row.due_at,
    sentAt: row.sent_at,
    recipientName: row.recipient_name,
    recipientEmail: row.recipient_email,
    recipientPhone: row.recipient_phone,
    findingId: row.finding_id,
    payload: row.payload || {},
    emailLogId: row.email_log_id,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))

  return {
    processedCount: events.length,
    events,
  }
}

/**
 * Mark a client message event as sent (e.g. staff tapped send on WhatsApp draft).
 */
export async function markClientMessageEventSent(
  clientUuid: string,
  eventId: string,
): Promise<{ success: boolean; event: ClientMessageEvent }> {
  if (IS_MOCK) {
    const existing = mockEvents.find((e) => e.id === eventId)
    if (!existing) {
      throw new Error(`Client message event not found: ${eventId}`)
    }
    existing.status = 'sent'
    existing.sentAt = new Date().toISOString()
    existing.updatedAt = new Date().toISOString()
    return { success: true, event: existing }
  }

  const { data, error } = await supabase.rpc('mark_client_message_event_sent', {
    p_client_uuid: clientUuid,
    p_event_id: eventId,
  })

  if (error) {
    throw new Error(`Failed to mark client message event sent: ${error.message}`)
  }

  const row = data
  return {
    success: true,
    event: {
      id: row.id,
      clientUuid: row.client_uuid,
      bookingId: row.booking_id,
      eventType: row.event_type as ClientMessageEventType,
      channel: row.channel as ClientMessageChannel,
      status: row.status as ClientMessageStatus,
      dueAt: row.due_at,
      sentAt: row.sent_at,
      recipientName: row.recipient_name,
      recipientEmail: row.recipient_email,
      recipientPhone: row.recipient_phone,
      findingId: row.finding_id,
      payload: row.payload || {},
      emailLogId: row.email_log_id,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  }
}
