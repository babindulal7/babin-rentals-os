import { describe, it, expect, beforeEach } from 'vitest'
import {
  sendEmail,
  getMockEmailLogs,
  _resetMockEmailLogs,
} from '../client'
import { fetchEmailLogs } from '../../queries/emailLogs'
import { renderEmailHtml } from '../templates'

describe('Transactional email client & logging (T5-03)', () => {
  beforeEach(() => {
    _resetMockEmailLogs()
  })

  it('requires a templateId', async () => {
    // @ts-expect-error testing missing templateId
    await expect(sendEmail({})).rejects.toThrow('templateId is required')
  })

  it('dispatches email in mock mode and logs to mock email log', async () => {
    const result = await sendEmail({
      templateId: 'pickup_reminder',
      recipientEmail: 'client@example.com',
      entityType: 'booking',
      entityId: 'BK-0012',
    })

    expect(result.success).toBe(true)
    expect(result.status).toBe('mock_sent')
    expect(result.recipientEmail).toBe('client@example.com')
    expect(result.emailLogId).toBeDefined()

    const logs = getMockEmailLogs()
    expect(logs.length).toBe(1)
    expect(logs[0]?.templateId).toBe('pickup_reminder')
    expect(logs[0]?.recipientEmail).toBe('client@example.com')
    expect(logs[0]?.entityId).toBe('BK-0012')
    expect(logs[0]?.status).toBe('mock_sent')
  })

  it('fetches email logs with filtering and limit', async () => {
    await sendEmail({
      templateId: 'pickup_receipt',
      recipientUserId: '00000000-0000-4000-8000-00000000e001',
      recipientEmail: 'owner@babinrentals.com',
      entityId: 'BK-0001',
    })

    await sendEmail({
      templateId: 'damage_notice',
      recipientUserId: '00000000-0000-4000-8000-00000000c001',
      recipientEmail: 'client@example.com',
      entityId: 'BK-0002',
    })

    const allLogs = await fetchEmailLogs()
    expect(allLogs.length).toBe(2)

    const clientLogs = await fetchEmailLogs({
      recipientUserId: '00000000-0000-4000-8000-00000000c001',
    })
    expect(clientLogs.length).toBe(1)
    expect(clientLogs[0]?.templateId).toBe('damage_notice')

    const bookingLogs = await fetchEmailLogs({ entityId: 'BK-0001' })
    expect(bookingLogs.length).toBe(1)
    expect(bookingLogs[0]?.recipientEmail).toBe('owner@babinrentals.com')

    const limited = await fetchEmailLogs({ limit: 1 })
    expect(limited.length).toBe(1)
  })

  it('renders damage notice template with no money figures (Law 6, W23)', () => {
    const html = renderEmailHtml({
      template_id: 'damage_notice',
      recipient_email: 'client@example.com',
      recipient_name: 'Babin Client',
      subject: 'Equipment Condition Notice — BK-0010',
      data: {
        booking_no: 'BK-0010',
        status: 'Under Review',
      },
    })

    expect(html).toContain('Babin Rentals')
    expect(html).toContain('BK-0010')
    expect(html).toContain('Under Technical Review')
    expect(html).toContain('no-reply@babinrentals.com')
    // Law 6: no money amount in damage notice
    expect(html).not.toContain('Rs')
    expect(html).not.toContain('paisa')
  })

  it('renders pickup reminder and pickup receipt templates cleanly', () => {
    const pickupHtml = renderEmailHtml({
      template_id: 'pickup_reminder',
      recipient_email: 'client@example.com',
      recipient_name: 'Babin Client',
      subject: 'Pickup Reminder — BK-0015',
      data: {
        booking_no: 'BK-0015',
        start_date: '2026-11-01 10:00 NPT',
        end_date: '2026-11-03 18:00 NPT',
      },
    })

    expect(pickupHtml).toContain('BK-0015')
    expect(pickupHtml).toContain('Pickup Time:')
    expect(pickupHtml).toContain('2026-11-01')

    const receiptHtml = renderEmailHtml({
      template_id: 'pickup_receipt',
      recipient_email: 'client@example.com',
      recipient_name: 'Babin Client',
      subject: 'Pickup Receipt — BK-0015',
      data: {
        booking_no: 'BK-0015',
        start_date: '2026-11-01 10:00 NPT',
        end_date: '2026-11-03 18:00 NPT',
      },
    })

    expect(receiptHtml).toContain('Handover Completed')
  })

  it('renders morning digest template for money role with payments due and estimates (T5-04, O-4)', () => {
    const html = renderEmailHtml({
      template_id: 'morning_digest',
      recipient_email: 'owner@babinrentals.com',
      recipient_name: 'Babin Dulal',
      subject: 'Babin Rentals Morning Digest — 15 Shrawan 2083 (2026-07-31)',
      data: {
        role: 'Owner',
        target_date: '2026-07-31',
        bs_date: '15 Shrawan 2083',
        can_view_money: true,
        has_scheduled_items: true,
        pickups: [
          { pickup_time: '08:30', booking_no: 'BK-1001', client_name: 'Paramount Films', delivery_type: 'Store Pickup' },
        ],
        returns: [
          { return_time: '17:00', booking_no: 'BK-0998', client_name: 'Incessant Rain Studios' },
        ],
        overdue: [
          { days_overdue: 2, booking_no: 'BK-0980', client_name: 'Kathmandu Media' },
        ],
        open_damage: [
          { damage_type: 'Impact Scratch', severity: 'High', description: 'Lens front element scratched', estimated_cost_paisa: 350000 },
        ],
        shift_handovers: [
          { shift_code: 'A', shift_date: '2026-07-30', from_user_name: 'Babin Warehouse', notes: 'All batteries recharged' },
        ],
        payments_due: [
          { invoice_no: 'INV-2026-0042', client_name: 'Paramount Films', outstanding_paisa: 1850000, due_date: '2026-07-31' },
        ],
      },
    })

    expect(html).toContain('Good morning, Babin Dulal (Owner)')
    expect(html).toContain('15 Shrawan 2083 · 2026-07-31')
    expect(html).toContain('BK-1001')
    expect(html).toContain('BK-0998')
    expect(html).toContain('BK-0980')
    expect(html).toContain('2 day(s) overdue')
    expect(html).toContain('Impact Scratch')
    expect(html).toContain('Shift A')
    expect(html).toContain('INV-2026-0042')
    expect(html).toContain('Rs. 18,500 due')
    expect(html).toContain('Est: Rs. 3,500')
  })

  it('renders morning digest template for money-blind role omitting all financial figures (Law 6, T5-04)', () => {
    const html = renderEmailHtml({
      template_id: 'morning_digest',
      recipient_email: 'warehouse@babinrentals.com',
      recipient_name: 'Warehouse Team',
      subject: 'Babin Rentals Morning Digest — 15 Shrawan 2083 (2026-07-31)',
      data: {
        role: 'Warehouse',
        target_date: '2026-07-31',
        bs_date: '15 Shrawan 2083',
        can_view_money: false,
        has_scheduled_items: true,
        pickups: [
          { pickup_time: '08:30', booking_no: 'BK-1001', client_name: 'Paramount Films', delivery_type: 'Store Pickup' },
        ],
        returns: [],
        overdue: [],
        open_damage: [
          { damage_type: 'Impact Scratch', severity: 'High', description: 'Lens front element scratched', estimated_cost_paisa: null },
        ],
        shift_handovers: [],
        payments_due: [],
      },
    })

    expect(html).toContain('Good morning, Warehouse Team (Warehouse)')
    expect(html).toContain('BK-1001')
    expect(html).toContain('Impact Scratch')
    // Law 6: no payments section or damage cost for warehouse
    expect(html).not.toContain('Payments Due')
    expect(html).not.toContain('INV-')
    expect(html).not.toContain('Estimated: Rs')
  })

  it('renders "Nothing scheduled today" when day has no operational items (O-4, T5-04)', () => {
    const html = renderEmailHtml({
      template_id: 'morning_digest',
      recipient_email: 'owner@babinrentals.com',
      recipient_name: 'Babin Dulal',
      subject: 'Babin Rentals Morning Digest — 16 Shrawan 2083 (2026-08-01)',
      data: {
        target_date: '2026-08-01',
        bs_date: '16 Shrawan 2083',
        can_view_money: true,
        has_scheduled_items: false,
        empty_message: 'Nothing scheduled today',
      },
    })

    expect(html).toContain('Nothing scheduled today')
    expect(html).toContain('All stations clear for operational day 2026-08-01 (16 Shrawan 2083).')
  })

  it('renders payment reminder template with sequence, balance and English branding (T5-08, W18, W80)', () => {
    const html = renderEmailHtml({
      template_id: 'payment_reminder',
      recipient_email: 'client@example.com',
      recipient_name: 'Sita Pokharel',
      subject: 'Payment Reminder — BK-2026-0880',
      data: {
        booking_no: 'BK-2026-0880',
        sequence: 1,
        outstanding_display: 'Rs. 5,000',
        currency: 'NPR',
      },
    })

    expect(html).toContain('Babin Rentals')
    expect(html).toContain('BK-2026-0880')
    expect(html).toContain('Reminder #2')
    expect(html).toContain('Rs. 5,000')
    expect(html).toContain('no-reply@babinrentals.com')
  })
})
