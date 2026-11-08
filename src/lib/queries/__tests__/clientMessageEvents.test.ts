import { describe, it, expect, beforeEach } from 'vitest'
import {
  formatClientDraftText,
  fetchClientMessageEvents,
  fetchPendingWhatsAppDraftTasks,
  processDueClientMessageEvents,
  markClientMessageEventSent,
  _resetMockClientMessageEvents,
  _seedMockClientMessageEvents,
  type ClientMessageEvent,
} from '../clientMessageEvents'
import type { Paisa } from '../../money'

describe('clientMessageEvents module (T5-07, W21, W22, W23, W37, W38, W80)', () => {
  beforeEach(() => {
    _resetMockClientMessageEvents()
  })

  describe('formatClientDraftText', () => {
    it('formats pickup reminder in English with first name and 2h notice', () => {
      const text = formatClientDraftText('pickup_reminder', 'Anil Gurung', 'BK-1001')
      expect(text).toContain('Namaste Anil,')
      expect(text).toContain('ready for pickup in 2 hours')
      expect(text).toContain('BK-1001')
      expect(text).toContain('Dhanyabad,\nBabin Rentals')
    })

    it('formats late return notice at +30m with urgency', () => {
      const text = formatClientDraftText('late_return', 'Bikash Rai', 'BK-2002')
      expect(text).toContain('Namaste Bikash,')
      expect(text).toContain('URGENT: Booking BK-2002 is overdue')
      expect(text).toContain('30-minute grace period has ended')
    })

    it('formats damage notice with NO money amount (Law 6, W23)', () => {
      const text = formatClientDraftText('damage_notice', 'Chandra Joshi', 'BK-3003', {
        findingDesc: 'Bent lens mount ring',
      })
      expect(text).toContain('Namaste Chandra,')
      expect(text).toContain('Bent lens mount ring')
      expect(text).toContain('Under Technical Review')
      expect(text).toContain('No charges are applied until assessment is concluded')
      // Strictly NO rupee/money mention
      expect(text).not.toContain('Rs')
      expect(text).not.toContain('paisa')
      expect(text).not.toContain('cost')
    })

    it('formats approved damage charge with money figure only after approval', () => {
      const text = formatClientDraftText('damage_charge', 'Chandra Joshi', 'BK-3003', {
        chargePaisa: 1500000 as Paisa, // Rs 15,000
      })
      expect(text).toContain('Namaste Chandra,')
      expect(text).toContain('has been approved')
      expect(text).toContain('Approved repair charge: Rs 15,000')
    })
  })

  describe('fetchClientMessageEvents and mock store', () => {
    it('seeds and fetches events, filtering by bookingId', async () => {
      const e1: ClientMessageEvent = {
        id: 'ev-1',
        clientUuid: 'uuid-1',
        bookingId: 'bk-1',
        eventType: 'pickup_reminder',
        channel: 'email',
        status: 'pending',
        dueAt: '2026-10-30T10:00:00Z',
        sentAt: null,
        recipientName: 'Deepak Sharma',
        recipientEmail: 'deepak@example.com',
        recipientPhone: '+9779841234567',
        findingId: null,
        payload: { booking_no: 'BK-500' },
        emailLogId: null,
        errorMessage: null,
        createdAt: '2026-10-30T08:00:00Z',
        updatedAt: '2026-10-30T08:00:00Z',
      }
      const e2: ClientMessageEvent = {
        id: 'ev-2',
        clientUuid: 'uuid-2',
        bookingId: 'bk-2',
        eventType: 'late_return',
        channel: 'whatsapp_draft',
        status: 'pending',
        dueAt: '2026-10-30T11:00:00Z',
        recipientName: 'Elina Shrestha',
        recipientEmail: null,
        recipientPhone: '+9779851000222',
        findingId: null,
        payload: { booking_no: 'BK-501' },
        emailLogId: null,
        errorMessage: null,
        sentAt: null,
        createdAt: '2026-10-30T08:00:00Z',
        updatedAt: '2026-10-30T08:00:00Z',
      }
      _seedMockClientMessageEvents([e1, e2])

      const all = await fetchClientMessageEvents()
      expect(all).toHaveLength(2)

      const forBk1 = await fetchClientMessageEvents('bk-1')
      expect(forBk1).toHaveLength(1)
      expect(forBk1[0]?.id).toBe('ev-1')
    })
  })

  describe('fetchPendingWhatsAppDraftTasks', () => {
    it('returns ready draft tasks with wa.me link for valid phone', async () => {
      const e: ClientMessageEvent = {
        id: 'ev-wa-1',
        clientUuid: 'uuid-wa',
        bookingId: 'bk-wa',
        eventType: 'pickup_receipt',
        channel: 'whatsapp_draft',
        status: 'draft_ready',
        dueAt: '2026-10-30T06:00:00Z',
        sentAt: null,
        recipientName: 'Gita Basnet',
        recipientEmail: null,
        recipientPhone: '9841112233',
        findingId: null,
        payload: { booking_no: 'BK-999' },
        emailLogId: null,
        errorMessage: null,
        createdAt: '2026-10-30T06:00:00Z',
        updatedAt: '2026-10-30T06:00:00Z',
      }
      _seedMockClientMessageEvents([e])

      const tasks = await fetchPendingWhatsAppDraftTasks()
      expect(tasks).toHaveLength(1)
      const t = tasks[0]
      expect(t?.bookingNo).toBe('BK-999')
      expect(t?.waLink).toContain('https://wa.me/9779841112233')
      expect(t?.draftText).toContain('Namaste Gita,')
    })

    it('handles missing or unusable phone with waLink: null', async () => {
      const e: ClientMessageEvent = {
        id: 'ev-wa-2',
        clientUuid: 'uuid-wa-2',
        bookingId: 'bk-wa-2',
        eventType: 'late_return',
        channel: 'whatsapp_draft',
        status: 'draft_ready',
        dueAt: '2026-10-30T06:00:00Z',
        sentAt: null,
        recipientName: 'Hari Thapa',
        recipientEmail: null,
        recipientPhone: null,
        findingId: null,
        payload: { booking_no: 'BK-888' },
        emailLogId: null,
        errorMessage: null,
        createdAt: '2026-10-30T06:00:00Z',
        updatedAt: '2026-10-30T06:00:00Z',
      }
      _seedMockClientMessageEvents([e])

      const tasks = await fetchPendingWhatsAppDraftTasks()
      expect(tasks).toHaveLength(1)
      expect(tasks[0]?.waLink).toBeNull()
    })
  })

  describe('processDueClientMessageEvents', () => {
    it('processes due email events to sent and whatsapp_draft to draft_ready', async () => {
      const pastTime = new Date(Date.now() - 3600000).toISOString()
      const futureTime = new Date(Date.now() + 3600000).toISOString()

      const dueEmail: ClientMessageEvent = {
        id: 'ev-due-email',
        clientUuid: 'uuid-d1',
        bookingId: 'bk-d1',
        eventType: 'pickup_reminder',
        channel: 'email',
        status: 'pending',
        dueAt: pastTime,
        sentAt: null,
        recipientName: 'Ishwor',
        recipientEmail: 'ishwor@example.com',
        recipientPhone: null,
        findingId: null,
        payload: { booking_no: 'BK-111' },
        emailLogId: null,
        errorMessage: null,
        createdAt: pastTime,
        updatedAt: pastTime,
      }
      const dueWa: ClientMessageEvent = {
        id: 'ev-due-wa',
        clientUuid: 'uuid-d2',
        bookingId: 'bk-d2',
        eventType: 'late_return',
        channel: 'whatsapp_draft',
        status: 'pending',
        dueAt: pastTime,
        sentAt: null,
        recipientName: 'Janak',
        recipientEmail: null,
        recipientPhone: '9841000000',
        findingId: null,
        payload: { booking_no: 'BK-222' },
        emailLogId: null,
        errorMessage: null,
        createdAt: pastTime,
        updatedAt: pastTime,
      }
      const futureEvent: ClientMessageEvent = {
        id: 'ev-future',
        clientUuid: 'uuid-d3',
        bookingId: 'bk-d3',
        eventType: 'return_reminder',
        channel: 'email',
        status: 'pending',
        dueAt: futureTime,
        sentAt: null,
        recipientName: 'Kiran',
        recipientEmail: 'kiran@example.com',
        recipientPhone: null,
        findingId: null,
        payload: { booking_no: 'BK-333' },
        emailLogId: null,
        errorMessage: null,
        createdAt: pastTime,
        updatedAt: pastTime,
      }

      _seedMockClientMessageEvents([dueEmail, dueWa, futureEvent])

      const result = await processDueClientMessageEvents(50)
      expect(result.processedCount).toBe(2)
      expect(dueEmail.status).toBe('sent')
      expect(dueEmail.sentAt).not.toBeNull()
      expect(dueWa.status).toBe('draft_ready')
      expect(futureEvent.status).toBe('pending')
    })
  })

  describe('markClientMessageEventSent', () => {
    it('marks ready draft event as sent', async () => {
      const e: ClientMessageEvent = {
        id: 'ev-mark',
        clientUuid: 'uuid-mark',
        bookingId: 'bk-mark',
        eventType: 'pickup_receipt',
        channel: 'whatsapp_draft',
        status: 'draft_ready',
        dueAt: '2026-10-30T06:00:00Z',
        sentAt: null,
        recipientName: 'Laxmi',
        recipientEmail: null,
        recipientPhone: '9841000111',
        findingId: null,
        payload: { booking_no: 'BK-444' },
        emailLogId: null,
        errorMessage: null,
        createdAt: '2026-10-30T06:00:00Z',
        updatedAt: '2026-10-30T06:00:00Z',
      }
      _seedMockClientMessageEvents([e])

      const res = await markClientMessageEventSent('uuid-mark', 'ev-mark')
      expect(res.success).toBe(true)
      expect(res.event.status).toBe('sent')
      expect(res.event.sentAt).not.toBeNull()
    })
  })
})
