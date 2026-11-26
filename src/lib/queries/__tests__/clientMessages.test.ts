import { describe, it, expect, beforeEach } from 'vitest'
import {
  fetchPendingWhatsAppDraftTasks,
  markClientMessageEventSent,
  fetchClientMessageEvents,
  buildWhatsAppDraftMessage,
  buildWhatsAppDraftLink,
  setMockClientMessageEvents,
  resetMockClientMessages,
  type WhatsAppDraftTask,
  type ClientMessageEvent,
} from '../clientMessages'

describe('clientMessages queries and draft task generator (T5-07)', () => {
  beforeEach(() => {
    resetMockClientMessages()
  })

  it('builds WhatsApp draft message in English with proper courtesy frame (W80, W22)', () => {
    const task: WhatsAppDraftTask = {
      id: 'task-1',
      clientUuid: '11111111-1111-4111-8111-111111111111',
      bookingId: 'b-1',
      bookingNo: 'BK-1001',
      eventType: 'pickup_reminder',
      recipientName: 'Aarav Sharma',
      recipientPhone: '+9779841234567',
      dueAt: new Date().toISOString(),
      status: 'draft_ready',
      payload: {},
    }

    const message = buildWhatsAppDraftMessage(task)
    expect(message).toContain('Namaste Aarav,')
    expect(message).toContain('BK-1001')
    expect(message).toContain('Dhanyabad,\nBabin Rentals')
    expect(message).toContain('ready for pickup')
  })

  it('formats all 6 event types correctly', () => {
    const makeTask = (eventType: string, payload: Record<string, unknown> = {}): WhatsAppDraftTask => ({
      id: 'task-id',
      clientUuid: '11111111-1111-4111-8111-111111111111',
      bookingId: 'b-1',
      bookingNo: 'BK-1001',
      eventType,
      recipientName: 'Sita Gurung',
      recipientPhone: '9841234567',
      dueAt: new Date().toISOString(),
      status: 'draft_ready',
      payload,
    })

    // 1. Pickup reminder
    expect(buildWhatsAppDraftMessage(makeTask('pickup_reminder'))).toContain('ready for pickup')

    // 2. Pickup receipt
    expect(buildWhatsAppDraftMessage(makeTask('pickup_receipt'))).toContain('handover for booking BK-1001 has been completed')

    // 3. Return reminder
    expect(buildWhatsAppDraftMessage(makeTask('return_reminder'))).toContain('scheduled for return today')

    // 4. Late return (+30 min grace end, W38)
    expect(buildWhatsAppDraftMessage(makeTask('late_return'))).toContain('+30 min grace period ended')

    // 5. Return receipt
    expect(buildWhatsAppDraftMessage(makeTask('return_receipt'))).toContain('return for booking BK-1001 has been processed')

    // 6. Damage notice (strictly NO money amount per Law 6, W23)
    const damageNoticeMsg = buildWhatsAppDraftMessage(makeTask('damage_notice'))
    expect(damageNoticeMsg).toContain('flagged for technical review')
    expect(damageNoticeMsg).toContain('No charges are applied until formal review concludes')
    expect(damageNoticeMsg).not.toContain('Rs')
    expect(damageNoticeMsg).not.toContain('paisa')

    // 7. Damage charge (only after approval)
    const damageChargeMsg = buildWhatsAppDraftMessage(makeTask('damage_charge', { approved_amount: 4500 }))
    expect(damageChargeMsg).toContain('approved charge of Rs 4500')

    // 8. Payment reminder (W18, W22)
    const paymentReminderMsg = buildWhatsAppDraftMessage(makeTask('payment_reminder', { outstanding_amount: 6000 }))
    expect(paymentReminderMsg).toContain('outstanding balance of Rs 6000')
    expect(paymentReminderMsg).toContain('settlement')
  })

  it('builds wa.me link for valid phone and null for invalid phone', () => {
    const validTask: WhatsAppDraftTask = {
      id: 'task-1',
      clientUuid: '11111111-1111-4111-8111-111111111111',
      bookingId: 'b-1',
      bookingNo: 'BK-1001',
      eventType: 'late_return',
      recipientName: 'Rohan Shrestha',
      recipientPhone: '+9779841234567',
      dueAt: new Date().toISOString(),
      status: 'draft_ready',
      payload: {},
    }

    const url = buildWhatsAppDraftLink(validTask)
    expect(url).not.toBeNull()
    expect(url).toContain('https://wa.me/9779841234567?text=')

    const invalidTask: WhatsAppDraftTask = {
      ...validTask,
      recipientPhone: null,
    }
    expect(buildWhatsAppDraftLink(invalidTask)).toBeNull()
  })

  it('fetches pending WhatsApp draft tasks and marks them sent', async () => {
    const mockEvent: ClientMessageEvent = {
      id: 'evt-test-100',
      clientUuid: '22222222-2222-4222-8222-222222222222',
      bookingId: 'b-test-100',
      eventType: 'late_return',
      channel: 'whatsapp_draft',
      status: 'draft_ready',
      dueAt: new Date().toISOString(),
      sentAt: null,
      recipientName: 'Binod Karki',
      recipientEmail: null,
      recipientPhone: '+9779841234567',
      findingId: null,
      payload: { booking_no: 'BK-9999' },
      emailLogId: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    setMockClientMessageEvents([mockEvent])

    const tasks = await fetchPendingWhatsAppDraftTasks()
    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.bookingNo).toBe('BK-9999')
    expect(tasks[0]?.eventType).toBe('late_return')

    const marked = await markClientMessageEventSent('evt-test-100')
    expect(marked).toBe(true)

    // Once marked sent, draft tasks list is empty
    const remainingTasks = await fetchPendingWhatsAppDraftTasks()
    expect(remainingTasks).toHaveLength(0)

    // Events list shows status = 'sent'
    const events = await fetchClientMessageEvents({ bookingId: 'b-test-100' })
    expect(events).toHaveLength(1)
    expect(events[0]?.status).toBe('sent')
    expect(events[0]?.sentAt).not.toBeNull()
  })

  it('pauses and resumes client payment reminders with reason validation (W18b)', async () => {
    const { pauseClientReminders, resumeClientReminders } = await import('../clientMessages')
    // Blank reason throws validation error
    await expect(pauseClientReminders('client-1', '')).rejects.toThrow('A reason is required to pause payment reminders')
    await expect(pauseClientReminders('client-1', '   ')).rejects.toThrow('A reason is required to pause payment reminders')

    // Valid call succeeds in mock mode
    const pauseOk = await pauseClientReminders('client-1', 'Client on shoot until Friday')
    expect(pauseOk).toBe(true)

    const resumeOk = await resumeClientReminders('client-1')
    expect(resumeOk).toBe(true)
  })
})
