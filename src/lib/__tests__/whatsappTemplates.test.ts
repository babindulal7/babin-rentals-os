import { describe, it, expect } from 'vitest'
import {
  adBs,
  firstName,
  bookingConfirmed,
  paymentReceipt,
  templatesForStage,
} from '../whatsappTemplates'
import { rupees } from '../money'

const BIZ = { businessName: 'Babin Rentals', businessPhone: '9800000000' }

describe('whatsappTemplates', () => {
  it('extracts first name safely and handles invalid dates in adBs', () => {
    expect(firstName('  Sagarmatha Pictures Pvt. Ltd. ')).toBe('Sagarmatha')
    expect(firstName('')).toBe('')
    expect(adBs('not-a-date')).toBe('—')
    expect(adBs('2026-11-10T06:00:00.000Z')).toContain('2026')
  })

  it('formats bookingConfirmed and paymentReceipt bodies', () => {
    const confirmed = bookingConfirmed(
      {
        clientName: 'Sita Sharma',
        bookingNo: '#946',
        startIso: '2026-11-10T06:00:00.000Z',
        endIso: '2026-11-12T06:00:00.000Z',
        lineCount: 3,
        topLines: ['Sony FX6'],
        total: rupees(25000),
        pickupTime: '09:00 AM',
      },
      BIZ,
    )
    expect(confirmed).toContain('Namaste Sita,')
    expect(confirmed).toContain('#946')
    expect(confirmed).toContain('Babin Rentals')

    const receipt = paymentReceipt(
      {
        clientName: 'Sita Sharma',
        receiptNo: 'PAY-1',
        amount: rupees(5000),
        method: 'Fonepay',
        bookingNo: '946',
        balance: rupees(0),
      },
      BIZ,
    )
    expect(receipt).toContain('Rs 5,000')
    expect(receipt).toContain('PAY-1')
  })

  it('enforces Law 6 money-blind filtering on templatesForStage and puts overdue first', () => {
    const coord = templatesForStage({ stage: 'On Rent', role: 'Coordinator', isOverdue: true, hasBalance: true })
    expect(coord[0]?.id).toBe('overdue')
    expect(coord.some((t) => t.id === 'balance_due')).toBe(true)

    const warehouse = templatesForStage({ stage: 'On Rent', role: 'Warehouse', isOverdue: true, hasBalance: true })
    expect(warehouse[0]?.id).toBe('overdue')
    expect(warehouse.some((t) => t.id === 'balance_due')).toBe(false)

    expect(templatesForStage({ stage: 'Quote', role: 'Owner' })).toEqual([])
  })
})
