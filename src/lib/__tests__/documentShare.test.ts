/**
 * src/lib/__tests__/documentShare.test.ts — Babin Rentals OS
 *
 * Unit tests for Document Sharing Engine (T3-16).
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  isPricedDocument,
  canRoleShareDocument,
  buildWhatsAppShareLink,
  sendDocumentEmail,
  copyDocumentText,
  type DocumentShareType,
} from '../documentShare'
import { NO_PHONE_REASON } from '../whatsapp'
import { _resetMockEmailLogs, getMockEmailLogs } from '../email/client'
import type { Paisa } from '../money'
import type { SystemRole } from '../../types/database'

const BUSINESS = {
  businessName: 'Babin Rentals',
  businessPhone: '+977-1-4780000',
}

describe('Document Sharing Engine (T3-16)', () => {
  beforeEach(() => {
    _resetMockEmailLogs()
  })

  describe('Document Classification & Law 6 Security Matrix', () => {
    it('classifies quote, invoice, receipt, and confirmation as priced documents', () => {
      expect(isPricedDocument('quote')).toBe(true)
      expect(isPricedDocument('invoice')).toBe(true)
      expect(isPricedDocument('receipt')).toBe(true)
      expect(isPricedDocument('confirmation')).toBe(true)
    })

    it('classifies agreement, packing list, and return report as unpriced documents', () => {
      expect(isPricedDocument('agreement')).toBe(false)
      expect(isPricedDocument('packing_list')).toBe(false)
      expect(isPricedDocument('return_report')).toBe(false)
    })

    it('denies money-blind roles (Warehouse, Technician, Driver, Client) permission to share priced documents', () => {
      const moneyBlindRoles: SystemRole[] = ['Warehouse', 'Technician', 'Driver', 'Client']
      const pricedDocs: DocumentShareType[] = ['quote', 'invoice', 'receipt', 'confirmation']

      for (const role of moneyBlindRoles) {
        for (const doc of pricedDocs) {
          const res = canRoleShareDocument(role, doc)
          expect(res.allowed).toBe(false)
          expect(res.reason).toBe('Your role cannot view or share financial documents.')
        }
      }
    })

    it('permits money-blind roles to share unpriced operational documents (Law 6)', () => {
      const moneyBlindRoles: SystemRole[] = ['Warehouse', 'Technician', 'Driver', 'Client']
      const unpricedDocs: DocumentShareType[] = ['agreement', 'packing_list', 'return_report']

      for (const role of moneyBlindRoles) {
        for (const doc of unpricedDocs) {
          const res = canRoleShareDocument(role, doc)
          expect(res.allowed).toBe(true)
          expect(res.reason).toBeUndefined()
        }
      }
    })

    it('permits desk, accounts, and admin roles to share all document types', () => {
      const financialRoles: SystemRole[] = ['Coordinator', 'Accounts', 'Admin', 'Owner', 'Manager']
      const allDocs: DocumentShareType[] = ['quote', 'invoice', 'receipt', 'agreement', 'confirmation', 'packing_list', 'return_report']

      for (const role of financialRoles) {
        for (const doc of allDocs) {
          const res = canRoleShareDocument(role, doc)
          expect(res.allowed).toBe(true)
        }
      }
    })
  })

  describe('WhatsApp Document Formatting & Linking', () => {
    it('generates valid WhatsApp compose link for quote with valid Nepali phone', () => {
      const res = buildWhatsAppShareLink({
        docType: 'quote',
        facts: {
          kind: 'quote',
          data: {
            clientName: 'Sagar Sharma',
            bookingNo: 'BR-2026-0042',
            quoteNo: 'QT-2026-0042-01',
            startIso: '2026-08-05T06:00:00.000Z',
            endIso: '2026-08-07T14:00:00.000Z',
            itemCount: 3,
            topItems: ['ARRI Alexa Mini LF', 'Master Anamorphic 50mm'],
            total: 12500000 as Paisa,
          },
        },
        business: BUSINESS,
        phone: '9841234567',
      })

      expect(res.url).not.toBeNull()
      expect(res.url).toContain('https://wa.me/9779841234567?text=')
      expect(res.text).toContain('Quotation: QT-2026-0042-01')
      expect(res.text).toContain('ARRI Alexa Mini LF')
      expect(res.text).toContain('Babin Rentals')
      expect(res.disabledReason).toBeUndefined()
    })

    it('returns null url and NO_PHONE_REASON when client phone is missing or invalid', () => {
      const invalidPhones = [null, undefined, '', '123', 'invalid-phone']

      for (const ph of invalidPhones) {
        const res = buildWhatsAppShareLink({
          docType: 'invoice',
          facts: {
            kind: 'invoice',
            data: {
              clientName: 'Himalayan Media',
              bookingNo: 'BR-2026-0088',
              invoiceNo: 'INV-2026-0012',
              total: 5000000 as Paisa,
              balance: 0 as Paisa,
            },
          },
          business: BUSINESS,
          phone: ph,
        })

        expect(res.url).toBeNull()
        expect(res.disabledReason).toBe(NO_PHONE_REASON)
        expect(res.text).toContain('INV-2026-0012')
      }
    })

    it('formats agreement document without prices', () => {
      const res = buildWhatsAppShareLink({
        docType: 'agreement',
        facts: {
          kind: 'agreement',
          data: {
            clientName: 'Pooja Thapa',
            bookingNo: 'BR-2026-0099',
            agreementNo: 'AGR-2026-0099',
            startIso: '2026-08-05T06:00:00.000Z',
            endIso: '2026-08-06T18:00:00.000Z',
            itemCount: 4,
          },
        },
        business: BUSINESS,
        phone: '9779801234567',
      })

      expect(res.url).toContain('https://wa.me/9779801234567?text=')
      expect(res.text).toContain('Equipment Rental Agreement')
      expect(res.text).toContain('AGR-2026-0099')
      expect(res.text).not.toContain('Rs')
    })
  })

  describe('Transactional Email Dispatch (T5-03)', () => {
    it('dispatches transactional email via send-email engine', async () => {
      const res = await sendDocumentEmail({
        docType: 'quote',
        recipientEmail: 'production@nepalfilms.com',
        recipientName: 'Nepal Films Team',
        bookingNo: 'BR-2026-0050',
      })

      expect(res.success).toBe(true)
      expect(res.recipientEmail).toBe('production@nepalfilms.com')

      const logs = getMockEmailLogs()
      expect(logs.length).toBe(1)
      expect(logs[0]?.templateId).toBe('quote_document')
      expect(logs[0]?.recipientEmail).toBe('production@nepalfilms.com')
      expect(logs[0]?.status).toBe('mock_sent')
    })

    it('rejects invalid recipient email addresses', async () => {
      await expect(
        sendDocumentEmail({
          docType: 'invoice',
          recipientEmail: 'notanemail',
          bookingNo: 'BR-2026-0050',
        }),
      ).rejects.toThrow('Please enter a valid recipient email address.')
    })
  })

  describe('Text Clipboard Copy', () => {
    it('copies text summary without throwing', async () => {
      const ok = await copyDocumentText('Rental summary text')
      expect(typeof ok).toBe('boolean')
    })
  })
})
