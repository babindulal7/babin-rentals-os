/**
 * Client messages & automatic communications query module (T5-07).
 *
 * Implements automatic client messages & WhatsApp draft tasks (W21, W22, W23, W37, W38, W80):
 *   1. Pickup reminder (2 hours before pickup, W37)
 *   2. Pickup receipt (when handover completes)
 *   3. Return reminder (2 hours before return, W37)
 *   4. Late return (+30m grace end, W38)
 *   5. Return receipt (when return completes)
 *   6. Damage / loss notice (strictly NO amount until manager/owner approval, W23, Law 6)
 *
 * For clients with NO email, WhatsApp draft tasks are produced for staff (W22).
 */

import { supabase, IS_MOCK } from '../supabase'
import { generateClientUuid } from '../dataAccess'
import { buildWaLink } from '../whatsapp'

export type ClientMessageEventType =
  | 'pickup_reminder'
  | 'pickup_receipt'
  | 'return_reminder'
  | 'late_return'
  | 'return_receipt'
  | 'damage_notice'
  | 'damage_charge'
  | 'payment_reminder'

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
  recipientName: string | null
  recipientEmail: string | null
  recipientPhone: string | null
  findingId: string | null
  payload: Record<string, unknown>
  emailLogId: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

export interface WhatsAppDraftTask {
  id: string
  clientUuid: string
  bookingId: string
  bookingNo: string
  eventType: string
  recipientName: string | null
  recipientPhone: string | null
  dueAt: string
  status: string
  payload: Record<string, unknown>
}

// In-memory mock store for test and development modes
let mockEventsStore: ClientMessageEvent[] = [
  {
    id: 'mock-evt-1',
    clientUuid: '11111111-1111-4111-8111-111111111111',
    bookingId: 'b-mock-01',
    eventType: 'late_return',
    channel: 'whatsapp_draft',
    status: 'draft_ready',
    dueAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    sentAt: new Date().toISOString(),
    recipientName: 'Sagar Lama',
    recipientEmail: null,
    recipientPhone: '+9779841234567',
    findingId: null,
    payload: { booking_no: 'BK-1001', return_at: new Date(Date.now() - 35 * 60 * 1000).toISOString() },
    emailLogId: null,
    errorMessage: null,
    createdAt: new Date(Date.now() - 3600 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
]

export function setMockClientMessageEvents(events: ClientMessageEvent[]): void {
  mockEventsStore = [...events]
}

export function getMockClientMessageEvents(): ClientMessageEvent[] {
  return [...mockEventsStore]
}

export function resetMockClientMessages(): void {
  mockEventsStore = []
}

/**
 * Fetch pending WhatsApp draft tasks for staff (W22).
 * These are client communications where the client has no email address on file.
 */
export async function fetchPendingWhatsAppDraftTasks(): Promise<WhatsAppDraftTask[]> {
  if (IS_MOCK) {
    return mockEventsStore
      .filter((e) => e.channel === 'whatsapp_draft' && (e.status === 'draft_ready' || e.status === 'pending'))
      .map((e) => ({
        id: e.id,
        clientUuid: e.clientUuid,
        bookingId: e.bookingId,
        bookingNo: String(e.payload['booking_no'] || 'BK-MOCK'),
        eventType: e.eventType,
        recipientName: e.recipientName,
        recipientPhone: e.recipientPhone,
        dueAt: e.dueAt,
        status: e.status,
        payload: e.payload,
      }))
  }

  const { data, error } = await supabase.rpc('get_pending_whatsapp_draft_tasks')
  if (error) {
    throw new Error(`Failed to fetch WhatsApp draft tasks: ${error.message}`)
  }

  const rows = (data ?? []) as Array<{
    id: string
    client_uuid: string
    booking_id: string
    booking_no: string
    event_type: string
    recipient_name: string | null
    recipient_phone: string | null
    due_at: string
    status: string
    payload: Record<string, unknown>
  }>

  return rows.map((r) => ({
    id: r.id,
    clientUuid: r.client_uuid,
    bookingId: r.booking_id,
    bookingNo: r.booking_no,
    eventType: r.event_type,
    recipientName: r.recipient_name,
    recipientPhone: r.recipient_phone,
    dueAt: r.due_at,
    status: r.status,
    payload: r.payload ?? {},
  }))
}

/**
 * Mark a client message event or draft task as sent (Law 4, Law 8).
 */
export async function markClientMessageEventSent(
  eventId: string,
  clientUuid?: string,
): Promise<boolean> {
  const effectiveUuid = clientUuid || generateClientUuid()

  if (IS_MOCK) {
    const idx = mockEventsStore.findIndex((e) => e.id === eventId)
    if (idx >= 0) {
      const current = mockEventsStore[idx]!
      mockEventsStore[idx] = {
        ...current,
        status: 'sent',
        sentAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      return true
    }
    return false
  }

  const { data, error } = await supabase.rpc('mark_client_message_event_sent', {
    p_client_uuid: effectiveUuid,
    p_event_id: eventId,
  })

  if (error) {
    throw new Error(`Failed to mark client message event sent: ${error.message}`)
  }

  return Boolean(data)
}

/**
 * Fetch client message events for a booking or overview.
 */
export async function fetchClientMessageEvents(options?: {
  bookingId?: string | undefined
  status?: ClientMessageStatus | undefined
  limit?: number | undefined
}): Promise<ClientMessageEvent[]> {
  if (IS_MOCK) {
    let list = [...mockEventsStore]
    if (options?.bookingId) {
      list = list.filter((e) => e.bookingId === options.bookingId)
    }
    if (options?.status) {
      list = list.filter((e) => e.status === options.status)
    }
    if (options?.limit) {
      list = list.slice(0, options.limit)
    }
    return list
  }

  let query = supabase
    .from('client_message_events')
    .select('*')
    .order('due_at', { ascending: false })

  if (options?.bookingId) {
    query = query.eq('booking_id', options.bookingId)
  }
  if (options?.status) {
    query = query.eq('status', options.status)
  }
  if (options?.limit) {
    query = query.limit(options.limit)
  }

  const { data, error } = await query
  if (error) {
    throw new Error(`Failed to fetch client message events: ${error.message}`)
  }

  const rows = (data ?? []) as Array<{
    id: string
    client_uuid: string
    booking_id: string
    event_type: ClientMessageEventType
    channel: ClientMessageChannel
    status: ClientMessageStatus
    due_at: string
    sent_at: string | null
    recipient_name: string | null
    recipient_email: string | null
    recipient_phone: string | null
    finding_id: string | null
    payload: Record<string, unknown>
    email_log_id: string | null
    error_message: string | null
    created_at: string
    updated_at: string
  }>

  return rows.map((r) => ({
    id: r.id,
    clientUuid: r.client_uuid,
    bookingId: r.booking_id,
    eventType: r.event_type,
    channel: r.channel,
    status: r.status,
    dueAt: r.due_at,
    sentAt: r.sent_at,
    recipientName: r.recipient_name,
    recipientEmail: r.recipient_email,
    recipientPhone: r.recipient_phone,
    findingId: r.finding_id,
    payload: r.payload,
    emailLogId: r.email_log_id,
    errorMessage: r.error_message,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }))
}

/**
 * Build message text and a wa.me URL for a staff WhatsApp draft task (W22, W80).
 * Strictly in English, with courtesy frame (Namaste ... / Dhanyabad, Babin Rentals).
 * Strictly NO money figures for damage notices (Law 6, W23).
 */
export function buildWhatsAppDraftMessage(
  task: WhatsAppDraftTask,
  businessName = 'Babin Rentals',
): string {
  const firstName = (task.recipientName || 'Client').trim().split(/\s+/)[0] || 'Client'
  const bookingNo = task.bookingNo || 'your booking'
  const openLine = `Namaste ${firstName},`
  const closeLine = `Dhanyabad,\n${businessName}`

  let body = ''
  switch (task.eventType) {
    case 'pickup_reminder':
      body = `This is a reminder that your rental gear for booking ${bookingNo} is ready for pickup. Please bring a valid government ID for handover.`
      break

    case 'pickup_receipt':
      body = `Your gear handover for booking ${bookingNo} has been completed. Please ensure all equipment and accessories are returned on schedule.`
      break

    case 'return_reminder':
      body = `This is a gentle reminder that rental gear for booking ${bookingNo} is scheduled for return today.`
      break

    case 'late_return':
      body = `URGENT: Booking ${bookingNo} has exceeded its return window (+30 min grace period ended). Please return the equipment immediately or contact us.`
      break

    case 'return_receipt':
      body = `Your equipment return for booking ${bookingNo} has been processed. Thank you for renting with ${businessName}.`
      break

    case 'damage_notice':
      // Strictly NO amount per Law 6 and W23
      body = `Notice regarding return inspection for booking ${bookingNo}: An item has been flagged for technical review. Our workshop is assessing the equipment. No charges are applied until formal review concludes.`
      break

    case 'damage_charge': {
      const amt = task.payload['approved_amount']
      const formattedAmt = amt ? `Rs ${amt}` : 'an approved amount'
      body = `Following technical review for booking ${bookingNo}, an assessment has concluded with an approved charge of ${formattedAmt}. Please contact us with any questions.`
      break
    }

    case 'payment_reminder': {
      const amt = task.payload['outstanding_amount']
      const formattedAmt = amt ? `Rs ${amt}` : 'your outstanding balance'
      body = `Friendly reminder regarding rental ${bookingNo}: you have an outstanding balance of ${formattedAmt}. Please let us know if you need any assistance with settlement.`
      break
    }

    default:
      body = `Update regarding your rental booking ${bookingNo}.`
      break
  }

  return `${openLine}\n\n${body}\n\n${closeLine}`
}

/**
 * Trigger processing of due client message events via RPC or mock.
 */
export async function processDueClientMessageEvents(limit = 50): Promise<number> {
  if (IS_MOCK) {
    const now = Date.now()
    let count = 0
    for (const evt of mockEventsStore) {
      if (evt.status === 'pending' && new Date(evt.dueAt).getTime() <= now) {
        if (evt.channel === 'whatsapp_draft') {
          evt.status = 'draft_ready'
        } else {
          evt.status = 'sent'
          evt.sentAt = new Date().toISOString()
        }
        evt.updatedAt = new Date().toISOString()
        count++
        if (count >= limit) break
      }
    }
    return count
  }

  const { data, error } = await supabase.rpc('process_due_client_message_events', {
    p_limit: limit,
  })
  if (error) {
    throw new Error(`Failed to process due client message events: ${error.message}`)
  }
  return Array.isArray(data) ? data.length : 0
}

/**
 * Build the full wa.me link for a WhatsApp draft task.
 * Returns null if the recipient phone is unusable (Law 12).
 */
export function buildWhatsAppDraftLink(
  task: WhatsAppDraftTask,
  businessName = 'Babin Rentals',
): string | null {
  if (!task.recipientPhone) return null
  const text = buildWhatsAppDraftMessage(task, businessName)
  return buildWaLink(task.recipientPhone, text)
}

/**
 * Pause payment reminders for a client with a required staff reason (W18b).
 */
export async function pauseClientReminders(
  clientId: string,
  reason: string,
  clientUuid = generateClientUuid(),
): Promise<boolean> {
  if (!reason || !reason.trim()) {
    throw new Error('A reason is required to pause payment reminders')
  }
  if (IS_MOCK) {
    return true
  }
  const { data, error } = await supabase.rpc('pause_client_payment_reminders', {
    p_client_uuid: clientUuid,
    p_client_id: clientId,
    p_reason: reason.trim(),
  })
  if (error) {
    throw new Error(`Failed to pause payment reminders: ${error.message}`)
  }
  return Boolean(data)
}

/**
 * Resume payment reminders for a client (W18b).
 */
export async function resumeClientReminders(
  clientId: string,
  clientUuid = generateClientUuid(),
): Promise<boolean> {
  if (IS_MOCK) {
    return true
  }
  const { data, error } = await supabase.rpc('resume_client_payment_reminders', {
    p_client_uuid: clientUuid,
    p_client_id: clientId,
  })
  if (error) {
    throw new Error(`Failed to resume payment reminders: ${error.message}`)
  }
  return Boolean(data)
}

