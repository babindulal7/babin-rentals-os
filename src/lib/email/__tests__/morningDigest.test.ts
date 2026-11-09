import { describe, it, expect } from 'vitest'
import { renderEmailHtml } from '../templates'
import { formatDigestSubject, fetchMorningDigest } from '../../queries/morningDigest'

describe('Morning Digest (T5-04, Ruling O-4)', () => {
  it('formats email subject with BS + AD date', () => {
    const subject = formatDigestSubject('2026-07-31')
    expect(subject).toContain('[Babin Rentals] Morning Digest')
    expect(subject).toContain('2083')
    expect(subject).toContain('AD')
  })

  it('renders digest HTML with operational movements for staff', () => {
    const html = renderEmailHtml({
      template_id: 'morning_digest',
      recipient_email: 'prakash@babinrentals.com',
      recipient_name: 'Prakash Sharma',
      subject: '[Babin Rentals] Morning Digest — 15 Shrawan 2083 (2026-07-31 AD)',
      data: {
        target_date: '2026-07-31',
        bs_date: '15 Shrawan 2083',
        can_view_money: true,
        has_scheduled_items: true,
        pickups: [
          {
            booking_no: 'BK-2026-0081',
            pickup_time: '08:45',
            client_name: 'Everest Motion Pictures',
            delivery_type: 'Store Pickup',
          },
        ],
        returns: [
          {
            booking_no: 'BK-2026-0078',
            return_time: '17:45',
            client_name: 'Kathmandu Visuals',
          },
        ],
        overdue: [
          {
            booking_no: 'BK-2026-0074',
            days_overdue: 2,
            client_name: 'Himalayan Arts',
          },
        ],
        openDamage: [
          {
            damage_type: 'Impact Damage',
            severity: 'Medium',
            description: 'Matte box ring dent',
            estimated_cost_paisa: 150000,
          },
        ],
        shiftHandovers: [
          {
            shift_code: 'C',
            shift_date: '2026-07-30',
            from_user_name: 'Night Tech',
            notes: 'Cleaning queue ready',
          },
        ],
        paymentsDue: [
          {
            invoice_no: 'INV-2026-0045',
            client_name: 'Everest Motion Pictures',
            outstanding_paisa: 3500000,
          },
        ],
      },
    })

    expect(html).toContain('Good morning, Prakash Sharma')
    expect(html).toContain('15 Shrawan 2083')
    expect(html).toContain('2026-07-31')
    expect(html).toContain('BK-2026-0081')
    expect(html).toContain('08:45')
    expect(html).toContain('BK-2026-0078')
    expect(html).toContain('17:45')
    expect(html).toContain('Overdue Returns (1)')
    expect(html).toContain('BK-2026-0074')
    expect(html).toContain('2 day(s) overdue')
    expect(html).toContain('Payments Due Today (1)')
    expect(html).toContain('INV-2026-0045')
    expect(html).toContain('Rs. 35,000')
    expect(html).toContain('Est: Rs. 1,500')
  })

  it('enforces Law 6 money blindness: Warehouse digest contains NO money amounts', () => {
    const html = renderEmailHtml({
      template_id: 'morning_digest',
      recipient_email: 'warehouse@babinrentals.com',
      recipient_name: 'Warehouse Floor',
      subject: '[Babin Rentals] Morning Digest',
      data: {
        target_date: '2026-07-31',
        bs_date: '15 Shrawan 2083',
        can_view_money: false,
        has_scheduled_items: true,
        pickups: [
          {
            booking_no: 'BK-2026-0081',
            pickup_time: '08:45',
            client_name: 'Everest Motion Pictures',
            delivery_type: 'Store Pickup',
          },
        ],
        returns: [],
        overdue: [],
        openDamage: [
          {
            damage_type: 'Impact Damage',
            severity: 'Medium',
            description: 'Matte box ring dent',
            estimated_cost_paisa: null,
          },
        ],
        shiftHandovers: [],
        paymentsDue: [],
      },
    })

    expect(html).toContain('Good morning, Warehouse Floor')
    expect(html).toContain('BK-2026-0081')
    expect(html).not.toContain('Payments Due')
    expect(html).not.toContain('Est: Rs.')
    expect(html).not.toContain('Rs.')
    expect(html).not.toContain('paisa')
  })

  it('renders "Nothing scheduled today" when no movements exist (O-4)', () => {
    const html = renderEmailHtml({
      template_id: 'morning_digest',
      recipient_email: 'owner@babinrentals.com',
      recipient_name: 'Babin Dulal',
      subject: '[Babin Rentals] Morning Digest — Quiet Day',
      data: {
        target_date: '2026-08-05',
        can_view_money: true,
        has_scheduled_items: false,
        empty_message: 'Nothing scheduled today',
      },
    })

    expect(html).toContain('Nothing scheduled today')
    expect(html).toContain('All stations clear for operational day 2026-08-05')
    expect(html).not.toContain('Pickups Today')
  })

  it('fetches mock morning digest data correctly', async () => {
    const digest = await fetchMorningDigest('2026-07-31')
    expect(digest).toBeDefined()
    expect(digest.target_date).toBe('2026-07-31')
    expect(digest.pickups.length).toBeGreaterThan(0)
    expect(digest.returns.length).toBeGreaterThan(0)
  })
})
